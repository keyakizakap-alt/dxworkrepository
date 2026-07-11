// src/demo-data.js
// demoモード(APIキー無し/live呼び出し失敗時)のレスポンス生成器。
// 入力テキストのキーワードに応じて内容が分岐するヒューリスティックで、
// 決定的だが「生きて」見えるレスポンスを返す。

function truncate(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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

// ---------------------------------------------------------------------------
// キーワード別シナリオ(analyze / chat 共通で利用)
// ---------------------------------------------------------------------------

const KEYWORD_SCENARIOS = [
  {
    id: 'estimate',
    keywords: ['見積'],
    summary:
      '取引先向けの見積内容について協議し、提示金額と提出スケジュールを確認しました。値引き条件についても方針を合意しています。',
    decisions: [
      '先方への見積提示額を確定し、今週中に正式書面を送付する',
      '値引き幅は上限10%までとし、それ以上は上長承認を必須とする',
    ],
    tasks: () => [
      { title: '見積書の最終数値を確認する', assignee: '営業担当', due: daysFromNow(2), priority: 'high' },
      { title: '見積書をテンプレートに整形して送付する', assignee: '営業事務', due: daysFromNow(3), priority: 'medium' },
    ],
    risks: ['価格交渉が長引くと納期・受注時期に影響する可能性がある'],
    sentiment: 'neutral',
    chatReply:
      '見積のご質問ですね。提示額の上限や値引き条件は営業担当と上長の承認フローに沿って進めるのが安全です。見積書のテンプレートを使うと作成時間を短縮できます。',
  },
  {
    id: 'invoice',
    keywords: ['請求'],
    summary:
      '請求書の発行状況と入金確認について共有しました。一部取引先で支払遅延が発生しており、督促対応の方針を決定しています。',
    decisions: [
      '支払期日を2週間超過した取引先には自動リマインドメールを送付する',
      '請求書の発行タイミングを月末締め翌営業日発行に統一する',
    ],
    tasks: () => [
      { title: '未入金の取引先リストを更新する', assignee: '経理担当', due: daysFromNow(1), priority: 'high' },
      { title: '督促メールの文面テンプレートを整備する', assignee: '経理担当', due: daysFromNow(4), priority: 'medium' },
    ],
    risks: ['支払遅延が続くとキャッシュフローに影響する可能性がある'],
    sentiment: 'neutral',
    chatReply:
      '請求関連ですね。支払期日を過ぎた取引先には自動リマインドを送る運用にすると、督促対応の工数を減らせます。請求書発行日は締め日基準で統一するのがおすすめです。',
  },
  {
    id: 'incident',
    keywords: ['障害'],
    summary:
      'システム障害の発生経緯と一次対応の内容を確認しました。復旧対応は完了しましたが、再発防止策の検討が必要です。',
    decisions: [
      '障害発生時のエスカレーション先を明文化し、対応手順書に追記する',
      '同種障害の再発防止のため、監視アラートのしきい値を見直す',
    ],
    tasks: () => [
      { title: '障害対応手順書を更新する', assignee: '情報システム担当', due: daysFromNow(3), priority: 'high' },
      { title: '監視アラートのしきい値を再設定する', assignee: '情報システム担当', due: daysFromNow(5), priority: 'medium' },
    ],
    risks: ['再発防止策が遅れると同様の障害が再発し顧客影響が拡大するリスクがある'],
    sentiment: 'negative',
    chatReply:
      '障害対応についてですね。エスカレーション先を手順書に明記し、監視アラートのしきい値を見直すことで、一次対応にかかる時間を短縮できます。',
  },
  {
    id: 'hiring',
    keywords: ['採用'],
    summary:
      '採用選考の進捗を確認しました。応募者数は順調に増えていますが、書類選考にかかる工数が課題として挙がっています。',
    decisions: [
      '書類選考の一次基準をチェックリスト化し、判断のばらつきを減らす',
      '選考結果の連絡は応募から5営業日以内に行うことを徹底する',
    ],
    tasks: () => [
      { title: '書類選考チェックリストを作成する', assignee: '人事担当', due: daysFromNow(2), priority: 'medium' },
      { title: '応募者への一次連絡テンプレートを整備する', assignee: '人事担当', due: daysFromNow(3), priority: 'low' },
    ],
    risks: ['選考連絡の遅延が続くと候補者の離脱率が上昇するリスクがある'],
    sentiment: 'positive',
    chatReply:
      '採用選考についてですね。書類選考の基準をチェックリスト化すると、担当者ごとの判断のばらつきが減り、選考スピードも上がります。',
  },
  {
    id: 'meeting',
    keywords: ['会議', '定例'],
    summary: '週次定例会議を実施し、各部署の進捗共有と今後のアクションについて確認しました。',
    decisions: ['次回定例までに各部署の進捗レポートを共有フォルダに集約する'],
    tasks: () => [
      { title: '議事録を関係者へ共有する', assignee: '会議運営担当', due: daysFromNow(1), priority: 'medium' },
      { title: '次回定例までのアクション状況をフォローアップする', assignee: '会議運営担当', due: daysFromNow(6), priority: 'low' },
    ],
    risks: ['アクションアイテムのフォローが漏れると進捗確認が遅れるリスクがある'],
    sentiment: 'neutral',
    chatReply:
      '定例会議についてですね。議事録を早めに共有し、アクションアイテムの担当と期限を明確にしておくとフォローアップがスムーズです。',
  },
];

const DEFAULT_SCENARIO = {
  id: 'general',
  summary: '共有された内容の要点を整理し、決定事項とネクストアクションを抽出しました。',
  decisions: ['次回までに関係者間で認識を合わせ、進捗を共有する'],
  tasks: () => [
    { title: '内容を関係者に共有する', assignee: '担当者', due: daysFromNow(2), priority: 'medium' },
    { title: 'ネクストアクションの進捗を確認する', assignee: '担当者', due: daysFromNow(5), priority: 'low' },
  ],
  risks: ['対応が遅れるとネクストアクションの実行が遅延するリスクがある'],
  sentiment: 'neutral',
  chatReply:
    'ご質問ありがとうございます。内容を整理し、決定事項とタスクの担当・期限を明確にすることで、次のアクションに移りやすくなります。',
};

function findScenario(text) {
  const s = String(text ?? '');
  return KEYWORD_SCENARIOS.find((scenario) => scenario.keywords.some((k) => s.includes(k))) || DEFAULT_SCENARIO;
}

// ---------------------------------------------------------------------------
// analyze
// ---------------------------------------------------------------------------

export function analyzeDemo(text, type = 'minutes') {
  const scenario = findScenario(text);
  const label = typeLabel(type);
  return {
    summary: `【${label}分析】${scenario.summary}`,
    decisions: scenario.decisions,
    tasks: scenario.tasks(),
    risks: scenario.risks,
    sentiment: scenario.sentiment,
  };
}

// ---------------------------------------------------------------------------
// chat
// ---------------------------------------------------------------------------

export function chatDemo(messages, context) {
  const lastUser = [...(messages || [])].reverse().find((m) => m && m.role === 'user');
  const question = lastUser ? String(lastUser.content ?? '') : '';
  const scenario = findScenario(question);
  let reply = scenario.chatReply;
  if (context && typeof context === 'object' && context.summary) {
    reply += ` なお、直前の分析結果「${truncate(context.summary, 50)}」も踏まえてお答えしました。`;
  }
  return reply;
}

// ---------------------------------------------------------------------------
// discover
// ---------------------------------------------------------------------------

export const SAMPLE_LOGS = `2026-07-04 09:12 営業部: 新規問い合わせが3件着信。内容はすべて価格に関する見積依頼で、返信下書きの作成に毎回15分ほど要している。
2026-07-04 10:30 経理部: A社への請求書発行が期日を2日超過。督促の電話・メール対応に合計30分。
2026-07-05 14:00 情報システム部: 社内システムに軽微な障害が発生。一次対応に45分、エスカレーション先が不明確で対応が遅延した。
2026-07-06 11:20 人事部: 採用応募が15件届く。書類選考に1件あたり10分、計150分を書類確認だけに費やした。
2026-07-07 16:00 全社: 週次定例会議を実施。議事録作成とタスク整理に40分。
2026-07-08 09:00 営業部: 問い合わせ対応の一次回答の下書きに毎回15分要しており、担当者によって回答品質にばらつきがある。
2026-07-09 13:45 経理部: 月次請求書の送付リマインドをExcelで手動管理しており、抜け漏れが発生しがち。
2026-07-10 10:00 情報システム部: 同種の軽微な障害が再発。同じ手順書を毎回参照して復旧に30分かかっている。`;

const DISCOVERY_TEMPLATES = [
  {
    keyword: '問い合わせ',
    id: 'auto-inquiry-triage',
    title: '問い合わせ対応の自動仕分け強化',
    description:
      '過去の問い合わせログから頻出パターンを検知し、内容の分類と一次回答案の作成を自動化して対応品質を平準化します。',
    estimatedSavingMinutesPerWeek: 180,
    confidence: 0.86,
    pipelineTemplate: {
      name: '問い合わせ自動仕分け(強化版)',
      trigger: '問い合わせフォーム送信・メール受信',
      steps: [
        { name: '問い合わせ内容を分類', type: 'ai_classify' },
        { name: '一次回答を下書き', type: 'ai_draft' },
        { name: '担当者にアサイン', type: 'assign' },
      ],
    },
  },
  {
    keyword: '見積',
    id: 'auto-estimate-draft',
    title: '見積書ドラフト自動作成',
    description: '過去の見積実績と条件をもとに、見積書のドラフトを自動生成し確認だけで送付できる状態にします。',
    estimatedSavingMinutesPerWeek: 90,
    confidence: 0.74,
    pipelineTemplate: {
      name: '見積書自動ドラフト作成',
      trigger: '見積依頼の受信',
      steps: [
        { name: '見積条件を要約', type: 'ai_summarize' },
        { name: '見積書ドラフトを作成', type: 'ai_draft' },
        { name: '担当者に確認依頼', type: 'notify' },
      ],
    },
  },
  {
    keyword: '請求',
    id: 'auto-invoice-reminder',
    title: '請求書送付・督促の自動リマインド',
    description:
      '支払期日を超過した取引先を自動検知し、督促メールの下書き作成と通知を自動化してキャッシュフローの遅延リスクを低減します。',
    estimatedSavingMinutesPerWeek: 60,
    confidence: 0.79,
    pipelineTemplate: {
      name: '請求書督促自動リマインド',
      trigger: '支払期日超過の検知',
      steps: [
        { name: '未入金状況を要約', type: 'ai_summarize' },
        { name: '督促メールを下書き', type: 'ai_draft' },
        { name: '経理担当へ通知', type: 'notify' },
      ],
    },
  },
  {
    keyword: '障害',
    id: 'auto-incident-escalation',
    title: '障害一次対応の自動エスカレーション',
    description:
      '障害発生時に過去事例から類似障害を照合し、一次対応手順の提示とエスカレーション先への通知を自動化します。',
    estimatedSavingMinutesPerWeek: 120,
    confidence: 0.81,
    pipelineTemplate: {
      name: '障害一次対応自動エスカレーション',
      trigger: '監視アラート発報',
      steps: [
        { name: '障害内容を分類', type: 'ai_classify' },
        { name: '一次対応手順を要約', type: 'ai_summarize' },
        { name: 'エスカレーション先へ通知', type: 'notify' },
      ],
    },
  },
  {
    keyword: '採用',
    id: 'auto-candidate-screening',
    title: '応募者一次スクリーニング自動化',
    description: '応募書類の内容をAIが一次スクリーニングし、選考基準に沿った評価コメントを自動生成します。',
    estimatedSavingMinutesPerWeek: 150,
    confidence: 0.7,
    pipelineTemplate: {
      name: '応募者一次スクリーニング自動化',
      trigger: '応募フォーム送信',
      steps: [
        { name: '応募内容を要約', type: 'ai_summarize' },
        { name: '選考基準で分類', type: 'ai_classify' },
        { name: '人事担当へ通知', type: 'notify' },
      ],
    },
  },
  {
    keyword: '会議',
    id: 'auto-meeting-digest',
    title: '定例会議の議事録自動配布',
    description: '会議の録音・メモから議事録を自動生成し、決定事項とタスクを抽出して関係者に自動配布します。',
    estimatedSavingMinutesPerWeek: 40,
    confidence: 0.68,
    pipelineTemplate: {
      name: '議事録自動生成・配布',
      trigger: '会議終了',
      steps: [
        { name: '会議内容を要約', type: 'ai_summarize' },
        { name: '議事録ドラフトを作成', type: 'ai_draft' },
        { name: '関係者へ通知', type: 'notify' },
        { name: '議事録をアーカイブ', type: 'archive' },
      ],
    },
  },
];

export function discoverDemo(logs) {
  const text = logs && String(logs).trim() ? String(logs) : SAMPLE_LOGS;
  const matched = DISCOVERY_TEMPLATES.filter((t) => text.includes(t.keyword));
  const chosen = matched.length ? matched : DISCOVERY_TEMPLATES.slice(0, 3);
  return chosen.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    estimatedSavingMinutesPerWeek: t.estimatedSavingMinutesPerWeek,
    confidence: t.confidence,
    pipelineTemplate: t.pipelineTemplate,
  }));
}

// ---------------------------------------------------------------------------
// パイプラインのai_*ステップ実行(demoフォールバック)
// ---------------------------------------------------------------------------

function classify(text) {
  if (text.includes('見積')) return '見積依頼';
  if (text.includes('請求')) return '請求関連';
  if (text.includes('障害')) return '障害・不具合';
  if (text.includes('採用')) return '採用関連';
  if (text.includes('問い合わせ') || text.includes('質問')) return '問い合わせ';
  return '一般';
}

export function runStepDemo(stepType, stepName, input) {
  const snippet = truncate(input, 60);
  switch (stepType) {
    case 'ai_summarize':
      return `【要約】${stepName}: ${snippet || '入力内容'}の要点を整理し、主要な論点とネクストアクションを抽出しました。`;
    case 'ai_classify':
      return `【分類】${stepName}: 入力内容を「${classify(snippet)}」に分類しました。`;
    case 'ai_draft':
      return `【下書き】${stepName}: 「${snippet || 'ご連絡'}」への返信・報告ドラフトを作成しました。ご確認のうえご利用ください。`;
    default:
      return `${stepName}を実行しました。`;
  }
}
