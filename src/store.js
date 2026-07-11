// src/store.js
// JSONファイル永続化レイヤー。load/save のみを責務とし、
// 初回起動時(store.jsonが存在しない場合)はシードデータを投入する。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STORE_PATH = path.join(__dirname, '..', 'data', 'store.json');

function daysAgoIso(daysAgo, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function minutesForSteps(steps) {
  return steps.reduce((sum, s) => sum + (s.type.startsWith('ai_') ? 8 : 3), 0);
}

function buildStepResult(step, shouldFail) {
  if (shouldFail) {
    return {
      name: step.name,
      status: 'failed',
      output: `エラー: ${step.name}の処理中に一時的な障害が発生しました。`,
    };
  }
  return {
    name: step.name,
    status: 'success',
    output: `${step.name}を完了しました。`,
  };
}

function buildRun(id, pipeline, { daysAgo, hour, minute, fail = false }) {
  const failIndex = fail ? pipeline.steps.length - 1 : -1;
  const steps = pipeline.steps.map((s, idx) => buildStepResult(s, idx === failIndex));
  const status = steps.some((s) => s.status === 'failed') ? 'failed' : 'success';
  const completedSteps = status === 'success' ? pipeline.steps : pipeline.steps.slice(0, failIndex);
  return {
    id,
    pipelineId: pipeline.id,
    startedAt: daysAgoIso(daysAgo, hour, minute),
    durationMs: 900 + ((hour * 60 + minute) % 7) * 250,
    savedMinutes: minutesForSteps(completedSteps),
    status,
    steps,
  };
}

function seedState() {
  const pipeline1 = {
    id: 'pl-inquiry-triage',
    name: '問い合わせメール自動仕分け&返信下書き',
    description:
      '受信した問い合わせメールを分類し、一次回答の下書きを自動作成して担当者に割り当てます。',
    trigger: '問い合わせメール受信',
    steps: [
      { name: '問い合わせ内容を分類', type: 'ai_classify', config: {} },
      { name: '一次回答を下書き', type: 'ai_draft', config: {} },
      { name: '担当者にアサイン', type: 'assign', config: {} },
      { name: '完了を通知', type: 'notify', config: {} },
    ],
    createdAt: daysAgoIso(30),
  };

  const pipeline2 = {
    id: 'pl-weekly-report',
    name: '週次報告書の自動生成',
    description: '今週の活動ログを要約し、報告書のドラフトを自動生成して関係者に共有します。',
    trigger: '毎週金曜 17:00',
    steps: [
      { name: '活動ログを要約', type: 'ai_summarize', config: {} },
      { name: '報告書ドラフトを作成', type: 'ai_draft', config: {} },
      { name: '関係者へ通知', type: 'notify', config: {} },
      { name: 'アーカイブに保存', type: 'archive', config: {} },
    ],
    createdAt: daysAgoIso(30),
  };

  // 直近7日に分散した実行履歴12件(weeklyTrendが綺麗に出るように各日に配置)
  const schedule = [
    { daysAgo: 6, hour: 9, minute: 10, pipeline: pipeline1 },
    { daysAgo: 6, hour: 15, minute: 40, pipeline: pipeline2 },
    { daysAgo: 5, hour: 9, minute: 5, pipeline: pipeline1 },
    { daysAgo: 5, hour: 11, minute: 20, pipeline: pipeline1 },
    { daysAgo: 4, hour: 10, minute: 0, pipeline: pipeline2 },
    { daysAgo: 4, hour: 16, minute: 30, pipeline: pipeline1 },
    { daysAgo: 3, hour: 9, minute: 45, pipeline: pipeline1 },
    { daysAgo: 3, hour: 14, minute: 15, pipeline: pipeline2, fail: true },
    { daysAgo: 2, hour: 9, minute: 30, pipeline: pipeline1 },
    { daysAgo: 2, hour: 13, minute: 0, pipeline: pipeline1 },
    { daysAgo: 1, hour: 10, minute: 10, pipeline: pipeline2 },
    { daysAgo: 0, hour: 9, minute: 0, pipeline: pipeline1 },
  ];

  const runs = schedule.map((s, idx) =>
    buildRun(`run-seed-${idx + 1}`, s.pipeline, s)
  );

  return { pipelines: [pipeline1, pipeline2], runs, suggestions: [] };
}

function readOrSeed(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      pipelines: Array.isArray(parsed.pipelines) ? parsed.pipelines : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[store] failed to read ${filePath}, reinitializing with seed data:`, err.message);
    }
    return seedState();
  }
}

function persist(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * ファイルベースのシンプルなストアを作成する。
 * @param {string} [filePath] - store.jsonのパス(省略時はdata/store.json)
 */
export function createStore(filePath = DEFAULT_STORE_PATH) {
  let state = null;
  let loadedFromFile = false;

  function ensureLoaded() {
    if (state) return state;
    const existed = fs.existsSync(filePath);
    state = readOrSeed(filePath);
    loadedFromFile = existed;
    if (!existed) {
      persist(filePath, state);
    }
    return state;
  }

  function save() {
    persist(filePath, ensureLoaded());
  }

  return {
    load: ensureLoaded,
    save,
    get filePath() {
      return filePath;
    },
    get wasSeeded() {
      ensureLoaded();
      return !loadedFromFile;
    },
    getPipelines() {
      return ensureLoaded().pipelines;
    },
    getPipelineById(id) {
      return ensureLoaded().pipelines.find((p) => p.id === id);
    },
    addPipeline(pipeline) {
      ensureLoaded().pipelines.push(pipeline);
      save();
      return pipeline;
    },
    getRuns() {
      return ensureLoaded().runs;
    },
    addRun(run) {
      ensureLoaded().runs.push(run);
      save();
      return run;
    },
    getSuggestions() {
      return ensureLoaded().suggestions;
    },
    setSuggestions(suggestions) {
      ensureLoaded().suggestions = suggestions;
      save();
      return suggestions;
    },
  };
}
