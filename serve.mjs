// 本地预览 site/：node serve.mjs [端口]，只监听 127.0.0.1。
// 支持 Range 请求，视频才能跳转进度、播放器的悬停预览才会动；Python 的 http.server 不支持。
// 打开 /?edit 进入改字模式：点页面上的文字直接改，回车保存，写回 site/index.html（见 edit-server.mjs）。
import http from "node:http";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as edit from "./edit-server.mjs";

const root = fileURLToPath(new URL("./site/", import.meta.url));
const port = Number(process.argv[2] || 8790);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".mp4": "video/mp4", ".ico": "image/x-icon" };
const index = path.join(root, "index.html");

async function editRequest(req, res, url) {
  // 只收本页发来的请求，别的网页借浏览器发过来的一律拒
  if (![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) { res.writeHead(403).end(); return; }
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 65536) { res.writeHead(413).end(); return; } }
  let result;
  try { result = await edit.post(index, url.pathname === "/__edit/tab" ? "tab" : "text", JSON.parse(body)); }
  catch (err) { result = { status: 500, json: { error: String(err) } }; }
  res.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(result.json));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const name = decodeURIComponent(url.pathname);
  if (req.method === "POST" && name.startsWith("/__edit/")) { await editRequest(req, res, url); return; }
  if (name === "/__edit.js") { res.writeHead(200, { "Content-Type": types[".js"], "Cache-Control": "no-store" }); createReadStream(edit.client).pipe(res); return; }
  if (url.searchParams.has("edit") && (name === "/" || name === "/index.html")) {
    const html = await edit.page(index, port);
    res.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-store" }).end(html);
    return;
  }
  const file = path.join(root, name.endsWith("/") ? name + "index.html" : name);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let info;
  try { info = await stat(file); } catch { res.writeHead(404).end("Not found"); return; }
  const headers = { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range) {
    const start = range[1] ? Number(range[1]) : info.size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) { res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end(); return; }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${info.size}`, "Content-Length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "Content-Length": info.size });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
