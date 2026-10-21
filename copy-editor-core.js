/* Peach 原位改字核心。以 classic script 同步注册，保存与工具条由各端适配器提供。 */
(() => {
  const SKIP = '[data-copy-editor],script,style,textarea,input,select,svg,[contenteditable]';
  const INTERACT = '[role="tab"],[role="switch"],[role="radio"],[role="radiogroup"],[role="slider"],[role="checkbox"],[role="combobox"],[data-platform-option],[aria-expanded],[aria-pressed],[aria-haspopup],summary,input,select,label,[data-copy-interact]';
  const spacing = new WeakMap();

  // 连续文字共用输入框，未改动的前后片段留在各自的行内元素里。
  function replaceTextParts(parts, text) {
    const before = parts.join('');
    let start = 0, suffix = 0;
    while (start < before.length && start < text.length && before[start] === text[start]) start++;
    while (suffix < before.length - start && suffix < text.length - start
      && before.at(-suffix - 1) === text.at(-suffix - 1)) suffix++;
    const end = before.length - suffix, insert = text.slice(start, text.length - suffix);
    let offset = 0, inserted = false;
    return parts.map((part, i) => {
      const from = offset; offset += part.length;
      const add = !inserted && start >= from && (start < offset || i === parts.length - 1);
      if (add) inserted = true;
      return part.slice(0, Math.max(0, Math.min(part.length, start - from)))
        + (add ? insert : '') + part.slice(Math.max(0, Math.min(part.length, end - from)));
    });
  }

  function cleanInline(element) {
    for (const child of [...element.querySelectorAll('span,code,b,strong,em,i,small,s,mark')].reverse()) {
      if (!child.textContent.trim() && !child.children.length
        && ![...child.attributes].some(attr => !['class', 'style'].includes(attr.name))) child.remove();
    }
    element.normalize();
  }

  async function readJson(response) {
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); }
    catch {
      const error = new Error(`未取得保存结果（HTTP ${response.status}），请刷新页面核对；服务未返回 JSON`);
      error.unconfirmed = response.ok;
      throw error;
    }
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || (typeof result?.detail === 'string' ? result.detail : `请求失败（HTTP ${response.status}）`));
    }
    if (result === null || typeof result !== 'object') {
      const error = new Error(`未取得保存结果（HTTP ${response.status}），请刷新页面核对`);
      error.unconfirmed = true;
      throw error;
    }
    return result;
  }

  function resolveDraft(edits, original) {
    if (!edits || typeof edits !== 'object') return original;
    let text = original;
    const seen = new Set();
    while (Object.hasOwn(edits, text) && !seen.has(text)) {
      seen.add(text);
      const next = edits[text];
      if (typeof next !== 'string') break;
      text = next;
    }
    return text;
  }

  function applyDrafts(root, edits, originals, skip = '') {
    if (!edits || typeof edits !== 'object') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement || node.parentElement.closest(SKIP + (skip ? ',' + skip : ''))) continue;
      const original = originals.get(node) ?? node.data.trim();
      if (!Object.hasOwn(edits, original)) continue;
      const text = resolveDraft(edits, original);
      originals.set(node, original);
      if (!spacing.has(node)) spacing.set(node, [/^\s*/.exec(node.data)[0], /\s*$/.exec(node.data)[0]]);
      const [lead, trail] = spacing.get(node);
      const next = lead + text + trail;
      if (node.data !== next) node.data = next;
    }
  }

  function create(options) {
    const skip = SKIP + (options.skip ? ',' + options.skip : '');
    const highlight = options.highlight || document.createElement('div');
    highlight.dataset.copyEditor = ''; highlight.dataset.copyHighlight = '';
    if (!options.highlight) document.body.append(highlight);
    let editing = null, busy = false, destroyed = false;
    const say = (message, tone) => options.onStatus?.(message, tone);
    const setBusy = value => { busy = value; options.onBusy?.(value); };
    const blocked = () => destroyed || busy || options.isBusy?.() || options.isActive?.() === false;
    const hideHighlight = () => { highlight.style.display = 'none'; };
    const scroll = () => { hideHighlight(); positionInput(); };
    const rectsOf = node => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()]; };
    function textAt(x, y) {
      const caret = document.caretPositionFromPoint?.(x, y), range = caret ? null : document.caretRangeFromPoint?.(x, y);
      const node = caret?.offsetNode || range?.startContainer;
      if (!node || node.nodeType !== 3 || !node.data.trim() || !node.parentElement || node.parentElement.closest(skip)) return null;
      return rectsOf(node).some(rect => x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) ? node : null;
    }
    const resolve = node => options.resolve ? options.resolve(node) : {};
    function move(event) {
      if (blocked() || editing) return;
      if (!event.altKey && event.target.closest?.(INTERACT)) { hideHighlight(); return; }
      const node = textAt(event.clientX, event.clientY);
      if (!node || !resolve(node)) { hideHighlight(); return; }
      const rects = rectsOf(resolve(node)?.element || node), left = Math.min(...rects.map(rect => rect.left)), top = Math.min(...rects.map(rect => rect.top));
      Object.assign(highlight.style, { position: 'fixed', display: 'block', left: left + 'px', top: top + 'px',
        width: Math.max(...rects.map(rect => rect.right)) - left + 'px', height: Math.max(...rects.map(rect => rect.bottom)) - top + 'px' });
    }
    function click(event) {
      if (blocked() || event.target.closest?.(skip)) return;
      if (!event.altKey && event.target.closest?.(INTERACT)) { if (editing) commit(); return; }
      if (editing) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!editing.box.contains(event.target)) commit();
        return;
      }
      const node = textAt(event.clientX, event.clientY), target = node && resolve(node);
      if (!target) return;
      event.preventDefault(); event.stopImmediatePropagation(); begin(node, target);
    }
    function positionInput() {
      if (editing?.box.tagName !== 'INPUT' || !editing.node.isConnected) return;
      const rect = rectsOf(editing.node)[0];
      if (!rect) return;
      const viewport = window.visualViewport, width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const inputWidth = Math.min(Math.max(140, rect.width + 60), Math.max(1, width - 32));
      const inputHeight = editing.box.getBoundingClientRect().height;
      Object.assign(editing.box.style, { left: Math.max(x + 16, Math.min(rect.left - 6, x + width - inputWidth - 16)) + 'px',
        top: Math.max(y + 2, Math.min(rect.top + (rect.height - inputHeight) / 2, y + height - inputHeight - 2)) + 'px', width: inputWidth + 'px' });
    }
    async function begin(node, target) {
      const before = target.element ? target.element.textContent : node.data, originalText = before.trim();
      let ed = { node, before, originalText, lead: /^\s*/.exec(before)[0], trail: /\s*$/.exec(before)[0],
        core: originalText, multiline: !!node.parentElement.closest('pre,code'), ...target };
      setBusy(true);
      try {
        const prepared = await options.prepare?.(ed);
        if (prepared === null || destroyed || !node.isConnected || (ed.element ? ed.element.textContent : node.data) !== before) { say('已取消'); return; }
        ed = { ...ed, ...prepared };
        const input = !!node.parentElement.closest('button,a,[role="button"]');
        const box = document.createElement(input ? 'input' : 'span');
        ed.box = box;
        if (input) {
          box.dataset.copyEditor = ''; box.dataset.copyInput = '';
          if (options.inputClass) box.className = options.inputClass;
          box.value = ed.core;
          const style = getComputedStyle(node.parentElement);
          Object.assign(box.style, { position: 'fixed', boxSizing: 'border-box', font: style.font, letterSpacing: style.letterSpacing });
          const host = node.parentElement.closest('dialog[open]') || document.body;
          ed.placeholder = document.createElement('span'); ed.placeholder.dataset.copyEditor = '';
          ed.placeholder.style.visibility = 'hidden';
          node.replaceWith(ed.placeholder); ed.placeholder.append(node);
          host.append(box);
        } else {
          box.dataset.copyInline = '';
          if (options.inlineClass) box.className = options.inlineClass;
          box.contentEditable = 'plaintext-only'; box.spellcheck = false; box.textContent = ed.core;
          if (ed.element) {
            ed.parts = ed.nodes.map(node => node.data);
            ed.fragment = document.createDocumentFragment();
            ed.fragment.append(...ed.element.childNodes);
            ed.element.append(box);
          } else node.replaceWith(...[ed.lead, box, ed.trail].filter(Boolean));
        }
        box.setAttribute('aria-label', '修改文字'); editing = ed; positionInput(); box.focus();
        if (input) box.select();
        else { const range = document.createRange(); range.selectNodeContents(box); getSelection()?.removeAllRanges(); getSelection()?.addRange(range); }
        hideHighlight(); say(ed.candidate?.template ? '保留 {占位符}，只改文字 · Enter 保存 · Esc 取消' : 'Enter 保存 · Esc 取消');
        box.addEventListener('keydown', event => {
          event.stopPropagation(); if (event.isComposing) return;
          if (event.key === 'Enter' && !(ed.multiline && event.shiftKey)) { event.preventDefault(); commit(); }
          else if (event.key === 'Escape') { event.preventDefault(); commit(true); }
        });
        box.addEventListener('blur', () => commit());
        if (ed.element) box.addEventListener('input', () => {
          const text = box.textContent.replace(/\s*\n\s*/g, ' ').trim();
          ed.parts = replaceTextParts(ed.parts, ed.lead + text + ed.trail);
        });
      } catch (error) { say(error.message, 'err'); }
      finally { setBusy(false); }
    }
    function putBack(ed) {
      if (ed.box.tagName === 'INPUT') { ed.placeholder.replaceWith(ed.node); ed.box.remove(); return; }
      if (ed.element) { ed.box.replaceWith(ed.fragment); return; }
      const a = ed.box.previousSibling, c = ed.box.nextSibling;
      if (ed.lead && a?.nodeType === 3) a.remove();
      if (ed.trail && c?.nodeType === 3) c.remove();
      ed.box.replaceWith(ed.node);
    }
    async function commit(cancel = false) {
      const ed = editing; if (!ed) return; editing = null;
      const value = ed.box.tagName === 'INPUT' ? ed.box.value : ed.box.textContent;
      const text = (ed.multiline ? value : value.replace(/\s*\n\s*/g, ' ')).trim();
      const connected = ed.node.isConnected || ed.box.isConnected;
      putBack(ed);
      if (cancel || !connected) { say('已取消'); return; }
      if (text === ed.core) return;
      setBusy(true); say('保存中…');
      let persisted = false;
      try {
        const result = await options.save(ed, text) ?? {};
        persisted = true;
        const rendered = result.text ?? text;
        if (ed.element) {
          const parts = replaceTextParts(ed.parts, ed.lead + rendered + ed.trail);
          ed.nodes.forEach((node, i) => { node.data = parts[i]; });
          cleanInline(ed.element);
        } else if (result.remove) ed.node.remove(); else ed.node.data = ed.lead + rendered + ed.trail;
        say(result.message || (rendered ? '已保存修改' : '已删除文字'), 'ok');
        await options.onSaved?.(ed, { ...result, text: rendered });
      } catch (error) {
        if (!persisted && !ed.element) ed.node.data = ed.before;
        say((persisted ? '已保存，界面更新未完成：' : error.unconfirmed ? '未确认保存：' : '没保存：') + error.message, 'err');
      } finally { setBusy(false); }
    }
    document.addEventListener('mousemove', move, { passive: true });
    document.addEventListener('click', click, true);
    addEventListener('scroll', scroll, true);
    addEventListener('resize', positionInput);
    window.visualViewport?.addEventListener('resize', positionInput);
    window.visualViewport?.addEventListener('scroll', positionInput);
    return {
      commit, hideHighlight,
      get editing() { return editing; }, get busy() { return busy; },
      destroy() {
        commit(true); destroyed = true; hideHighlight();
        document.removeEventListener('mousemove', move);
        document.removeEventListener('click', click, true);
        removeEventListener('scroll', scroll, true);
        removeEventListener('resize', positionInput);
        window.visualViewport?.removeEventListener('resize', positionInput);
        window.visualViewport?.removeEventListener('scroll', positionInput);
        if (!options.highlight) highlight.remove();
      },
    };
  }
  globalThis.PeachCopyEditorCore = Object.freeze({ version: 1, create, readJson, resolveDraft, applyDrafts, replaceTextParts });
})();
