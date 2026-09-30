// 首屏贴纸：每张是一个 Sticker Forge 实例（WebGL 撕纸），外面包一层让它能拖走。
// 贴纸钉在页面上：往下滚就跟首屏一起滚走，不跟着窗口走；坐标一律用页面坐标（pageX/pageY）。
// Sticker Forge 自己只能在画布里撕起、甩飞；这里把画布放进一个小盒子，
//   · 按住边缘撕起过半，盒子就跟着指针走，撕起的姿态保持不变；
//   · 按住中间直接拖，用 setPeelProgress 翘起一角再跟着走；
//   · 松手后盒子留在新位置，贴纸自己弹回、贴平。
// 盒子平时不接指针，指针进到贴纸本体上才接，透明的边距不挡页面上的按钮。
// 默认位置只落在首屏标题和按钮两侧的空白里：横坐标按空白宽度等比换算，空白窄了贴纸跟着缩小，太窄就不贴。
// 提示：进场逐张落下；每隔几秒轮流翘一下角；每次打开时显示「拖我试试」便签，本次拖过就收起。

// 按 1440 宽排：x 为正从左边量、为负从右边量，y 从顶上量，size 是贴纸本体的显示宽度（CSS 像素）。
// size 不超过贴纸图宽度的一半，高分屏上也不糊。corner 是翘角提示从哪一角起（0..1，y 向下）。
const LIST = [
  {src: "/assets/stickers/115.png", x: 145, y: 175, size: 68, tilt: -10, corner: [0.9, 0.9]},
  {src: "/assets/stickers/kemono.png", x: 280, y: 270, size: 58, tilt: -4, corner: [0.9, 0.2]},
  {src: "/assets/stickers/pikpak.png", x: 120, y: 350, size: 64, tilt: 8, corner: [0.06, 0.94]},
  {src: "/assets/stickers/javdb.svg", x: 245, y: 440, size: 140, tilt: -6, corner: [0.97, 0.9]},
  {src: "/assets/stickers/patreon.png", x: 130, y: 535, size: 56, tilt: -12, corner: [0.94, 0.94]},
  {src: "/assets/stickers/remu.png", x: -155, y: 180, size: 88, tilt: 7, corner: [0.85, 0.75], hint: true},
  {src: "/assets/stickers/fanbox.png", x: -280, y: 295, size: 62, tilt: 12, corner: [0.94, 0.94]},
  {src: "/assets/stickers/yuna.png", x: -140, y: 410, size: 84, tilt: -5, corner: [0.15, 0.75]},
  {src: "/assets/stickers/f95zone.png", x: -265, y: 525, size: 58, tilt: 9, corner: [0.1, 0.9]},
];
const KEY = "peach.stickers.v3";
const PAD = 36;          // 贴图四周留的透明像素，白边画在这里（不计入显示尺寸）
const ROOM = 2;          // 盒子是贴纸的几倍大，给卷边和投影留地方
const CARRY_AT = 0.5;    // 边缘撕起到这个进度，开始整张跟着走
const GUTTER = 351;      // 1440 宽时首屏文字两侧各留的空白（实测 375，减去 24 的间距）
const MIN_GUTTER = 140;  // 空白比这窄就不贴
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
let touched = false;
let zTop = 1, active = null, tag = null;

// 首屏标题、副标题和按钮实际占的横向范围，两侧剩下的空白（取较窄一侧，减去间距）
function gutter() {
  const rects = [...document.querySelectorAll(".hero h1, .hero .say")].map((el) => {
    const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect();
  });
  for (const el of document.querySelectorAll(".hero .cta > *")) rects.push(el.getBoundingClientRect());
  if (!rects.length) return GUTTER;
  const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
  return Math.min(left, innerWidth - right) - 24;
}
const room = gutter();
const spread = room / GUTTER, shrink = Math.min(1, spread);
const home = (item) => ({x: item.x < 0 ? innerWidth + item.x * spread : item.x * spread, y: item.y});

const layer = document.createElement("div");
layer.className = "stk-layer";
layer.setAttribute("aria-hidden", "true");
document.body.append(layer);

const tween = (ms, step) => new Promise((done) => {
  const t0 = performance.now();
  const frame = (now) => { const t = Math.min(1, (now - t0) / ms); step(t); t < 1 ? requestAnimationFrame(frame) : done(); };
  requestAnimationFrame(frame);
});
const ease = (t) => 1 - (1 - t) ** 3;

function imageSize(src) {
  return new Promise((ok, fail) => { const img = new Image(); img.onload = () => ok([img.naturalWidth || 300, img.naturalHeight || 100]); img.onerror = fail; img.src = src; });
}

async function mount(item, index) {
  const [iw, ih] = await imageSize(item.src);
  const vw = Math.round(item.size * shrink), vh = vw * ih / iw;
  const bw = Math.round(vw * ROOM), bh = Math.round(vh * ROOM);
  const box = document.createElement("div");
  box.className = "stk";
  box.dataset.i = index;
  Object.assign(box.style, {width: bw + "px", height: bh + "px", zIndex: zTop++});
  layer.append(box);
  const s = {item, box, vw, vh, bw, bh, iw, ih, cx: 0, cy: 0, index, inst: null, busy: false};
  const pos = saved[item.src] || home(item);
  place(s, pos.x, pos.y);
  const preview = document.createElement('img');
  preview.src = item.src; preview.alt = ''; preview.draggable = false;
  preview.className = 'stk-preview';
  Object.assign(preview.style, {width: vw+'px', height: vh+'px', transform:`translate(-50%,-50%) rotate(${item.tilt}deg)`});
  box.append(preview); s.preview = preview; box.classList.add('on');
  return s;
}

async function enhance(s, createSticker) {
  const {item, box, vw, vh} = s;
  // 默认 2048px 会逐像素计算距离场与外轮廓；纹理保持至少两倍显示精度。
  // 宽标志保留较大的长边，以满足库的 320px 短边下限并保持原始比例。
  const textureMaxEdge = Math.min(2048, Math.max(512, Math.ceil(Math.max(s.iw/s.ih,s.ih/s.iw)*340/128)*128, Math.ceil(Math.max(vw,vh)*Math.min(devicePixelRatio||1,2)/128)*128));
  const textureScale = textureMaxEdge/2048;
  s.inst = await createSticker(box, {
    source: {type: "image", src: item.src, name: item.src, padding: PAD*textureScale, textureMaxEdge},
    display: {width: vw, height: vh},
    tilt: item.tilt,
    outline: {width: 14*textureScale},
    shadow: {opacity: 0.32, blur: 18, distance: 10},
    peel: {release: "reset", grabWidth: 30},
    sound: {enabled: false, volume: 0.5},
    quality: "medium",
  });
  s.preview.remove();
  wire(s);
  box.dataset.readyAt = performance.now().toFixed(1);
  if (!calm) s.inst.reappear();
}

function place(s, cx, cy) {
  // 贴纸中心至少留 30px 在页面里，拖出去也能拖回来
  s.cx = Math.max(30, Math.min(innerWidth - 30, cx));
  s.cy = Math.max(30, Math.min(document.documentElement.scrollHeight - 30, cy));
  s.box.style.transform = `translate(${s.cx - s.bw / 2}px,${s.cy - s.bh / 2}px) rotate(var(--swing,0deg))`;
}
// 白边加撕起的抓取带都算贴纸本体
const over = (s, x, y) => Math.abs(x - s.cx) < s.vw / 2 + 22 && Math.abs(y - s.cy) < s.vh / 2 + 22;

function wire(s) {
  const {box, inst} = s;
  let start = null, mode = null, anchor = null, lift = 0, lastX = 0, lastT = 0, vx = 0;
  // 捕获阶段先于画布自己的监听，Sticker Forge 读到的盒子位置已经是这一帧的
  box.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    active = s; s.busy = true; mode = null;
    start = {x: e.pageX, y: e.pageY, cx: s.cx, cy: s.cy};
    lastX = e.pageX; lastT = performance.now(); vx = 0;
    box.style.zIndex = ++zTop;
    inst.setOptions({sound: {enabled: true}});
  }, true);
  const move = (e) => {
    if (active !== s || !start) return;
    const st = inst.getState();
    if (!mode) {
      if (st.dragging) mode = "peel";
      else if (Math.hypot(e.pageX - start.x, e.pageY - start.y) > 4) {
        // 按在中间：Sticker Forge 不接，自己拿起来，翘起一角
        mode = "lift"; box.setPointerCapture(e.pointerId);
        anchor = {x: e.pageX, y: e.pageY, cx: s.cx, cy: s.cy};
        const motion = {origin: {x: s.item.corner[0], y: s.item.corner[1]}, target: {x: 0.5, y: 0.5}};
        tween(160, (t) => { lift = 0.3 * ease(t); inst.setPeelProgress(lift, motion); });
      }
    }
    if (mode === "peel" && !anchor && st.progress >= CARRY_AT) anchor = {x: e.pageX, y: e.pageY, cx: s.cx, cy: s.cy};
    if (anchor) {
      const now = performance.now();
      vx = vx * 0.7 + ((e.pageX - lastX) / Math.max(1, now - lastT)) * 0.3;
      // 只在按中间拿起时随速度摆一下；撕着走时盒子一转，画布的外接矩形跟着变，撕起的姿态会乱
      if (mode === "lift") box.style.setProperty("--swing", Math.max(-14, Math.min(14, vx * 10)).toFixed(1) + "deg");
      place(s, anchor.cx + e.pageX - anchor.x, anchor.cy + e.pageY - anchor.y);
    }
    lastX = e.pageX; lastT = performance.now();
  };
  const end = async (e) => {
    if (active !== s || !start) return;
    const carried = !!anchor, wasLift = mode === "lift";
    active = null; start = null; anchor = null; mode = null;
    box.style.setProperty("--swing", "0deg");
    if (box.hasPointerCapture?.(e.pointerId)) box.releasePointerCapture(e.pointerId);
    if (wasLift) {
      const motion = {origin: {x: s.item.corner[0], y: s.item.corner[1]}, target: {x: 0.5, y: 0.5}};
      const from = lift;
      await tween(240, (t) => inst.setPeelProgress(from * (1 - ease(t)), motion));
      inst.reset();
    }
    s.busy = false;
    if (carried) {
      saved[s.item.src] = {x: s.cx, y: s.cy};
      localStorage.setItem(KEY, JSON.stringify(saved));
      if (!touched) { touched = true; tag?.classList.add("gone"); }
    }
  };
  addEventListener("pointermove", move, true);
  addEventListener("pointerup", end, true);
  addEventListener("pointercancel", end, true);
}

async function start() {
  if (room < MIN_GUTTER) { layer.remove(); return; }
  const stickers = (await Promise.allSettled(LIST.map(mount))).filter(r=>r.status==='fulfilled').map(r=>r.value);
  if (!stickers.length) { layer.remove(); return; }
  // 指针在哪张贴纸本体上，就只让那张的盒子接指针
  addEventListener("pointermove", (e) => {
    if (active) return;
    for (const s of stickers) s.box.classList.toggle("hot", Boolean(s.inst) && over(s, e.pageX, e.pageY));
  }, {passive: true});
  addEventListener("resize", () => stickers.forEach((s) => place(s, s.cx, s.cy)));

  const host = stickers.find((s) => s.item.hint);
  if (!touched && host) {
    tag = document.createElement("div");
    tag.className = "stk-tag"; tag.hidden = true;
    tag.innerHTML = '拖我试试<svg viewBox="0 0 46 30"><path d="M3 6c10 16 24 20 38 14"/><path d="m35 14 6 6-8 3"/></svg>';
    layer.append(tag);
    // 放在贴纸左边；左边会伸进首屏文字时改放到贴纸上方
    const pin = () => {
      const left = host.cx - host.vw / 2 - 118, textRight = innerWidth - room - 24;
      const beside = left >= textRight;
      tag.style.left = (beside ? left : host.cx - 70) + "px";
      tag.style.top = (beside ? host.cy - 6 : host.cy - host.vh / 2 - 58) + "px";
    };
    pin(); addEventListener("resize", pin);
  }

  // 轮流翘一下角：每 3.2 秒一张，拖过之后 9 秒一张；有人正在拿的那张跳过
  if (calm) return stickers;
  let turn = 0;
  const tick = async () => {
    const s = stickers[turn++ % stickers.length];
    if (s.inst && !document.hidden && !active && !s.busy) {
      s.busy = true;
      const motion = {origin: {x: s.item.corner[0], y: s.item.corner[1]}, target: {x: 0.5, y: 0.5}};
      await tween(900, (t) => { if (!active) s.inst.setPeelProgress(0.17 * Math.sin(Math.PI * t) ** 2, motion); });
      if (active !== s) s.inst.reset();
      s.busy = false;
    }
    setTimeout(tick, touched ? 9000 : 3200);
  };
  setTimeout(tick, 2600);
  return stickers;
}

const mounted = start().catch((err) => { console.warn("贴纸没有加载", err); return []; });
export async function enhanceStickers() {
  const stickers = await mounted;
  if (!stickers?.length) return;
  const {createSticker} = await import('/assets/vendor/sticker-forge/sticker-forge.es.js');
  for (const s of stickers) {
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try { await enhance(s, createSticker); if (s.item.hint && tag) tag.hidden = false; }
    catch (err) { console.warn('贴纸交互没有加载', s.item.src, err); }
  }
}
