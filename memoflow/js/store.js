/* MemoFlow - workspace state + localStorage persistence */
(function (global) {
  'use strict';

  var U = global.Util;
  var STORAGE_KEY = 'memoflow.workspace.v1';
  var SCHEMA = 1;

  var state = null;
  var listeners = [];

  function emit() { listeners.forEach(function (fn) { fn(state); }); }
  function subscribe(fn) { listeners.push(fn); return function () {
    listeners = listeners.filter(function (f) { return f !== fn; });
  }; }

  function newBlock(type, html) {
    return {
      id: U.uid('b'),
      type: type || 'paragraph',
      html: html || '',
      checked: false,
      lang: '',
      url: '',
      caption: '',
      emoji: ''
    };
  }

  function newPage(opts) {
    opts = opts || {};
    return {
      id: U.uid('p'),
      title: opts.title || '',
      icon: opts.icon || '📄',
      parentId: opts.parentId || null,
      blocks: opts.blocks && opts.blocks.length ? opts.blocks : [newBlock('paragraph', '')],
      favorite: false,
      collapsed: false,
      deletedAt: null,
      createdAt: U.nowISO(),
      updatedAt: U.nowISO()
    };
  }

  function emptyWorkspace() {
    return { schema: SCHEMA, name: 'マイワークスペース', pages: [], updatedAt: U.nowISO() };
  }

  /* ---------- persistence ---------- */

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        state = normalize(parsed);
        return state;
      } catch (e) {
        console.warn('MemoFlow: 保存データを読み込めませんでした', e);
      }
    }
    state = seed();
    save();
    return state;
  }

  var saveListeners = [];
  /** Called after every successful write to localStorage (e.g. to trigger cloud sync). */
  function onSave(fn) { saveListeners.push(fn); return function () {
    saveListeners = saveListeners.filter(function (f) { return f !== fn; });
  }; }
  function notifySaved() { saveListeners.forEach(function (fn) { fn(state); }); }

  var save = U.debounce(function () {
    if (!state) return;
    state.updatedAt = U.nowISO();
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notifySaved();
    } catch (e) {
      U.toast('保存に失敗しました（保存容量の上限の可能性があります）', 'error');
      console.error(e);
    }
  }, 350);

  function saveNow() {
    if (!state) return;
    state.updatedAt = U.nowISO();
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notifySaved();
    } catch (e) { console.error(e); }
  }

  /** Accept partially-shaped data (e.g. imported JSON) and fill in defaults. */
  function normalize(data) {
    var ws = emptyWorkspace();
    if (!data || typeof data !== 'object') return ws;
    ws.name = typeof data.name === 'string' && data.name ? data.name : ws.name;
    var pages = Array.isArray(data.pages) ? data.pages : [];
    var ids = Object.create(null);
    ws.pages = pages.map(function (p) {
      var page = newPage({ title: p && p.title, icon: p && p.icon });
      if (p && typeof p.id === 'string' && p.id && !ids[p.id]) page.id = p.id;
      ids[page.id] = true;
      page.parentId = p && typeof p.parentId === 'string' ? p.parentId : null;
      page.favorite = !!(p && p.favorite);
      page.collapsed = !!(p && p.collapsed);
      page.deletedAt = p && p.deletedAt ? p.deletedAt : null;
      page.createdAt = (p && p.createdAt) || page.createdAt;
      page.updatedAt = (p && p.updatedAt) || page.updatedAt;
      var blocks = Array.isArray(p && p.blocks) ? p.blocks : [];
      page.blocks = blocks.map(function (b) {
        var block = newBlock(b && b.type, typeof (b && b.html) === 'string' ? b.html : '');
        if (b && typeof b.id === 'string' && b.id) block.id = b.id;
        block.checked = !!(b && b.checked);
        block.lang = (b && b.lang) || '';
        block.url = (b && b.url) || '';
        block.caption = (b && b.caption) || '';
        block.emoji = (b && b.emoji) || '';
        return block;
      });
      if (!page.blocks.length) page.blocks = [newBlock('paragraph', '')];
      return page;
    });
    // drop dangling parents so nothing becomes invisible
    var known = Object.create(null);
    ws.pages.forEach(function (p) { known[p.id] = true; });
    ws.pages.forEach(function (p) { if (p.parentId && !known[p.parentId]) p.parentId = null; });
    return ws;
  }

  function seed() {
    var ws = emptyWorkspace();
    var welcome = newPage({ title: 'MemoFlow へようこそ', icon: '👋' });
    welcome.blocks = [
      newBlock('heading1', 'MemoFlow へようこそ'),
      newBlock('paragraph', '講座メモ・プロジェクト記録・議事録などを、1つの場所にまとめるためのメモアプリです。データはこのブラウザの中だけに保存されます。'),
      newBlock('heading2', '基本の使い方'),
      newBlock('bulleted', '左のサイドバーの <b>＋ 新規ページ</b> でページを追加します'),
      newBlock('bulleted', '本文で <code>/</code> を入力すると、見出し・リスト・ToDo などのメニューが開きます'),
      newBlock('bulleted', '<code>#</code> + スペースで見出し、<code>-</code> + スペースで箇条書きにもなります'),
      newBlock('bulleted', '左端の <b>⠿</b> をドラッグすると、ブロックを並べ替えられます'),
      newBlock('heading2', '出力とインポート'),
      newBlock('paragraph', '右上の <b>出力</b> から Markdown / HTML / テキスト / JSON / ZIP / PDF に書き出せます。<b>取込</b> からは Markdown・テキスト・HTML・JSON を読み込めます（ファイルを画面にドラッグしても取り込めます）。'),
      newBlock('callout', 'ヒント: <b>Ctrl + K</b> でページをすばやく検索できます。')
    ];
    welcome.blocks[welcome.blocks.length - 1].emoji = '💡';

    var course = newPage({ title: '講座メモ', icon: '🎓' });
    course.blocks = [
      newBlock('heading1', '講座メモ'),
      newBlock('paragraph', '受講した講座ごとに子ページを作ると整理しやすくなります。'),
      newBlock('todo', '受講した内容を要約する'),
      newBlock('todo', '実務で試すことを1つ決める')
    ];

    var project = newPage({ title: 'プロジェクト', icon: '🚀' });
    project.blocks = [
      newBlock('heading1', 'プロジェクト'),
      newBlock('heading2', '目的'),
      newBlock('paragraph', ''),
      newBlock('heading2', 'タスク'),
      newBlock('todo', ''),
      newBlock('heading2', 'メモ'),
      newBlock('paragraph', '')
    ];
    welcome.favorite = true;
    ws.pages = [welcome, course, project];
    return ws;
  }

  /* ---------- queries ---------- */

  function all() { return state.pages; }
  function alive() { return state.pages.filter(function (p) { return !p.deletedAt; }); }
  function trashed() { return state.pages.filter(function (p) { return !!p.deletedAt; }); }
  function get(id) {
    for (var i = 0; i < state.pages.length; i++) if (state.pages[i].id === id) return state.pages[i];
    return null;
  }
  function children(parentId) {
    return alive().filter(function (p) { return (p.parentId || null) === (parentId || null); });
  }
  function descendants(id) {
    var out = [], stack = [id];
    while (stack.length) {
      var cur = stack.pop();
      state.pages.forEach(function (p) {
        if (p.parentId === cur) { out.push(p); stack.push(p.id); }
      });
    }
    return out;
  }
  function breadcrumb(id) {
    var chain = [], guard = 0, cur = get(id);
    while (cur && guard++ < 50) { chain.unshift(cur); cur = cur.parentId ? get(cur.parentId) : null; }
    return chain;
  }
  function pageTitle(page) {
    return (page && page.title && page.title.trim()) || '無題のページ';
  }

  /* ---------- mutations ---------- */

  function touch(page) {
    if (page) page.updatedAt = U.nowISO();
    save();
  }

  function createPage(parentId, opts) {
    var page = newPage(Object.assign({ parentId: parentId || null }, opts || {}));
    state.pages.push(page);
    if (parentId) { var parent = get(parentId); if (parent) parent.collapsed = false; }
    save(); emit();
    return page;
  }

  function updatePage(id, patch) {
    var page = get(id);
    if (!page) return null;
    Object.assign(page, patch);
    touch(page);
    return page;
  }

  /** Soft delete: the page and its descendants move to the trash. */
  function trashPage(id) {
    var page = get(id);
    if (!page) return;
    var stamp = U.nowISO();
    page.deletedAt = stamp;
    descendants(id).forEach(function (p) { p.deletedAt = stamp; });
    save(); emit();
  }

  function restorePage(id) {
    var page = get(id);
    if (!page) return;
    page.deletedAt = null;
    descendants(id).forEach(function (p) { p.deletedAt = null; });
    if (page.parentId) {
      var parent = get(page.parentId);
      if (!parent || parent.deletedAt) page.parentId = null;
    }
    save(); emit();
  }

  function deleteForever(id) {
    var ids = Object.create(null);
    ids[id] = true;
    descendants(id).forEach(function (p) { ids[p.id] = true; });
    state.pages = state.pages.filter(function (p) { return !ids[p.id]; });
    save(); emit();
  }

  function emptyTrash() {
    state.pages = state.pages.filter(function (p) { return !p.deletedAt; });
    state.pages.forEach(function (p) {
      if (p.parentId && !get(p.parentId)) p.parentId = null;
    });
    save(); emit();
  }

  function movePage(id, newParentId) {
    if (id === newParentId) return false;
    var page = get(id);
    if (!page) return false;
    if (newParentId) {
      var blocked = descendants(id).some(function (p) { return p.id === newParentId; });
      if (blocked) return false; // cannot nest a page inside its own subtree
    }
    page.parentId = newParentId || null;
    touch(page); emit();
    return true;
  }

  function replaceWorkspace(data, mode) {
    var incoming = normalize(data);
    if (mode === 'merge') {
      var existing = Object.create(null);
      state.pages.forEach(function (p) { existing[p.id] = true; });
      var remap = Object.create(null);
      incoming.pages.forEach(function (p) {
        if (existing[p.id]) { var nid = U.uid('p'); remap[p.id] = nid; p.id = nid; }
      });
      incoming.pages.forEach(function (p) {
        if (p.parentId && remap[p.parentId]) p.parentId = remap[p.parentId];
      });
      state.pages = state.pages.concat(incoming.pages);
    } else {
      state = incoming;
    }
    saveNow(); emit();
    return incoming.pages;
  }

  function search(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    return alive().map(function (p) {
      var title = pageTitle(p).toLowerCase();
      var body = p.blocks.map(function (b) { return stripTags(b.html) + ' ' + (b.caption || ''); })
        .join(' ').toLowerCase();
      var score = 0;
      if (title.indexOf(q) === 0) score = 100;
      else if (title.indexOf(q) >= 0) score = 60;
      else if (body.indexOf(q) >= 0) score = 20;
      var snippet = '';
      if (score === 20) {
        var idx = body.indexOf(q);
        snippet = body.slice(Math.max(0, idx - 30), idx + 60).trim();
      }
      return { page: p, score: score, snippet: snippet };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return (b.page.updatedAt || '').localeCompare(a.page.updatedAt || '');
      });
  }

  function stripTags(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '');
    return d.textContent || '';
  }

  function stats() {
    var pages = alive();
    var blocks = 0, chars = 0;
    pages.forEach(function (p) {
      blocks += p.blocks.length;
      p.blocks.forEach(function (b) { chars += stripTags(b.html).length; });
    });
    return { pages: pages.length, blocks: blocks, chars: chars, trashed: trashed().length };
  }

  global.Store = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA: SCHEMA,
    load: load, save: save, saveNow: saveNow, subscribe: subscribe, emit: emit,
    onSave: onSave,
    newBlock: newBlock, newPage: newPage, normalize: normalize,
    get state() { return state; },
    all: all, alive: alive, trashed: trashed, get: get, children: children,
    descendants: descendants, breadcrumb: breadcrumb, pageTitle: pageTitle,
    createPage: createPage, updatePage: updatePage, trashPage: trashPage,
    restorePage: restorePage, deleteForever: deleteForever, emptyTrash: emptyTrash,
    movePage: movePage, replaceWorkspace: replaceWorkspace,
    search: search, stripTags: stripTags, stats: stats, touch: touch
  };
})(window);
