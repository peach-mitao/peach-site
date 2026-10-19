// 改字模式的页面端（serve.mjs 在 /?edit 时插在 body 里第一个 <script> 之前，页面自己的脚本还没动过 DOM）。
// 先按文档顺序取下 body 里的每一段文字，和服务端给的源文件原文逐段核对；对得上的段落才能改。
// 点一段文字就在原位变成可编辑，回车或点别处保存，Esc 取消；保存时只发「第几段、原文、新文字」。
// 导览区那句轮换说明和标签名由脚本从按钮的 data-say / data-label 换进来，改的是当前选中那个标签页的属性。
// 切换控件照常操作；Alt+点击可改控件文字。动态文案按 data-copy-key 保存各个状态。
// 不开放：动效卡里的演示界面、播放器读数、图标里的文字与贴纸便签。
(() => {
  const {raw} = window.__EDIT;
  const decode = (s) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const index = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const found = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest("script,style")) found.push(n);
  let bad = -1;
  for (let i = 0; i < Math.max(found.length, raw.length); i++) {
    if (!found[i] || raw[i] === undefined || decode(raw[i]) !== found[i].data) { bad = i; break; }
    index.set(found[i], i);
  }
  if (bad >= 0) console.warn("改字模式：第", bad, "段起和源文件对不上", JSON.stringify(found[bad]?.data), JSON.stringify(raw[bad]));

  const SKIP = "svg, #live .mk, .media-01, .__eb";
  const kindOf = (n) => {
    const el = n.parentElement;
    if (!el || !n.data.trim() || el.closest(SKIP)) return null;
    if (el.closest('[data-copy-key]')) return 'copy';
    if (el.closest("#stage-say")) return "say";
    if (el.closest("#dock-label")) return "label";
    return index.has(n) ? "text" : null;
  };
  const rectsOf = (n) => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()]; };
  function textAt(x, y) {
    const r = document.caretRangeFromPoint?.(x, y);
    const n = r?.startContainer;
    if (!n || n.nodeType !== 3) return null;
    return rectsOf(n).some((b) => x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2) ? n : null;
  }

  const css = document.createElement("style");
  css.textContent = `
[data-copy-draft],[data-copy-draft] *{color:#F4C0BD!important}
.__eh{position:absolute;pointer-events:none;z-index:2147483000;outline:1.5px dashed #F08A8C;outline-offset:3px;border-radius:4px;display:none}
.__ee{outline:2px solid #F08A8C;outline-offset:3px;border-radius:3px;background:rgba(240,138,140,.14);-webkit-user-select:text;user-select:text;cursor:text}
.__ei{position:absolute;z-index:2147483001;padding:2px 6px;border:0;border-radius:4px;outline:2px solid #F08A8C;background:#141518;color:#fff}
.__eb{position:fixed;left:16px;bottom:16px;z-index:2147483002;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 14px;border-radius:10px;max-width:calc(100vw - 32px);box-sizing:border-box;
  font:13px/1.4 system-ui,"Microsoft YaHei",sans-serif;color:#C9CDD3;background:rgba(17,18,20,.94);border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 30px rgba(0,0,0,.4)}
.__eb b{color:#fff}.__eb .ok{color:#7BD88F}.__eb .err{color:#FF8A80}`;
  document.head.append(css);
  const hl = document.createElement("div"); hl.className = "__eh";
  const bar = document.createElement("div"); bar.className = "__eb";
  bar.innerHTML = `<b>改字模式</b><span>点文字编辑，切换照常；Alt+点击改控件文字；回车保存，Esc 取消</span><span class="st"></span>`;
  const status = bar.querySelector(".st");
  const say = (msg, cls) => { status.textContent = msg; status.className = "st " + (cls || ""); };
  addEventListener("DOMContentLoaded", () => {
    document.body.append(hl, bar);
    if (bad >= 0) say(`第 ${bad} 段起和源文件对不上，那之后的文字不能改（详情在控制台）`, "err");
  });

  let editing = null;
  addEventListener("mousemove", (e) => {
    if (editing) return;
    const n = textAt(e.clientX, e.clientY);
    if (!n || !kindOf(n)) { hl.style.display = "none"; return; }
    const rs = rectsOf(n);
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    const w = Math.max(...rs.map((r) => r.right)) - l, h = Math.max(...rs.map((r) => r.bottom)) - t;
    Object.assign(hl.style, {display: "block", left: l + scrollX + "px", top: t + scrollY + "px", width: w + "px", height: h + "px"});
  }, {passive: true});

  addEventListener("click", (e) => {
    if (e.target.closest?.(".__eb")) return;
    if (e.target.closest?.(SKIP)) return;
    if (!e.altKey && e.target.closest?.('[role="tab"], [role="switch"], [role="radiogroup"], [role="slider"], [role="checkbox"], [role="combobox"], [data-platform-option], [aria-expanded], [aria-pressed], [aria-haspopup], summary, input, select, label, [data-copy-interact]')) {
      if (editing) commit();
      return;
    }
    e.preventDefault(); e.stopPropagation();
    if (editing) { if (!editing.box.contains(e.target)) commit(); return; }
    const n = textAt(e.clientX, e.clientY);
    const kind = n && kindOf(n);
    if (kind) begin(n, kind);
  }, true);

  function begin(node, kind) {
    const field = node.parentElement?.closest('[data-copy-key]');
    const multiline = !!node.parentElement?.closest('pre,code');
    const data = node.data;
    const lead = /^\s*/.exec(data)[0], trail = /\s*$/.exec(data)[0];
    const core = data.slice(lead.length, data.length - trail.length);
    let box;
    if (node.parentElement.closest("button")) {
      // 按钮里的文字没法原位编辑（按下会先聚焦按钮），在文字上盖一个同字体的输入框
      const rs = rectsOf(node), st = getComputedStyle(node.parentElement);
      box = document.createElement("input"); box.className = "__ei"; box.value = core;
      const width = Math.min(Math.max(140, rs[0].width + 60), innerWidth - 32);
      Object.assign(box.style, {left: Math.max(16, Math.min(rs[0].left - 6, innerWidth - width - 16)) + scrollX + "px", top: rs[0].top + scrollY - 2 + "px",
        width: width + "px", boxSizing: 'border-box', font: st.font, letterSpacing: st.letterSpacing});
      document.body.append(box);
      box.select();
    } else {
      box = document.createElement("span"); box.className = "__ee"; box.spellcheck = false;
      box.contentEditable = "plaintext-only"; box.textContent = core;
      node.replaceWith(...[lead, box, trail].filter(Boolean));
      box.focus();
      const r = document.createRange(); r.selectNodeContents(box);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    }
    hl.style.display = "none";
    editing = {node, kind, lead, trail, core, box, key: field?.dataset.copyKey,
      multiline};
    box.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !(e.shiftKey && editing?.multiline)) { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); commit(true); }
    });
    box.addEventListener("blur", () => commit());
  }

  // 把编辑框换回原来的文字节点，节点本身不换，段号的对应关系就一直有效
  function putBack(ed) {
    if (ed.box.tagName === "INPUT") { ed.box.remove(); return; }
    const {previousSibling: a, nextSibling: c} = ed.box;
    if (ed.lead && a?.nodeType === 3) a.remove();
    if (ed.trail && c?.nodeType === 3) c.remove();
    ed.box.replaceWith(ed.node);
  }

  async function commit(cancel) {
    const ed = editing;
    if (!ed) return;
    editing = null;
    const value = ed.box.tagName === "INPUT" ? ed.box.value : ed.box.textContent;
    const text = (ed.multiline ? value : value.replace(/\s*\n\s*/g, " ")).trim();
    putBack(ed);
    if (cancel || text === ed.core) return;
    const before = ed.node.data;
    ed.node.data = ed.lead + text + ed.trail;
    say("保存中…");
    try {
      let url, body;
      if (ed.kind === 'copy') {
        const overrides = JSON.parse(document.body.dataset.copyOverrides || '{}');
        url = '/__edit/copy'; body = {key: ed.key, before: Object.hasOwn(overrides, ed.key) ? overrides[ed.key] : '', text};
      } else if (ed.kind === "text") {
        const i = index.get(ed.node);
        url = "/__edit/text"; body = {i, raw: raw[i], text};
      } else {
        const tab = document.querySelector('.dock [aria-selected="true"]');
        url = "/__edit/tab";
        if (ed.kind === "label") body = {k: tab.dataset.k, oldLabel: tab.dataset.label, label: text};
        else {
          const t = document.createElement("template"); t.innerHTML = tab.dataset.say;
          const oldTitle = t.content.querySelector("b")?.textContent ?? "", oldSub = t.content.querySelector(".sub")?.textContent ?? "";
          const sub = !!ed.node.parentElement.closest(".sub");
          body = {k: tab.dataset.k, oldTitle, oldSub, title: sub ? oldTitle : text, sub: sub ? text : oldSub};
        }
      }
      const res = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      const response = await res.text();
      let out;
      try { out = JSON.parse(response); } catch {
        throw Error(`保存接口未返回有效数据（HTTP ${res.status}），请刷新编辑页后重试`);
      }
      if (!res.ok) throw new Error(out.error || res.status);
      if (ed.kind === 'copy') {
        document.body.dataset.copyOverrides = JSON.stringify(out.overrides);
        dispatchEvent(new Event('peach:copy-saved'));
      } else if (ed.kind === "text") {
        if (out.raw === "") {
          raw.splice(body.i, 1); index.delete(ed.node); ed.node.remove();
          for (const [node, i] of index) if (i > body.i) index.set(node, i - 1);
        } else raw[body.i] = out.raw;
      }
      else {
        const tab = document.querySelector(`.dock [data-k="${body.k}"]`);
        if (ed.kind === "label") { tab.dataset.label = text; tab.setAttribute("aria-label", text); }
        else tab.dataset.say = `<b>${esc(body.title)}</b>` + (body.sub ? `<span class="sub">${esc(body.sub)}</span>` : "");
      }
      say(text ? "已保存「" + text.slice(0, 24) + (text.length > 24 ? "…" : "") + "」" : "已删除文字", "ok");
    } catch (err) {
      ed.node.data = before;
      say("没保存：" + err.message, "err");
    }
  }
})();
