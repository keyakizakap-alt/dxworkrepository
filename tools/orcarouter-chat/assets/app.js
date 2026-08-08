/**
 * OrcaRouter 壁打ちボット
 *
 * 依存ゼロ。file:// でもそのまま動く。
 * 知識ベースは assets/kb.js（window.ORCA_KB）から読み込む。
 */
(function () {
  'use strict';

  const KB = window.ORCA_KB;
  const STORAGE_KEY = 'orca-chat-settings';
  const $ = (sel) => document.querySelector(sel);

  // ══ 設定 ═══════════════════════════════════════════════════

  const PROVIDER_DEFAULTS = {
    orcarouter: {
      baseUrl: 'https://api.orcarouter.ai/v1',
      model: 'orcarouter/auto',
      modelHint: 'orcarouter/auto を指定すると OrcaRouter がリクエストごとに最適なモデルを選びます。',
      keyPlaceholder: 'sk-orca-...'
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-5',
      modelHint: 'Anthropic Messages API を直接呼びます（ブラウザ直叩き用ヘッダを付与）。',
      keyPlaceholder: 'sk-ant-...'
    },
    'openai-compat': {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.5',
      modelHint: 'OpenAI 互換の /chat/completions を持つ任意のエンドポイントを指定できます。',
      keyPlaceholder: 'sk-...'
    }
  };

  const defaultSettings = () => ({
    provider: 'orcarouter',
    baseUrl: PROVIDER_DEFAULTS.orcarouter.baseUrl,
    apiKey: '',
    model: PROVIDER_DEFAULTS.orcarouter.model,
    temperature: 0.4,
    persist: true
  });

  let settings = loadSettings();

  function loadSettings() {
    const base = defaultSettings();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(base, JSON.parse(raw));
    } catch (_) {
      /* localStorage が使えない環境（file:// の一部ブラウザ等）では既定値のまま動かす */
    }
    return base;
  }

  function saveSettings() {
    try {
      const toStore = Object.assign({}, settings);
      if (!settings.persist) toStore.apiKey = '';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (_) { /* 保存できなくても動作は継続する */ }
  }

  // ══ 壁打ちモード ════════════════════════════════════════════

  const MODES = {
    review: {
      label: '導入検討の論点出し',
      desc: '自社に入れるべきかを詰めます。現状をヒアリングし、コスト・リスク・代替案を出して反論も返します。',
      prompt: `【モード：導入検討の論点出し】
ユーザーは OrcaRouter を自社に導入すべきか判断しようとしている。あなたの役割は追認ではなく壁打ち相手。
- まず現状を短く確認する（月間 LLM 支出、使っているモデルとプロバイダ、主なワークロード、品質要件、セキュリティ／コンプライアンス要件）。一度に聞くのは 3 つまで。
- 分かっている範囲で必ず「効きそうな理由」と「効かなさそうな理由」を両方出す。
- 削減効果の話をするときは、必ず自社ワークロードの定型／高度推論の比率に依存することを指摘する。
- 少なくとも 1 つは代替案（OpenRouter、LiteLLM 自前運用、各社直接契約の現状維持）に触れる。
- 最後に「次にやるべき具体的な一歩」を 1〜3 個、実行可能な粒度で示す。`,
      starters: [
        '月のLLM費用が約80万円。半分くらいはコード補完。導入する価値ある？',
        '入れない方がいい会社ってどんなケース？',
        'PoCで2週間検証するなら、何を測ればいい？'
      ]
    },
    cost: {
      label: 'コスト削減シミュレーション',
      desc: 'コスト試算タブの数字を前提に、その試算がどこまで信用できるかを一緒に詰めます。',
      prompt: `【モード：コスト削減シミュレーション】
コスト削減の試算を一緒に詰める。
- 数字を出すときは前提（定型／高度推論の比率、想定削減率、プラン費用）を必ず明示し、計算過程を省かない。
- 提供元の公表値（47〜71%）は「レンジの上限は上限であって期待値ではない」ことを毎回明確にする。
- 削減額だけでなく、移行工数・検証工数・運用の学習コストといった見えにくいコストも必ず挙げる。
- ユーザーが楽観的な前提を置いたら、保守的なシナリオも併記して差を見せる。`,
      starters: [
        '月$10,000で削減率47%だと年間どれくらい浮く？',
        '楽観・標準・保守の3シナリオで試算して',
        '削減額以外に見落としがちなコストは？'
      ]
    },
    memo: {
      label: '社内説明資料の壁打ち',
      desc: '稟議・上申用の説明文と、セキュリティやロックインなどの想定質問を一緒に作ります。',
      prompt: `【モード：社内説明資料の壁打ち】
稟議・上申用の説明を一緒に作る。
- 読み手（情報システム部門、経営層、法務、現場の開発者）を確認し、それに合わせた粒度で書く。
- 文章を書いたら、必ずセットで「想定される反対質問」を 3 つ以上出し、それぞれに回答案を付ける。想定質問には最低限、セキュリティ／データの取り扱い、ベンダーロックイン、EU AI 法を含むコンプライアンス、可用性と単一障害点、削減効果の根拠を含める。
- 数値を書くときは必ず出典と「ベンダー公表値である」旨を本文に残す。社内資料で独立検証済みのように見せない。`,
      starters: [
        '情シス向けの稟議文のドラフトを書いて',
        'セキュリティ部門から来そうな質問を洗い出して',
        '経営層向けに3行で要約すると？'
      ]
    },
    tech: {
      label: '技術検証の相談',
      desc: 'OpenAI 互換への移行手順、Dify / Cursor / Codex CLI / MCP 連携、OrcaRouter-Lite の自前ホストなど。',
      prompt: `【モード：技術検証の相談】
実装・検証まわりの相談に答える。
- 手順を示すときは、実際に打てるコマンドや設定値のレベルまで具体的に書く。
- 知識ベースに載っている設定値（Base URL、キーの接頭辞、モデル名、環境変数名）は正確に引用する。載っていない詳細は推測せず「公式ドキュメントで要確認」と明示する。
- 移行の話では必ずロールバック手段（base_url を戻す）と、切り戻し可能な段階的導入を提案する。
- 評価まわりでは、ゴールデンセットを用意して固定モデル運用と比較する方法に触れる。`,
      starters: [
        '既存のOpenAI SDKのコードから移行する手順は？',
        'OrcaRouter-Liteを自前ホストする場合の構成は？',
        'ルーティングで品質が落ちてないかどう検証する？'
      ]
    }
  };

  let currentMode = 'review';

  // ══ システムプロンプト ══════════════════════════════════════

  function kbAsText() {
    const L = [];
    const src = (arr) => (arr || []).map((s) => `${s.title} <${s.url}>`).join(' / ');

    L.push(`# OrcaRouter 知識ベース（最終更新: ${KB.meta.updatedAt}）`);
    L.push('');
    L.push('## この知識ベースの前提');
    KB.meta.researchNotes.forEach((n) => L.push(`- ${n}`));

    L.push('', '## 概要', KB.overview.summary);
    KB.overview.facts.forEach((f) => {
      L.push(`- **${f.label}**（確度: ${f.confidence}）: ${f.value}　出典: ${src(f.sources)}`);
    });

    L.push('', '## 機能');
    KB.features.forEach((f) => {
      L.push(`### ${f.name}（確度: ${f.confidence}）`);
      L.push(f.description);
      (f.details || []).forEach((d) => L.push(`- ${d}`));
      L.push(`出典: ${src(f.sources)}`);
    });

    L.push('', '## 料金', KB.pricing.summary);
    KB.pricing.plans.forEach((p) => {
      L.push(`- **${p.name}**（${p.price}）: ${p.includes.join('／')}　出典: ${src(p.sources)}`);
    });
    KB.pricing.notes.forEach((n) => {
      L.push(`- **${n.label}**（確度: ${n.confidence}）: ${n.value}　出典: ${src(n.sources)}`);
    });

    L.push('', '## ベンチマーク・コスト根拠');
    KB.benchmarks.forEach((b) => {
      L.push(`### ${b.name}（確度: ${b.confidence}）`);
      L.push(`結果: ${b.result}`);
      L.push(b.detail);
      L.push(`⚠ 注意: ${b.caveat}`);
      L.push(`出典: ${src(b.sources)}`);
    });

    L.push('', '## 活用事例');
    KB.useCases.forEach((u) => {
      L.push(`### ${u.title}［${u.category}］（確度: ${u.confidence}）`);
      L.push(u.body);
      L.push(`出典: ${src(u.sources)}`);
    });

    L.push('', '## 導入事例・連携（エコシステム採用）');
    KB.integrations.forEach((i) => {
      L.push(`### ${i.name}［${i.type}］（確度: ${i.confidence}）`);
      L.push(i.body);
      L.push(`設定方法: ${i.setup}`);
      L.push(`出典: ${src(i.sources)}`);
    });

    L.push('', `## OSS 版: ${KB.oss.name}（ライセンス: ${KB.oss.license}）`);
    L.push(KB.oss.summary);
    KB.oss.points.forEach((p) => L.push(`- ${p}`));
    L.push(`クイックスタート: ${KB.oss.quickstart}`);
    L.push(`出典: ${src(KB.oss.sources)}`);

    L.push('', '## 競合・代替案');
    KB.competitors.forEach((c) => {
      L.push(`### ${c.name}（確度: ${c.confidence}）`);
      L.push(`位置づけ: ${c.positioning}`);
      L.push(`違い: ${c.diff}`);
      L.push(`出典: ${src(c.sources)}`);
    });

    L.push('', '## 検討時の論点（壁打ちで必ず使う材料）');
    KB.considerations.forEach((c) => {
      L.push(`### ${c.topic} — ${c.question}`);
      L.push(c.body);
    });

    L.push('', '## 用語');
    KB.glossary.forEach((g) => L.push(`- **${g.term}**: ${g.desc}`));

    return L.join('\n');
  }

  const BASE_RULES = `あなたは OrcaRouter（アダプティブ LLM ルーティングの AI ゲートウェイ）の導入検討を支援する壁打ち相手です。
下記の知識ベースだけを事実の根拠として使ってください。

## 絶対に守るルール
1. 知識ベースに根拠がある事実を述べるときは、出典 URL を Markdown リンクで添える。
2. 知識ベースにない事柄は推測で埋めない。「知識ベースには収録されていないため、公式ドキュメントまたは提供元への確認が必要」と明示する。特に、個社名の顧客導入事例は公開情報で確認できていないので、あるかのように語らない。
3. confidence が vendor-claim または unverified の数値を使うときは、必ず「提供元の公表値であり独立検証されていない。自社ワークロードでの実測が必要」という趣旨の注記を添える。
4. 導入を無条件に推奨しない。メリットを述べたら、同じ回答の中で必ずトレードオフ・リスク・代替案（OpenRouter / LiteLLM 自前運用 / 各社直接契約）のいずれかに触れる。
5. ユーザーの前提が甘いと感じたら、遠慮せず指摘して質問を返す。相手の意見に同意することが目的ではない。
6. 日本語で、簡潔に。前置きや自己紹介は書かない。箇条書きと短い見出しを使い、結論から書く。
7. 数値を扱うときは計算過程を省かず、前提を明示する。

## 出力形式
Markdown。見出しは ### まで。長い回答でも本文は 600 字程度を目安にまとめ、必要なら「さらに詰めますか？」と次の論点を 1 つ提示して終える。`;

  function buildSystemPrompt() {
    return `${BASE_RULES}\n\n${MODES[currentMode].prompt}\n\n---\n\n${kbAsText()}`;
  }

  // ══ Markdown レンダリング（最小限） ══════════════════════════

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderInline(s) {
    return s
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // 裸の URL（既にリンク化された href="..." の中は避ける）
      .replace(/(^|[^"(>])((?:https?:\/\/)[^\s<)]+)/g,
        '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  }

  function renderMarkdown(md) {
    const lines = md.split('\n');
    const out = [];
    let inCode = false;
    let listType = null;
    let inQuote = false;

    const closeList = () => {
      if (listType) { out.push(`</${listType}>`); listType = null; }
    };
    const closeQuote = () => {
      if (inQuote) { out.push('</blockquote>'); inQuote = false; }
    };

    for (const raw of lines) {
      if (/^\s*```/.test(raw)) {
        closeList();
        closeQuote();
        out.push(inCode ? '</code></pre>' : '<pre><code>');
        inCode = !inCode;
        continue;
      }
      if (inCode) { out.push(escapeHtml(raw)); continue; }

      const quote = raw.match(/^\s*>\s?(.*)$/);
      if (quote) {
        closeList();
        if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
        if (quote[1].trim()) out.push(`<p>${renderInline(escapeHtml(quote[1]))}</p>`);
        continue;
      }
      closeQuote();

      const line = escapeHtml(raw);

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeList();
        out.push(`<h3>${renderInline(heading[2])}</h3>`);
        continue;
      }

      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${renderInline(ul[1])}</li>`);
        continue;
      }

      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ol) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${renderInline(ol[1])}</li>`);
        continue;
      }

      if (!line.trim()) { closeList(); continue; }

      closeList();
      out.push(`<p>${renderInline(line)}</p>`);
    }

    closeList();
    closeQuote();
    if (inCode) out.push('</code></pre>');
    return out.join('\n');
  }

  // ══ SSE パース（プロバイダ共通） ════════════════════════════

  /**
   * SSE レスポンスを読み、イベントごとに handleEvent(dataString) を呼ぶ。
   * handleEvent が 'done' を返したら読み取りを打ち切る。
   */
  async function readSSE(response, handleEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        const dataLines = chunk
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim());

        if (!dataLines.length) continue;
        const data = dataLines.join('\n');
        if (data === '[DONE]') return;
        if (handleEvent(data) === 'done') return;
      }
    }
  }

  async function assertOk(response) {
    if (response.ok) return;
    let detail = '';
    try { detail = (await response.text()).slice(0, 400); } catch (_) { /* 本文なし */ }
    const hints = {
      401: 'API キーが正しいか、設定画面で確認してください。',
      403: 'キーの権限か、CORS の制限が原因の可能性があります。中継サーバ（scripts/proxy.mjs）の利用を検討してください。',
      404: 'Base URL とモデル名を確認してください（末尾の /v1 の有無など）。',
      429: 'レート制限に達しています。少し待って再試行してください。'
    };
    const hint = hints[response.status] || '';
    throw new Error(`HTTP ${response.status} ${response.statusText}${hint ? '\n' + hint : ''}${detail ? '\n\n' + detail : ''}`);
  }

  // ══ プロバイダアダプタ ══════════════════════════════════════

  /** OpenAI 互換（OrcaRouter / OpenAI / ローカル LLM） */
  async function openaiCompatAdapter({ system, messages, signal, onDelta }) {
    const url = settings.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: settings.temperature,
        stream: true,
        messages: [{ role: 'system', content: system }, ...messages]
      })
    });
    await assertOk(res);

    await readSSE(res, (data) => {
      let json;
      try { json = JSON.parse(data); } catch (_) { return; }
      const delta = json.choices && json.choices[0] && json.choices[0].delta;
      if (delta && delta.content) onDelta(delta.content);
    });
  }

  /** Anthropic Messages API（ブラウザ直叩き） */
  async function anthropicAdapter({ system, messages, signal, onDelta }) {
    const url = settings.baseUrl.replace(/\/+$/, '') + '/v1/messages';
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        // ブラウザから直接 Anthropic API を呼ぶために必要
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 2048,
        temperature: settings.temperature,
        stream: true,
        system,
        messages
      })
    });
    await assertOk(res);

    await readSSE(res, (data) => {
      let json;
      try { json = JSON.parse(data); } catch (_) { return; }
      if (json.type === 'content_block_delta' && json.delta && json.delta.text) {
        onDelta(json.delta.text);
      }
      if (json.type === 'message_stop') return 'done';
    });
  }

  function currentAdapter() {
    return settings.provider === 'anthropic' ? anthropicAdapter : openaiCompatAdapter;
  }

  // ══ オフライン検索モード（API キー未設定時） ════════════════

  /** 知識ベースを平坦化して検索可能なレコード列にする */
  function flattenKB() {
    const recs = [];
    const add = (section, title, text, sources, confidence) =>
      recs.push({ section, title, text, sources: sources || [], confidence: confidence || 'unverified' });

    add('概要', 'OrcaRouter とは', KB.overview.summary, [], 'official');
    KB.overview.facts.forEach((f) => add('概要', f.label, f.value, f.sources, f.confidence));
    KB.features.forEach((f) =>
      add('機能', f.name, [f.description].concat(f.details || []).join('\n'), f.sources, f.confidence));
    add('料金', '料金の考え方', KB.pricing.summary, [], 'official');
    KB.pricing.plans.forEach((p) =>
      add('料金', `${p.name}（${p.price}）`, p.includes.join('\n'), p.sources, p.confidence));
    KB.pricing.notes.forEach((n) => add('料金', n.label, n.value, n.sources, n.confidence));
    KB.benchmarks.forEach((b) =>
      add('ベンチマーク', b.name, `${b.result}\n${b.detail}\n⚠ ${b.caveat}`, b.sources, b.confidence));
    KB.useCases.forEach((u) => add('活用事例', u.title, u.body, u.sources, u.confidence));
    KB.integrations.forEach((i) =>
      add('導入事例・連携', i.name, `${i.body}\n設定: ${i.setup}`, i.sources, i.confidence));
    add('OSS', KB.oss.name,
      [KB.oss.summary].concat(KB.oss.points, [`クイックスタート: ${KB.oss.quickstart}`]).join('\n'),
      KB.oss.sources, KB.oss.confidence);
    KB.competitors.forEach((c) =>
      add('競合・代替案', c.name, `${c.positioning}\n${c.diff}`, c.sources, c.confidence));
    KB.considerations.forEach((c) => add('検討論点', `${c.topic}：${c.question}`, c.body, [], 'unverified'));
    KB.glossary.forEach((g) => add('用語', g.term, g.desc, [], 'unverified'));
    return recs;
  }

  const KB_RECORDS = flattenKB();

  // 「ー」（長音符）は語の一部なので区切り文字に含めない（サーバー / ルーター が壊れるため）
  const PUNCT = /[\s、。，．,.!?！？「」『』（）()［］\[\]:：;；~〜・"'`＝=]+/g;

  /**
   * 検索語をトークンに分解する。
   * 日本語は分かち書きされないため、CJK を含む断片は文字 2-gram に展開する。
   * （「料金プランは？」→ 料金 / 金プ / プラ / ラン / ンは）
   */
  function tokenize(query) {
    const tokens = new Set();
    for (const seg of query.toLowerCase().replace(PUNCT, ' ').split(' ')) {
      if (!seg) continue;
      if (/^[\x20-\x7e]+$/.test(seg)) {
        // 半角英数字（api、mcp、dify など）は 1 語として扱う
        if (seg.length >= 2) tokens.add(seg);
      } else if (seg.length === 1) {
        tokens.add(seg);
      } else {
        for (let i = 0; i + 2 <= seg.length; i++) tokens.add(seg.slice(i, i + 2));
      }
    }
    return [...tokens];
  }

  // 検索用にあらかじめ小文字化したフィールドを持たせておく
  const SEARCH_INDEX = KB_RECORDS.map((r) => ({
    rec: r,
    title: r.title.toLowerCase(),
    section: r.section.toLowerCase(),
    text: r.text.toLowerCase()
  }));

  /**
   * 語の希少性（IDF）で重み付けして検索する。
   * 2-gram はどうしても「機能」「につ」のようなありふれた断片を含むため、
   * 単純な出現回数だと無関係な項目が上位に来る。多くの項目に出る語ほど重みを下げる。
   */
  function searchKB(query, limit) {
    const terms = tokenize(query);
    if (!terms.length) return [];

    const N = SEARCH_INDEX.length;
    const idf = new Map();
    terms.forEach((t) => {
      const df = SEARCH_INDEX.reduce(
        (n, e) => n + (e.title.includes(t) || e.section.includes(t) || e.text.includes(t) ? 1 : 0), 0);
      idf.set(t, Math.log(N / (1 + df)));
    });

    // 2-gram はノイズを含むため、断片的な一致だけの項目は落とす。
    // 見出しに希少語が 1 つ当たれば概ね 8 前後になるので、その半分程度を下限にする。
    const MIN_SCORE = 4.0;

    return SEARCH_INDEX
      .map((e) => {
        let score = 0;
        terms.forEach((t) => {
          const w = idf.get(t);
          if (w <= 0) return;
          if (e.title.includes(t)) score += w * 3;
          if (e.section.includes(t)) score += w * 2;
          if (e.text.includes(t)) score += w;
        });
        return { rec: e.rec, score };
      })
      .filter((x) => x.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 4)
      .map((x) => x.rec);
  }

  function offlineAnswer(query) {
    const hits = searchKB(query, 3);
    const head =
      '> **オフライン検索モードで応答しています。** API キーが未設定のため、LLM ではなくキーワード検索で知識ベースの関連項目を上位 3 件返しています。' +
      '質問に直接答えているとは限りません。壁打ち（対話的な議論）を行うには、右上の「設定」から API キーを登録してください。\n\n';

    if (!hits.length) {
      return head +
        `「${query}」に一致する項目は知識ベースに見つかりませんでした。\n\n` +
        '**収録されているトピック**\n' +
        [...new Set(KB_RECORDS.map((r) => r.section))].map((s) => `- ${s}`).join('\n');
    }

    return head + hits.map((r) => {
      const srcs = r.sources.length
        ? '\n\n出典: ' + r.sources.map((s) => `[${s.title}](${s.url})`).join(' / ')
        : '';
      return `### ${r.title}\n（${r.section} / 確度: ${r.confidence}）\n\n${r.text}${srcs}`;
    }).join('\n\n---\n\n');
  }

  // ══ チャット ════════════════════════════════════════════════

  const history = [];   // { role, content } の配列（system は含まない）
  let controller = null;

  const messagesEl = $('#messages');

  function addMessage(role, content, opts) {
    const el = document.createElement('div');
    el.className = 'msg ' + (role === 'user' ? 'msg-user' : (opts && opts.error ? 'msg-error' : 'msg-bot'));

    if (role === 'user') {
      el.textContent = content;
    } else {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = opts && opts.error ? 'エラー' : (opts && opts.label) || 'アシスタント';
      const body = document.createElement('div');
      body.className = 'msg-body';
      body.innerHTML = renderMarkdown(content);
      el.append(meta, body);
    }

    messagesEl.append(el);
    el.scrollIntoView({ block: 'end', behavior: 'smooth' });
    return el;
  }

  function setBusy(busy) {
    $('#btn-send').disabled = busy;
    $('#btn-stop').hidden = !busy;
    $('#input').disabled = busy;
  }

  async function send(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    $('#starters').hidden = true;
    addMessage('user', trimmed);
    $('#input').value = '';
    history.push({ role: 'user', content: trimmed });

    // API キーがなければオフライン検索で返す
    if (!settings.apiKey) {
      const answer = offlineAnswer(trimmed);
      addMessage('assistant', answer, { label: 'オフライン検索' });
      history.push({ role: 'assistant', content: answer });
      return;
    }

    setBusy(true);
    controller = new AbortController();

    const el = addMessage('assistant', '', { label: modelLabel() });
    const bodyEl = el.querySelector('.msg-body');
    bodyEl.classList.add('cursor-blink');

    let acc = '';
    try {
      await currentAdapter()({
        system: buildSystemPrompt(),
        messages: history,
        signal: controller.signal,
        onDelta: (chunk) => {
          acc += chunk;
          bodyEl.innerHTML = renderMarkdown(acc);
          el.scrollIntoView({ block: 'end' });
        }
      });
      bodyEl.classList.remove('cursor-blink');

      if (acc) {
        history.push({ role: 'assistant', content: acc });
      } else {
        bodyEl.innerHTML = renderMarkdown('_（応答が空でした。モデル名と Base URL を確認してください）_');
      }
    } catch (err) {
      bodyEl.classList.remove('cursor-blink');
      history.pop();  // 失敗したユーザー発言は履歴に残さない

      if (err.name === 'AbortError') {
        el.remove();
        if (acc) addMessage('assistant', acc + '\n\n_（停止しました）_', { label: modelLabel() });
      } else {
        el.remove();
        const isNetwork = err instanceof TypeError;
        addMessage('assistant',
          `${err.message}\n\n` +
          (isNetwork
            ? 'ネットワークまたは CORS で失敗した可能性があります。ブラウザの開発者ツールのコンソールを確認し、'
              + 'CORS が原因であれば `node tools/orcarouter-chat/scripts/proxy.mjs` を起動して '
              + 'Base URL を `http://localhost:8787/v1` に変更してください。'
            : '設定を確認して再送信してください。'),
          { error: true });
      }
    } finally {
      setBusy(false);
      controller = null;
    }
  }

  function modelLabel() {
    return `${settings.provider} · ${settings.model}`;
  }

  // ══ 知識ベースタブ ══════════════════════════════════════════

  function confBadge(conf) {
    const labels = {
      official: '公式',
      'press-release': 'プレスリリース',
      'vendor-claim': 'ベンダー公表値',
      'third-party': '第三者',
      unverified: '要一次確認'
    };
    return `<span class="conf conf-${conf}">${labels[conf] || conf}</span>`;
  }

  function sourceList(sources) {
    if (!sources || !sources.length) return '';
    return '<div class="kb-sources">出典:<ul>' + sources.map((s) =>
      `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></li>`
    ).join('') + '</ul></div>';
  }

  function renderKB(filter) {
    const q = (filter || '').trim().toLowerCase();
    const container = $('#kb-body');
    const groups = new Map();

    KB_RECORDS.forEach((r) => {
      const hay = `${r.section}\n${r.title}\n${r.text}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      if (!groups.has(r.section)) groups.set(r.section, []);
      groups.get(r.section).push(r);
    });

    const shown = [...groups.values()].reduce((n, g) => n + g.length, 0);
    $('#kb-count').textContent = q
      ? `${shown} 件 / 全 ${KB_RECORDS.length} 件`
      : `全 ${KB_RECORDS.length} 件`;

    if (!shown) {
      container.innerHTML = '<p class="kb-empty">一致する項目がありません。</p>';
      return;
    }

    container.innerHTML = [...groups.entries()].map(([section, recs]) => `
      <div class="kb-section">
        <h2>${escapeHtml(section)}</h2>
        ${recs.map((r) => `
          <div class="kb-card">
            <h3>${escapeHtml(r.title)}${confBadge(r.confidence)}</h3>
            ${r.text.split('\n').filter(Boolean).map((line) => `<p>${renderInline(escapeHtml(line))}</p>`).join('')}
            ${sourceList(r.sources)}
          </div>`).join('')}
      </div>`).join('');
  }

  // ══ コスト試算 ══════════════════════════════════════════════

  const TEAM_PLAN_USD_PER_MONTH = 499;
  const USD_JPY_ASSUMPTION = 150;   // 円建て入力時に Team プラン費用を換算するための想定レート

  function fmtMoney(v, currency) {
    const rounded = Math.round(v);
    return currency === 'jpy'
      ? '¥' + rounded.toLocaleString('ja-JP')
      : '$' + rounded.toLocaleString('en-US');
  }

  function recalc() {
    const currency = $('#calc-currency').value;
    const spend = Number($('#calc-spend').value) || 0;
    const rate = Number($('#calc-rate').value) / 100;
    const routine = Number($('#calc-routine').value);
    const useTeam = $('#calc-team').checked;

    $('#calc-rate-out').textContent = Math.round(rate * 100);
    $('#calc-routine-out').textContent = routine;

    const monthlySaving = spend * rate;
    const yearlySaving = monthlySaving * 12;
    const planMonthly = useTeam
      ? (currency === 'jpy' ? TEAM_PLAN_USD_PER_MONTH * USD_JPY_ASSUMPTION : TEAM_PLAN_USD_PER_MONTH)
      : 0;
    const netYearly = yearlySaving - planMonthly * 12;

    $('#out-monthly').textContent = fmtMoney(monthlySaving, currency);
    $('#out-yearly').textContent = fmtMoney(yearlySaving, currency);
    $('#out-net').textContent = fmtMoney(netYearly, currency);

    let payback = '—';
    if (planMonthly === 0) {
      payback = monthlySaving > 0 ? '即時（プラン費用なし）' : '—';
    } else if (monthlySaving > planMonthly) {
      const days = (planMonthly / monthlySaving) * 30;
      payback = days < 1 ? '1 日未満' : `約 ${days.toFixed(1)} 日`;
    } else if (monthlySaving > 0) {
      payback = '回収不能（削減額 < プラン費用）';
    }
    $('#out-payback').textContent = payback;

    const notes = [
      `前提：月額支出 ${fmtMoney(spend, currency)}、削減率 ${Math.round(rate * 100)}%、定型タスク比率 ${routine}%`,
      useTeam ? `Team プラン ${fmtMoney(planMonthly, currency)}/月を控除` : 'プラン費用は控除していません（Free プラン想定）'
    ];
    if (useTeam && currency === 'jpy') {
      notes.push(`※ Team プランは $499/月。円換算は 1ドル=${USD_JPY_ASSUMPTION}円 と仮定`);
    }
    notes.push('※ 移行工数・検証工数・運用の学習コストは含みません');
    $('#out-note').textContent = notes.join(' / ');
  }

  function calcToChat() {
    const currency = $('#calc-currency').value;
    const spend = Number($('#calc-spend').value) || 0;
    const rate = Number($('#calc-rate').value);
    const routine = Number($('#calc-routine').value);
    const useTeam = $('#calc-team').checked;

    switchTab('chat');
    setMode('cost');
    $('#input').value =
      `コスト試算の前提を共有します。この試算の妥当性を一緒に詰めてください。\n` +
      `- 月額LLM支出: ${fmtMoney(spend, currency)}\n` +
      `- 定型タスクの比率: ${routine}%\n` +
      `- 想定削減率: ${rate}%\n` +
      `- Teamプラン($499/月)の費用: ${useTeam ? '考慮する' : '考慮しない（Freeプラン想定）'}\n\n` +
      `この前提は妥当ですか？楽観的すぎる点があれば指摘してください。`;
    $('#input').focus();
  }

  // ══ 会話の書き出し ══════════════════════════════════════════

  function exportConversation() {
    if (!history.length) {
      alert('書き出す会話がまだありません。');
      return;
    }
    const md = [
      `# OrcaRouter 壁打ちメモ`,
      ``,
      `- 日時: ${new Date().toLocaleString('ja-JP')}`,
      `- モード: ${MODES[currentMode].label}`,
      `- モデル: ${settings.apiKey ? modelLabel() : 'オフライン検索モード（LLM未使用）'}`,
      `- 知識ベース最終更新: ${KB.meta.updatedAt}`,
      ``,
      `> 本メモ中の数値には提供元の公表値が含まれます。導入判断の前に一次情報と PoC 実測で確認してください。`,
      ``,
      `---`,
      ``,
      ...history.map((m) => `## ${m.role === 'user' ? '質問' : '回答'}\n\n${m.content}\n`)
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orcarouter-hearing-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(md).catch(() => { /* クリップボード不可でもDLは成功している */ });
    }
  }

  // ══ UI 配線 ════════════════════════════════════════════════

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('is-active', p.id === `panel-${name}`);
    });
  }

  function setMode(name) {
    currentMode = name;
    document.querySelectorAll('.mode-chip').forEach((c) => {
      c.classList.toggle('is-active', c.dataset.mode === name);
    });
    $('#mode-desc').textContent = MODES[name].desc;
    renderStarters();
  }

  function renderStarters() {
    const box = $('#starters');
    box.innerHTML = '';
    MODES[currentMode].starters.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'starter';
      b.textContent = s;
      b.addEventListener('click', () => send(s));
      box.append(b);
    });
    box.hidden = history.length > 0;
  }

  function updateConnBadge() {
    const badge = $('#conn-badge');
    if (settings.apiKey) {
      badge.className = 'badge badge-ok';
      badge.textContent = modelLabel();
    } else {
      badge.className = 'badge badge-warn';
      badge.textContent = 'APIキー未設定（オフライン検索）';
    }
    $('#composer-hint').textContent = settings.apiKey
      ? `モード: ${MODES[currentMode].label}`
      : 'APIキーが未設定です。知識ベースの検索結果のみ返します。';
  }

  function openSettings() {
    $('#set-provider').value = settings.provider;
    $('#set-baseurl').value = settings.baseUrl;
    $('#set-apikey').value = settings.apiKey;
    $('#set-model').value = settings.model;
    $('#set-temp').value = settings.temperature;
    $('#set-temp-out').textContent = settings.temperature;
    $('#set-persist').checked = settings.persist;
    $('#set-model-hint').textContent = PROVIDER_DEFAULTS[settings.provider].modelHint;
    $('#settings').showModal();
  }

  function init() {
    // モードチップ
    const bar = $('#modebar');
    Object.entries(MODES).forEach(([key, m]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-chip';
      b.dataset.mode = key;
      b.textContent = m.label;
      b.addEventListener('click', () => { setMode(key); updateConnBadge(); });
      bar.append(b);
    });
    setMode(currentMode);

    // タブ
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => switchTab(t.dataset.tab));
    });

    // 知識ベース
    $('#kb-notes').innerHTML =
      '<strong>この知識ベースの前提</strong><ul>' +
      KB.meta.researchNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('') +
      `</ul><span class="hint">最終更新: ${KB.meta.updatedAt}</span>`;
    renderKB('');
    $('#kb-search').addEventListener('input', (e) => renderKB(e.target.value));

    // 送信
    $('#composer').addEventListener('submit', (e) => {
      e.preventDefault();
      send($('#input').value);
    });
    $('#input').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        send($('#input').value);
      }
    });
    $('#btn-stop').addEventListener('click', () => controller && controller.abort());
    $('#btn-export').addEventListener('click', exportConversation);

    // コスト試算
    ['#calc-spend', '#calc-currency', '#calc-rate', '#calc-routine', '#calc-team']
      .forEach((sel) => $(sel).addEventListener('input', recalc));
    $('#btn-to-chat').addEventListener('click', calcToChat);
    recalc();

    // 設定
    $('#btn-settings').addEventListener('click', openSettings);
    $('#set-provider').addEventListener('change', (e) => {
      const d = PROVIDER_DEFAULTS[e.target.value];
      $('#set-baseurl').value = d.baseUrl;
      $('#set-model').value = d.model;
      $('#set-apikey').placeholder = d.keyPlaceholder;
      $('#set-model-hint').textContent = d.modelHint;
    });
    $('#set-temp').addEventListener('input', (e) => {
      $('#set-temp-out').textContent = e.target.value;
    });
    $('#btn-save-settings').addEventListener('click', () => {
      settings.provider = $('#set-provider').value;
      settings.baseUrl = $('#set-baseurl').value.trim() || PROVIDER_DEFAULTS[settings.provider].baseUrl;
      settings.apiKey = $('#set-apikey').value.trim();
      settings.model = $('#set-model').value.trim() || PROVIDER_DEFAULTS[settings.provider].model;
      settings.temperature = Number($('#set-temp').value);
      settings.persist = $('#set-persist').checked;
      saveSettings();
      updateConnBadge();
      $('#settings').close();
    });
    $('#btn-clear-key').addEventListener('click', () => {
      settings.apiKey = '';
      $('#set-apikey').value = '';
      saveSettings();
      updateConnBadge();
    });

    updateConnBadge();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
