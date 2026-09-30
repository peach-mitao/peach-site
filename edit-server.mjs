// 预览页直接改字的服务端（serve.mjs 调用，只在本地预览用，不随 site/ 部署）。
// 打开 /?edit 时，在 body 里第一个 <script> 之前插入 edit-client.js，并附上这之前每一段文字在源文件里的原文；
// 客户端按文档顺序把页面上的文字节点和这份原文一一对上，改完把「第几段、原文、新文字」发回来，
// 这里重读 index.html、核对那一段原文没变，再只替换那一段写回。导览区的轮换说明另走 data-say 属性。
import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// 放进单引号属性的 HTML：先按文字转义，再按属性转义
const attrSq = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
const attrDq = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// 从 from 扫到 to，列出每一段文字节点在源文件里的起止位置；跳过注释、script、style 的内容，
// 与浏览器一样丢掉紧跟在 <pre> 开标签后的那个换行。
function textSlices(html, from, to) {
  const out = [];
  let i = from, text = i;
  const flush = (end) => { if (end > text) out.push([text, end]); };
  while (i < to) {
    if (html[i] !== "<" || !/[A-Za-z\/!?]/.test(html[i + 1] || "")) { i++; continue; }
    flush(i);
    if (html.startsWith("<!--", i)) { i = html.indexOf("-->", i + 4) + 3; text = i; continue; }
    let j = i + 1, quote = null;
    for (; j < to; j++) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const name = (/^<([A-Za-z][\w-]*)/.exec(html.slice(i, i + 40)) || [])[1]?.toLowerCase();
    i = j + 1;
    if (name === "script" || name === "style") i = html.toLowerCase().indexOf(`</${name}`, i);
    else if (name === "pre" && html[i] === "\n") i++;
    text = i;
  }
  flush(to);
  return out;
}

function bounds(html) {
  const body = html.indexOf("<body");
  const from = html.indexOf(">", body) + 1;
  const to = html.indexOf("<script", from);
  return { from, to };
}

export async function page(file, port) {
  const html = await readFile(file, "utf8");
  const { from, to } = bounds(html);
  const raw = textSlices(html, from, to).map(([a, b]) => html.slice(a, b));
  const data = JSON.stringify({ raw, port }).replace(/</g, "\\u003c");
  // 两个 script 之间不能留空白：客户端取文字时那段空白已经在 DOM 里，会多出一段
  const inject = `<script>window.__EDIT=${data}</script><script src="/__edit.js"></script>\n`;
  return html.slice(0, to) + inject + html.slice(to);
}

async function save(file, html) {
  const tmp = file + ".tmp";
  await writeFile(tmp, html, "utf8");
  await rename(tmp, file);
}

const say = (title, sub) => `<b>${esc(title)}</b>` + (sub ? `<span class="sub">${esc(sub)}</span>` : "");

// 导览区的六个标签：按钮上的 data-say / data-label 是真相，首页那个还同时写在 #stage-say 和 #dock-label 里
function editTab(html, body) {
  const tag = new RegExp(`<button role="tab" aria-selected="(true|false)" data-k="${body.k.replace(/\W/g, "")}"(?:[^>"']|"[^"]*"|'[^']*')*>`).exec(html);
  if (!tag) return { error: "找不到这个标签页" };
  let t = tag[0];
  const selected = tag[1] === "true";
  if ("title" in body) {
    const old = `data-say='${attrSq(say(body.oldTitle, body.oldSub))}'`;
    if (!t.includes(old)) return { error: "源文件里这一句已经变了，刷新再改" };
    t = t.replace(old, `data-say='${attrSq(say(body.title, body.sub))}'`);
    if (selected) html = html.replace(/(<p [^>]*id="stage-say"[^>]*>)[\s\S]*?(<\/p>)/, (m, a, b) => a + say(body.title, body.sub) + b);
  } else {
    const old = `data-label="${attrDq(body.oldLabel)}"`;
    if (!t.includes(old)) return { error: "源文件里这个名字已经变了，刷新再改" };
    t = t.replace(old, `data-label="${attrDq(body.label)}"`).replace(/aria-label="[^"]*"/, `aria-label="${attrDq(body.label)}"`);
    if (selected) html = html.replace(/(<div [^>]*id="dock-label"[^>]*>)[\s\S]*?(<\/div>)/, (m, a, b) => a + esc(body.label) + b);
  }
  return { html: html.replace(tag[0], t) };
}

export async function post(file, kind, body) {
  const html = await readFile(file, "utf8");
  if (kind === "tab") {
    const r = editTab(html, body);
    if (r.error) return { status: 409, json: { error: r.error } };
    await save(file, r.html);
    return { status: 200, json: { ok: true } };
  }
  const { from, to } = bounds(html);
  const slice = textSlices(html, from, to)[body.i];
  if (!slice || html.slice(...slice) !== body.raw) return { status: 409, json: { error: "源文件里这一段已经变了，刷新再改" } };
  const [lead] = /^\s*/.exec(body.raw), [trail] = /\s*$/.exec(body.raw);
  const next = lead + esc(body.text) + trail;
  await save(file, html.slice(0, slice[0]) + next + html.slice(slice[1]));
  return { status: 200, json: { ok: true, raw: next } };
}

export const client = fileURLToPath(new URL("./edit-client.js", import.meta.url));
