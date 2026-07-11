'use strict';

/* ==========================================================================
   DX Copilot — フロントエンド SPA
   API契約は DESIGN.md を唯一の真実とする。全てのAPI応答文字列は
   textContent / escapeHtml を経由して挿入し、生データを innerHTML に
   渡さないこと(XSS対策)。
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------- Utilities ---------------------------- */

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatNumber(n) {
    return Math.round(n).toLocaleString('ja-JP');
  }

  function formatDateTime(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString('ja-JP', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return String(iso);
    }
  }

  function formatDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return '-';
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + '秒';
  }

  /* ---------------------------- Toast ---------------------------- */

  function toast(message, type) {
    const container = qs('#toastContainer');
    if (!container) return;
    const node = el('div', 'toast toast-' + (type || 'info'));
    node.textContent = message;
    container.appendChild(node);
    setTimeout(function () {
      node.classList.add('toast-out');
      setTimeout(function () { node.remove(); }, 220);
    }, 4200);
  }

  /* ---------------------------- API helper ---------------------------- */

  async function api(path, options) {
    options = options || {};
    let res;
    try {
      res = await fetch(path, Object.assign({
        headers: { 'Content-Type': 'application/json' }
      }, options));
    } catch (err) {
      toast('サーバーに接続できませんでした。バックエンドが起動しているか確認してください。', 'error');
      throw err;
    }

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }

    if (!res.ok) {
      const msg = (data && data.error) ? data.error : ('リクエストに失敗しました (' + res.status + ')');
      toast(msg, 'error');
      throw new Error(msg);
    }
    return data;
  }

  function post(path, body) {
    return api(path, { method: 'POST', body: JSON.stringify(body || {}) });
  }
  function get(path) {
    return api(path, { method: 'GET' });
  }

  /* ---------------------------- Count-up animation ---------------------------- */

  function animateNumber(node, target, opts) {
    opts = opts || {};
    const duration = opts.duration || 900;
    const decimals = opts.decimals || 0;
    const startTime = performance.now();
    const startVal = 0;
    if (!isFinite(target)) target = 0;

    function tick(now) {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = startVal + (target - startVal) * eased;
      node.textContent = decimals > 0 ? val.toFixed(decimals) : formatNumber(val);
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        node.textContent = decimals > 0 ? target.toFixed(decimals) : formatNumber(target);
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------- Router ---------------------------- */

  const ROUTES = ['dashboard', 'analyze', 'pipelines', 'discover'];
  const TITLES = {
    dashboard: 'ダッシュボード',
    analyze: 'AI分析',
    pipelines: '自動化パイプライン',
    discover: 'AI自動化発見'
  };

  const loadedOnce = {};

  function router() {
    let hash = (location.hash || '').replace('#', '');
    if (ROUTES.indexOf(hash) === -1) hash = 'dashboard';

    ROUTES.forEach(function (r) {
      const view = qs('#view-' + r);
      const navItem = qs('.nav-item[data-route="' + r + '"]');
      if (view) view.classList.toggle('active', r === hash);
      if (navItem) navItem.classList.toggle('active', r === hash);
    });

    qs('#viewTitle').textContent = TITLES[hash];

    if (hash === 'dashboard') loadDashboard();
    if (hash === 'pipelines') loadPipelines();
  }

  window.addEventListener('hashchange', router);

  /* ---------------------------- Health / mode badge ---------------------------- */

  async function loadHealth() {
    const badge = qs('#modeBadge');
    const text = qs('#modeBadgeText');
    try {
      const data = await get('/api/health');
      const mode = data && data.mode;
      badge.classList.remove('mode-badge-pending');
      if (mode === 'live') {
        badge.classList.add('mode-badge-live');
        badge.classList.remove('mode-badge-demo');
        text.textContent = 'Claude API接続中';
      } else {
        badge.classList.add('mode-badge-demo');
        badge.classList.remove('mode-badge-live');
        text.textContent = 'デモモード';
      }
    } catch (e) {
      badge.classList.remove('mode-badge-pending', 'mode-badge-live');
      badge.classList.add('mode-badge-demo');
      text.textContent = 'デモモード（オフライン）';
    }
  }

  /* ---------------------------- Dashboard ---------------------------- */

  function renderWeeklyChart(container, trend) {
    container.innerHTML = '';
    const values = Array.isArray(trend) && trend.length ? trend : [0, 0, 0, 0, 0, 0, 0];
    const days = ['月', '火', '水', '木', '金', '土', '日'];
    const max = Math.max.apply(null, values.concat([1]));

    const width = 520;
    const height = 180;
    const padding = 24;
    const barGap = 14;
    const n = values.length;
    const barWidth = (width - padding * 2 - barGap * (n - 1)) / n;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + (height + 24));
    svg.setAttribute('class', 'bar-chart-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');

    values.forEach(function (v, i) {
      const barH = max > 0 ? (v / max) * (height - 30) : 0;
      const x = padding + i * (barWidth + barGap);
      const y = height - barH;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x.toFixed(1));
      rect.setAttribute('y', height.toFixed(1));
      rect.setAttribute('width', barWidth.toFixed(1));
      rect.setAttribute('height', '0');
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', 'url(#dxBarGradient)');
      svg.appendChild(rect);

      requestAnimationFrame(function () {
        rect.style.transition = 'y 600ms cubic-bezier(0.4,0,0.2,1) ' + (i * 45) + 'ms, height 600ms cubic-bezier(0.4,0,0.2,1) ' + (i * 45) + 'ms';
        rect.setAttribute('y', y.toFixed(1));
        rect.setAttribute('height', Math.max(barH, 1).toFixed(1));
      });

      const valueLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      valueLabel.setAttribute('x', (x + barWidth / 2).toFixed(1));
      valueLabel.setAttribute('y', (y - 8).toFixed(1));
      valueLabel.setAttribute('text-anchor', 'middle');
      valueLabel.setAttribute('fill', '#9aa4bd');
      valueLabel.setAttribute('font-size', '10.5');
      valueLabel.textContent = String(v);
      svg.appendChild(valueLabel);

      const dayLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      dayLabel.setAttribute('x', (x + barWidth / 2).toFixed(1));
      dayLabel.setAttribute('y', (height + 18).toFixed(1));
      dayLabel.setAttribute('text-anchor', 'middle');
      dayLabel.setAttribute('fill', '#6b7590');
      dayLabel.setAttribute('font-size', '11');
      dayLabel.textContent = days[i] || '';
      svg.appendChild(dayLabel);
    });

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', 'dxBarGradient');
    gradient.setAttribute('x1', '0'); gradient.setAttribute('y1', '1');
    gradient.setAttribute('x2', '0'); gradient.setAttribute('y2', '0');
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', '#06b6d4');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', '#22d3ee');
    gradient.appendChild(stop1); gradient.appendChild(stop2);
    defs.appendChild(gradient);
    svg.insertBefore(defs, svg.firstChild);

    container.appendChild(svg);
  }

  function statusBadge(status) {
    const span = el('span', 'badge');
    if (status === 'success') {
      span.classList.add('badge-success');
      span.textContent = '成功';
    } else if (status === 'failed') {
      span.classList.add('badge-danger');
      span.textContent = '失敗';
    } else {
      span.classList.add('badge-neutral');
      span.textContent = String(status || '-');
    }
    return span;
  }

  function renderRunsTable(tbody, runs, pipelineNameMap) {
    tbody.innerHTML = '';
    if (!runs || !runs.length) {
      const tr = document.createElement('tr');
      const td = el('td', 'empty-row', '実行履歴がありません');
      td.colSpan = 5;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    runs.slice(0, 10).forEach(function (run) {
      const tr = document.createElement('tr');

      const nameTd = el('td', null, (pipelineNameMap && pipelineNameMap[run.pipelineId]) || run.pipelineId || '-');
      const startedTd = el('td', null, formatDateTime(run.startedAt));
      const durationTd = el('td', null, formatDuration(run.durationMs));
      const savedTd = el('td', null, (typeof run.savedMinutes === 'number' ? run.savedMinutes + '分' : '-'));
      const statusTd = document.createElement('td');
      statusTd.appendChild(statusBadge(run.status));

      tr.appendChild(nameTd);
      tr.appendChild(startedTd);
      tr.appendChild(durationTd);
      tr.appendChild(savedTd);
      tr.appendChild(statusTd);
      tbody.appendChild(tr);
    });
  }

  let pipelinesCache = [];

  async function loadDashboard() {
    try {
      const [metrics, runsData, pipelinesData] = await Promise.all([
        get('/api/metrics'),
        get('/api/runs'),
        get('/api/pipelines').catch(function () { return { pipelines: [] }; })
      ]);

      if (pipelinesData && pipelinesData.pipelines) pipelinesCache = pipelinesData.pipelines;
      const nameMap = {};
      pipelinesCache.forEach(function (p) { nameMap[p.id] = p.name; });

      animateNumber(qs('#metricSavedMinutes'), metrics.savedMinutes || 0);
      animateNumber(qs('#metricSavedCost'), metrics.savedCostYen || 0);
      animateNumber(qs('#metricTotalRuns'), metrics.totalRuns || 0);
      animateNumber(qs('#metricSuccessRate'), Math.round((metrics.successRate || 0) * (metrics.successRate <= 1 ? 100 : 1)));

      renderWeeklyChart(qs('#weeklyChart'), metrics.weeklyTrend);
      renderRunsTable(qs('#runsTableBody'), runsData.runs, nameMap);
    } catch (e) {
      // toast already shown by api()
      renderWeeklyChart(qs('#weeklyChart'), [0, 0, 0, 0, 0, 0, 0]);
      renderRunsTable(qs('#runsTableBody'), []);
    }
  }

  /* ---------------------------- AI分析 ---------------------------- */

  const SAMPLE_MINUTES = [
    '2026年7月10日 定例会議議事録',
    '出席者: 田中(営業部長)、佐藤(開発リーダー)、鈴木(カスタマーサクセス)、山本(経理)',
    '議題: 新規顧客A社への提案内容と請求書発行フローの見直しについて',
    '',
    '1. A社案件の進捗',
    '田中より、A社への見積書を本日提出済みとの報告。先方より来週金曜までに正式発注の意向を確認済み。契約金額は月額80万円、契約期間は12ヶ月を想定。',
    '',
    '2. サーバー障害の振り返り',
    '佐藤より、先週発生した本番環境の障害について報告。原因はDBコネクションプールの枯渇であり、応急対応は完了済みだが、恒久対策としてオートスケーリング設定の見直しが必要。対応期限は7月末。',
    '',
    '3. 請求書発行業務の課題',
    '山本より、月末の請求書発行作業に毎月20時間程度かかっており、手作業でのミスが月に2〜3件発生している課題が共有された。テンプレート化と自動チェックの導入を検討する。',
    '',
    '4. 採用計画',
    '鈴木より、カスタマーサクセス部門の増員について提案。来月から中途採用を1名開始する方向で合意。',
    '',
    '決定事項:',
    '- A社との契約書ドラフトを佐藤が来週水曜までに作成する',
    '- オートスケーリング設定の見直しを佐藤が7月31日までに完了する',
    '- 請求書発行フローの自動化検討を山本が中心に進め、来月の定例で提案する',
    '- カスタマーサクセスの中途採用を鈴木が来週から開始する',
    '',
    'リスク:',
    '- A社の正式発注が遅れた場合、今期の売上目標達成が困難になる可能性がある',
    '- オートスケーリング対応が遅れると、同様の障害が再発するリスクがある',
    '- 請求書発行の手作業ミスが是正されない場合、顧客からの信頼低下につながる可能性がある'
  ].join('\n');

  let lastAnalysisContext = '';

  function priorityBadge(priority) {
    const span = el('span', 'badge');
    const p = String(priority || '').toLowerCase();
    if (p === 'high' || p === '高') {
      span.classList.add('priority-high');
      span.textContent = '高';
    } else if (p === 'low' || p === '低') {
      span.classList.add('priority-low');
      span.textContent = '低';
    } else {
      span.classList.add('priority-medium');
      span.textContent = '中';
    }
    return span;
  }

  function sentimentInfo(sentiment) {
    if (sentiment === 'positive') return { text: 'ポジティブ', cls: 'sentiment-positive' };
    if (sentiment === 'negative') return { text: 'ネガティブ', cls: 'sentiment-negative' };
    return { text: 'ニュートラル', cls: 'sentiment-neutral' };
  }

  function renderAnalyzeResults(result) {
    qs('#resSummary').textContent = result.summary || '';

    const sentiment = sentimentInfo(result.sentiment);
    const sentimentEl = qs('#resSentiment');
    sentimentEl.className = 'badge ' + sentiment.cls;
    sentimentEl.textContent = sentiment.text;

    const decisionsEl = qs('#resDecisions');
    decisionsEl.innerHTML = '';
    (result.decisions || []).forEach(function (d) {
      decisionsEl.appendChild(el('li', null, d));
    });
    if (!result.decisions || !result.decisions.length) {
      decisionsEl.appendChild(el('li', null, '該当なし'));
    }

    const risksEl = qs('#resRisks');
    risksEl.innerHTML = '';
    (result.risks || []).forEach(function (r) {
      risksEl.appendChild(el('li', null, r));
    });
    if (!result.risks || !result.risks.length) {
      risksEl.appendChild(el('li', null, '該当なし'));
    }

    const tasksBody = qs('#resTasks');
    tasksBody.innerHTML = '';
    const tasks = result.tasks || [];
    if (!tasks.length) {
      const tr = document.createElement('tr');
      const td = el('td', 'empty-row', 'タスクが見つかりませんでした');
      td.colSpan = 4;
      tr.appendChild(td);
      tasksBody.appendChild(tr);
    } else {
      tasks.forEach(function (t) {
        const tr = document.createElement('tr');
        tr.appendChild(el('td', null, t.title || '-'));
        tr.appendChild(el('td', null, t.assignee || '-'));
        tr.appendChild(el('td', null, t.due || '-'));
        const priorityTd = document.createElement('td');
        priorityTd.appendChild(priorityBadge(t.priority));
        tr.appendChild(priorityTd);
        tasksBody.appendChild(tr);
      });
    }

    qs('#analyzeResults').classList.remove('hidden');
  }

  function buildAnalysisContextText(result) {
    const lines = [];
    lines.push('要約: ' + (result.summary || ''));
    if (result.decisions && result.decisions.length) {
      lines.push('決定事項: ' + result.decisions.join(' / '));
    }
    if (result.tasks && result.tasks.length) {
      lines.push('タスク: ' + result.tasks.map(function (t) {
        return (t.title || '') + '(担当:' + (t.assignee || '-') + ' 期限:' + (t.due || '-') + ' 優先度:' + (t.priority || '-') + ')';
      }).join(' / '));
    }
    if (result.risks && result.risks.length) {
      lines.push('リスク: ' + result.risks.join(' / '));
    }
    lines.push('センチメント: ' + (result.sentiment || 'neutral'));
    return lines.join('\n');
  }

  function initAnalyzeView() {
    qs('#btnLoadSample').addEventListener('click', function () {
      qs('#analyzeInput').value = SAMPLE_MINUTES;
    });

    qs('#btnAnalyze').addEventListener('click', async function () {
      const text = qs('#analyzeInput').value.trim();
      if (!text) {
        toast('分析するテキストを入力してください。', 'error');
        return;
      }
      const type = qs('#analyzeType').value;
      const btn = qs('#btnAnalyze');
      btn.disabled = true;
      qs('#analyzeLoading').classList.remove('hidden');
      qs('#analyzeResults').classList.add('hidden');

      try {
        const result = await post('/api/analyze', { text: text, type: type });
        renderAnalyzeResults(result);
        lastAnalysisContext = buildAnalysisContextText(result);
        toast('分析が完了しました。', 'success');
      } catch (e) {
        // toast already shown
      } finally {
        btn.disabled = false;
        qs('#analyzeLoading').classList.add('hidden');
      }
    });
  }

  /* ---------------------------- Chat ---------------------------- */

  let chatHistory = [];

  function appendChatMessage(role, content, pending) {
    const wrap = qs('#chatMessages');
    const bubble = el('div', 'chat-msg ' + (role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant') + (pending ? ' chat-msg-pending' : ''));
    bubble.textContent = content;
    wrap.appendChild(bubble);
    wrap.scrollTop = wrap.scrollHeight;
    return bubble;
  }

  function initChat() {
    async function sendChat() {
      const input = qs('#chatInput');
      const text = input.value.trim();
      if (!text) return;

      appendChatMessage('user', text);
      chatHistory.push({ role: 'user', content: text });
      input.value = '';

      const pendingBubble = appendChatMessage('assistant', '考えています...', true);
      qs('#btnChatSend').disabled = true;

      try {
        const data = await post('/api/chat', {
          messages: chatHistory,
          context: lastAnalysisContext || undefined
        });
        pendingBubble.textContent = data.reply || '';
        pendingBubble.classList.remove('chat-msg-pending');
        chatHistory.push({ role: 'assistant', content: data.reply || '' });
      } catch (e) {
        pendingBubble.remove();
        chatHistory.pop();
      } finally {
        qs('#btnChatSend').disabled = false;
      }
    }

    qs('#btnChatSend').addEventListener('click', sendChat);
    qs('#chatInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChat();
      }
    });
  }

  /* ---------------------------- パイプライン ---------------------------- */

  function buildFlowDiagram(steps) {
    const wrap = el('div', 'flow-diagram');
    (steps || []).forEach(function (step, i) {
      const stepEl = el('div', 'flow-step');
      stepEl.dataset.stepIndex = String(i);
      stepEl.appendChild(el('span', 'flow-step-name', step.name || step.type || ('ステップ' + (i + 1))));
      stepEl.appendChild(el('span', 'flow-step-status', ''));
      wrap.appendChild(stepEl);
      if (i < steps.length - 1) {
        wrap.appendChild(el('span', 'flow-arrow', '→'));
      }
    });
    return wrap;
  }

  function renderPipelineCard(pipeline) {
    const card = el('div', 'pipeline-card');
    card.dataset.pipelineId = pipeline.id;

    const header = el('div', 'pipeline-card-header');
    header.appendChild(el('h3', null, pipeline.name || '無題のパイプライン'));
    const runBtn = el('button', 'btn btn-primary btn-sm btn-run', '実行');
    runBtn.type = 'button';
    header.appendChild(runBtn);
    card.appendChild(header);

    if (pipeline.description) {
      card.appendChild(el('p', 'pipeline-desc', pipeline.description));
    }

    const triggerRow = el('div', 'pipeline-trigger');
    triggerRow.appendChild(el('span', 'tag', 'トリガー'));
    triggerRow.appendChild(document.createTextNode(pipeline.trigger || '-'));
    card.appendChild(triggerRow);

    const flow = buildFlowDiagram(pipeline.steps || []);
    card.appendChild(flow);

    const runLog = el('div', 'run-log hidden');
    card.appendChild(runLog);

    runBtn.addEventListener('click', function () {
      runPipeline(pipeline, card, runBtn);
    });

    return card;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function runPipeline(pipeline, card, runBtn) {
    runBtn.disabled = true;
    runBtn.textContent = '実行中...';

    const flowSteps = qsa('.flow-step', card);
    flowSteps.forEach(function (s) {
      s.classList.remove('active', 'done', 'failed');
      const status = qs('.flow-step-status', s);
      if (status) status.textContent = '';
    });

    const runLog = qs('.run-log', card);
    runLog.innerHTML = '';
    runLog.classList.add('hidden');

    try {
      const data = await post('/api/pipelines/' + encodeURIComponent(pipeline.id) + '/run', {});
      const run = data.run;
      const steps = run.steps || [];

      runLog.classList.remove('hidden');

      for (let i = 0; i < steps.length; i++) {
        const stepResult = steps[i];
        const stepEl = flowSteps[i];
        if (stepEl) stepEl.classList.add('active');
        await sleep(480);

        if (stepEl) {
          stepEl.classList.remove('active');
          stepEl.classList.add(stepResult.status === 'failed' ? 'failed' : 'done');
          const statusLabel = qs('.flow-step-status', stepEl);
          if (statusLabel) statusLabel.textContent = stepResult.status === 'failed' ? '失敗' : '完了';
        }

        const logItem = el('div', 'run-log-item');
        logItem.appendChild(el('span', 'rl-name', stepResult.name || ('ステップ' + (i + 1))));
        logItem.appendChild(el('span', null, stepResult.output || ''));
        runLog.appendChild(logItem);
      }

      if (run.status === 'success') {
        toast((run.savedMinutes || 0) + '分の作業を自動化しました', 'success');
      } else {
        toast('パイプラインの実行中にエラーが発生しました', 'error');
      }

      loadPipelineRuns();
    } catch (e) {
      // toast already shown by api()
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = '実行';
    }
  }

  async function loadPipelineRuns() {
    try {
      const runsData = await get('/api/runs');
      const nameMap = {};
      pipelinesCache.forEach(function (p) { nameMap[p.id] = p.name; });
      renderRunsTable(qs('#pipelineRunsBody'), runsData.runs, nameMap);
    } catch (e) {
      renderRunsTable(qs('#pipelineRunsBody'), []);
    }
  }

  async function loadPipelines() {
    const list = qs('#pipelinesList');
    try {
      const data = await get('/api/pipelines');
      pipelinesCache = data.pipelines || [];
      list.innerHTML = '';
      if (!pipelinesCache.length) {
        list.appendChild(el('p', 'empty-state', 'パイプラインがまだありません。「AI自動化発見」から作成できます。'));
      } else {
        pipelinesCache.forEach(function (p) {
          list.appendChild(renderPipelineCard(p));
        });
      }
      loadPipelineRuns();
    } catch (e) {
      list.innerHTML = '';
      list.appendChild(el('p', 'empty-state', 'パイプラインを読み込めませんでした。'));
    }
  }

  /* ---------------------------- AI自動化発見 ---------------------------- */

  function renderSuggestionCard(suggestion) {
    const card = el('div', 'suggestion-card');
    card.appendChild(el('h3', null, suggestion.title || '自動化の提案'));
    card.appendChild(el('p', 'suggestion-desc', suggestion.description || ''));

    const metricRow = el('div', 'suggestion-metric');
    const bigNum = el('span', 'big-num', String(suggestion.estimatedSavingMinutesPerWeek != null ? suggestion.estimatedSavingMinutesPerWeek : '-'));
    metricRow.appendChild(bigNum);
    metricRow.appendChild(el('span', 'big-num-label', '分/週 削減見込み'));
    card.appendChild(metricRow);

    const confidenceRow = el('div', 'confidence-row');
    const confidencePct = Math.round((suggestion.confidence || 0) * 100);
    const labelRow = el('div', 'confidence-label');
    labelRow.appendChild(el('span', null, 'AIの確信度'));
    labelRow.appendChild(el('span', null, confidencePct + '%'));
    confidenceRow.appendChild(labelRow);
    const barBg = el('div', 'confidence-bar-bg');
    const barFill = el('div', 'confidence-bar-fill');
    barBg.appendChild(barFill);
    confidenceRow.appendChild(barBg);
    card.appendChild(confidenceRow);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { barFill.style.width = confidencePct + '%'; });
    });

    const adoptBtn = el('button', 'btn btn-primary btn-adopt', 'このパイプラインを採用');
    adoptBtn.type = 'button';
    adoptBtn.addEventListener('click', async function () {
      adoptBtn.disabled = true;
      adoptBtn.textContent = '採用中...';
      try {
        await post('/api/discover/' + encodeURIComponent(suggestion.id) + '/adopt', {});
        adoptBtn.textContent = '採用済み';
        adoptBtn.classList.add('adopted');
        toast('パイプラインを採用しました。実行してみましょう。', 'success');
        setTimeout(function () {
          location.hash = '#pipelines';
        }, 700);
      } catch (e) {
        adoptBtn.disabled = false;
        adoptBtn.textContent = 'このパイプラインを採用';
      }
    });
    card.appendChild(adoptBtn);

    return card;
  }

  function initDiscoverView() {
    qs('#btnDiscover').addEventListener('click', async function () {
      const btn = qs('#btnDiscover');
      const loading = qs('#discoverLoading');
      const results = qs('#discoverResults');

      btn.disabled = true;
      loading.classList.remove('hidden');
      results.innerHTML = '';

      try {
        const data = await post('/api/discover', {});
        const suggestions = data.suggestions || [];
        if (!suggestions.length) {
          results.appendChild(el('p', 'empty-state', '自動化できそうな業務は見つかりませんでした。'));
        } else {
          suggestions.forEach(function (s) {
            results.appendChild(renderSuggestionCard(s));
          });
          toast(suggestions.length + '件の自動化候補を発見しました', 'success');
        }
      } catch (e) {
        // toast already shown
      } finally {
        btn.disabled = false;
        loading.classList.add('hidden');
      }
    });
  }

  /* ---------------------------- Init ---------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    initAnalyzeView();
    initChat();
    initDiscoverView();
    loadHealth();
    router();
  });

})();
