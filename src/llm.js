// src/llm.js
// Claude API クライアント + demoフォールバック。analyze/chat/discover(+ パイプライン用runStep)を提供する。
//
// - live モード: ANTHROPIC_API_KEY があり @anthropic-ai/sdk がロードできる場合
// - demo モード: それ以外(未インストール・キー無し・呼び出し失敗)は必ず demo-data.js にフォールバックする
//
// 重要: temperature / top_p / top_k / thinking.budget_tokens は絶対に送らない(400エラーになるため)。

import * as demo from './demo-data.js';

const MODEL = process.env.DX_COPILOT_MODEL || 'claude-opus-4-8';
const MAX_TOKENS = 4096;

let client = null;
let mode = null;
let initPromise = null;

function log(...args) {
  console.warn('[llm]', ...args);
}

async function ensureClient() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      mode = 'demo';
      return;
    }
    try {
      const imported = await import('@anthropic-ai/sdk');
      const Anthropic = imported.default ?? imported.Anthropic;
      client = new Anthropic({ apiKey });
      mode = 'live';
    } catch (err) {
      log('@anthropic-ai/sdk is not available, falling back to demo mode:', err.message);
      client = null;
      mode = 'demo';
    }
  })();
  return initPromise;
}

/** @returns {Promise<"live"|"demo">} */
export async function getMode() {
  await ensureClient();
  return mode;
}

function extractText(response) {
  const block = Array.isArray(response.content) ? response.content.find((b) => b.type === 'text') : null;
  return block ? block.text : '';
}

async function callClaude({ system, messages, schema }) {
  const params = { model: MODEL, max_tokens: MAX_TOKENS, system, messages };
  if (schema) {
    params.output_config = { format: { type: 'json_schema', schema } };
  }
  const response = await client.messages.create(params);
  if (response.stop_reason === 'refusal') {
    throw new Error('claude refused the request (stop_reason: refusal)');
  }
  const text = extractText(response);
  if (schema) {
    return JSON.parse(text);
  }
  return text;
}

function typeLabel(type) {
  switch (type) {
    case 'email':
      return 'メール';
    case 'report':
      return '報告書';
    default:
      return '議事録';
  }
}

const TASK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    assignee: { type: 'string' },
    due: { type: 'string' },
    priority: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['title', 'assignee', 'due', 'priority'],
  additionalProperties: false,
};

const ANALYZE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    decisions: { type: 'array', items: { type: 'string' } },
    tasks: { type: 'array', items: TASK_SCHEMA },
    risks: { type: 'array', items: { type: 'string' } },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
  },
  required: ['summary', 'decisions', 'tasks', 'risks', 'sentiment'],
  additionalProperties: false,
};

const PIPELINE_STEP_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string' },
  },
  required: ['name', 'type'],
  additionalProperties: false,
};

const PIPELINE_TEMPLATE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    trigger: { type: 'string' },
    steps: { type: 'array', items: PIPELINE_STEP_SCHEMA },
  },
  required: ['name', 'trigger', 'steps'],
  additionalProperties: false,
};

const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    estimatedSavingMinutesPerWeek: { type: 'number' },
    confidence: { type: 'number' },
    pipelineTemplate: PIPELINE_TEMPLATE_SCHEMA,
  },
  required: ['id', 'title', 'description', 'estimatedSavingMinutesPerWeek', 'confidence', 'pipelineTemplate'],
  additionalProperties: false,
};

const DISCOVER_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: { type: 'array', items: SUGGESTION_SCHEMA },
  },
  required: ['suggestions'],
  additionalProperties: false,
};

/**
 * テキストを構造化分析する(議事録/メール/報告書)。
 * @param {string} text
 * @param {"minutes"|"email"|"report"} [type]
 */
export async function analyze(text, type = 'minutes') {
  await ensureClient();
  if (mode === 'live') {
    try {
      const system = `あなたは日本企業の業務文書を分析するアシスタントです。入力される${typeLabel(
        type
      )}を分析し、要約(summary)・決定事項(decisions)・タスク(tasks)・リスク(risks)・全体的な感情(sentiment)を日本語で抽出してください。`;
      return await callClaude({
        system,
        messages: [{ role: 'user', content: String(text ?? '') }],
        schema: ANALYZE_SCHEMA,
      });
    } catch (err) {
      log('analyze live call failed, falling back to demo:', err.message);
    }
  }
  return demo.analyzeDemo(text, type);
}

/**
 * チャットQ&A。
 * @param {{role: "user"|"assistant", content: string}[]} messages
 * @param {object} [context]
 */
export async function chat(messages, context) {
  await ensureClient();
  if (mode === 'live') {
    try {
      const contextNote = context ? `\n直前の分析結果: ${JSON.stringify(context)}` : '';
      const system = `あなたはDX Copilotの業務アシスタントです。簡潔かつ具体的な日本語で回答してください。${contextNote}`;
      const claudeMessages = messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content ?? ''),
      }));
      return await callClaude({ system, messages: claudeMessages });
    } catch (err) {
      log('chat live call failed, falling back to demo:', err.message);
    }
  }
  return demo.chatDemo(messages, context);
}

/**
 * 業務ログから自動化候補を発見する。
 * @param {string} [logs]
 */
export async function discover(logs) {
  await ensureClient();
  const logText = logs && String(logs).trim() ? String(logs) : demo.SAMPLE_LOGS;
  if (mode === 'live') {
    try {
      const system =
        'あなたは業務自動化コンサルタントです。与えられた業務ログを分析し、自動化できる業務を発見して提案してください。各提案にはID・タイトル・説明・週あたりの削減見込み分数・確信度(0〜1)・パイプラインテンプレート(名前/トリガー/ステップ)を含めてください。';
      const result = await callClaude({
        system,
        messages: [{ role: 'user', content: logText }],
        schema: DISCOVER_SCHEMA,
      });
      return result.suggestions;
    } catch (err) {
      log('discover live call failed, falling back to demo:', err.message);
    }
  }
  return demo.discoverDemo(logText);
}

/**
 * パイプラインのai_*ステップを実行する。
 * @param {string} stepType
 * @param {string} stepName
 * @param {string} input
 */
export async function runStep(stepType, stepName, input) {
  await ensureClient();
  if (mode === 'live') {
    try {
      const system = `あなたは業務自動化パイプラインのAIステップ「${stepName}」(${stepType})を実行するアシスタントです。簡潔に日本語で処理結果のみを出力してください。`;
      return await callClaude({ system, messages: [{ role: 'user', content: String(input ?? '') }] });
    } catch (err) {
      log('runStep live call failed, falling back to demo:', err.message);
    }
  }
  return demo.runStepDemo(stepType, stepName, input);
}
