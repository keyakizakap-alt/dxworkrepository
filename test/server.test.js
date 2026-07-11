import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createServer } from '../src/router.js';
import { createStore } from '../src/store.js';

let server;
let baseUrl;
let tmpDir;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-copilot-server-test-'));
  const store = createStore(path.join(tmpDir, 'store.json'));
  server = createServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function getJson(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function postJson(pathname, payload) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await res.json();
  return { status: res.status, body };
}

test('GET /api/health returns ok status and demo mode (no API key configured)', async () => {
  const { status, body } = await getJson('/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.mode, 'demo');
  assert.equal(typeof body.version, 'string');
});

test('POST /api/analyze requires text', async () => {
  const { status, body } = await postJson('/api/analyze', {});
  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
});

test('POST /api/analyze returns structured analysis reacting to keywords', async () => {
  const { status, body } = await postJson('/api/analyze', {
    text: '本日は見積の件で打ち合わせを行いました。',
    type: 'minutes',
  });
  assert.equal(status, 200);
  assert.equal(typeof body.summary, 'string');
  assert.ok(body.summary.includes('見積'));
  assert.ok(Array.isArray(body.decisions));
  assert.ok(Array.isArray(body.tasks));
  for (const t of body.tasks) {
    assert.equal(typeof t.title, 'string');
    assert.equal(typeof t.assignee, 'string');
    assert.equal(typeof t.due, 'string');
    assert.ok(['high', 'medium', 'low'].includes(t.priority));
  }
  assert.ok(Array.isArray(body.risks));
  assert.ok(['positive', 'neutral', 'negative'].includes(body.sentiment));
});

test('POST /api/chat returns a reply string', async () => {
  const { status, body } = await postJson('/api/chat', {
    messages: [{ role: 'user', content: '請求書について教えてください' }],
  });
  assert.equal(status, 200);
  assert.equal(typeof body.reply, 'string');
  assert.ok(body.reply.length > 0);
});

test('POST /api/chat requires messages array', async () => {
  const { status, body } = await postJson('/api/chat', {});
  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
});

test('GET /api/pipelines returns seeded pipelines', async () => {
  const { status, body } = await getJson('/api/pipelines');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.pipelines));
  assert.equal(body.pipelines.length, 2);
});

let createdPipelineId;

test('POST /api/pipelines creates a new pipeline (201)', async () => {
  const { status, body } = await postJson('/api/pipelines', {
    name: '統合テスト用パイプライン',
    trigger: '手動実行',
    steps: [
      { name: '要約する', type: 'ai_summarize' },
      { name: '通知する', type: 'notify' },
    ],
  });
  assert.equal(status, 201);
  assert.ok(body.pipeline.id);
  createdPipelineId = body.pipeline.id;
});

test('POST /api/pipelines rejects invalid payload (400)', async () => {
  const { status, body } = await postJson('/api/pipelines', { name: '不正' });
  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
});

test('POST /api/pipelines/:id/run executes the pipeline', async () => {
  const { status, body } = await postJson(`/api/pipelines/${createdPipelineId}/run`, {
    input: '問い合わせが届きました',
  });
  assert.equal(status, 200);
  assert.equal(body.run.pipelineId, createdPipelineId);
  assert.equal(body.run.status, 'success');
  assert.equal(body.run.steps.length, 2);
});

test('POST /api/pipelines/:id/run returns 404 for unknown pipeline', async () => {
  const { status, body } = await postJson('/api/pipelines/unknown-id/run', {});
  assert.equal(status, 404);
  assert.equal(typeof body.error, 'string');
});

test('GET /api/runs returns runs sorted newest-first including the new run', async () => {
  const { status, body } = await getJson('/api/runs');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.runs));
  assert.equal(body.runs.length, 13); // 12 seeded + 1 created above
  for (let i = 1; i < body.runs.length; i++) {
    const prev = new Date(body.runs[i - 1].startedAt).getTime();
    const curr = new Date(body.runs[i].startedAt).getTime();
    assert.ok(prev >= curr, 'runs should be sorted newest first');
  }
});

test('GET /api/metrics returns aggregated metrics', async () => {
  const { status, body } = await getJson('/api/metrics');
  assert.equal(status, 200);
  assert.equal(typeof body.totalRuns, 'number');
  assert.equal(typeof body.successRate, 'number');
  assert.equal(typeof body.savedMinutes, 'number');
  assert.equal(typeof body.savedCostYen, 'number');
  assert.equal(typeof body.automationRate, 'number');
  assert.ok(Array.isArray(body.weeklyTrend));
  assert.equal(body.weeklyTrend.length, 7);
});

let discoveredSuggestionId;

test('POST /api/discover returns suggestions using the built-in sample logs', async () => {
  const { status, body } = await postJson('/api/discover', {});
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.suggestions));
  assert.ok(body.suggestions.length > 0);
  const suggestion = body.suggestions[0];
  assert.equal(typeof suggestion.id, 'string');
  assert.equal(typeof suggestion.title, 'string');
  assert.equal(typeof suggestion.description, 'string');
  assert.equal(typeof suggestion.estimatedSavingMinutesPerWeek, 'number');
  assert.equal(typeof suggestion.confidence, 'number');
  assert.ok(suggestion.pipelineTemplate);
  assert.equal(typeof suggestion.pipelineTemplate.name, 'string');
  assert.ok(Array.isArray(suggestion.pipelineTemplate.steps));
  discoveredSuggestionId = suggestion.id;
});

test('POST /api/discover/:suggestionId/adopt creates a pipeline from a suggestion (201)', async () => {
  const { status, body } = await postJson(`/api/discover/${discoveredSuggestionId}/adopt`, {});
  assert.equal(status, 201);
  assert.ok(body.pipeline.id);
  assert.equal(body.pipeline.name, body.pipeline.name);
});

test('POST /api/discover/:suggestionId/adopt returns 404 for unknown suggestion', async () => {
  const { status, body } = await postJson('/api/discover/unknown-suggestion/adopt', {});
  assert.equal(status, 404);
  assert.equal(typeof body.error, 'string');
});

test('unknown /api/* route returns 404 JSON', async () => {
  const { status, body } = await getJson('/api/does-not-exist');
  assert.equal(status, 404);
  assert.equal(typeof body.error, 'string');
});
