#!/usr/bin/env node
/**
 * assets/kb.js から docs/orcarouter-research.md を生成する。
 *
 *   node tools/orcarouter-chat/scripts/build-docs.mjs
 *
 * 知識ベースを更新したら必ず再実行すること。ドキュメントは手で編集しない。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const kbPath = resolve(here, '../assets/kb.js');
const outPath = resolve(here, '../../../docs/orcarouter-research.md');

// kb.js は `window.ORCA_KB = {...}` を定義するブラウザ向けスクリプトなので、
// window を globalThis に束ねてから評価する。
globalThis.window = globalThis;
new Function(readFileSync(kbPath, 'utf8'))();
const KB = globalThis.ORCA_KB;

const CONF_LABEL = {
  official: '公式',
  'press-release': 'プレスリリース',
  'vendor-claim': 'ベンダー公表値',
  'third-party': '第三者',
  unverified: '要一次確認'
};

const conf = (c) => `\`${CONF_LABEL[c] || c}\``;
const links = (sources) => (sources || []).map((s) => `[${s.title}](${s.url})`).join(' / ');
const srcLine = (sources) => (sources && sources.length ? `\n出典: ${links(sources)}\n` : '');

const L = [];
const w = (...lines) => L.push(...lines);

// ── ヘッダ ──────────────────────────────────────────
w(
  `# ${KB.meta.title}`,
  '',
  `**対象**: ${KB.meta.subject}`,
  `**最終更新**: ${KB.meta.updatedAt}`,
  '',
  '> **このファイルは自動生成です。** 直接編集しないでください。',
  '> 内容を更新する場合は `tools/orcarouter-chat/assets/kb.js` を修正し、',
  '> `node tools/orcarouter-chat/scripts/build-docs.mjs` を実行して再生成してください。',
  '',
  '## 調査の前提と限界',
  ''
);
KB.meta.researchNotes.forEach((n) => w(`- ${n}`));

// ── 目次 ────────────────────────────────────────────
w(
  '',
  '## 目次',
  '',
  '1. [サービス概要](#サービス概要)',
  '2. [機能](#機能)',
  '3. [料金](#料金)',
  '4. [ベンチマークとコスト根拠](#ベンチマークとコスト根拠)',
  '5. [活用事例](#活用事例)',
  '6. [導入事例・エコシステム連携](#導入事例エコシステム連携)',
  `7. [OSS 版: ${KB.oss.name}](#oss-版-${KB.oss.name.toLowerCase().replace(/\s+/g, '-')})`,
  '8. [競合・代替案](#競合代替案)',
  '9. [導入検討時の論点](#導入検討時の論点)',
  '10. [用語](#用語)',
  '11. [出典一覧](#出典一覧)',
  ''
);

// ── 概要 ────────────────────────────────────────────
w('---', '', '## サービス概要', '', KB.overview.summary, '', '| 項目 | 内容 | 確度 |', '| --- | --- | --- |');
KB.overview.facts.forEach((f) => {
  const value = f.value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  w(`| **${f.label}** | ${value} | ${conf(f.confidence)} |`);
});
w('', '**出典**', '');
KB.overview.facts.forEach((f) => w(`- ${f.label}: ${links(f.sources)}`));

// ── 機能 ────────────────────────────────────────────
w('', '---', '', '## 機能', '');
KB.features.forEach((f) => {
  w(`### ${f.name} ${conf(f.confidence)}`, '', f.description, '');
  (f.details || []).forEach((d) => w(`- ${d}`));
  w(srcLine(f.sources));
});

// ── 料金 ────────────────────────────────────────────
w('---', '', '## 料金', '', KB.pricing.summary, '', '| プラン | 価格 | 含まれるもの |', '| --- | --- | --- |');
KB.pricing.plans.forEach((p) => {
  w(`| **${p.name}** | ${p.price} | ${p.includes.join('<br>').replace(/\|/g, '\\|')} |`);
});
w('', '### 料金に関する補足', '');
KB.pricing.notes.forEach((n) => {
  w(`#### ${n.label} ${conf(n.confidence)}`, '', n.value, srcLine(n.sources));
});

// ── ベンチマーク ─────────────────────────────────────
w('---', '', '## ベンチマークとコスト根拠', '');
KB.benchmarks.forEach((b) => {
  w(
    `### ${b.name} ${conf(b.confidence)}`,
    '',
    `**結果**: ${b.result}`,
    '',
    b.detail,
    '',
    `> ⚠️ **注意**: ${b.caveat}`,
    srcLine(b.sources)
  );
});

// ── 活用事例 ────────────────────────────────────────
w('---', '', '## 活用事例', '');
KB.useCases.forEach((u) => {
  w(`### ${u.title} ${conf(u.confidence)}`, '', `*${u.category}*`, '', u.body, srcLine(u.sources));
});

// ── 導入事例 ────────────────────────────────────────
w(
  '---',
  '',
  '## 導入事例・エコシステム連携',
  '',
  '> 公開情報の範囲では個社名を明かした顧客導入事例は確認できなかった。以下は開発ツール・プラットフォーム側での採用事例である。',
  ''
);
KB.integrations.forEach((i) => {
  w(
    `### ${i.name} ${conf(i.confidence)}`,
    '',
    `*${i.type}*`,
    '',
    i.body,
    '',
    `**設定方法**: ${i.setup}`,
    srcLine(i.sources)
  );
});

// ── OSS ─────────────────────────────────────────────
w(
  '---',
  '',
  `## OSS 版: ${KB.oss.name}`,
  '',
  `**ライセンス**: ${KB.oss.license} ${conf(KB.oss.confidence)}`,
  '',
  KB.oss.summary,
  ''
);
KB.oss.points.forEach((p) => w(`- ${p}`));
w('', `**クイックスタート**: ${KB.oss.quickstart}`, srcLine(KB.oss.sources));

// ── 競合 ────────────────────────────────────────────
w('---', '', '## 競合・代替案', '');
KB.competitors.forEach((c) => {
  w(
    `### ${c.name} ${conf(c.confidence)}`,
    '',
    `**位置づけ**: ${c.positioning}`,
    '',
    `**違い**: ${c.diff}`,
    srcLine(c.sources)
  );
});

// ── 論点 ────────────────────────────────────────────
w('---', '', '## 導入検討時の論点', '');
KB.considerations.forEach((c) => {
  w(`### ${c.topic}`, '', `**問い**: ${c.question}`, '', c.body, '');
});

// ── 用語 ────────────────────────────────────────────
w('---', '', '## 用語', '', '| 用語 | 説明 |', '| --- | --- |');
KB.glossary.forEach((g) => w(`| **${g.term}** | ${g.desc.replace(/\|/g, '\\|')} |`));

// ── 出典一覧 ────────────────────────────────────────
const allSources = new Map();
const collect = (sources) => (sources || []).forEach((s) => {
  if (!allSources.has(s.url)) allSources.set(s.url, s.title);
});

KB.overview.facts.forEach((f) => collect(f.sources));
KB.features.forEach((f) => collect(f.sources));
KB.pricing.plans.forEach((p) => collect(p.sources));
KB.pricing.notes.forEach((n) => collect(n.sources));
KB.benchmarks.forEach((b) => collect(b.sources));
KB.useCases.forEach((u) => collect(u.sources));
KB.integrations.forEach((i) => collect(i.sources));
collect(KB.oss.sources);
KB.competitors.forEach((c) => collect(c.sources));

w('', '---', '', '## 出典一覧', '', `全 ${allSources.size} 件（${KB.meta.updatedAt} 時点で参照）`, '');
[...allSources.entries()].forEach(([url, title], i) => w(`${i + 1}. [${title}](${url})`));

w(
  '',
  '---',
  '',
  `*Generated by \`tools/orcarouter-chat/scripts/build-docs.mjs\` from \`assets/kb.js\` on ${new Date().toISOString().slice(0, 10)}.*`,
  ''
);

writeFileSync(outPath, L.join('\n'), 'utf8');

// 生成結果の健全性チェック（出典のない項目が紛れていないか）
const missing = [];
const checkAll = (label, items) => items.forEach((it, i) => {
  if (!it.sources || !it.sources.length) missing.push(`${label}[${i}] ${it.name || it.title || it.label}`);
});
checkAll('features', KB.features);
checkAll('pricing.plans', KB.pricing.plans);
checkAll('pricing.notes', KB.pricing.notes);
checkAll('benchmarks', KB.benchmarks);
checkAll('useCases', KB.useCases);
checkAll('integrations', KB.integrations);
checkAll('competitors', KB.competitors);

console.log(`✓ ${outPath} を生成しました（${L.length} 行 / 出典 ${allSources.size} 件）`);
if (missing.length) {
  console.warn(`⚠ 出典が未設定の項目があります:\n  - ${missing.join('\n  - ')}`);
  process.exitCode = 1;
}
