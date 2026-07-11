// src/pipeline.js
// パイプラインエンジン: 定義(作成/バリデーション)・実行・履歴・メトリクス集計。

import crypto from 'node:crypto';
import * as llm from './llm.js';

const AI_STEP_MINUTES = 8;
const OTHER_STEP_MINUTES = 3;
// 削減時間を円換算する際の単価(想定される事務作業の平均人件費 約3,000円/時 = 50円/分)
const YEN_PER_MINUTE = 50;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function genId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * 新規パイプラインを作成しストアに追加する。
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {{name:string, description?:string, trigger:string, steps: {name:string, type:string, config?:object}[]}} input
 */
export function createPipeline(store, input) {
  if (!input || typeof input !== 'object') {
    throw httpError(400, 'リクエストボディが不正です');
  }
  const { name, description = '', trigger, steps } = input;

  if (!isNonEmptyString(name)) {
    throw httpError(400, 'name is required');
  }
  if (!isNonEmptyString(trigger)) {
    throw httpError(400, 'trigger is required');
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw httpError(400, 'steps must be a non-empty array');
  }
  for (const step of steps) {
    if (!step || !isNonEmptyString(step.name) || !isNonEmptyString(step.type)) {
      throw httpError(400, 'each step requires a name and a type');
    }
  }

  const pipeline = {
    id: genId('pl'),
    name,
    description: typeof description === 'string' ? description : '',
    trigger,
    steps: steps.map((s) => ({ name: s.name, type: s.type, config: s.config ?? {} })),
    createdAt: new Date().toISOString(),
  };

  store.addPipeline(pipeline);
  return pipeline;
}

async function executeStep(step, input) {
  switch (step.type) {
    case 'ai_summarize':
    case 'ai_classify':
    case 'ai_draft':
      return llm.runStep(step.type, step.name, input);
    case 'notify':
      return `通知を送信しました: 「${step.name}」の完了を関係者に共有しました。`;
    case 'assign':
      return `担当者にアサインしました: ${step.name} を次の担当者へ割り当てました。`;
    case 'archive':
      return `アーカイブに保存しました: ${step.name} の結果を保存しました。`;
    default:
      return `${step.name} を実行しました。`;
  }
}

/**
 * パイプラインを実行し、実行結果(Run)をストアに追加する。
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {string} pipelineId
 * @param {string} [input]
 */
export async function runPipeline(store, pipelineId, input = '') {
  const pipeline = store.getPipelineById(pipelineId);
  if (!pipeline) {
    throw httpError(404, 'pipeline not found');
  }

  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const stepResults = [];
  let status = 'success';
  let savedMinutes = 0;
  let carry = typeof input === 'string' ? input : input == null ? '' : JSON.stringify(input);

  for (const step of pipeline.steps) {
    try {
      const output = await executeStep(step, carry);
      stepResults.push({ name: step.name, status: 'success', output });
      carry = output;
      savedMinutes += step.type.startsWith('ai_') ? AI_STEP_MINUTES : OTHER_STEP_MINUTES;
    } catch (err) {
      stepResults.push({ name: step.name, status: 'failed', output: `エラー: ${err.message}` });
      status = 'failed';
      break;
    }
  }

  const run = {
    id: genId('run'),
    pipelineId,
    startedAt,
    durationMs: Date.now() - startedAtMs,
    savedMinutes,
    status,
    steps: stepResults,
  };

  store.addRun(run);
  return run;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 直近7日間(古い日→新しい日)の実行件数トレンドを計算する。 */
function computeWeeklyTrend(runs) {
  const today = startOfDay(new Date());
  const dayMs = 24 * 60 * 60 * 1000;
  const trend = new Array(7).fill(0);
  for (const run of runs) {
    const runDay = startOfDay(run.startedAt);
    const diffDays = Math.round((today - runDay) / dayMs);
    if (diffDays >= 0 && diffDays < 7) {
      trend[6 - diffDays] += 1;
    }
  }
  return trend;
}

/**
 * ダッシュボード用メトリクスを集計する。
 * @param {ReturnType<import('./store.js').createStore>} store
 */
export function getMetrics(store) {
  const runs = store.getRuns();
  const pipelines = store.getPipelines();

  const totalRuns = runs.length;
  const successCount = runs.filter((r) => r.status === 'success').length;
  const successRate = totalRuns ? successCount / totalRuns : 0;
  const savedMinutes = runs.reduce((sum, r) => sum + (r.savedMinutes || 0), 0);
  const savedCostYen = savedMinutes * YEN_PER_MINUTE;

  const allSteps = pipelines.flatMap((p) => p.steps || []);
  const aiSteps = allSteps.filter((s) => s.type && s.type.startsWith('ai_'));
  const automationRate = allSteps.length ? aiSteps.length / allSteps.length : 0;

  const weeklyTrend = computeWeeklyTrend(runs);

  return {
    totalRuns,
    successRate,
    savedMinutes,
    savedCostYen,
    automationRate,
    weeklyTrend,
  };
}
