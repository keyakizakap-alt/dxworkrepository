#!/usr/bin/env node
/**
 * ブラウザから LLM API を直接呼ぶと CORS で弾かれる場合の中継サーバ。
 * Node 標準機能のみ。依存パッケージなし。
 *
 *   node tools/orcarouter-chat/scripts/proxy.mjs
 *   # → http://localhost:8787 で待ち受け
 *
 * 使い方：チャットボットの設定画面で Base URL を以下に変更する。
 *   OrcaRouter        → http://localhost:8787/v1
 *   Anthropic         → http://localhost:8787
 *   その他 OpenAI 互換 → http://localhost:8787/v1
 *
 * 転送先は環境変数 ORCA_PROXY_TARGET で切り替える（既定は OrcaRouter）。
 *   ORCA_PROXY_TARGET=https://api.anthropic.com node scripts/proxy.mjs
 *
 * 注意: これはローカル開発用。API キーはブラウザから Authorization ヘッダで
 * そのまま透過転送されるだけで、このサーバには保存されない。
 * 認証をかけていないので、公開ネットワークに晒さないこと。
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.ORCA_PROXY_PORT || 8787);
const TARGET = (process.env.ORCA_PROXY_TARGET || 'https://api.orcarouter.ai').replace(/\/+$/, '');

// クライアントから透過させるヘッダだけを許可する
const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'x-api-key',
  'anthropic-version',
  'anthropic-beta'
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': FORWARD_HEADERS.join(', '),
  'Access-Control-Max-Age': '86400'
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS).end();
    return;
  }

  const url = TARGET + req.url;
  const headers = {};
  for (const name of FORWARD_HEADERS) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }

  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const upstream = await fetch(url, { method: req.method, headers, body });

    const outHeaders = Object.assign({}, CORS_HEADERS);
    const contentType = upstream.headers.get('content-type');
    if (contentType) outHeaders['Content-Type'] = contentType;
    // SSE をバッファリングさせない
    outHeaders['Cache-Control'] = 'no-cache';
    res.writeHead(upstream.status, outHeaders);

    console.log(`${req.method} ${req.url} → ${upstream.status}`);

    if (!upstream.body) { res.end(); return; }

    // ストリームをそのまま素通しする（チャンクごとに即 flush）
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error(`${req.method} ${req.url} → 転送エラー:`, err.message);
    res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
    res.end(JSON.stringify({ error: { message: `proxy upstream error: ${err.message}` } }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`OrcaRouter 壁打ちボット 中継サーバ`);
  console.log(`  待ち受け: http://localhost:${PORT}`);
  console.log(`  転送先  : ${TARGET}`);
  console.log(`  停止    : Ctrl+C`);
});
