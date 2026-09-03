/* MemoFlow - format conversion (Markdown / HTML / text / JSON / ZIP) */
(function (global) {
  'use strict';

  var U = global.Util;
  var S = global.Store;

  /* =========================================================
   * inline: stored HTML  <->  Markdown
   * ======================================================= */

  function inlineHtmlToMarkdown(html) {
    var root = document.createElement('div');
    root.innerHTML = String(html || '');
    return walk(root).replace(/[ \t]+$/g, '');

    function walk(node) {
      var out = '';
      node.childNodes.forEach(function (child) {
        if (child.nodeType === 3) {
          out += escapeMd(child.nodeValue);
          return;
        }
        if (child.nodeType !== 1) return;
        var tag = child.tagName.toLowerCase();
        var inner = walk(child);
        switch (tag) {
          case 'b': case 'strong': out += inner ? '**' + inner + '**' : ''; break;
          case 'i': case 'em': out += inner ? '*' + inner + '*' : ''; break;
          case 'u': out += inner ? '<u>' + inner + '</u>' : ''; break;
          case 's': case 'strike': case 'del': out += inner ? '~~' + inner + '~~' : ''; break;
          case 'code': out += inner ? '`' + unescapeMd(inner) + '`' : ''; break;
          case 'a':
            var href = child.getAttribute('href') || '';
            out += href ? '[' + (inner || href) + '](' + href + ')' : inner;
            break;
          case 'br': out += '  \n'; break;
          case 'img':
            out += '![' + (child.getAttribute('alt') || '') + '](' + (child.getAttribute('src') || '') + ')';
            break;
          default: out += inner;
        }
      });
      return out;
    }
  }

  function escapeMd(text) {
    return String(text).replace(/([\\`*_\[\]])/g, '\\$1');
  }
  function unescapeMd(text) {
    return String(text).replace(/\\([\\`*_\[\]])/g, '$1');
  }

  function markdownInlineToHtml(md) {
    var s = U.escapeHtml(md);
    // images before links
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, src) {
      return '<img src="' + src + '" alt="' + alt + '">';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/__([^_]+)__/g, '<b>$1</b>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    return s;
  }

  /* =========================================================
   * blocks -> Markdown
   * ======================================================= */

  function blocksToMarkdown(blocks) {
    var lines = [];
    var counter = 0;
    (blocks || []).forEach(function (b) {
      if (b.type !== 'numbered') counter = 0;
      var text = inlineHtmlToMarkdown(b.html);
      switch (b.type) {
        case 'heading1': lines.push('# ' + text, ''); break;
        case 'heading2': lines.push('## ' + text, ''); break;
        case 'heading3': lines.push('### ' + text, ''); break;
        case 'bulleted': lines.push('- ' + text); break;
        case 'numbered': counter += 1; lines.push(counter + '. ' + text); break;
        case 'todo': lines.push('- [' + (b.checked ? 'x' : ' ') + '] ' + text); break;
        case 'quote': lines.push('> ' + text, ''); break;
        case 'callout': lines.push('> ' + (b.emoji || '💡') + ' ' + text, ''); break;
        case 'code':
          lines.push('```' + (b.lang || ''), S.stripTags(b.html), '```', '');
          break;
        case 'divider': lines.push('---', ''); break;
        case 'image':
          lines.push('![' + (b.caption || '') + '](' + (b.url || '') + ')', '');
          break;
        default:
          lines.push(text, '');
      }
    });
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function pageToMarkdown(page, opts) {
    opts = opts || {};
    var head = '';
    if (opts.frontMatter !== false) {
      head = '# ' + (page.icon ? page.icon + ' ' : '') + S.pageTitle(page) + '\n\n';
      if (opts.meta) {
        head += '<!-- updated: ' + page.updatedAt + ' -->\n\n';
      }
    }
    return head + blocksToMarkdown(page.blocks);
  }

  /* =========================================================
   * Markdown -> blocks
   * ======================================================= */

  function isTableRow(line) {
    return /^\s*\|.*\|\s*$/.test(line || '');
  }
  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line || '');
  }

  function markdownToBlocks(md) {
    var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    var blocks = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];

      // fenced code
      var fence = line.match(/^```(.*)$/);
      if (fence) {
        var lang = fence[1].trim();
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // closing fence
        var cb = S.newBlock('code', U.escapeHtml(buf.join('\n')));
        cb.lang = lang;
        blocks.push(cb);
        continue;
      }

      if (/^\s*$/.test(line)) { i++; continue; }

      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push(S.newBlock('divider', ''));
        i++; continue;
      }

      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var level = Math.min(h[1].length, 3);
        blocks.push(S.newBlock('heading' + level, markdownInlineToHtml(h[2].trim())));
        i++; continue;
      }

      var todo = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
      if (todo) {
        var tb = S.newBlock('todo', markdownInlineToHtml(todo[2]));
        tb.checked = todo[1].toLowerCase() === 'x';
        blocks.push(tb);
        i++; continue;
      }

      var bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bullet) {
        blocks.push(S.newBlock('bulleted', markdownInlineToHtml(bullet[1])));
        i++; continue;
      }

      var num = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (num) {
        blocks.push(S.newBlock('numbered', markdownInlineToHtml(num[1])));
        i++; continue;
      }

      var quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        var body = quote[1];
        var emoji = body.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])\s+(.*)$/u);
        if (emoji) {
          var cob = S.newBlock('callout', markdownInlineToHtml(emoji[2]));
          cob.emoji = emoji[1];
          blocks.push(cob);
        } else {
          blocks.push(S.newBlock('quote', markdownInlineToHtml(body)));
        }
        i++; continue;
      }

      var img = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
      if (img) {
        var ib = S.newBlock('image', '');
        ib.url = img[2];
        ib.caption = img[1];
        blocks.push(ib);
        i++; continue;
      }

      // table: not modeled as a block type, so keep it verbatim (lossless)
      // instead of letting the paragraph joiner below scramble the rows.
      if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        var tableBuf = [line];
        i++;
        while (i < lines.length && isTableRow(lines[i])) { tableBuf.push(lines[i]); i++; }
        blocks.push(S.newBlock('code', U.escapeHtml(tableBuf.join('\n'))));
        continue;
      }

      // paragraph: join following non-blank, non-special lines
      var para = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() &&
        !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|\s*>|\s*(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i]) &&
        !isTableRow(lines[i])) {
        para.push(lines[i].trim());
        i++;
      }
      blocks.push(S.newBlock('paragraph', markdownInlineToHtml(para.join(' '))));
    }
    if (!blocks.length) blocks.push(S.newBlock('paragraph', ''));
    return blocks;
  }

  /** Split a markdown document on top level headings into several pages. */
  function markdownToPages(md, fallbackTitle) {
    var text = String(md || '').replace(/\r\n?/g, '\n');
    var blocks = markdownToBlocks(text);
    var title = fallbackTitle || '取り込んだメモ';
    // Use a leading H1 as the page title.
    if (blocks.length && blocks[0].type === 'heading1') {
      var raw = S.stripTags(blocks[0].html).trim();
      if (raw) {
        var m = raw.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])\s+(.*)$/u);
        title = m ? m[2] : raw;
        blocks = blocks.slice(1);
      }
    }
    if (!blocks.length) blocks = [S.newBlock('paragraph', '')];
    return [{ title: title, blocks: blocks }];
  }

  /* =========================================================
   * blocks -> HTML / plain text
   * ======================================================= */

  function blocksToHtml(blocks) {
    var out = [];
    var listOpen = null;
    function closeList() {
      if (listOpen) { out.push(listOpen === 'ul' ? '</ul>' : '</ol>'); listOpen = null; }
    }
    (blocks || []).forEach(function (b) {
      var text = b.html || '';
      switch (b.type) {
        case 'bulleted':
          if (listOpen !== 'ul') { closeList(); out.push('<ul>'); listOpen = 'ul'; }
          out.push('<li>' + text + '</li>');
          return;
        case 'numbered':
          if (listOpen !== 'ol') { closeList(); out.push('<ol>'); listOpen = 'ol'; }
          out.push('<li>' + text + '</li>');
          return;
        default: closeList();
      }
      switch (b.type) {
        case 'heading1': out.push('<h1>' + text + '</h1>'); break;
        case 'heading2': out.push('<h2>' + text + '</h2>'); break;
        case 'heading3': out.push('<h3>' + text + '</h3>'); break;
        case 'todo':
          out.push('<p class="todo"><input type="checkbox" disabled' +
            (b.checked ? ' checked' : '') + '> <span' +
            (b.checked ? ' class="done"' : '') + '>' + text + '</span></p>');
          break;
        case 'quote': out.push('<blockquote>' + text + '</blockquote>'); break;
        case 'callout':
          out.push('<div class="callout"><span class="callout-emoji">' +
            U.escapeHtml(b.emoji || '💡') + '</span><div>' + text + '</div></div>');
          break;
        case 'code':
          out.push('<pre><code' + (b.lang ? ' class="language-' + U.escapeHtml(b.lang) + '"' : '') +
            '>' + U.escapeHtml(S.stripTags(b.html)) + '</code></pre>');
          break;
        case 'divider': out.push('<hr>'); break;
        case 'image':
          out.push('<figure><img src="' + U.escapeHtml(b.url || '') + '" alt="' +
            U.escapeHtml(b.caption || '') + '">' +
            (b.caption ? '<figcaption>' + U.escapeHtml(b.caption) + '</figcaption>' : '') +
            '</figure>');
          break;
        default:
          out.push('<p>' + (text || '<br>') + '</p>');
      }
    });
    closeList();
    return out.join('\n');
  }

  var DOC_CSS = [
    'body{max-width:760px;margin:48px auto;padding:0 24px;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif;',
    'line-height:1.75;color:#25292e;background:#fff}',
    'h1,h2,h3{line-height:1.35;margin:1.6em 0 .5em;font-weight:650}',
    'h1{font-size:2rem}h2{font-size:1.5rem}h3{font-size:1.2rem}',
    'p{margin:.6em 0}ul,ol{padding-left:1.4em;margin:.6em 0}li{margin:.25em 0}',
    'blockquote{margin:1em 0;padding:.2em 0 .2em 1em;border-left:3px solid #d6d9de;color:#4b5158}',
    'pre{background:#f5f6f7;border:1px solid #e6e8eb;border-radius:8px;padding:14px;overflow:auto}',
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}',
    'pre code{background:none;padding:0}',
    ':not(pre)>code{background:#f0f1f3;padding:.1em .35em;border-radius:4px}',
    'hr{border:0;border-top:1px solid #e6e8eb;margin:2em 0}',
    'img{max-width:100%;border-radius:8px}',
    'figure{margin:1.2em 0}figcaption{font-size:.85rem;color:#6b7280;margin-top:.4em}',
    '.callout{display:flex;gap:10px;background:#f6f7f9;border:1px solid #e6e8eb;border-radius:10px;padding:14px 16px;margin:1em 0}',
    '.todo .done{color:#8b9199;text-decoration:line-through}',
    '.meta{color:#8b9199;font-size:.85rem;margin-bottom:2em}'
  ].join('');

  function pageToHtmlDocument(page) {
    var title = S.pageTitle(page);
    return [
      '<!DOCTYPE html>',
      '<html lang="ja">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + U.escapeHtml(title) + '</title>',
      '<style>' + DOC_CSS + '</style>',
      '</head>',
      '<body>',
      '<h1>' + U.escapeHtml((page.icon ? page.icon + ' ' : '') + title) + '</h1>',
      '<p class="meta">最終更新: ' + U.escapeHtml(U.formatDate(page.updatedAt)) + '</p>',
      blocksToHtml(page.blocks),
      '</body>',
      '</html>'
    ].join('\n');
  }

  function blocksToText(blocks) {
    var counter = 0;
    return (blocks || []).map(function (b) {
      if (b.type !== 'numbered') counter = 0;
      var t = S.stripTags(b.html);
      switch (b.type) {
        case 'heading1': return '\n' + t + '\n' + '='.repeat(Math.max(t.length, 3));
        case 'heading2': return '\n' + t + '\n' + '-'.repeat(Math.max(t.length, 3));
        case 'heading3': return '\n■ ' + t;
        case 'bulleted': return '・' + t;
        case 'numbered': counter += 1; return counter + '. ' + t;
        case 'todo': return (b.checked ? '[x] ' : '[ ] ') + t;
        case 'quote': return '| ' + t;
        case 'callout': return (b.emoji || '💡') + ' ' + t;
        case 'code': return t;
        case 'divider': return '--------------------------------';
        case 'image': return '[画像] ' + (b.caption || b.url || '');
        default: return t;
      }
    }).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function pageToText(page) {
    return S.pageTitle(page) + '\n' + '='.repeat(20) + '\n\n' + blocksToText(page.blocks);
  }

  /* =========================================================
   * HTML -> blocks (import)
   * ======================================================= */

  var ALLOWED_INLINE = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, CODE: 1, A: 1, BR: 1 };

  function sanitizeInline(node) {
    var out = '';
    node.childNodes.forEach(function (child) {
      if (child.nodeType === 3) { out += U.escapeHtml(child.nodeValue); return; }
      if (child.nodeType !== 1) return;
      var tag = child.tagName;
      var inner = sanitizeInline(child);
      if (tag === 'BR') { out += '<br>'; return; }
      if (!ALLOWED_INLINE[tag]) { out += inner; return; }
      if (tag === 'A') {
        var href = child.getAttribute('href') || '';
        if (!/^(https?:|mailto:|#|\/)/i.test(href)) { out += inner; return; }
        out += '<a href="' + U.escapeHtml(href) + '" target="_blank" rel="noopener">' + inner + '</a>';
        return;
      }
      var map = { STRONG: 'b', EM: 'i', STRIKE: 's', DEL: 's' };
      var name = map[tag] || tag.toLowerCase();
      out += '<' + name + '>' + inner + '</' + name + '>';
    });
    return out;
  }

  function htmlToBlocks(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    var blocks = [];
    walkChildren(doc.body);
    if (!blocks.length) blocks.push(S.newBlock('paragraph', ''));
    return blocks;

    function walkChildren(parent) {
      if (!parent) return;
      Array.prototype.forEach.call(parent.childNodes, function (node) {
        if (node.nodeType === 3) {
          var t = node.nodeValue.trim();
          if (t) blocks.push(S.newBlock('paragraph', U.escapeHtml(t)));
          return;
        }
        if (node.nodeType !== 1) return;
        var tag = node.tagName.toLowerCase();
        switch (tag) {
          case 'script': case 'style': case 'noscript': return;
          case 'h1': case 'h2': case 'h3':
            blocks.push(S.newBlock('heading' + tag[1], sanitizeInline(node))); return;
          case 'h4': case 'h5': case 'h6':
            blocks.push(S.newBlock('heading3', sanitizeInline(node))); return;
          case 'ul': case 'ol':
            Array.prototype.forEach.call(node.children, function (li) {
              if (li.tagName.toLowerCase() !== 'li') return;
              var cb = li.querySelector('input[type=checkbox]');
              if (cb) {
                var tb = S.newBlock('todo', sanitizeInline(li));
                tb.checked = cb.checked || cb.hasAttribute('checked');
                blocks.push(tb);
              } else {
                blocks.push(S.newBlock(tag === 'ul' ? 'bulleted' : 'numbered', sanitizeInline(li)));
              }
            });
            return;
          case 'blockquote':
            blocks.push(S.newBlock('quote', sanitizeInline(node))); return;
          case 'pre':
            var code = S.newBlock('code', U.escapeHtml(node.textContent || ''));
            var codeEl = node.querySelector('code');
            var cls = codeEl && codeEl.className.match(/language-([\w+#-]+)/);
            if (cls) code.lang = cls[1];
            blocks.push(code); return;
          case 'hr':
            blocks.push(S.newBlock('divider', '')); return;
          case 'img':
            var ib = S.newBlock('image', '');
            ib.url = node.getAttribute('src') || '';
            ib.caption = node.getAttribute('alt') || '';
            if (ib.url) blocks.push(ib);
            return;
          case 'p':
            var inline = sanitizeInline(node).trim();
            var cbx = node.querySelector('input[type=checkbox]');
            if (cbx) {
              var t2 = S.newBlock('todo', inline);
              t2.checked = cbx.checked || cbx.hasAttribute('checked');
              blocks.push(t2);
            } else if (inline) {
              blocks.push(S.newBlock('paragraph', inline));
            }
            var imgs = node.querySelectorAll('img');
            Array.prototype.forEach.call(imgs, function (im) {
              var b = S.newBlock('image', '');
              b.url = im.getAttribute('src') || '';
              b.caption = im.getAttribute('alt') || '';
              if (b.url) blocks.push(b);
            });
            return;
          case 'br': return;
          default:
            walkChildren(node);
        }
      });
    }
  }

  function htmlToPages(html, fallbackTitle) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    var title = (doc.title || '').trim() || fallbackTitle || '取り込んだメモ';
    var blocks = htmlToBlocks(html);
    if (blocks.length && blocks[0].type === 'heading1') {
      var raw = S.stripTags(blocks[0].html).trim();
      if (raw && (!doc.title || !doc.title.trim())) { title = raw; blocks = blocks.slice(1); }
      else if (raw === title) { blocks = blocks.slice(1); }
    }
    if (!blocks.length) blocks = [S.newBlock('paragraph', '')];
    return [{ title: title, blocks: blocks }];
  }

  function textToPages(text, fallbackTitle) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var title = fallbackTitle || '取り込んだメモ';
    var blocks = lines.map(function (l) {
      return S.newBlock('paragraph', U.escapeHtml(l.trim()));
    }).filter(function (b, idx, arr) {
      // collapse repeated empty lines
      return b.html || (arr[idx - 1] && arr[idx - 1].html);
    });
    if (!blocks.length) blocks = [S.newBlock('paragraph', '')];
    return [{ title: title, blocks: blocks }];
  }

  /* =========================================================
   * workspace level export
   * ======================================================= */

  function workspaceToJson(pretty) {
    var data = {
      app: 'MemoFlow',
      schema: S.SCHEMA,
      exportedAt: U.nowISO(),
      name: S.state.name,
      pages: S.state.pages
    };
    return JSON.stringify(data, null, pretty === false ? 0 : 2);
  }

  function pageToJson(page) {
    return JSON.stringify({
      app: 'MemoFlow',
      schema: S.SCHEMA,
      exportedAt: U.nowISO(),
      name: S.state.name,
      pages: [page].concat(S.descendants(page.id).filter(function (p) { return !p.deletedAt; }))
    }, null, 2);
  }

  function workspaceToMarkdown() {
    var parts = [];
    function walk(parentId, depth) {
      S.children(parentId).forEach(function (p) {
        parts.push('#'.repeat(Math.min(depth, 6)) + ' ' +
          (p.icon ? p.icon + ' ' : '') + S.pageTitle(p));
        parts.push('');
        parts.push(blocksToMarkdown(p.blocks).trim());
        parts.push('');
        walk(p.id, depth + 1);
      });
    }
    walk(null, 1);
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* =========================================================
   * minimal ZIP writer (store / no compression)
   * ======================================================= */

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTime(date) {
    var t = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) |
      ((Math.floor(date.getSeconds() / 2)) & 0x1f);
    var d = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) |
      (date.getDate() & 0x1f);
    return { time: t, date: d };
  }

  /** files: [{ name, text }] -> Blob (application/zip) */
  function makeZip(files) {
    var enc = new TextEncoder();
    var chunks = [];
    var central = [];
    var offset = 0;
    var stamp = dosTime(new Date());

    files.forEach(function (f) {
      var nameBytes = enc.encode(f.name);
      var dataBytes = enc.encode(f.text);
      var crc = crc32(dataBytes);

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);          // version needed
      lv.setUint16(6, 0x0800, true);      // UTF-8 filename flag
      lv.setUint16(8, 0, true);           // stored
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, dataBytes.length, true);
      lv.setUint32(22, dataBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, dataBytes);

      var cd = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, dataBytes.length, true);
      cv.setUint32(24, dataBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + dataBytes.length;
    });

    var centralSize = central.reduce(function (n, c) { return n + c.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
  }

  /** Every live page as an individual markdown file, folders mirroring the tree. */
  function workspaceToZip() {
    var files = [];
    var used = Object.create(null);
    function walk(parentId, dir) {
      S.children(parentId).forEach(function (p) {
        var base = U.safeFileName(S.pageTitle(p), 'page');
        var path = (dir ? dir + '/' : '') + base;
        var name = path + '.md';
        var n = 2;
        while (used[name]) { name = path + '-' + n + '.md'; n++; }
        used[name] = true;
        files.push({ name: name, text: pageToMarkdown(p, { meta: true }) });
        walk(p.id, path);
      });
    }
    walk(null, '');
    files.push({ name: 'memoflow-workspace.json', text: workspaceToJson() });
    if (!files.length) files.push({ name: 'README.txt', text: 'ページがありません' });
    return makeZip(files);
  }

  global.Convert = {
    inlineHtmlToMarkdown: inlineHtmlToMarkdown,
    markdownInlineToHtml: markdownInlineToHtml,
    blocksToMarkdown: blocksToMarkdown,
    pageToMarkdown: pageToMarkdown,
    markdownToBlocks: markdownToBlocks,
    markdownToPages: markdownToPages,
    blocksToHtml: blocksToHtml,
    pageToHtmlDocument: pageToHtmlDocument,
    blocksToText: blocksToText,
    pageToText: pageToText,
    htmlToBlocks: htmlToBlocks,
    htmlToPages: htmlToPages,
    textToPages: textToPages,
    sanitizeInline: sanitizeInline,
    workspaceToJson: workspaceToJson,
    pageToJson: pageToJson,
    workspaceToMarkdown: workspaceToMarkdown,
    workspaceToZip: workspaceToZip,
    makeZip: makeZip,
    DOC_CSS: DOC_CSS
  };
})(window);
