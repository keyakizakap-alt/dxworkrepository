/* MemoFlow - application shell: sidebar, search, import / export */
(function (global) {
  'use strict';

  var U = global.Util;
  var S = global.Store;
  var C = global.Convert;
  var E = global.Editor;

  var LAST_PAGE_KEY = 'memoflow.lastPage';
  var THEME_KEY = 'memoflow.theme';
  var SIDEBAR_KEY = 'memoflow.sidebar';

  var currentId = null;
  var dom = {};
  var pageDragId = null;

  /* ---------------- boot ---------------- */

  function init() {
    dom = {
      app: document.getElementById('app'),
      sidebar: document.getElementById('sidebar'),
      tree: document.getElementById('page-tree'),
      favorites: document.getElementById('favorite-list'),
      favSection: document.getElementById('favorite-section'),
      trashList: document.getElementById('trash-list'),
      trashSection: document.getElementById('trash-section'),
      sidebarSearch: document.getElementById('sidebar-search'),
      editor: document.getElementById('editor'),
      titleInput: document.getElementById('page-title'),
      iconBtn: document.getElementById('page-icon'),
      breadcrumb: document.getElementById('breadcrumb'),
      meta: document.getElementById('page-meta'),
      empty: document.getElementById('empty-state'),
      doc: document.getElementById('document'),
      stats: document.getElementById('workspace-stats'),
      quick: document.getElementById('quick-switcher'),
      quickInput: document.getElementById('quick-input'),
      quickResults: document.getElementById('quick-results'),
      exportDialog: document.getElementById('export-dialog'),
      importDialog: document.getElementById('import-dialog'),
      fileInput: document.getElementById('file-input'),
      importText: document.getElementById('import-text'),
      dropzone: document.getElementById('dropzone')
    };

    S.load();
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');
    if (localStorage.getItem(SIDEBAR_KEY) === 'closed') dom.app.classList.add('sidebar-closed');

    S.subscribe(function () { renderSidebar(); renderStats(); });

    bindChrome();
    bindDialogs();
    bindShortcuts();
    bindDropzone();

    renderSidebar();
    renderStats();

    var last = localStorage.getItem(LAST_PAGE_KEY);
    var first = S.alive()[0];
    openPage(last && S.get(last) && !S.get(last).deletedAt ? last : (first ? first.id : null));
  }

  /* ---------------- chrome ---------------- */

  function bindChrome() {
    document.getElementById('btn-new-page').addEventListener('click', function () {
      var p = S.createPage(null);
      openPage(p.id);
      dom.titleInput.focus();
    });
    document.getElementById('btn-toggle-sidebar').addEventListener('click', toggleSidebar);
    document.getElementById('btn-sidebar-close').addEventListener('click', toggleSidebar);
    document.getElementById('btn-theme').addEventListener('click', function () {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    document.getElementById('btn-search').addEventListener('click', openQuickSwitcher);
    document.getElementById('btn-export').addEventListener('click', openExport);
    document.getElementById('btn-import').addEventListener('click', openImport);
    document.getElementById('btn-print').addEventListener('click', function () { global.print(); });

    document.getElementById('btn-page-menu').addEventListener('click', togglePageMenu);
    document.getElementById('btn-favorite').addEventListener('click', function () {
      var p = S.get(currentId);
      if (!p) return;
      S.updatePage(p.id, { favorite: !p.favorite });
      renderSidebar(); renderHeader();
      U.toast(p.favorite ? 'お気に入りに追加しました' : 'お気に入りから外しました');
    });
    document.getElementById('btn-add-subpage').addEventListener('click', function () {
      if (!currentId) return;
      var p = S.createPage(currentId);
      openPage(p.id);
      dom.titleInput.focus();
    });
    document.getElementById('btn-delete-page').addEventListener('click', function () {
      var p = S.get(currentId);
      if (!p) return;
      var kids = S.descendants(p.id).filter(function (x) { return !x.deletedAt; }).length;
      var msg = 'このページ' + (kids ? 'と子ページ ' + kids + ' 件' : '') + 'をゴミ箱に移動します。よろしいですか？';
      if (!global.confirm(msg)) return;
      S.trashPage(p.id);
      var next = S.alive()[0];
      openPage(next ? next.id : null);
      U.toast('ゴミ箱に移動しました');
    });

    dom.titleInput.addEventListener('input', function () {
      if (!currentId) return;
      S.updatePage(currentId, { title: dom.titleInput.value });
      renderSidebar(); renderMeta();
    });
    dom.titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); E.focusFirst(); }
    });
    dom.iconBtn.addEventListener('click', function () {
      var p = S.get(currentId);
      if (!p) return;
      var next = global.prompt('ページのアイコン（絵文字1文字）', p.icon || '📄');
      if (next == null) return;
      S.updatePage(p.id, { icon: next.trim().slice(0, 4) || '📄' });
      renderHeader(); renderSidebar();
    });

    dom.sidebarSearch.addEventListener('input', function () { renderSidebar(); });

    document.getElementById('btn-empty-trash').addEventListener('click', function () {
      if (!S.trashed().length) return;
      if (!global.confirm('ゴミ箱を空にします。この操作は取り消せません。よろしいですか？')) return;
      S.emptyTrash();
      U.toast('ゴミ箱を空にしました');
    });

    document.getElementById('btn-start-page').addEventListener('click', function () {
      var p = S.createPage(null, { title: '' });
      openPage(p.id);
      dom.titleInput.focus();
    });

    document.addEventListener('mousedown', function (e) {
      var menu = document.getElementById('page-menu');
      if (menu && menu.classList.contains('open') &&
        !menu.contains(e.target) && e.target.id !== 'btn-page-menu') {
        menu.classList.remove('open');
      }
    });
  }

  function togglePageMenu() {
    var menu = document.getElementById('page-menu');
    menu.classList.toggle('open');
  }

  function toggleSidebar() {
    dom.app.classList.toggle('sidebar-closed');
    localStorage.setItem(SIDEBAR_KEY,
      dom.app.classList.contains('sidebar-closed') ? 'closed' : 'open');
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    var btn = document.getElementById('btn-theme');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  /* ---------------- sidebar ---------------- */

  function renderSidebar() {
    var q = (dom.sidebarSearch.value || '').trim().toLowerCase();
    dom.tree.innerHTML = '';

    if (q) {
      var results = S.search(q);
      if (!results.length) {
        dom.tree.appendChild(U.el('div', { class: 'sidebar-empty', text: '一致するページがありません' }));
      }
      results.forEach(function (r) {
        dom.tree.appendChild(pageRow(r.page, 0, true));
      });
    } else {
      buildTree(null, 0, dom.tree);
      if (!S.alive().length) {
        dom.tree.appendChild(U.el('div', { class: 'sidebar-empty', text: 'ページがありません' }));
      }
    }

    var favs = S.alive().filter(function (p) { return p.favorite; });
    dom.favorites.innerHTML = '';
    dom.favSection.hidden = !favs.length;
    favs.forEach(function (p) { dom.favorites.appendChild(pageRow(p, 0, true)); });

    var trash = S.trashed();
    dom.trashList.innerHTML = '';
    dom.trashSection.hidden = !trash.length;
    trash.forEach(function (p) {
      var row = U.el('div', { class: 'tree-row trash-row' }, [
        U.el('span', { class: 'tree-icon', text: p.icon || '📄' }),
        U.el('span', { class: 'tree-label', text: S.pageTitle(p) }),
        U.el('button', {
          class: 'tree-action', type: 'button', title: '復元', text: '↩',
          onclick: function (e) { e.stopPropagation(); S.restorePage(p.id); U.toast('復元しました'); }
        }),
        U.el('button', {
          class: 'tree-action danger', type: 'button', title: '完全に削除', text: '✕',
          onclick: function (e) {
            e.stopPropagation();
            if (!global.confirm('「' + S.pageTitle(p) + '」を完全に削除します。よろしいですか？')) return;
            S.deleteForever(p.id);
          }
        })
      ]);
      dom.trashList.appendChild(row);
    });
  }

  function buildTree(parentId, depth, container) {
    S.children(parentId).forEach(function (p) {
      var kids = S.children(p.id);
      var row = pageRow(p, depth, false, kids.length > 0);
      container.appendChild(row);
      if (kids.length && !p.collapsed) buildTree(p.id, depth + 1, container);
    });
  }

  function pageRow(p, depth, flat, hasKids) {
    var row = U.el('div', {
      class: 'tree-row' + (p.id === currentId ? ' active' : ''),
      'data-id': p.id,
      draggable: 'true',
      title: S.pageTitle(p)
    });
    row.style.paddingLeft = (10 + depth * 14) + 'px';

    if (!flat) {
      row.appendChild(U.el('button', {
        class: 'tree-toggle' + (hasKids ? '' : ' hidden'),
        type: 'button',
        text: p.collapsed ? '▸' : '▾',
        'aria-label': p.collapsed ? '展開' : '折りたたむ',
        onclick: function (e) {
          e.stopPropagation();
          S.updatePage(p.id, { collapsed: !p.collapsed });
          renderSidebar();
        }
      }));
    }
    row.appendChild(U.el('span', { class: 'tree-icon', text: p.icon || '📄' }));
    row.appendChild(U.el('span', { class: 'tree-label', text: S.pageTitle(p) }));
    row.appendChild(U.el('button', {
      class: 'tree-action', type: 'button', title: '子ページを追加', text: '+',
      onclick: function (e) {
        e.stopPropagation();
        var child = S.createPage(p.id);
        openPage(child.id);
        dom.titleInput.focus();
      }
    }));
    row.addEventListener('click', function () { openPage(p.id); });

    row.addEventListener('dragstart', function (e) {
      pageDragId = p.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'page:' + p.id); } catch (err) { /* ignore */ }
    });
    row.addEventListener('dragend', function () {
      pageDragId = null;
      dom.tree.querySelectorAll('.drop-into').forEach(function (n) { n.classList.remove('drop-into'); });
    });
    row.addEventListener('dragover', function (e) {
      if (!pageDragId || pageDragId === p.id) return;
      e.preventDefault();
      row.classList.add('drop-into');
    });
    row.addEventListener('dragleave', function () { row.classList.remove('drop-into'); });
    row.addEventListener('drop', function (e) {
      if (!pageDragId || pageDragId === p.id) return;
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drop-into');
      if (S.movePage(pageDragId, p.id)) U.toast('ページを移動しました');
      else U.toast('その位置には移動できません', 'error');
    });

    return row;
  }

  function renderStats() {
    var st = S.stats();
    dom.stats.textContent = st.pages + ' ページ / ' + st.chars.toLocaleString() + ' 文字';
  }

  /* ---------------- page view ---------------- */

  function openPage(id) {
    E.closeMenus();
    currentId = id;
    var p = id ? S.get(id) : null;
    if (!p || p.deletedAt) {
      currentId = null;
      dom.doc.hidden = true;
      dom.empty.hidden = false;
      renderSidebar();
      return;
    }
    localStorage.setItem(LAST_PAGE_KEY, id);
    dom.empty.hidden = true;
    dom.doc.hidden = false;
    renderHeader();
    E.render(p, dom.editor, function () { renderMeta(); renderStats(); renderSidebarTitles(); });
    renderSidebar();
    if (global.innerWidth < 860) dom.app.classList.add('sidebar-closed');
  }

  function renderSidebarTitles() {
    Array.prototype.forEach.call(dom.tree.querySelectorAll('.tree-row'), function (row) {
      var p = S.get(row.dataset.id);
      if (!p) return;
      var label = row.querySelector('.tree-label');
      if (label) label.textContent = S.pageTitle(p);
    });
  }

  function renderHeader() {
    var p = S.get(currentId);
    if (!p) return;
    dom.titleInput.value = p.title || '';
    dom.iconBtn.textContent = p.icon || '📄';
    document.getElementById('btn-favorite').textContent = p.favorite ? '★' : '☆';
    document.getElementById('btn-favorite').title = p.favorite ? 'お気に入りから外す' : 'お気に入りに追加';
    document.title = S.pageTitle(p) + ' - MemoFlow';

    dom.breadcrumb.innerHTML = '';
    S.breadcrumb(p.id).forEach(function (node, i, arr) {
      if (i) dom.breadcrumb.appendChild(U.el('span', { class: 'crumb-sep', text: '/' }));
      dom.breadcrumb.appendChild(U.el('button', {
        class: 'crumb' + (i === arr.length - 1 ? ' current' : ''),
        type: 'button',
        text: (node.icon ? node.icon + ' ' : '') + S.pageTitle(node),
        onclick: function () { openPage(node.id); }
      }));
    });
    renderMeta();
  }

  function renderMeta() {
    var p = S.get(currentId);
    if (!p) return;
    var chars = p.blocks.reduce(function (n, b) { return n + S.stripTags(b.html).length; }, 0);
    var todos = p.blocks.filter(function (b) { return b.type === 'todo'; });
    var done = todos.filter(function (b) { return b.checked; }).length;
    var parts = [
      '最終更新 ' + U.formatDate(p.updatedAt),
      chars.toLocaleString() + ' 文字'
    ];
    if (todos.length) parts.push('ToDo ' + done + '/' + todos.length);
    dom.meta.textContent = parts.join(' ・ ');
  }

  /* ---------------- quick switcher ---------------- */

  var quickIndex = 0;
  var quickItems = [];

  function openQuickSwitcher() {
    dom.quick.classList.add('open');
    dom.quickInput.value = '';
    renderQuickResults();
    dom.quickInput.focus();
  }
  function closeQuickSwitcher() { dom.quick.classList.remove('open'); }

  function renderQuickResults() {
    var q = dom.quickInput.value.trim();
    quickItems = q
      ? S.search(q).slice(0, 12).map(function (r) { return r; })
      : S.alive().slice().sort(function (a, b) {
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      }).slice(0, 8).map(function (p) { return { page: p, snippet: '' }; });
    quickIndex = 0;
    dom.quickResults.innerHTML = '';
    if (!quickItems.length) {
      dom.quickResults.appendChild(U.el('div', { class: 'quick-empty', text: '見つかりませんでした' }));
      return;
    }
    quickItems.forEach(function (item, i) {
      var crumbs = S.breadcrumb(item.page.id).slice(0, -1)
        .map(function (n) { return S.pageTitle(n); }).join(' / ');
      dom.quickResults.appendChild(U.el('button', {
        class: 'quick-item' + (i === 0 ? ' active' : ''),
        type: 'button',
        onclick: function () { closeQuickSwitcher(); openPage(item.page.id); }
      }, [
        U.el('span', { class: 'quick-icon', text: item.page.icon || '📄' }),
        U.el('span', { class: 'quick-body' }, [
          U.el('span', { class: 'quick-title', text: S.pageTitle(item.page) }),
          U.el('span', { class: 'quick-sub', text: item.snippet || crumbs || '' })
        ])
      ]));
    });
  }

  function moveQuick(delta) {
    var nodes = dom.quickResults.querySelectorAll('.quick-item');
    if (!nodes.length) return;
    nodes[quickIndex].classList.remove('active');
    quickIndex = (quickIndex + delta + nodes.length) % nodes.length;
    nodes[quickIndex].classList.add('active');
    nodes[quickIndex].scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- shortcuts ---------------- */

  function bindShortcuts() {
    dom.quickInput.addEventListener('input', renderQuickResults);
    dom.quickInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveQuick(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveQuick(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var item = quickItems[quickIndex];
        if (item) { closeQuickSwitcher(); openPage(item.page.id); }
      } else if (e.key === 'Escape') { closeQuickSwitcher(); }
    });
    dom.quick.addEventListener('mousedown', function (e) {
      if (e.target === dom.quick) closeQuickSwitcher();
    });

    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openQuickSwitcher(); return; }
      if (mod && e.key.toLowerCase() === 'p' && e.shiftKey) { e.preventDefault(); global.print(); return; }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault(); S.saveNow(); U.toast('保存しました（自動保存も有効です）'); return;
      }
      if (mod && e.key === '\\') { e.preventDefault(); toggleSidebar(); return; }
      if (e.key === 'Escape') {
        closeQuickSwitcher();
        closeDialog(dom.exportDialog);
        closeDialog(dom.importDialog);
        E.closeMenus();
      }
    });
  }

  /* ---------------- export / import ---------------- */

  function openDialog(d) { d.classList.add('open'); }
  function closeDialog(d) { if (d) d.classList.remove('open'); }

  function openExport() {
    var p = S.get(currentId);
    document.getElementById('export-target').textContent = p ? S.pageTitle(p) : '（ページ未選択）';
    openDialog(dom.exportDialog);
  }
  function openImport() {
    dom.importText.value = '';
    openDialog(dom.importDialog);
  }

  function bindDialogs() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (btn) {
      btn.addEventListener('click', function () { closeDialog(btn.closest('.dialog')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.dialog'), function (d) {
      d.addEventListener('mousedown', function (e) { if (e.target === d) closeDialog(d); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-export]'), function (btn) {
      btn.addEventListener('click', function () { runExport(btn.dataset.export); });
    });

    document.getElementById('btn-choose-file').addEventListener('click', function () {
      dom.fileInput.click();
    });
    dom.fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(dom.fileInput.files || []);
      dom.fileInput.value = '';
      importFiles(files);
    });
    document.getElementById('btn-import-text').addEventListener('click', function () {
      var text = dom.importText.value;
      if (!text.trim()) { U.toast('テキストが空です', 'error'); return; }
      var format = document.querySelector('input[name="import-format"]:checked').value;
      importContent(text, format, '貼り付けたメモ');
      closeDialog(dom.importDialog);
    });
  }

  function currentPageOrWarn() {
    var p = S.get(currentId);
    if (!p) U.toast('先にページを選択してください', 'error');
    return p;
  }

  function runExport(kind) {
    var p, base;
    switch (kind) {
      case 'md':
        p = currentPageOrWarn(); if (!p) return;
        base = U.safeFileName(S.pageTitle(p), 'page');
        U.download(base + '.md', C.pageToMarkdown(p), 'text/markdown');
        break;
      case 'html':
        p = currentPageOrWarn(); if (!p) return;
        base = U.safeFileName(S.pageTitle(p), 'page');
        U.download(base + '.html', C.pageToHtmlDocument(p), 'text/html');
        break;
      case 'txt':
        p = currentPageOrWarn(); if (!p) return;
        base = U.safeFileName(S.pageTitle(p), 'page');
        U.download(base + '.txt', C.pageToText(p), 'text/plain');
        break;
      case 'json-page':
        p = currentPageOrWarn(); if (!p) return;
        base = U.safeFileName(S.pageTitle(p), 'page');
        U.download(base + '.json', C.pageToJson(p), 'application/json');
        break;
      case 'clipboard-md':
        p = currentPageOrWarn(); if (!p) return;
        copyToClipboard(C.pageToMarkdown(p));
        return;
      case 'pdf':
        p = currentPageOrWarn(); if (!p) return;
        closeDialog(dom.exportDialog);
        setTimeout(function () { global.print(); }, 120);
        return;
      case 'json-all':
        U.download('memoflow-workspace-' + stamp() + '.json', C.workspaceToJson(), 'application/json');
        break;
      case 'md-all':
        U.download('memoflow-all-' + stamp() + '.md', C.workspaceToMarkdown(), 'text/markdown');
        break;
      case 'zip-all':
        U.download('memoflow-' + stamp() + '.zip', C.workspaceToZip());
        break;
      default:
        return;
    }
    U.toast('書き出しました');
    closeDialog(dom.exportDialog);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function copyToClipboard(text) {
    if (global.navigator.clipboard && global.isSecureContext) {
      global.navigator.clipboard.writeText(text).then(function () {
        U.toast('Markdown をコピーしました');
      }, function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); U.toast('Markdown をコピーしました'); }
    catch (e) { U.toast('コピーできませんでした', 'error'); }
    document.body.removeChild(ta);
  }

  function detectFormat(name) {
    var ext = String(name || '').toLowerCase().split('.').pop();
    if (ext === 'json') return 'json';
    if (ext === 'html' || ext === 'htm') return 'html';
    if (ext === 'md' || ext === 'markdown' || ext === 'mdown') return 'md';
    return 'txt';
  }

  function importFiles(files) {
    if (!files.length) return;
    var tasks = files.map(function (f) {
      return U.readFileAsText(f).then(function (text) {
        return { text: text, name: f.name };
      });
    });
    Promise.all(tasks).then(function (items) {
      var created = 0;
      items.forEach(function (item) {
        created += importContent(item.text, detectFormat(item.name),
          item.name.replace(/\.[^.]+$/, ''), true);
      });
      finishImport(created);
    }).catch(function (err) {
      console.error(err);
      U.toast('ファイルを読み込めませんでした', 'error');
    });
  }

  /** Returns the number of pages created. */
  function importContent(text, format, fallbackTitle, quiet) {
    var pagesData;
    try {
      if (format === 'json') {
        var data = JSON.parse(text);
        var incoming = S.normalize(data);
        if (!incoming.pages.length) { U.toast('JSON にページが含まれていません', 'error'); return 0; }
        var mode = global.confirm(
          'JSON に ' + incoming.pages.length + ' ページ含まれています。\n' +
          '［OK］ 今のワークスペースに追加\n［キャンセル］ すべて置き換え'
        ) ? 'merge' : 'replace';
        if (mode === 'replace' &&
          !global.confirm('現在のすべてのページを置き換えます。取り消せません。よろしいですか？')) {
          return 0;
        }
        var added = S.replaceWorkspace(data, mode);
        if (!quiet) finishImport(added.length, added[0] && added[0].id);
        else if (added[0]) pendingFocus = added[0].id;
        return added.length;
      }
      if (format === 'html') pagesData = C.htmlToPages(text, fallbackTitle);
      else if (format === 'md') pagesData = C.markdownToPages(text, fallbackTitle);
      else pagesData = C.textToPages(text, fallbackTitle);
    } catch (e) {
      console.error(e);
      U.toast('読み込みに失敗しました（形式を確認してください）', 'error');
      return 0;
    }

    var lastId = null;
    pagesData.forEach(function (pd) {
      var created = S.createPage(currentId && document.getElementById('import-as-child').checked ? currentId : null, {
        title: pd.title,
        blocks: pd.blocks,
        icon: '📄'
      });
      lastId = created.id;
    });
    pendingFocus = lastId;
    if (!quiet) finishImport(pagesData.length, lastId);
    return pagesData.length;
  }

  var pendingFocus = null;

  function finishImport(count, focusId) {
    if (!count) return;
    renderSidebar();
    renderStats();
    var target = focusId || pendingFocus;
    pendingFocus = null;
    if (target && S.get(target)) openPage(target);
    closeDialog(dom.importDialog);
    U.toast(count + ' ページを取り込みました');
  }

  /* ---------------- drag & drop import ---------------- */

  function bindDropzone() {
    var depth = 0;
    global.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      depth++;
      dom.dropzone.classList.add('active');
    });
    global.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
    });
    global.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) dom.dropzone.classList.remove('active');
    });
    global.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      dom.dropzone.classList.remove('active');
      importFiles(Array.prototype.slice.call(e.dataTransfer.files || []));
    });
  }

  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt) return false;
    return Array.prototype.indexOf.call(dt.types || [], 'Files') >= 0;
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
