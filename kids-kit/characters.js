/* Kids-explainer cast. Needs the sticker primitives (sticker, txt, rr, chip, sparkle, smoke…) and C, TAU, lerp, clamp.
   Every character: fn(x, y, scale, opts) with y = ground line under the feet. Moods change face + pose. */

/* ---------- shared face ---------- */
function face(cx, cy, sz, { eyes = 'open', mouth = 'smile', brows = 'up', look = [0, 0], t = 0, seed = 0, cheeks = true, sweat = 0 } = {}) {
  const ex = sz * .36, ey = -sz * .12, er = sz * .2;
  const blink = eyes === 'open' && ((t + seed) % 3.9) < .12;
  ctx.save(); ctx.translate(cx, cy); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = C.ink;
  [-1, 1].forEach(s => {
    const x = s * ex;
    if (eyes === 'x') { ctx.lineWidth = sz * .07; ctx.beginPath(); ctx.moveTo(x - er * .6, ey - er * .6); ctx.lineTo(x + er * .6, ey + er * .6); ctx.moveTo(x + er * .6, ey - er * .6); ctx.lineTo(x - er * .6, ey + er * .6); ctx.stroke(); return; }
    if (eyes === 'sleepy' || blink) { ctx.lineWidth = sz * .06; ctx.beginPath(); ctx.arc(x, ey, er * .7, .15 * Math.PI, .85 * Math.PI); ctx.stroke(); return; }
    if (eyes === 'happy') { ctx.lineWidth = sz * .06; ctx.beginPath(); ctx.arc(x, ey + er * .3, er * .7, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); return; }
    const wide = eyes === 'wide' ? 1.25 : 1;
    sticker(() => { ctx.beginPath(); ctx.ellipse(x, ey, er * .85 * wide, er * wide, 0, 0, TAU); }, C.white, { sh: 0, lw: sz * .045 });
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x + look[0] * er * .35, ey + look[1] * er * .35 + er * .1, er * (eyes === 'wide' ? .32 : .45), 0, TAU); ctx.fill();
    ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(x + look[0] * er * .35 + er * .15, ey + look[1] * er * .35 - er * .1, er * .15, 0, TAU); ctx.fill();
  });
  // brows
  ctx.lineWidth = sz * .055;
  [-1, 1].forEach(s => {
    const x = s * ex, y = ey - er * 1.45;
    ctx.beginPath();
    if (brows === 'angry') { ctx.moveTo(x - s * er * .8, y - er * .1); ctx.lineTo(x + s * er * .5, y + er * .35); }
    else if (brows === 'worried') { ctx.moveTo(x - s * er * .8, y + er * .3); ctx.lineTo(x + s * er * .6, y - er * .15); }
    else if (brows !== 'none') { ctx.moveTo(x - er * .7, y + er * .1); ctx.quadraticCurveTo(x, y - er * .35, x + er * .7, y + er * .1); }
    ctx.stroke();
  });
  if (cheeks) { ctx.fillStyle = 'rgba(255,120,140,.5)'; [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(s * ex * 1.45, ey + er * 1.3, er * .55, er * .32, 0, 0, TAU); ctx.fill(); }); }
  // mouth
  const my = sz * .26;
  ctx.lineWidth = sz * .055;
  if (mouth === 'smile') { ctx.beginPath(); ctx.arc(0, my - sz * .1, sz * .2, .2 * Math.PI, .8 * Math.PI); ctx.stroke(); }
  else if (mouth === 'grin') { sticker(() => { ctx.beginPath(); ctx.moveTo(-sz * .24, my - sz * .05); ctx.quadraticCurveTo(0, my + sz * .3, sz * .24, my - sz * .05); ctx.closePath(); }, '#7A2E2E', { sh: 0, lw: sz * .045 }); }
  else if (mouth === 'o') { sticker(() => { ctx.beginPath(); ctx.ellipse(0, my, sz * .09, sz * .12, 0, 0, TAU); }, '#7A2E2E', { sh: 0, lw: sz * .045 }); }
  else if (mouth === 'open') { sticker(() => { ctx.beginPath(); ctx.ellipse(0, my, sz * .16, sz * .1 + sz * .06 * Math.abs(Math.sin(t * 16)), 0, 0, TAU); }, '#7A2E2E', { sh: 0, lw: sz * .045 }); }
  else if (mouth === 'wobbly') { ctx.beginPath(); for (let i = 0; i <= 12; i++) { const x = -sz * .2 + i * sz * .4 / 12; const y = my + Math.sin(i * 1.6) * sz * .03; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  else if (mouth === 'flat') { ctx.beginPath(); ctx.moveTo(-sz * .15, my); ctx.lineTo(sz * .15, my); ctx.stroke(); }
  else if (mouth === 'frown') { ctx.beginPath(); ctx.arc(0, my + sz * .14, sz * .17, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke(); }
  if (sweat > 0) { ctx.globalAlpha *= sweat; [[1.6, -.2], [-1.75, .2]].forEach(([fx, fy], i) => { const yy = ey + fy * sz + ((t * 70 + i * 30) % 40); sticker(() => { ctx.beginPath(); ctx.moveTo(fx * ex, yy - sz * .12); ctx.quadraticCurveTo(fx * ex + sz * .08, yy, fx * ex, yy + sz * .05); ctx.quadraticCurveTo(fx * ex - sz * .08, yy, fx * ex, yy - sz * .12); }, C.sky, { sh: 0, lw: sz * .03 }); }); }
  ctx.restore();
}
function limb(x0, y0, x1, y1, w, bend = 0) { ctx.lineWidth = w; ctx.strokeStyle = C.ink; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1); ctx.stroke(); }
function hand(x, y, r, fill = C.white) { sticker(() => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }, fill, { sh: 0, lw: r * .22 }); }
function shoe(x, y, w, dir = 1, fill = C.white) { sticker(() => { ctx.beginPath(); ctx.ellipse(x + dir * w * .25, y - w * .28, w * .6, w * .32, 0, 0, TAU); }, fill, { sh: 0, lw: w * .12 }); }
function groundPatch(x, y, w) { sticker(() => { ctx.beginPath(); ctx.ellipse(x, y - 4, w, w * .22, 0, 0, TAU); }, C.grass, { sh: 0, lw: 5 }); }
function bubble(x, y, text, { size = 44, tail = [-40, 60], s = 1, fill = C.white, font = DISPLAY } = {}) {
  if (s <= 0.01) return;
  const w = measure(text, size, 800, font) + 60, h = size + 44;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  sticker(() => { rr(-w / 2, -h / 2, w, h, h / 2); ctx.moveTo(-14, h / 2 - 2); ctx.lineTo(tail[0], tail[1]); ctx.lineTo(18, h / 2 - 2); }, fill, { sh: 6, lw: 5 });
  ctx.fillStyle = fill; ctx.fillRect(-16, h / 2 - 8, 34, 10);
  txt(text, 0, 2, { size, font });
  ctx.restore();
}

/* ---------- Kiko: curious host (atom antenna), asks the questions kids would ---------- */
function kiko(x, y, sc, { mood = 'happy', look = [0, 0], arm = 'rest', t = 0, s = 1, flip = 1, sign = null } = {}) {
  if (s <= .01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc * s * flip, sc * s);
  groundPatch(0, 0, 130);
  const bob = Math.sin(t * 3.4) * 5, hy = -262 + bob;
  [-36, 36].forEach(lx => limb(lx, hy + 110, lx, -34, 13));
  [-36, 36].forEach(lx => shoe(lx, -6, 70, lx < 0 ? -1 : 1));
  const arms = { rest: [[-150, hy + 140], [150, hy + 140]], up: [[-150, hy + 140], [170, hy - 90]], both: [[-185, hy - 70], [185, hy - 70]], point: [[-150, hy + 140], [215, hy - 10]], cheer: [[-175, hy - 120], [175, hy - 120]] }[arm];
  const wave = arm === 'up' ? Math.sin(t * 9) * 18 : 0;
  limb(-100, hy + 40, arms[0][0], arms[0][1], 12, -20); limb(100, hy + 40, arms[1][0] + wave, arms[1][1], 12, 20);
  hand(arms[0][0], arms[0][1], 26); hand(arms[1][0] + wave, arms[1][1], 26);
  // antenna + atom
  ctx.lineWidth = 9; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(0, hy - 118); ctx.quadraticCurveTo(14, hy - 150, 6, hy - 182); ctx.stroke();
  ctx.save(); ctx.translate(6, hy - 196); sticker(() => { ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); }, C.cyan, { sh: 0, lw: 5 });
  ctx.lineWidth = 4; ctx.rotate(t * 1.5); for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 40, 13, i * Math.PI / 2.4, 0, TAU); ctx.stroke(); } ctx.restore();
  sticker(() => { ctx.beginPath(); ctx.arc(0, hy, 122, 0, TAU); }, C.white, { sh: 8, lw: 6 });
  const F = { happy: { mouth: 'smile' }, talk: { mouth: 'open' }, wow: { eyes: 'wide', mouth: 'o' }, think: { mouth: 'flat', brows: 'worried', look: [.8, -.8] }, gasp: { eyes: 'wide', mouth: 'o', brows: 'worried' }, cheer: { eyes: 'happy', mouth: 'grin' } }[mood];
  face(0, hy, 200, { look, t, seed: 1, ...F });
  if (sign) { limb(-185, hy - 70, -150, hy - 230, 10); limb(185, hy - 70, 150, hy - 230, 10); ctx.save(); ctx.translate(0, hy - 300); sticker(() => rr(-210, -70, 420, 140, 18), C.lemon, { sh: 7 }); txt(sign, 0, 4, { size: 64 }); ctx.restore(); }
  ctx.restore();
}

/* ---------- Sparky: an LED. Long leg (+) on the left, short leg (−) on the right ---------- */
function sparky(x, y, sc, { mood = 'happy', on = 0, t = 0, s = 1, flip = false, upside = false, burnt = 0, arm = 'rest', color = '255,70,60', look = [0, 0] } = {}) {
  if (s <= .01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc * s, sc * s);
  if (upside) { ctx.translate(0, -230); ctx.rotate(Math.PI); ctx.translate(0, -230); }
  const hot = mood === 'hot' || mood === 'scared';
  const shake = hot ? Math.sin(t * 40) * 3 : 0;
  ctx.translate(shake, 0);
  if (!upside) groundPatch(0, 0, 105);
  const domeY = -330;
  if (on > 0 && burnt < .5) glowAt(0, domeY, 300, `rgba(${color},A)`, on);
  // legs = the two leads
  const L = flip ? [-28, -110] : [-28, -60], R = flip ? [28, -60] : [28, -110];   // knee heights hint long/short
  ctx.strokeStyle = '#8C857B'; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-28, domeY + 130); ctx.lineTo(-28, -30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(28, domeY + 130); ctx.lineTo(28, flip ? -30 : -30); ctx.stroke();
  shoe(-28, -2, 62, -1, C.white); shoe(28, -2, 62, 1, C.white);
  txt(flip ? '−' : '+', -70, -120, { size: 44, color: flip ? C.ink : C.red, stroke: 6 });
  txt(flip ? '+' : '−', 70, -120, { size: 44, color: flip ? C.red : C.ink, stroke: 6 });
  // arms from the collar
  const armY = domeY + 110;
  const A = { rest: [[-135, armY + 80], [135, armY + 80]], up: [[-150, armY - 120], [150, armY - 120]], thumbs: [[-135, armY + 80], [150, armY - 60]], cover: [[-60, domeY - 20], [60, domeY - 20]] }[arm];
  limb(-80, armY, A[0][0], A[0][1], 10, -20); limb(80, armY, A[1][0], A[1][1], 10, 20);
  // dome (the head)
  const base = burnt > .5 ? 'rgb(70,60,55)' : `rgba(${color},${.6 + on * .4})`;
  sticker(() => { ctx.beginPath(); ctx.moveTo(-95, domeY + 105); ctx.lineTo(-95, domeY - 20); ctx.arc(0, domeY - 20, 95, Math.PI, 0); ctx.lineTo(95, domeY + 105); ctx.closePath(); }, base, { sh: 8, lw: 6 });
  sticker(() => rr(-112, domeY + 95, 224, 30, 10), burnt > .5 ? '#4A423C' : `rgba(${color},.95)`, { sh: 0, lw: 5 });
  hand(A[0][0], A[0][1], 22); hand(A[1][0], A[1][1], 22);
  if (arm === 'thumbs') { sticker(() => rr(A[1][0] - 7, A[1][1] - 46, 14, 34, 7), C.white, { sh: 0, lw: 4 }); }
  if (burnt < .5) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-14, domeY - 28, 60, Math.PI * 1.1, Math.PI * 1.42); ctx.stroke(); }
  const F = { happy: { mouth: 'smile', eyes: 'open' }, cheer: { eyes: 'happy', mouth: 'grin' }, scared: { eyes: 'wide', mouth: 'wobbly', brows: 'worried', sweat: 1 }, hot: { eyes: 'wide', mouth: 'wobbly', brows: 'worried', sweat: 1 }, burnt: { eyes: 'x', mouth: 'o', cheeks: false }, sleepy: { eyes: 'sleepy', mouth: 'flat' }, confused: { eyes: 'open', mouth: 'flat', brows: 'worried', look: [-.6, -.6] } }[burnt > .5 ? 'burnt' : mood];
  face(0, domeY + 25, 150, { t, look, seed: 2, ...F });
  if (mood === 'sleepy') { const k = (t * .6) % 1; txt('z', 120 + k * 40, domeY - 60 - k * 80, { size: 56 - k * 16, font: HAND, weight: 700, a: 1 - k }); txt('Z', 150 + ((k + .5) % 1) * 40, domeY - 60 - ((k + .5) % 1) * 80, { size: 48, font: HAND, weight: 700, a: 1 - (k + .5) % 1 }); }
  if (burnt > .5) { ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-30, domeY - 100); ctx.lineTo(-5, domeY - 60); ctx.lineTo(-25, domeY - 30); ctx.stroke(); smoke(0, domeY - 120, ((t * .4) % 1) + .2, t); }
  if (upside) { txt('?', 0, -60, { size: 90, color: C.purple, stroke: 10, rot: Math.PI }); }
  ctx.restore();
}

/* ---------- Ohmie: a resistor, the crossing guard who slows the Zips down ---------- */
function ohmie(x, y, sc, { mood = 'guard', t = 0, s = 1, arm = 'stop', look = [0, 0], strict = .5 } = {}) {
  if (s <= .01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc * s, sc * s);
  groundPatch(0, 0, 110);
  const by = -300;
  [-30, 30].forEach(lx => limb(lx, by + 160, lx, -30, 12));
  shoe(-30, -2, 64, -1, C.ink); shoe(30, -2, 64, 1, C.ink);
  const A = { stop: [[-150, by + 140], [170, by - 70]], wave: [[-150, by + 140], [175, by - 40 + Math.sin(t * 8) * 25]], arms: [[-170, by - 60], [170, by - 60]], rest: [[-140, by + 150], [140, by + 150]] }[arm];
  ctx.strokeStyle = '#8C857B'; [[-80, by + 40, ...A[0]], [80, by + 40, ...A[1]]].forEach(([a, b, c, d]) => limb(a, b, c, d, 11, a < 0 ? -25 : 25));
  // body: tall capsule with colour-band stripes
  sticker(() => { ctx.beginPath(); ctx.roundRect(-95, by - 150, 190, 330, 95); }, '#E9CFA0', { sh: 8, lw: 6 });
  ctx.save(); ctx.beginPath(); ctx.roundRect(-95, by - 150, 190, 330, 95); ctx.clip();
  ['#8B4513', '#1E1A16', '#E8473B', '#D4AF37'].forEach((b, i) => { ctx.fillStyle = b; ctx.fillRect(-95, by + 40 + i * 32 + (i === 3 ? 16 : 0), 190, 18); });
  ctx.restore();
  ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.roundRect(-95, by - 150, 190, 330, 95); ctx.stroke();
  // guard cap
  sticker(() => { ctx.beginPath(); ctx.moveTo(-90, by - 120); ctx.quadraticCurveTo(0, by - 210, 90, by - 120); ctx.closePath(); }, C.purple, { sh: 0, lw: 5 });
  sticker(() => rr(-110, by - 128, 150, 22, 10), C.purpleD, { sh: 0, lw: 5 });
  hand(A[0][0], A[0][1], 24); hand(A[1][0], A[1][1], 24);
  if (arm === 'stop') { sticker(() => { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; ctx.lineTo(A[1][0] + 30 + Math.cos(a) * 62, A[1][1] - 70 + Math.sin(a) * 62); } ctx.closePath(); }, C.red, { sh: 5, lw: 5 }); txt('SLOW', A[1][0] + 30, A[1][1] - 68, { size: 30, color: C.white }); limb(A[1][0], A[1][1], A[1][0] + 30, A[1][1] - 10, 8); }
  const F = { guard: { brows: 'angry', mouth: 'flat' }, happy: { mouth: 'smile' }, strict: { brows: 'angry', mouth: 'frown', eyes: 'open' }, relaxed: { eyes: 'sleepy', mouth: 'smile', brows: 'up' }, cheer: { eyes: 'happy', mouth: 'grin' } }[mood];
  face(0, by - 40, 150, { t, look, seed: 3, ...F });
  ctx.restore();
}

/* ---------- Zip: one electron. Crowds of Zips = current ---------- */
function zip(x, y, sc, { mood = 'calm', t = 0, seed = 0, dir = 1 } = {}) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 9 + seed) * 4 * sc); ctx.scale(sc * dir, sc);
  if (mood === 'rush') { ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.lineCap = 'round'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-60, i * 16); ctx.lineTo(-90 - Math.abs(i) * 10, i * 16); ctx.stroke(); } }
  sticker(() => { ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); }, C.gold, { sh: 5, lw: 5 });
  txt('−', 0, 24, { size: 30, color: C.ink });
  const F = { calm: { mouth: 'smile' }, rush: { mouth: 'grin', brows: 'angry' }, wait: { mouth: 'flat', eyes: 'open' }, happy: { eyes: 'happy', mouth: 'smile' } }[mood];
  face(0, -6, 62, { t, seed, cheeks: false, look: [1, 0], ...F });
  ctx.restore();
}
function zipCrowd(x0, y0, x1, y1, n, { mood = 'calm', t = 0, speed = 0, sc = .6, spread = 30 } = {}) {
  for (let i = 0; i < n; i++) {
    const u = ((i / n) + t * speed) % 1;
    zip(lerp(x0, x1, u), lerp(y0, y1, u) + Math.sin(i * 7.3) * spread, sc, { mood, t, seed: i });
  }
}

/* ---------- Batt: a 9V battery. Pushes the Zips around the circuit ---------- */
function batt(x, y, sc, { mood = 'proud', flex = 0, t = 0, s = 1, label = '9V' } = {}) {
  if (s <= .01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc * s, sc * s);
  groundPatch(0, 0, 120);
  [-40, 40].forEach(lx => limb(lx, -100, lx, -30, 14)); shoe(-40, -2, 70, -1, C.ink); shoe(40, -2, 70, 1, C.ink);
  // muscly arms
  const fl = flex * (1 + Math.sin(t * 6) * .05);
  [-1, 1].forEach(sd => {
    ctx.lineWidth = 14; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(sd * 110, -300); ctx.lineTo(sd * 190, lerp(-230, -330, fl)); ctx.lineTo(sd * lerp(170, 180, fl), lerp(-170, -420, fl)); ctx.stroke();
    sticker(() => { ctx.beginPath(); ctx.ellipse(sd * 165, lerp(-250, -350, fl), 30 + 14 * fl, 22 + 10 * fl, sd * .5, 0, TAU); }, C.gold, { sh: 0, lw: 5 });
    hand(sd * lerp(170, 180, fl), lerp(-170, -420, fl), 28);
  });
  sticker(() => rr(-115, -420, 230, 330, 26), C.ink, { sh: 9 });
  sticker(() => rr(-104, -300, 208, 190, 16), C.gold, { sh: 0 });
  txt(label, 0, -150, { size: 70, color: C.ink });
  sticker(() => rr(-80, -462, 56, 44, 8), C.grey, { sh: 0 });
  sticker(() => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.lineTo(52 + Math.cos(a) * 32, -440 + Math.sin(a) * 26); } ctx.closePath(); }, C.grey, { sh: 0 });
  const F = { proud: { mouth: 'grin', brows: 'angry' }, happy: { mouth: 'smile' }, oops: { eyes: 'wide', mouth: 'o', brows: 'worried' } }[mood];
  face(0, -350, 120, { t, seed: 4, cheeks: false, ...F });
  ctx.restore();
}

/* ---------- Grandpa Bulb: the old-style bulb who gets hot to make light ---------- */
function grandpaBulb(x, y, sc, { heat = 0, t = 0, s = 1, mood = 'happy', fan = false } = {}) {
  if (s <= .01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc * s, sc * s);
  groundPatch(0, 0, 110);
  [-34, 34].forEach(lx => limb(lx, -150, lx, -30, 12)); shoe(-34, -2, 64, -1, '#8B5A2B'); shoe(34, -2, 64, 1, '#8B5A2B');
  glowAt(0, -420, 340, 'rgba(255,190,70,A)', clamp(heat * 1.3 - .3));
  if (heat > .45) { ctx.save(); ctx.globalAlpha = clamp((heat - .45) * 2); ctx.strokeStyle = C.coral; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); for (let k = 0; k <= 18; k++) ctx.lineTo(i * 80 + Math.sin(k * .7 + t * 6 + i) * 10, -600 - k * 6 - (t * 60 % 30)); ctx.stroke(); } ctx.restore(); }
  // screw base = body
  for (let i = 0; i < 3; i++) sticker(() => rr(-70, -250 + i * 32, 140, 32, 10), i % 2 ? C.grey : '#B9B0A2', { sh: 0, lw: 5 });
  // arms
  limb(-70, -230, -160, fan ? -330 + Math.sin(t * 14) * 20 : -150, 11, -20); limb(70, -230, 160, -150, 11, 20);
  hand(-160, fan ? -330 + Math.sin(t * 14) * 20 : -150, 24); hand(160, -150, 24);
  if (fan) { ctx.save(); ctx.translate(-175, -380 + Math.sin(t * 14) * 20); ctx.rotate(-.4 + Math.sin(t * 14) * .3); sticker(() => { ctx.beginPath(); ctx.moveTo(0, 40); ctx.arc(0, 40, 80, -2.2, -.9); ctx.closePath(); }, C.pink, { sh: 0, lw: 5 }); ctx.restore(); }
  // glass head
  const r = Math.round(lerp(255, 255, heat)), g = Math.round(lerp(253, 200, heat)), b = Math.round(lerp(248, 150, heat));
  sticker(() => { ctx.beginPath(); ctx.arc(0, -420, 150, Math.PI * .78, Math.PI * .22, false); ctx.lineTo(60, -250); ctx.lineTo(-60, -250); ctx.closePath(); }, `rgba(${r},${g},${b},.92)`, { sh: 8, lw: 6 });
  // filament as a moustache-y zigzag inside the glass, glowing with heat
  const col = heat < .5 ? `rgb(${Math.round(lerp(80, 255, heat * 2))},${Math.round(lerp(70, 120, heat * 2))},40)` : `rgb(255,${Math.round(lerp(120, 230, (heat - .5) * 2))},${Math.round(lerp(40, 150, (heat - .5) * 2))})`;
  ctx.save(); if (heat > .1) { ctx.shadowColor = col; ctx.shadowBlur = 40 * heat; }
  ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-50, -330); for (let i = 0; i <= 10; i++) ctx.lineTo(-50 + i * 10, -330 + (i % 2 ? -18 : 0)); ctx.stroke(); ctx.restore();
  // bushy grandpa brows + glasses
  const F = { happy: { mouth: 'smile' }, hot: { mouth: 'wobbly', brows: 'worried', eyes: 'open', sweat: 1 }, proud: { eyes: 'happy', mouth: 'grin' } }[mood];
  face(0, -440, 170, { t, seed: 5, ...F, cheeks: heat > .4 });
  ctx.strokeStyle = C.ink; ctx.lineWidth = 5; [-1, 1].forEach(sd => { ctx.beginPath(); ctx.arc(sd * 61, -460, 40, 0, TAU); ctx.stroke(); }); ctx.beginPath(); ctx.moveTo(-21, -462); ctx.lineTo(21, -462); ctx.stroke();
  ctx.fillStyle = C.white; ctx.strokeStyle = C.ink; ctx.lineWidth = 4; [-1, 1].forEach(sd => { ctx.beginPath(); ctx.ellipse(sd * 61, -515, 42, 14, sd * -.2, 0, TAU); ctx.fill(); ctx.stroke(); });
  ctx.restore();
}
