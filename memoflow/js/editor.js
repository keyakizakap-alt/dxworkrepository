/* MemoFlow - block editor */
(function (global) {
  'use strict';

  var U = global.Util;
  var S = global.Store;

  var TEXT_TYPES = {
    paragraph: 1, heading1: 1, heading2: 1, heading3: 1,
    bulleted: 1, numbered: 1, todo: 1, quote: 1, callout: 1, code: 1
  };

  var COMMANDS = [
    { type: 'paragraph', label: 'テキスト', desc: '本文を書く', icon: '¶', keys: 'text ほんぶん てきすと' },
    { type: 'heading1', label: '見出し 1', desc: '大きな見出し', icon: 'H1', keys: 'h1 midashi みだし' },
    { type: 'heading2', label: '見出し 2', desc: '中くらいの見出し', icon: 'H2', keys: 'h2 midashi みだし' },
    { type: 'heading3', label: '見出し 3', desc: '小さな見出し', icon: 'H3', keys: 'h3 midashi みだし' },
    { type: 'bulleted', label: '箇条書き', desc: '・のリスト', icon: '•', keys: 'list bullet かじょう リスト' },
    { type: 'numbered', label: '番号付きリスト', desc: '1. 2. 3. のリスト', icon: '1.', keys: 'number ol ばんごう リスト' },
    { type: 'todo', label: 'ToDo', desc: 'チェックボックス', icon: '☑', keys: 'todo check タスク チェック' },
    { type: 'quote', label: '引用', desc: '引用ブロック', icon: '❝', keys: 'quote いんよう' },
    { type: 'callout', label: 'コールアウト', desc: '目立たせるメモ', icon: '💡', keys: 'callout note めだつ' },
    { type: 'code', label: 'コード', desc: 'コードブロック', icon: '</>', keys: 'code コード' },
    { type: 'divider', label: '区切り線', desc: '横線で区切る', icon: '—', keys: 'divider hr くぎり せん' },
    { type: 'image', label: '画像', desc: 'URL またはファイル', icon: '🖼', keys: 'image picture がぞう' }
  ];

  var TYPE_LABEL = {};
  COMMANDS.forEach(function (c) { TYPE_LABEL[c.type] = c.label; });

  var host = null;         // container element
  var page = null;         // current page
  var onChange = function () {};
  var slashState = null;   // { blockId, query, index }
  var dragId = null;

  /* ---------------- caret helpers ---------------- */

  function focusEnd(el) {
    if (!el) return;
    el.focus();
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = global.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function focusStart(el) {
    if (!el) return;
    el.focus();
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    var sel = global.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function caretAtStart(el) {
    var sel = global.getSelection();
    if (!sel.rangeCount) return false;
    var r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    var probe = r.cloneRange();
    probe.selectNodeContents(el);
    probe.setEnd(r.endContainer, r.endOffset);
    return probe.toString().length === 0;
  }

  function caretAtEnd(el) {
    var sel = global.getSelection();
    if (!sel.rangeCount) return false;
    var r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    var probe = r.cloneRange();
    probe.selectNodeContents(el);
    probe.setStart(r.endContainer, r.endOffset);
    return probe.toString().length === 0;
  }

  /* ---------------- model helpers ---------------- */

  function indexOf(id) {
    for (var i = 0; i < page.blocks.length; i++) if (page.blocks[i].id === id) return i;
    return -1;
  }
  function blockById(id) {
    var i = indexOf(id);
    return i < 0 ? null : page.blocks[i];
  }
  function rowById(id) {
    return host.querySelector('.block[data-id="' + id + '"]');
  }
  function textElOf(id) {
    var row = rowById(id);
    return row ? row.querySelector('[contenteditable]') : null;
  }

  function commit() {
    S.touch(page);
    onChange(page);
  }

  /* ---------------- rendering ---------------- */

  function render(targetPage, container, changeHandler) {
    page = targetPage;
    host = container;
    if (changeHandler) onChange = changeHandler;
    host.innerHTML = '';
    if (!page) return;
    page.blocks.forEach(function (b) { host.appendChild(renderBlock(b)); });
    updateNumbers();
  }

  function rerender() {
    var active = document.activeElement;
    var activeId = active && active.closest ? (active.closest('.block') || {}).dataset : null;
    render(page, host);
    if (activeId && activeId.id) focusEnd(textElOf(activeId.id));
  }

  function renderBlock(b) {
    var row = U.el('div', { class: 'block', 'data-id': b.id, 'data-type': b.type });

    var controls = U.el('div', { class: 'block-controls' }, [
      U.el('button', {
        class: 'ctrl-btn', title: '下にブロックを追加', 'aria-label': '下にブロックを追加',
        type: 'button', text: '+',
        onclick: function (e) { e.preventDefault(); insertAfter(b.id, 'paragraph', true); }
      }),
      U.el('button', {
        class: 'ctrl-btn drag', title: 'ドラッグで移動 / クリックでメニュー',
        'aria-label': 'ブロックメニュー', type: 'button', draggable: 'true', text: '⠿',
        onclick: function (e) { e.preventDefault(); openBlockMenu(b.id, e.currentTarget); }
      })
    ]);
    row.appendChild(controls);

    var body = U.el('div', { class: 'block-body' });

    if (b.type === 'divider') {
      body.appendChild(U.el('hr', { class: 'divider' }));
    } else if (b.type === 'image') {
      body.appendChild(renderImage(b));
    } else {
      if (b.type === 'bulleted') body.appendChild(U.el('span', { class: 'marker bullet', text: '•' }));
      if (b.type === 'numbered') body.appendChild(U.el('span', { class: 'marker number', text: '1.' }));
      if (b.type === 'todo') {
        var box = U.el('input', { class: 'marker checkbox', type: 'checkbox' });
        box.checked = !!b.checked;
        box.addEventListener('change', function () {
          b.checked = box.checked;
          row.classList.toggle('checked', box.checked);
          commit();
        });
        body.appendChild(box);
      }
      if (b.type === 'callout') {
        body.appendChild(U.el('button', {
          class: 'marker emoji', type: 'button', text: b.emoji || '💡', title: '絵文字を変更',
          onclick: function () {
            var next = global.prompt('コールアウトの絵文字', b.emoji || '💡');
            if (next != null) { b.emoji = next.trim().slice(0, 4) || '💡'; commit(); rerender(); }
          }
        }));
      }
      if (b.type === 'code') {
        body.appendChild(U.el('input', {
          class: 'code-lang', type: 'text', value: b.lang || '', placeholder: '言語 (例: python)',
          oninput: function (e) { b.lang = e.target.value; commit(); }
        }));
      }

      var text = U.el('div', {
        class: 'block-text', contenteditable: 'true', spellcheck: 'false',
        'data-placeholder': placeholderFor(b.type),
        html: b.html || ''
      });
      text.addEventListener('input', function () { onInput(b, text); });
      text.addEventListener('keydown', function (e) { onKeyDown(e, b, text); });
      text.addEventListener('paste', function (e) { onPaste(e, b, text); });
      text.addEventListener('blur', function () { b.html = cleanHtml(text.innerHTML); commit(); });
      body.appendChild(text);
    }

    row.appendChild(body);
    if (b.type === 'todo' && b.checked) row.classList.add('checked');

    // drag & drop reordering
    var handle = controls.querySelector('.drag');
    handle.addEventListener('dragstart', function (e) {
      dragId = b.id;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', b.id); } catch (err) { /* ignore */ }
    });
    handle.addEventListener('dragend', function () {
      dragId = null;
      row.classList.remove('dragging');
      host.querySelectorAll('.drop-before,.drop-after').forEach(function (n) {
        n.classList.remove('drop-before', 'drop-after');
      });
    });
    row.addEventListener('dragover', function (e) {
      if (!dragId || dragId === b.id) return;
      e.preventDefault();
      var rect = row.getBoundingClientRect();
      var after = e.clientY > rect.top + rect.height / 2;
      row.classList.toggle('drop-after', after);
      row.classList.toggle('drop-before', !after);
    });
    row.addEventListener('dragleave', function () {
      row.classList.remove('drop-before', 'drop-after');
    });
    row.addEventListener('drop', function (e) {
      if (!dragId || dragId === b.id) return;
      e.preventDefault();
      var rect = row.getBoundingClientRect();
      var after = e.clientY > rect.top + rect.height / 2;
      moveBlock(dragId, b.id, after);
    });

    return row;
  }

  function renderImage(b) {
    var wrap = U.el('div', { class: 'image-block' });
    if (b.url) {
      wrap.appendChild(U.el('img', { src: b.url, alt: b.caption || '' }));
    } else {
      wrap.appendChild(U.el('button', {
        class: 'image-empty', type: 'button', text: '🖼 画像を追加（クリック）',
        onclick: function () { pickImage(b); }
      }));
    }
    wrap.appendChild(U.el('input', {
      class: 'image-caption', type: 'text', value: b.caption || '', placeholder: 'キャプション（任意）',
      oninput: function (e) { b.caption = e.target.value; commit(); }
    }));
    return wrap;
  }

  function pickImage(b) {
    var input = U.el('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) {
        U.toast('画像は 1.5MB 以下にしてください（ブラウザ保存の上限対策）', 'error');
        return;
      }
      U.readFileAsDataURL(f).then(function (dataUrl) {
        b.url = dataUrl;
        commit(); rerender();
      });
    });
    input.click();
  }

  function placeholderFor(type) {
    switch (type) {
      case 'heading1': return '見出し 1';
      case 'heading2': return '見出し 2';
      case 'heading3': return '見出し 3';
      case 'todo': return 'ToDo';
      case 'quote': return '引用';
      case 'callout': return '伝えたいこと';
      case 'code': return 'コードを入力';
      case 'bulleted': case 'numbered': return 'リスト項目';
      default: return '「/」でコマンド、そのまま入力で本文';
    }
  }

  function updateNumbers() {
    var n = 0;
    Array.prototype.forEach.call(host.querySelectorAll('.block'), function (row) {
      if (row.dataset.type !== 'numbered') { n = 0; return; }
      n += 1;
      var marker = row.querySelector('.marker.number');
      if (marker) marker.textContent = n + '.';
    });
  }

  /** Keep only the inline markup we understand. */
  function cleanHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '');
    var out = global.Convert.sanitizeInline(d);
    return out === '<br>' ? '' : out;
  }

  /* ---------------- editing operations ---------------- */

  function insertAfter(id, type, focus) {
    var i = indexOf(id);
    var block = S.newBlock(type || 'paragraph', '');
    page.blocks.splice(i < 0 ? page.blocks.length : i + 1, 0, block);
    commit();
    var row = renderBlock(block);
    var ref = rowById(id);
    if (ref && ref.nextSibling) host.insertBefore(row, ref.nextSibling);
    else host.appendChild(row);
    updateNumbers();
    if (focus !== false) focusEnd(row.querySelector('[contenteditable]'));
    return block;
  }

  function setType(id, type) {
    var b = blockById(id);
    if (!b || b.type === type) return;
    if (type === 'code') b.html = U.escapeHtml(S.stripTags(b.html));
    else if (b.type === 'code') b.html = U.escapeHtml(S.stripTags(b.html));
    b.type = type;
    if (type === 'callout' && !b.emoji) b.emoji = '💡';
    commit();
    var old = rowById(id);
    var fresh = renderBlock(b);
    old.replaceWith(fresh);
    updateNumbers();
    if (type === 'image' && !b.url) pickImage(b);
    else focusEnd(fresh.querySelector('[contenteditable]'));
  }

  function removeBlock(id, focusPrev) {
    var i = indexOf(id);
    if (i < 0) return;
    if (page.blocks.length === 1) {
      var only = page.blocks[0];
      only.type = 'paragraph';
      only.html = '';
      commit(); rerender();
      focusEnd(textElOf(only.id));
      return;
    }
    page.blocks.splice(i, 1);
    var row = rowById(id);
    if (row) row.remove();
    commit();
    updateNumbers();
    if (focusPrev !== false) {
      var target = page.blocks[Math.max(0, i - 1)];
      if (target) focusEnd(textElOf(target.id));
    }
  }

  function moveBlock(id, targetId, after) {
    var from = indexOf(id);
    if (from < 0) return;
    var block = page.blocks.splice(from, 1)[0];
    var to = indexOf(targetId);
    if (to < 0) to = page.blocks.length - 1;
    page.blocks.splice(after ? to + 1 : to, 0, block);
    commit();
    rerender();
  }

  function moveBy(id, delta) {
    var i = indexOf(id);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= page.blocks.length) return;
    var block = page.blocks.splice(i, 1)[0];
    page.blocks.splice(j, 0, block);
    commit();
    render(page, host);
    focusEnd(textElOf(id));
  }

  function duplicateBlock(id) {
    var i = indexOf(id);
    if (i < 0) return;
    var copy = JSON.parse(JSON.stringify(page.blocks[i]));
    copy.id = U.uid('b');
    page.blocks.splice(i + 1, 0, copy);
    commit();
    rerender();
  }

  /* ---------------- input handling ---------------- */

  var MD_SHORTCUTS = [
    { re: /^#\s$/, type: 'heading1' },
    { re: /^##\s$/, type: 'heading2' },
    { re: /^###\s$/, type: 'heading3' },
    { re: /^[-*]\s$/, type: 'bulleted' },
    { re: /^1[.)]\s$/, type: 'numbered' },
    { re: /^\[\]\s$/, type: 'todo' },
    { re: /^\[\s?\]\s$/, type: 'todo' },
    { re: /^>\s$/, type: 'quote' },
    { re: /^```$/, type: 'code' },
    { re: /^---$/, type: 'divider' }
  ];

  function onInput(b, textEl) {
    if (b.type !== 'code') {
      var plain = textEl.textContent;
      for (var i = 0; i < MD_SHORTCUTS.length; i++) {
        if (MD_SHORTCUTS[i].re.test(plain)) {
          textEl.innerHTML = '';
          b.html = '';
          if (MD_SHORTCUTS[i].type === 'divider') {
            setType(b.id, 'divider');
            insertAfter(b.id, 'paragraph', true);
          } else {
            setType(b.id, MD_SHORTCUTS[i].type);
          }
          return;
        }
      }
    }
    b.html = b.type === 'code' ? U.escapeHtml(textEl.textContent) : cleanHtml(textEl.innerHTML);
    updateSlash(b, textEl);
    S.save();
    onChange(page);
  }

  function onPaste(e, b, textEl) {
    var data = e.clipboardData;
    if (!data) return;
    var text = data.getData('text/plain');
    if (!text) return;
    // Multi-line paste becomes multiple blocks (markdown aware).
    if (/\n/.test(text.trim()) && b.type !== 'code') {
      e.preventDefault();
      var blocks = global.Convert.markdownToBlocks(text);
      var at = indexOf(b.id);
      var isEmpty = !S.stripTags(b.html).trim();
      if (isEmpty) { page.blocks.splice(at, 1); } else { at += 1; }
      Array.prototype.splice.apply(page.blocks, [at, 0].concat(blocks));
      commit();
      render(page, host);
      var last = blocks[blocks.length - 1];
      focusEnd(textElOf(last.id));
      U.toast(blocks.length + ' 個のブロックとして貼り付けました');
      return;
    }
    e.preventDefault();
    document.execCommand('insertText', false, text);
  }

  function onKeyDown(e, b, textEl) {
    if (slashState && slashState.blockId === b.id) {
      if (handleSlashKey(e, b, textEl)) return;
    }

    // inline formatting shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      var k = e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'u') {
        // let the browser handle bold/italic/underline, then sync
        setTimeout(function () { b.html = cleanHtml(textEl.innerHTML); commit(); }, 0);
        return;
      }
      if (k === 'e') { e.preventDefault(); wrapInline(textEl, 'code'); b.html = cleanHtml(textEl.innerHTML); commit(); return; }
      if (k === 'k') { e.preventDefault(); makeLink(textEl); b.html = cleanHtml(textEl.innerHTML); commit(); return; }
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault(); moveBy(b.id, e.key === 'ArrowUp' ? -1 : 1); return;
      }
      if (k === 'd') { e.preventDefault(); duplicateBlock(b.id); return; }
    }

    if (e.key === 'Enter') {
      if (b.type === 'code' && !(e.ctrlKey || e.metaKey)) {
        // stay inside the code block; Ctrl+Enter leaves it
        return;
      }
      if (e.shiftKey) return; // soft break
      e.preventDefault();
      b.html = b.type === 'code' ? U.escapeHtml(textEl.textContent) : cleanHtml(textEl.innerHTML);

      var isList = b.type === 'bulleted' || b.type === 'numbered' || b.type === 'todo';
      if (isList && !S.stripTags(b.html).trim()) {
        setType(b.id, 'paragraph');
        return;
      }
      var nextType = isList ? b.type : 'paragraph';

      // split the block if the caret sits in the middle
      var tail = '';
      if (!caretAtEnd(textEl) && b.type !== 'code') {
        var sel = global.getSelection();
        var range = sel.getRangeAt(0);
        var after = range.cloneRange();
        after.selectNodeContents(textEl);
        after.setStart(range.endContainer, range.endOffset);
        var frag = after.extractContents();
        var holder = document.createElement('div');
        holder.appendChild(frag);
        tail = cleanHtml(holder.innerHTML);
        b.html = cleanHtml(textEl.innerHTML);
      }
      var created = insertAfter(b.id, nextType, false);
      created.html = tail;
      if (nextType === 'todo') created.checked = false;
      commit();
      var newRow = rowById(created.id);
      var newText = newRow.querySelector('[contenteditable]');
      newText.innerHTML = tail;
      focusStart(newText);
      return;
    }

    if (e.key === 'Backspace') {
      if (!caretAtStart(textEl)) return;
      var idx = indexOf(b.id);
      if (b.type !== 'paragraph') { e.preventDefault(); setType(b.id, 'paragraph'); return; }
      if (idx === 0) return;
      e.preventDefault();
      var prev = page.blocks[idx - 1];
      if (prev.type === 'divider' || prev.type === 'image') {
        removeBlock(prev.id, false);
        focusStart(textEl);
        return;
      }
      var prevText = textElOf(prev.id);
      var merged = (prev.html || '') + (b.html || '');
      prev.html = merged;
      removeBlock(b.id, false);
      var freshPrev = textElOf(prev.id);
      if (freshPrev) {
        // place caret at the junction
        var before = prevText ? prevText.textContent.length : 0;
        freshPrev.innerHTML = merged;
        placeCaretAtOffset(freshPrev, before);
      }
      commit();
      return;
    }

    if (e.key === 'ArrowUp' && caretAtStart(textEl)) {
      var i1 = indexOf(b.id);
      if (i1 > 0) { e.preventDefault(); focusEnd(textElOf(page.blocks[i1 - 1].id)); }
      return;
    }
    if (e.key === 'ArrowDown' && caretAtEnd(textEl)) {
      var i2 = indexOf(b.id);
      if (i2 >= 0 && i2 < page.blocks.length - 1) {
        e.preventDefault(); focusStart(textElOf(page.blocks[i2 + 1].id));
      }
      return;
    }

    if (e.key === 'Tab' && (b.type === 'code')) {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
  }

  function placeCaretAtOffset(el, offset) {
    el.focus();
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var remaining = offset, node = null;
    while (walker.nextNode()) {
      node = walker.currentNode;
      if (node.nodeValue.length >= remaining) break;
      remaining -= node.nodeValue.length;
    }
    var range = document.createRange();
    if (node) range.setStart(node, Math.min(remaining, node.nodeValue.length));
    else { range.selectNodeContents(el); range.collapse(true); }
    range.collapse(true);
    var sel = global.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function wrapInline(textEl, tag) {
    var sel = global.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    var wrapper = document.createElement(tag);
    try {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
      sel.removeAllRanges();
      var r = document.createRange();
      r.selectNodeContents(wrapper);
      r.collapse(false);
      sel.addRange(r);
    } catch (e) { /* ignore odd selections */ }
  }

  function makeLink(textEl) {
    var sel = global.getSelection();
    if (!sel.rangeCount) return;
    var url = global.prompt('リンク先の URL');
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
    document.execCommand('createLink', false, url);
    Array.prototype.forEach.call(textEl.querySelectorAll('a'), function (a) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }

  /* ---------------- slash menu ---------------- */

  function menuEl() {
    var m = document.getElementById('slash-menu');
    if (!m) {
      m = U.el('div', { id: 'slash-menu', class: 'slash-menu' });
      document.body.appendChild(m);
    }
    return m;
  }

  function updateSlash(b, textEl) {
    if (b.type === 'code') { closeSlash(); return; }
    var plain = textEl.textContent;
    var m = plain.match(/^\/([^\s/]*)$/);
    if (!m) { closeSlash(); return; }
    slashState = { blockId: b.id, query: m[1], index: 0 };
    renderSlash(textEl);
  }

  function filtered() {
    var q = (slashState.query || '').toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(function (c) {
      return (c.label + ' ' + c.keys + ' ' + c.type).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderSlash(textEl) {
    var list = filtered();
    var m = menuEl();
    if (!list.length) { closeSlash(); return; }
    if (slashState.index >= list.length) slashState.index = 0;
    m.innerHTML = '';
    list.forEach(function (c, i) {
      m.appendChild(U.el('button', {
        class: 'slash-item' + (i === slashState.index ? ' active' : ''),
        type: 'button',
        onmousedown: function (e) { e.preventDefault(); applySlash(c); }
      }, [
        U.el('span', { class: 'slash-icon', text: c.icon }),
        U.el('span', { class: 'slash-body' }, [
          U.el('span', { class: 'slash-label', text: c.label }),
          U.el('span', { class: 'slash-desc', text: c.desc })
        ])
      ]));
    });
    var rect = textEl.getBoundingClientRect();
    m.classList.add('open');
    var top = rect.bottom + 6;
    if (top + m.offsetHeight > global.innerHeight - 12) {
      top = Math.max(12, rect.top - m.offsetHeight - 6);
    }
    m.style.top = top + 'px';
    m.style.left = Math.min(rect.left, global.innerWidth - m.offsetWidth - 16) + 'px';
  }

  function handleSlashKey(e, b, textEl) {
    var list = filtered();
    if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return true; }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); slashState.index = (slashState.index + 1) % list.length;
      renderSlash(textEl); return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault(); slashState.index = (slashState.index - 1 + list.length) % list.length;
      renderSlash(textEl); return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applySlash(list[slashState.index]);
      return true;
    }
    return false;
  }

  function applySlash(cmd) {
    if (!slashState || !cmd) return;
    var id = slashState.blockId;
    var b = blockById(id);
    closeSlash();
    if (!b) return;
    b.html = '';
    var t = textElOf(id);
    if (t) t.innerHTML = '';
    if (cmd.type === 'divider') {
      setType(id, 'divider');
      insertAfter(id, 'paragraph', true);
    } else {
      setType(id, cmd.type);
    }
  }

  function closeSlash() {
    slashState = null;
    var m = document.getElementById('slash-menu');
    if (m) { m.classList.remove('open'); m.innerHTML = ''; }
  }

  /* ---------------- block context menu ---------------- */

  function openBlockMenu(id, anchor) {
    closeBlockMenu();
    var b = blockById(id);
    if (!b) return;
    var menu = U.el('div', { class: 'block-menu open', id: 'block-menu' });
    menu.appendChild(U.el('div', { class: 'menu-title', text: 'ブロック操作' }));
    [
      { label: '↑ 上へ移動', run: function () { moveBy(id, -1); } },
      { label: '↓ 下へ移動', run: function () { moveBy(id, 1); } },
      { label: '⧉ 複製', run: function () { duplicateBlock(id); } },
      { label: '🗑 削除', run: function () { removeBlock(id); }, danger: true }
    ].forEach(function (item) {
      menu.appendChild(U.el('button', {
        class: 'menu-item' + (item.danger ? ' danger' : ''), type: 'button', text: item.label,
        onclick: function () { closeBlockMenu(); item.run(); }
      }));
    });
    menu.appendChild(U.el('div', { class: 'menu-title', text: '種類を変更' }));
    var grid = U.el('div', { class: 'menu-grid' });
    COMMANDS.forEach(function (c) {
      grid.appendChild(U.el('button', {
        class: 'menu-type' + (c.type === b.type ? ' active' : ''), type: 'button',
        title: c.label,
        onclick: function () { closeBlockMenu(); setType(id, c.type); }
      }, [
        U.el('span', { class: 'menu-type-icon', text: c.icon }),
        U.el('span', { text: c.label })
      ]));
    });
    menu.appendChild(grid);
    document.body.appendChild(menu);
    var rect = anchor.getBoundingClientRect();
    var top = Math.min(rect.bottom + 6, global.innerHeight - menu.offsetHeight - 12);
    menu.style.top = Math.max(12, top) + 'px';
    menu.style.left = Math.max(12, Math.min(rect.left, global.innerWidth - menu.offsetWidth - 16)) + 'px';
  }

  function closeBlockMenu() {
    var m = document.getElementById('block-menu');
    if (m) m.remove();
  }

  document.addEventListener('mousedown', function (e) {
    var menu = document.getElementById('block-menu');
    if (menu && !menu.contains(e.target)) closeBlockMenu();
    var slash = document.getElementById('slash-menu');
    if (slash && slash.classList.contains('open') && !slash.contains(e.target)) closeSlash();
  });

  global.Editor = {
    render: render,
    rerender: rerender,
    focusFirst: function () {
      var first = host && host.querySelector('[contenteditable]');
      focusEnd(first);
    },
    focusEnd: focusEnd,
    appendBlock: function (type) {
      var last = page.blocks[page.blocks.length - 1];
      var lastEmpty = last && !S.stripTags(last.html).trim() && last.type === 'paragraph';
      if (lastEmpty && (!type || type === 'paragraph')) { focusEnd(textElOf(last.id)); return; }
      insertAfter(last ? last.id : null, type || 'paragraph', true);
    },
    COMMANDS: COMMANDS,
    TYPE_LABEL: TYPE_LABEL,
    TEXT_TYPES: TEXT_TYPES,
    closeMenus: function () { closeSlash(); closeBlockMenu(); }
  };
})(window);
