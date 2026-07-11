// src/router.js
// HTTPルーティング + 静的ファイル配信(public/)。node:http のみで実装(依存ゼロ)。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStore } from './store.js';
import * as llm from './llm.js';
import * as pipeline from './pipeline.js';
import * as demo from './demo-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VERSION = '1.0.0';
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(Object.assign(new Error('invalid JSON body'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      // SPA: 拡張子なしのパス(hashルーティング等)はindex.htmlへフォールバック
      if (path.extname(relative) === '') {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexContent);
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

/**
 * リクエストハンドラを作成する。テストではカスタムstoreを渡してAPI経路のみ検証できる。
 * @param {{ store?: ReturnType<typeof createStore> }} [opts]
 */
export function createRequestHandler(opts = {}) {
  const store = opts.store || createStore();

  return async function handler(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      sendJson(res, 400, { error: 'invalid request url' });
      return;
    }
    const { pathname } = url;
    const method = req.method;

    try {
      if (pathname === '/api/health' && method === 'GET') {
        const mode = await llm.getMode();
        sendJson(res, 200, { status: 'ok', mode, version: VERSION });
        return;
      }

      if (pathname === '/api/analyze' && method === 'POST') {
        const body = await readJsonBody(req);
        if (!body || typeof body.text !== 'string' || !body.text.trim()) {
          sendJson(res, 400, { error: 'text is required' });
          return;
        }
        const type = ['minutes', 'email', 'report'].includes(body.type) ? body.type : 'minutes';
        const result = await llm.analyze(body.text, type);
        sendJson(res, 200, result);
        return;
      }

      if (pathname === '/api/chat' && method === 'POST') {
        const body = await readJsonBody(req);
        if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
          sendJson(res, 400, { error: 'messages is required' });
          return;
        }
        const valid = body.messages.every(
          (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        );
        if (!valid) {
          sendJson(res, 400, { error: 'each message requires role ("user"|"assistant") and content' });
          return;
        }
        const reply = await llm.chat(body.messages, body.context);
        sendJson(res, 200, { reply });
        return;
      }

      if (pathname === '/api/pipelines' && method === 'GET') {
        sendJson(res, 200, { pipelines: store.getPipelines() });
        return;
      }

      if (pathname === '/api/pipelines' && method === 'POST') {
        const body = await readJsonBody(req);
        const created = pipeline.createPipeline(store, body);
        sendJson(res, 201, { pipeline: created });
        return;
      }

      const runMatch = pathname.match(/^\/api\/pipelines\/([^/]+)\/run$/);
      if (runMatch && method === 'POST') {
        const body = await readJsonBody(req);
        const run = await pipeline.runPipeline(store, runMatch[1], body.input);
        sendJson(res, 200, { run });
        return;
      }

      if (pathname === '/api/runs' && method === 'GET') {
        const runs = [...store.getRuns()].sort(
          (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        );
        sendJson(res, 200, { runs });
        return;
      }

      if (pathname === '/api/metrics' && method === 'GET') {
        sendJson(res, 200, pipeline.getMetrics(store));
        return;
      }

      if (pathname === '/api/discover' && method === 'POST') {
        const body = await readJsonBody(req);
        const logs = typeof body.logs === 'string' && body.logs.trim() ? body.logs : demo.SAMPLE_LOGS;
        const suggestions = await llm.discover(logs);
        store.setSuggestions(suggestions);
        sendJson(res, 200, { suggestions });
        return;
      }

      const adoptMatch = pathname.match(/^\/api\/discover\/([^/]+)\/adopt$/);
      if (adoptMatch && method === 'POST') {
        const suggestionId = decodeURIComponent(adoptMatch[1]);
        const suggestion = store.getSuggestions().find((s) => s.id === suggestionId);
        if (!suggestion) {
          sendJson(res, 404, { error: 'suggestion not found' });
          return;
        }
        const created = pipeline.createPipeline(store, {
          name: suggestion.pipelineTemplate.name,
          description: suggestion.description,
          trigger: suggestion.pipelineTemplate.trigger,
          steps: suggestion.pipelineTemplate.steps,
        });
        sendJson(res, 201, { pipeline: created });
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }

      if (method === 'GET' || method === 'HEAD') {
        serveStatic(req, res);
        return;
      }

      sendJson(res, 405, { error: 'method not allowed' });
    } catch (err) {
      const statusCode = err.statusCode || err.status || 500;
      if (statusCode >= 500) {
        console.error('[router] unhandled error:', err);
      }
      sendJson(res, statusCode, { error: err.message || 'internal server error' });
    }
  };
}

/**
 * http.Serverインスタンスを作成する(まだlistenはしない)。
 * @param {{ store?: ReturnType<typeof createStore> }} [opts]
 */
export function createServer(opts = {}) {
  return http.createServer(createRequestHandler(opts));
}
