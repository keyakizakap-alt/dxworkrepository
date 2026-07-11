import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createStore } from '../src/store.js';
import { createPipeline, runPipeline, getMetrics } from '../src/pipeline.js';

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-copilot-pipeline-test-'));
  const filePath = path.join(dir, 'store.json');
  const store = createStore(filePath);
  // シードデータは無視し、テストごとにクリーンな状態から始める
  store.load().pipelines.length = 0;
  store.load().runs.length = 0;
  store.save();
  return { store, dir };
}

test('createPipeline: rejects missing name', () => {
  const { store, dir } = freshStore();
  assert.throws(
    () => createPipeline(store, { trigger: '手動実行', steps: [{ name: 's1', type: 'notify' }] }),
    (err) => err.statusCode === 400
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('createPipeline: rejects missing trigger', () => {
  const { store, dir } = freshStore();
  assert.throws(
    () => createPipeline(store, { name: 'テスト', steps: [{ name: 's1', type: 'notify' }] }),
    (err) => err.statusCode === 400
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('createPipeline: rejects empty steps', () => {
  const { store, dir } = freshStore();
  assert.throws(
    () => createPipeline(store, { name: 'テスト', trigger: '手動実行', steps: [] }),
    (err) => err.statusCode === 400
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('createPipeline: rejects steps without name/type', () => {
  const { store, dir } = freshStore();
  assert.throws(
    () => createPipeline(store, { name: 'テスト', trigger: '手動実行', steps: [{ name: 's1' }] }),
    (err) => err.statusCode === 400
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('createPipeline: creates and persists a valid pipeline', () => {
  const { store, dir } = freshStore();
  const pipeline = createPipeline(store, {
    name: 'テストパイプライン',
    description: '説明',
    trigger: '手動実行',
    steps: [
      { name: '分類する', type: 'ai_classify' },
      { name: '通知する', type: 'notify' },
    ],
  });

  assert.ok(pipeline.id.startsWith('pl-'));
  assert.equal(pipeline.name, 'テストパイプライン');
  assert.equal(pipeline.steps.length, 2);
  assert.deepEqual(pipeline.steps[0].config, {});
  assert.ok(pipeline.createdAt);

  assert.equal(store.getPipelines().length, 1);
  assert.equal(store.getPipelineById(pipeline.id).name, 'テストパイプライン');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('runPipeline: throws 404 for unknown pipeline id', async () => {
  const { store, dir } = freshStore();
  await assert.rejects(
    () => runPipeline(store, 'does-not-exist'),
    (err) => err.statusCode === 404
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runPipeline: executes all steps, records output strings and saved minutes', async () => {
  const { store, dir } = freshStore();
  const pipeline = createPipeline(store, {
    name: '実行テスト',
    trigger: '手動実行',
    steps: [
      { name: 'AI要約', type: 'ai_summarize' },
      { name: 'AI分類', type: 'ai_classify' },
      { name: '通知', type: 'notify' },
      { name: 'アーカイブ', type: 'archive' },
    ],
  });

  const run = await runPipeline(store, pipeline.id, '見積依頼のメールが届きました');

  assert.equal(run.pipelineId, pipeline.id);
  assert.equal(run.status, 'success');
  assert.equal(run.steps.length, 4);
  for (const step of run.steps) {
    assert.equal(step.status, 'success');
    assert.equal(typeof step.output, 'string');
    assert.ok(step.output.length > 0);
  }
  // ai系8分 x2 + その他3分 x2 = 22分
  assert.equal(run.savedMinutes, 22);
  assert.equal(typeof run.durationMs, 'number');
  assert.ok(run.durationMs >= 0);

  const runs = store.getRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, run.id);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('getMetrics: aggregates totals, success rate, cost and weekly trend', () => {
  const { store, dir } = freshStore();
  createPipeline(store, {
    name: 'メトリクス用パイプライン',
    trigger: '手動実行',
    steps: [
      { name: 'AI要約', type: 'ai_summarize' },
      { name: '通知', type: 'notify' },
    ],
  });

  const now = new Date().toISOString();
  store.addRun({
    id: 'run-a',
    pipelineId: 'pl-x',
    startedAt: now,
    durationMs: 100,
    savedMinutes: 11,
    status: 'success',
    steps: [],
  });
  store.addRun({
    id: 'run-b',
    pipelineId: 'pl-x',
    startedAt: now,
    durationMs: 100,
    savedMinutes: 0,
    status: 'failed',
    steps: [],
  });

  const metrics = getMetrics(store);
  assert.equal(metrics.totalRuns, 2);
  assert.equal(metrics.successRate, 0.5);
  assert.equal(metrics.savedMinutes, 11);
  assert.equal(metrics.savedCostYen, 11 * 50);
  // 1 pipeline, steps: [ai_summarize, notify] -> automationRate = 1/2
  assert.equal(metrics.automationRate, 0.5);
  assert.equal(metrics.weeklyTrend.length, 7);
  assert.equal(metrics.weeklyTrend.reduce((a, b) => a + b, 0), 2);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('getMetrics: returns zeroed metrics for an empty store', () => {
  const { store, dir } = freshStore();
  const metrics = getMetrics(store);
  assert.equal(metrics.totalRuns, 0);
  assert.equal(metrics.successRate, 0);
  assert.equal(metrics.savedMinutes, 0);
  assert.equal(metrics.savedCostYen, 0);
  assert.equal(metrics.automationRate, 0);
  assert.deepEqual(metrics.weeklyTrend, [0, 0, 0, 0, 0, 0, 0]);
  fs.rmSync(dir, { recursive: true, force: true });
});
