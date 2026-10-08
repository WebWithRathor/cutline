/* ---------- backdrop for cutaways ---------- */
function paper(t, v) {
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.grid; ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 64) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
  const spots = [[[2010, -40, 300], [-90, 1130, 280]], [[-60, -60, 260], [2000, 1120, 300]], [[2020, 540, 260], [-80, 1150, 240]]][v % 3];
  spots.forEach(([x, y, r], i) => { blobPath(x, y, r, t, i * 3 + v); ctx.fillStyle = C.gold; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.stroke(); });
  const g = ctx.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1200); g.addColorStop(0, 'rgba(120,70,20,0)'); g.addColorStop(1, 'rgba(120,70,20,.16)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function tag(t, s0, label) { const w = measure(label, 44) + 60; chip(70 + w / 2, 110, label, C.lemon, { rot: -.03, size: 44, s: pop(t, s0 + .15) }); }

/* ---------- props ---------- */
function glowAt(x, y, r, color, a) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color.replace('A', String(.85 * a))); g.addColorStop(.45, color.replace('A', String(.35 * a))); g.addColorStop(1, color.replace('A', '0'));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function bulb(x, y, s, heat, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  glowAt(0, -40, 330, 'rgba(255,190,70,A)', clamp(heat * 1.3 - .3));
  // heat waves
  if (heat > .45) { ctx.save(); ctx.globalAlpha = clamp((heat - .45) * 2); ctx.strokeStyle = C.coral; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); for (let k = 0; k <= 20; k++) { const yy = -250 - k * 6 - (t * 60 % 30); ctx.lineTo(i * 70 + Math.sin(k * .7 + t * 6 + i) * 10, yy); } ctx.stroke(); } ctx.restore(); }
  // glass
  sticker(() => { ctx.beginPath(); ctx.arc(0, -60, 150, Math.PI * .78, Math.PI * .22, false); ctx.lineTo(55, 110); ctx.lineTo(-55, 110); ctx.closePath(); }, `rgba(255,253,248,${.75 - heat * .2})`, { sh: 8, lw: 6 });
  // filament: grey → red → orange → white-yellow
  const col = heat < .33 ? `rgb(${lerp(80, 220, heat * 3)},${lerp(70, 50, heat * 3)},40)` : heat < .66 ? `rgb(${lerp(220, 255, (heat - .33) * 3)},${lerp(50, 140, (heat - .33) * 3)},40)` : `rgb(255,${lerp(140, 235, (heat - .66) * 3)},${lerp(40, 160, (heat - .66) * 3)})`;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-30, 105); ctx.lineTo(-40, -40); ctx.moveTo(30, 105); ctx.lineTo(40, -40); ctx.stroke();
  const zig = () => { ctx.beginPath(); ctx.moveTo(-40, -40); for (let i = 0; i <= 8; i++) ctx.lineTo(-40 + i * 10, -40 + (i % 2 ? -26 : 0)); };
  if (heat > .1) { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 40 * heat; zig(); ctx.strokeStyle = col; ctx.lineWidth = 12; ctx.stroke(); ctx.restore(); }
  zig(); ctx.strokeStyle = heat > .1 ? col : C.ink; ctx.lineWidth = 7; ctx.stroke();
  // screw base
  for (let i = 0; i < 3; i++) sticker(() => rr(-62, 108 + i * 30, 124, 30, 10), i % 2 ? C.grey : '#B9B0A2', { sh: 0, lw: 5 });
  sticker(() => { ctx.beginPath(); ctx.moveTo(-36, 198); ctx.lineTo(36, 198); ctx.lineTo(16, 232); ctx.lineTo(-16, 232); ctx.closePath(); }, C.ink, { sh: 0, lw: 4 });
  ctx.restore();
}
function led(x, y, s, { on = 0, burnt = 0, color = '255,70,60', t = 0, legs = true, flip = false } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (on > 0 && burnt < .5) glowAt(0, -70, 260, `rgba(${color},A)`, on);
  if (legs) {
    ctx.strokeStyle = '#8C857B'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    const L1 = flip ? 150 : 200, L2 = flip ? 200 : 150;   // long leg = + (anode)
    ctx.beginPath(); ctx.moveTo(-28, 40); ctx.lineTo(-28, 40 + L1); ctx.moveTo(28, 40); ctx.lineTo(28, 40 + L2); ctx.stroke();
  }
  const dome = () => { ctx.beginPath(); ctx.moveTo(-70, 40); ctx.lineTo(-70, -60); ctx.arc(0, -60, 70, Math.PI, 0); ctx.lineTo(70, 40); ctx.closePath(); };
  const base = burnt > 0 ? `rgb(${lerp(255, 70, burnt)},${lerp(110, 60, burnt)},${lerp(100, 55, burnt)})` : `rgba(${color},${.55 + on * .45})`;
  sticker(dome, base, { sh: 7, lw: 6 });
  sticker(() => rr(-84, 30, 168, 26, 8), burnt > .5 ? '#5B524A' : `rgba(${color},.9)`, { sh: 0, lw: 5 });
  if (burnt < .5) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-8, -62, 42, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke(); }
  if (burnt > .5) { ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-20, -110); ctx.lineTo(0, -70); ctx.lineTo(-14, -40); ctx.lineTo(10, -10); ctx.stroke(); }
  ctx.restore();
}
function smoke(x, y, k, t) {
  if (k <= 0) return;
  for (let i = 0; i < 4; i++) {
    const u = (k * 1.2 + i * .22) % 1, a = (1 - u) * clamp(k * 3);
    sticker(() => { ctx.beginPath(); ctx.arc(x + Math.sin(i * 2 + t * 2) * 30 + i * 12, y - u * 220, 26 + u * 40, 0, TAU); }, `rgba(140,132,124,${a})`, { sh: 0, lw: 4 * a });
  }
}
function battery9V(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  sticker(() => rr(-110, -150, 220, 300, 22), C.ink, { sh: 8 });
  sticker(() => rr(-100, -60, 200, 200, 14), C.gold, { sh: 0 });
  txt('9V', 0, 40, { size: 90, color: C.ink });
  sticker(() => rr(-80, -192, 56, 44, 8), C.grey, { sh: 0 });
  sticker(() => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.lineTo(52 + Math.cos(a) * 32, -170 + Math.sin(a) * 26); } ctx.closePath(); }, C.grey, { sh: 0 });
  txt('+', -52, -238, { size: 54, color: C.red, stroke: 8 }); txt('−', 52, -238, { size: 54, color: C.ink });
  ctx.restore();
}
function cell(x, y, s, rot = 0) { // AA style cell
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  sticker(() => rr(-130, -55, 260, 110, 20), C.ink, { sh: 7 });
  sticker(() => rr(-130, -55, 110, 110, 20), C.gold, { sh: 0 });
  sticker(() => rr(130, -20, 22, 40, 6), C.grey, { sh: 0 });
  txt('+', 100, 0, { size: 56, color: C.white }); txt('−', -80, 0, { size: 56, color: C.ink });
  ctx.restore();
}
function resistor(x, y, s, rot = 0, bands = ['#8B4513', '#1E1A16', '#E8473B', '#D4AF37']) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.strokeStyle = '#8C857B'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-210, 0); ctx.lineTo(210, 0); ctx.stroke();
  sticker(() => { ctx.beginPath(); ctx.roundRect(-130, -46, 260, 92, 46); }, '#E9CFA0', { sh: 7, lw: 6 });
  bands.forEach((b, i) => { ctx.fillStyle = b; ctx.fillRect(-82 + i * 44 + (i === 3 ? 18 : 0), -44, 22, 88); });
  ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.roundRect(-130, -46, 260, 92, 46); ctx.stroke();
  ctx.restore();
}
function meter(x, y, s, v, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  sticker(() => { ctx.beginPath(); ctx.arc(0, 0, 260, Math.PI, 0); ctx.lineTo(260, 40); ctx.lineTo(-260, 40); ctx.closePath(); }, C.white, { sh: 9, lw: 6 });
  [[C.mint, 0, .5], [C.lemon, .5, .75], [C.coral, .75, 1]].forEach(([c, a, b]) => { ctx.beginPath(); ctx.arc(0, 0, 200, Math.PI + a * Math.PI, Math.PI + b * Math.PI); ctx.lineWidth = 50; ctx.strokeStyle = c; ctx.stroke(); });
  ctx.beginPath(); ctx.arc(0, 0, 225, Math.PI, 0); ctx.lineWidth = 5; ctx.strokeStyle = C.ink; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 175, Math.PI, 0); ctx.stroke();
  const shake = v > .8 ? Math.sin(t * 50) * .03 : 0, ang = Math.PI + clamp(v + shake) * Math.PI;
  ctx.lineWidth = 12; ctx.strokeStyle = C.ink; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * 210, Math.sin(ang) * 210); ctx.stroke();
  sticker(() => { ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); }, C.gold, { sh: 0 });
  txt('CURRENT', 0, -70, { size: 34, font: MONO, weight: 600 });
  ctx.restore();
}
function wires(cx, k, flip) { // leg ends → battery terminals (+ on the left)
  if (k <= .05) return;
  const yL = 380 + (40 + (flip ? 150 : 200)) * 1.05 * k, yR = 380 + (40 + (flip ? 200 : 150)) * 1.05 * k;
  ctx.save(); ctx.globalAlpha *= clamp(k); ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 29 * k, yL); ctx.lineTo(cx - 29 * k, 690); ctx.lineTo(cx - 190 * k, 690); ctx.lineTo(cx - 190 * k, 760); ctx.lineTo(cx - 135 * k, 760); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 29 * k, yR); ctx.lineTo(cx + 29 * k, 680); ctx.lineTo(cx + 190 * k, 680); ctx.lineTo(cx + 190 * k, 760); ctx.lineTo(cx + 117 * k, 760); ctx.stroke();
  ctx.restore();
}
function cross(x, y, s) { if (s <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineCap = 'round'; [14, 0].forEach((w, i) => { ctx.strokeStyle = i ? C.red : C.ink; ctx.lineWidth = i ? 22 : 38; ctx.beginPath(); ctx.moveTo(-60, -60); ctx.lineTo(60, 60); ctx.moveTo(60, -60); ctx.lineTo(-60, 60); ctx.stroke(); }); ctx.restore(); }
function tick(x, y, s) { if (s <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; [0, 1].forEach(i => { ctx.strokeStyle = i ? '#3FAE5A' : C.ink; ctx.lineWidth = i ? 22 : 38; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-15, 45); ctx.lineTo(70, -55); ctx.stroke(); }); ctx.restore(); }
function photon(x, y, k, color) { if (k <= 0 || k >= 1) return; ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(x, y); ctx.rotate(k * 3); sparkle(0, 0, 26 * (1 - k * .4), { fill: color }); ctx.restore(); }

