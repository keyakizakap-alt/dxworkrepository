import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createStore } from '../src/store.js';

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-copilot-store-test-'));
  return path.join(dir, 'store.json');
}

test('store: creates seed data on first load when file is absent', () => {
  const filePath = tempStorePath();
  assert.equal(fs.existsSync(filePath), false);

  const store = createStore(filePath);
  const pipelines = store.getPipelines();
  const runs = store.getRuns();

  assert.equal(store.wasSeeded, true);
  assert.equal(pipelines.length, 2);
  assert.equal(runs.length, 12);
  assert.equal(fs.existsSync(filePath), true);

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test('store: seeded runs are spread across the last 7 days', () => {
  const filePath = tempStorePath();
  const store = createStore(filePath);
  const runs = store.getRuns();

  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daySet = new Set();
  for (const run of runs) {
    const d = new Date(run.startedAt);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - d.getTime()) / dayMs);
    assert.ok(diffDays >= 0 && diffDays < 7, `run ${run.id} should fall within last 7 days`);
    daySet.add(diffDays);
  }
  // 各日に少なくとも1件は存在すること(週次トレンドが綺麗に見えるように)
  assert.equal(daySet.size, 7);

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test('store: persists pipelines and runs across reload', () => {
  const filePath = tempStorePath();
  const store = createStore(filePath);
  store.load();

  const newPipeline = {
    id: 'pl-test-1',
    name: 'テストパイプライン',
    description: '',
    trigger: '手動実行',
    steps: [{ name: 'ステップ1', type: 'notify', config: {} }],
    createdAt: new Date().toISOString(),
  };
  store.addPipeline(newPipeline);

  const newRun = {
    id: 'run-test-1',
    pipelineId: 'pl-test-1',
    startedAt: new Date().toISOString(),
    durationMs: 100,
    savedMinutes: 3,
    status: 'success',
    steps: [{ name: 'ステップ1', status: 'success', output: '完了' }],
  };
  store.addRun(newRun);

  // 別インスタンスで再読込しても永続化されていること
  const reloaded = createStore(filePath);
  const pipelines = reloaded.getPipelines();
  const runs = reloaded.getRuns();

  assert.ok(pipelines.some((p) => p.id === 'pl-test-1'));
  assert.ok(runs.some((r) => r.id === 'run-test-1'));
  assert.equal(reloaded.wasSeeded, false);

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test('store: getPipelineById returns undefined for unknown id', () => {
  const filePath = tempStorePath();
  const store = createStore(filePath);
  assert.equal(store.getPipelineById('does-not-exist'), undefined);
  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test('store: setSuggestions/getSuggestions round-trip', () => {
  const filePath = tempStorePath();
  const store = createStore(filePath);
  assert.deepEqual(store.getSuggestions(), []);

  const suggestions = [{ id: 'sugg-1', title: 'test' }];
  store.setSuggestions(suggestions);
  assert.deepEqual(store.getSuggestions(), suggestions);

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});

test('store: recovers with fresh seed data if store.json is corrupted', () => {
  const filePath = tempStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '{ not valid json', 'utf-8');

  const store = createStore(filePath);
  assert.equal(store.getPipelines().length, 2);
  assert.equal(store.getRuns().length, 12);

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
});
