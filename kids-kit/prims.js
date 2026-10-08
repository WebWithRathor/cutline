/* ---------- drawing primitives ---------- */
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function sticker(path, fill, { sh = 8, lw = 5, a = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= a;
  if (sh) { ctx.save(); ctx.translate(sh, sh); path(); ctx.fillStyle = 'rgba(30,26,22,.9)'; ctx.fill(); ctx.restore(); }
  path(); ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = C.ink; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
}
function txt(s, x, y, { size = 40, weight = 800, font = DISPLAY, color = C.ink, align = 'center', base = 'middle', stroke = 0, a = 1, rot = 0 } = {}) {
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(rot);
  ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = base;
  if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = C.ink; ctx.lineJoin = 'round'; ctx.strokeText(s, 0, 0); }
  ctx.fillStyle = color; ctx.fillText(s, 0, 0); ctx.restore();
}
function measure(s, size, weight = 800, font = DISPLAY) { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(s).width; ctx.restore(); return w; }

function chip(x, y, label, fill, { rot = 0, size = 40, font = DISPLAY, weight = 800, s = 1, a = 1, color = C.ink, padX = 30, padY = 18 } = {}) {
  if (s <= 0.001 || a <= 0) return;
  const w = measure(label, size, weight, font) + padX * 2, h = size + padY * 2;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  sticker(() => rr(-w / 2, -h / 2, w, h, 14), fill, { sh: 7 });
  txt(label, 0, 2, { size, font, weight, color });
  ctx.restore();
}
function sparkle(x, y, r, { rot = 0, s = 1, fill = C.gold } = {}) {
  if (s <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  sticker(() => { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * .28 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); }, fill, { sh: 0, lw: 4 });
  ctx.restore();
}
function blobPath(cx, cy, r, t, seed, n = 9) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU; const k = 1 + .14 * Math.sin(t * .9 + seed + i * 1.7) + .08 * Math.sin(t * 1.3 + i * 2.3 + seed); pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]); }
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const p0 = pts[i], p1 = pts[(i + 1) % n]; const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p0[0], p0[1], mx, my); }
  const p0 = pts[0], p1 = pts[1]; ctx.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); ctx.closePath();
}
function cloud(cx, cy, w, h, s, inner) {
  if (s <= 0.01) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  const circ = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; circ.push([Math.cos(a) * w * .42, Math.sin(a) * h * .36, Math.min(w, h) * (.24 + .05 * Math.sin(i * 2.1))]); }
  circ.push([0, 0, Math.min(w, h) * .42]);
  const each = f => circ.forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); f(); });
  ctx.save(); ctx.translate(7, 7); each(() => { ctx.fillStyle = 'rgba(30,26,22,.9)'; ctx.fill(); }); ctx.restore();
  each(() => { ctx.lineWidth = 10; ctx.strokeStyle = C.ink; ctx.stroke(); });
  each(() => { ctx.fillStyle = C.white; ctx.fill(); });
  if (inner) inner();
  ctx.restore();
}
function spiral(x, y, r, prog, { turns = 2.2, rot = 0, color = C.ink, dash = [12, 11], lw = 4 } = {}) {
  if (prog <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.setLineDash(dash); ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = 'round';
  ctx.beginPath(); const N = 120;
  for (let i = 0; i <= N * prog; i++) { const u = i / N, a = u * turns * TAU; const rad = r * (.25 + .75 * u); const px = Math.cos(a) * rad + u * r * 1.6, py = Math.sin(a) * rad * .8; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.stroke(); ctx.restore();
}
function dashedPath(pts, prog, { color = C.ink, lw = 5, dash = [16, 12] } = {}) {
  if (prog <= 0) return;
  ctx.save(); ctx.setLineDash(dash); ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = 'round';
  ctx.beginPath(); const n = Math.min(pts.length, Math.max(2, Math.floor(pts.length * prog)));
  for (let i = 0; i < n; i++) i ? ctx.lineTo(...pts[i]) : ctx.moveTo(...pts[i]);
  ctx.stroke(); ctx.restore();
}
function bez(p0, p1, p2, p3, n = 80) { const out = []; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out.push([v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]]); } return out; }
function scribbleCircle(x, y, rx, ry, prog, color = C.coral) {
  if (prog <= 0) return;
  ctx.save(); ctx.lineWidth = 7; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.beginPath();
  const N = 100;
  for (let i = 0; i <= N * prog; i++) { const u = i / N, a = -1.9 + u * TAU * 1.15; const k = 1 + .06 * Math.sin(u * 9); const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k + u * 10; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.stroke(); ctx.restore();
}
function burst(x, y, prog, r = 70) {
  if (prog <= 0 || prog >= 1) return;
  ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + .2; const r0 = r * (.5 + prog * .6), r1 = r0 + 34 * (1 - prog); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke(); }
  ctx.restore();
}
function cursorIcon(x, y, press = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.6 - press * .25, 1.6 - press * .25);
  sticker(() => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 44); ctx.lineTo(12, 33); ctx.lineTo(21, 52); ctx.lineTo(29, 48); ctx.lineTo(20, 30); ctx.lineTo(36, 30); ctx.closePath(); }, C.white, { sh: 4, lw: 4 });
  ctx.restore();
}


function windowBox(x, y, w, h, { fill = C.lav, title = '', s = 1, a = 1, rot = 0, stack = true } = {}) {
  if (s <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
  if (stack) { sticker(() => rr(26, 26, w, h, 18), C.white, { sh: 0 }); sticker(() => rr(13, 13, w, h, 18), C.white, { sh: 0 }); }
  sticker(() => rr(0, 0, w, h, 18), C.white, { sh: 0 });
  rr(14, 66, w - 28, h - 80, 10); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = C.ink; ctx.stroke();
  [C.coral, C.lemon, C.mint].forEach((c, i) => sticker(() => { ctx.beginPath(); ctx.arc(38 + i * 34, 34, 11, 0, TAU); }, c, { sh: 0, lw: 4 }));
  if (title) txt(title, w / 2, 36, { size: 38, font: HAND, weight: 700 });
  ctx.restore();
}
