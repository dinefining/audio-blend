(() => {
'use strict';
const $ = id => document.getElementById(id);
const BLEND_NAMES = Object.keys(BLEND), BOOL_NAMES = Object.keys(BOOL), BOOL_KEYS = { u: 'union', i: 'intersect', x: 'minus', e: 'exclude' };
const ABBR = { normal: 'NRM', darken: 'DRK', multiply: 'MUL', 'color burn': 'BRN', lighten: 'LGT', screen: 'SCR', 'color dodge': 'DDG', add: 'ADD', overlay: 'OVL', 'soft light': 'SFT', 'hard light': 'HRD', difference: 'DIF', exclusion: 'EXC', subtract: 'SUB', divide: 'DIV' };
const MUSE = {
  normal: 'Only the top layer.', darken: 'The quieter of the two, at every pitch and moment.', multiply: 'Each sound heard through the other.',
  'color burn': 'The top layer burns into the base.', lighten: 'The louder of the two, at every pitch and moment.', screen: 'Both at once, lifted.',
  'color dodge': 'The top layer floods the base with light.', add: 'Everything, stacked.', overlay: "The base, with the top layer's contrast.",
  'soft light': 'A faint tint of one on the other.', 'hard light': "The top layer's contrast, the base's body.", difference: 'Only where they disagree.',
  exclusion: 'A softer kind of disagreement.', subtract: 'The base, with the top taken out.', divide: 'The base, measured against the top.',
  union: 'Anything either one holds.', intersect: 'Only what both hold.', minus: 'What only A has.', exclude: 'What belongs to just one of them.',
};
const VIEWS = ['out', 'a', 'b'];
const CA = [1, 0.82, 0.25], CB = [0.29, 0.55, 1];   // A yellow, B blue, as 0..1 RGB

/* ───────── icons: minimal 1.5px line drawings ───────── */
let uid = 0;
const svg = (w, h, body) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
const ICON = {
  play: svg(12, 14, '<path class="f" d="M1 0.5 L11.5 7 L1 13.5 Z"/>'),
  stop: svg(12, 12, '<rect class="f" x="0" y="0" width="12" height="12"/>'),
  drift: svg(22, 12, '<path class="s" d="M1 6 C 4 -1.5, 7 -1.5, 11 6 S 18 13.5, 21 6"/>'),
  eye: svg(22, 14, '<path class="s" d="M1 7 C 5 1, 17 1, 21 7 C 17 13, 5 13, 1 7 Z"/><circle class="f" cx="11" cy="7" r="2.6"/>'),
  cross: svg(14, 14, '<path class="s" d="M1 1 L13 13 M13 1 L1 13"/>'),
  rec: svg(14, 14, '<circle class="red" cx="7" cy="7" r="6.5"/>'),
  recStop: svg(12, 12, '<rect class="red" x="0" y="0" width="12" height="12"/>'),
  upload: svg(14, 16, '<path class="s" d="M7 11 V1.5 M3 5.5 L7 1.5 L11 5.5 M1 14.5 H13"/>'),
};
function venn(op) {
  const L = 'M2 9 a6.5 6.5 0 1 0 13 0 a6.5 6.5 0 1 0 -13 0 Z', Rr = 'M9 9 a6.5 6.5 0 1 0 13 0 a6.5 6.5 0 1 0 -13 0 Z', id = 'vc' + (uid++);
  const rings = `<path class="ln" d="${L}"/><path class="ln" d="${Rr}"/>`;
  let body = '';
  if (op === 'union') body = `<path class="f" d="${L} ${Rr}"/>` + rings;
  else if (op === 'exclude') body = `<path class="f" fill-rule="evenodd" d="${L} ${Rr}"/>` + rings;
  else if (op === 'minus') body = `<path class="f" d="${L}"/><path class="e" d="${Rr}"/>` + rings;
  else body = `<clipPath id="${id}"><path d="${Rr}"/></clipPath><path class="f" clip-path="url(#${id})" d="${L}"/>` + rings;
  return svg(24, 18, body);
}
const modeGlyph = m => BOOL[m] ? venn(m) : ABBR[m];

/* ───────── state ───────── */
let AC = null, E = null, master = null;
const S = { playing: false, ready: false, drift: false, color: false, view: 'out', hint: '', note: '', loading: {}, pop: null };
let rec = null;
let P = { a: 'A', b: 'B', mode: 'multiply', op: 0.75, th: 0.725, dt: 47, st: 0 };

/* ───────── tile row ───────── */
const CELLS = [
  ['tPlay', 'Play / Stop · Space', ''],
  ['tA', 'Layer A · tap to record or upload, or drop a file here', '<canvas id="thA" width="40" height="40"></canvas><span class="lt">A</span>'],
  ['tB', 'Layer B · tap to record or upload, or drop a file here', '<canvas id="thB" width="40" height="40"></canvas><span class="lt">B</span>'],
  ['tView', 'View · result, A only or B only', ''],
  ['tDrift', 'Drift · B slides slowly against A', ''],
  ['tColor', 'Colour · black and white, or A and B in colour', ''],
  ['tMode', 'Mode · tap to choose a blend or boolean mode', ''],
  ['tMix', '', '<span class="fill" id="fMix"></span><span class="v" id="vMix"></span>'],
];
const popFor = l => `<div class="pop" id="pop${l}" hidden>
  <button class="t" id="rec${l}" type="button" data-hint="Record your voice into ${l} · up to 30 s · tap again to stop"><span class="fill rec" id="fRec${l}" style="height:0"></span></button>
  <button class="t" id="up${l}" type="button" data-hint="Upload a sound into ${l}">${ICON.upload}</button></div>`;
$('mainRow').innerHTML = CELLS.map(([id, h, c]) => `<div class="cell">${id === 'tA' ? popFor('A') : id === 'tB' ? popFor('B') : ''}<button class="t" id="${id}" type="button" data-hint="${h}">${c}</button></div>`).join('');
$('infoClose').innerHTML = ICON.cross;

/* ───────── canvas ───────── */
const cv = $('cv'), ctx = cv.getContext('2d'), ov = $('ov');
const img = document.createElement('canvas'), ix = img.getContext('2d');
const COLS = 520, ROWS = 260, FMIN = 50, FMAX = 14000;
img.width = COLS; img.height = ROWS;
const imgData = ix.createImageData(COLS, ROWS);
const grain = new Float32Array(COLS * ROWS); { const r = rng(99); for (let i = 0; i < grain.length; i++) grain[i] = r() + r() - 1; }
let W = 1, H = 1, DPR = 1, rowBin = null, dirty = true;
let PADL = 44, PADB = 26, PADT = 10, PADR = 10;
const plot = () => ({ x: PADL, y: PADT, w: Math.max(10, W - PADL - PADR), h: Math.max(10, H - PADT - PADB) });
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, 2);
  const narrow = W < 640; PADL = narrow ? 30 : 40; PADB = narrow ? 20 : 24; PADT = narrow ? 22 : 26; PADR = narrow ? 6 : 10;
  cv.width = W * DPR; cv.height = H * DPR;
  const pl = plot();
  Object.assign(ov.style, { left: pl.x + 'px', top: pl.y + 'px', width: pl.w + 'px', height: pl.h + 'px' });
  // if the tile row plus the info tile no longer fit side by side, the info tile moves to the top-right corner
  const t = $('tPlay').offsetWidth, g = 4, edge = W < 640 ? 8 : 14, n = $('mainRow').children.length;
  document.body.classList.toggle('qtop', n * t + (n - 1) * g + 12 + t > pl.w - 2 * edge);
  dirty = true;
}
addEventListener('resize', resize);

// brightness + grain → grey, or tinted by how much of A and B is in the pixel
function paint(d, i, v, wa, gr) {
  const g = Math.max(0, Math.min(255, Math.pow(Math.max(0, v), 1.35) * 255 + gr * 120 * Math.min(1, v * 4 + 0.08)));
  if (!S.color) { d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255; return; }
  const wb = 1 - wa, r = wa * CA[0] + wb * CB[0], gg = wa * CA[1] + wb * CB[1], b = wa * CA[2] + wb * CB[2], m = Math.max(r, gg, b);
  d[i] = g * r / m; d[i + 1] = g * gg / m; d[i + 2] = g * b / m; d[i + 3] = 255;
}
function computeImage() {
  if (!E || !E.sources.A || !E.sources.B) return;
  const A = E.sources[P.a], B = E.sources[P.b], F = E.F, ratio = Math.pow(2, P.st / 12), d = imgData.data;
  if (!rowBin) rowBin = Array.from({ length: ROWS }, (_, r) => FMIN * Math.pow(FMAX / FMIN, 1 - r / (ROWS - 1)) / E.SR * N);
  for (let c = 0; c < COLS; c++) {
    const f = Math.floor(c / COLS * F);
    for (let r = 0; r < ROWS; r++) {
      const kb = rowBin[r], k0 = Math.min(BINS - 2, Math.floor(kb)), fr = kb - k0;
      const a = A.v[f * BINS + k0] * (1 - fr) + A.v[f * BINS + k0 + 1] * fr;
      const b = E.sampleB(B, f, kb / ratio);
      const v = S.view === 'a' ? a : S.view === 'b' ? b : blendValue(P, a, b);
      const wa = S.view === 'a' ? 1 : S.view === 'b' ? 0 : (a + 1e-4) / (a + b + 2e-4);
      const i = r * COLS + c;
      paint(d, i * 4, v, wa, grain[i]);
    }
  }
  ix.putImageData(imgData, 0, 0);
}
function thumb(layer) {
  const c = $(layer === 'A' ? 'thA' : 'thB'), x = c.getContext('2d'), w = c.width, h = c.height, id = x.createImageData(w, h), s = E.sources[layer];
  for (let col = 0; col < w; col++) { const f = Math.floor(col / w * E.F); for (let r = 0; r < h; r++) {
    const k = Math.min(BINS - 1, Math.round(FMIN * Math.pow(FMAX / FMIN, 1 - r / (h - 1)) / E.SR * N));
    paint(id.data, (r * w + col) * 4, s.v[f * BINS + k], layer === 'A' ? 1 : 0, 0); } }
  x.putImageData(id, 0, 0);
}

function draw() {
  if (S.drift && E) { P.dt = (P.dt + 0.25) % E.F; dirty = true; readout(); }
  if (rec && E) {
    $('fRec' + rec.layer).style.height = `${rec.n / E.MAX * 100}%`;
    S.note = `Recording into ${rec.layer} · ${(rec.n / AC.sampleRate).toFixed(1)} / 30 s`; readout();
  }
  if (dirty) { computeImage(); dirty = false; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const pl = plot(), hair = 1 / DPR;
  if (E) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, pl.x, pl.y, pl.w, pl.h); }
  ctx.strokeStyle = '#7c7c7c'; ctx.lineWidth = hair; ctx.strokeRect(pl.x - hair / 2, pl.y - hair / 2, pl.w + hair, pl.h + hair);
  ctx.fillStyle = '#9a9a9a'; ctx.font = `${W < 640 ? 10 : 11}px "JetBrains Mono", ui-monospace, monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  [[100, '100'], [1000, '1k'], [10000, '10k']].forEach(([f, t]) => { const y = pl.y + pl.h * (1 - Math.log(f / FMIN) / Math.log(FMAX / FMIN)); ctx.fillText(t, pl.x - 8, y); ctx.fillRect(pl.x - 5, Math.round(y), 3, hair); });
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const dur = E ? E.L / E.SR : 8, stp = dur <= 10.5 ? 2 : dur <= 20.5 ? 5 : 10;
  for (let s = 0; s <= dur + 0.01; s += stp) { const x = pl.x + pl.w * s / dur; ctx.fillText(s + 's', Math.min(Math.max(x, pl.x + 10), pl.x + pl.w - 10), pl.y + pl.h + 5); }
  if (E) {
    const bcol = S.color ? '#4a8cff' : '#fff';
    const bx = Math.round(pl.x + pl.w * (((P.dt % E.F) + E.F) % E.F) / E.F) + 0.5;
    ctx.strokeStyle = bcol; ctx.lineWidth = 1; ctx.setLineDash([1, 3]); ctx.beginPath(); ctx.moveTo(bx, pl.y); ctx.lineTo(bx, pl.y + pl.h); ctx.stroke(); ctx.setLineDash([]);
    const fEdge = E.SR / 2 * Math.pow(2, P.st / 12);
    if (fEdge < FMAX) {
      // pitching B down pulls its top edge into view; above it B is empty
      const ey = Math.round(pl.y + pl.h * (1 - Math.log(fEdge / FMIN) / Math.log(FMAX / FMIN))) + 0.5;
      ctx.beginPath(); ctx.setLineDash([1, 3]); ctx.moveTo(pl.x, ey); ctx.lineTo(pl.x + pl.w, ey); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = bcol; ctx.fillRect(bx - 8, pl.y - 20, 16, 16);
    ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.font = '11px "JetBrains Mono", ui-monospace, monospace'; ctx.fillText('B', bx, pl.y - 11.5);
    if (S.playing) {
      const lat = (AC.outputLatency || 0) + 4096 / AC.sampleRate;
      const f = ((E.frame - lat * AC.sampleRate / HOP) % E.F + E.F) % E.F;
      ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(pl.x + pl.w * f / E.F), pl.y, 1, pl.h);
    }
  }
  requestAnimationFrame(draw);
}

/* ───────── readout + tiles ───────── */
const fmtDb = th => `${Math.round(th * DB - DB)}DB`;
function readout() {
  const F = E ? E.F : 750, dur = E ? E.L / E.SR : 8, sec = (((P.dt % F) + F) % F) / F * dur, parts = [P.mode];
  parts.push(`+${sec.toFixed(2)}S`, `${P.st > 0 ? '+' : P.st < 0 ? '-' : '±'}${Math.abs(P.st)}ST`);
  if (BOOL[P.mode]) parts.push(`@ ${fmtDb(P.th)}`);
  if (!BOOL[P.mode] && P.op < 1) parts.push(`${Math.round(P.op * 100)}%`);
  $('r1').textContent = parts.join(' ');
  $('r2').textContent = !S.ready ? 'Tuning…' : S.note || S.hint || (S.view !== 'out' ? `Showing ${S.view.toUpperCase()} only` : '');
  const isB = !!BOOL[P.mode], mix = isB ? (P.th - 0.05) / 0.9 : P.op;
  $('vMix').textContent = isB ? Math.round(P.th * DB - DB) : Math.round(P.op * 100);
  $('fMix').style.height = `${mix * 100}%`;
  $('tMix').dataset.hint = isB ? 'Mix · threshold: how loud counts as inside a shape · drag up or down' : 'Mix · opacity of B · drag up or down';
}
function syncUI() {
  document.body.classList.toggle('col', S.color);
  $('tView').innerHTML = S.view === 'out' ? ICON.eye : `<span class="lt">${S.view.toUpperCase()}</span>`;
  $('tView').classList.toggle('on', S.view !== 'out');
  $('tDrift').innerHTML = ICON.drift; $('tDrift').classList.toggle('on', S.drift);
  $('tColor').innerHTML = `<span class="lt">${S.color ? 'COL' : 'BW'}</span>`;
  $('tMode').innerHTML = modeGlyph(P.mode); $('tMode').classList.toggle('on', !$('modeRow').hidden);
  ['A', 'B'].forEach(l => { $('pop' + l).hidden = S.pop !== l; $('t' + l).classList.toggle('on', S.pop === l); $('rec' + l).querySelectorAll('svg').forEach(n => n.remove()); $('rec' + l).insertAdjacentHTML('beforeend', rec && rec.layer === l ? ICON.recStop : ICON.rec); });
  const pb = $('tPlay'); pb.disabled = !S.ready; pb.innerHTML = S.playing ? ICON.stop : ICON.play; pb.classList.toggle('on', S.playing);
  pb.setAttribute('aria-label', S.playing ? 'Stop' : 'Play');
  ['A', 'B'].forEach(l => { const t = $('t' + l); t.querySelector('.lt').textContent = S.loading[l] ? '…' : l; t.setAttribute('aria-label', `Layer ${l}. Tap to upload a sound`); });
  $('tMode').setAttribute('aria-label', `Blend mode: ${P.mode}`);
  modeBtns.forEach(b => b.classList.toggle('on', b.dataset.mode === P.mode));
  readout();
}

// mode row
const modeBtns = [];
function addMode(parent, m) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 't'; b.dataset.mode = m; b.innerHTML = modeGlyph(m);
  b.dataset.hint = `${m[0].toUpperCase() + m.slice(1)} · ${MUSE[m]}`; b.setAttribute('aria-label', m);
  b.onclick = () => setMode(m);
  parent.appendChild(b); modeBtns.push(b);
}
BOOL_NAMES.forEach(m => addMode($('mBool'), m));
BLEND_NAMES.forEach(m => addMode($('mBlend'), m));
const toggleModes = force => { const p = $('modeRow'); p.hidden = typeof force === 'boolean' ? !force : !p.hidden; if (!p.hidden) S.pop = null; syncUI(); };
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('.t');
  let changed = false;
  if (S.pop && !(t && (t.id === 't' + S.pop || t.closest('#pop' + S.pop)))) { S.pop = null; changed = true; }
  if (!$('modeRow').hidden && !(t && (t.id === 'tMode' || t.closest('#modeRow')))) { $('modeRow').hidden = true; changed = true; }
  if (changed) syncUI();
}, true);
const togglePop = l => { S.pop = S.pop === l ? null : l; if (S.pop) $('modeRow').hidden = true; syncUI(); };
function setMode(m) { P.mode = m; dirty = true; syncUI(); }
const toggleInfo = force => { const i = $('info'); i.hidden = typeof force === 'boolean' ? !force : !i.hidden; if (!i.hidden) $('infoClose').focus(); };

// hints: hover, focus, or a touch shows what a tile does
let hintT;
document.querySelectorAll('.tiles .t, #tInfo').forEach(t => {
  const show = () => { clearTimeout(hintT); S.hint = t.dataset.hint; readout(); };
  const hide = () => { S.hint = ''; readout(); };
  t.addEventListener('mouseenter', show); t.addEventListener('mouseleave', hide);
  t.addEventListener('focus', show); t.addEventListener('blur', hide);
  t.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { show(); hintT = setTimeout(hide, 2500); } });
});

// the mix tile: its fill is the value; opacity in blend modes, threshold in boolean modes
const mixKey = () => BOOL[P.mode] ? ['th', 0.05, 0.95] : ['op', 0, 1];
const setMix = d => { const [k, lo, hi] = mixKey(); P[k] = Math.max(lo, Math.min(hi, P[k] + d * (hi - lo))); dirty = true; readout(); };
{
  const el = $('tMix'); let st = null;
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); st = { y: e.clientY }; });
  el.addEventListener('pointermove', e => { if (!st) return; setMix((st.y - e.clientY) / 140); st.y = e.clientY; });
  el.addEventListener('pointerup', () => { st = null; }); el.addEventListener('pointercancel', () => { st = null; });
  el.addEventListener('wheel', e => { e.preventDefault(); setMix(-Math.sign(e.deltaY) * 0.05); }, { passive: false });
  el.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setMix(e.key === 'ArrowUp' ? 0.05 : -0.05); } });
}

/* ───────── loading sounds ───────── */
let pendingLayer = 'A';
const fileIn = $('file');
['A', 'B'].forEach(l => {
  const t = $('t' + l);
  t.onclick = () => togglePop(l);
  $('up' + l).onclick = () => { pendingLayer = l; fileIn.value = ''; fileIn.click(); };
  $('rec' + l).onclick = () => rec ? stopRec() : startRec(l);
  t.addEventListener('dragover', e => { e.preventDefault(); t.classList.add('drop'); });
  t.addEventListener('dragleave', () => t.classList.remove('drop'));
  t.addEventListener('drop', e => { e.preventDefault(); t.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (f) loadFile(l, f); });
});
fileIn.onchange = () => { const f = fileIn.files[0]; if (f) loadFile(pendingLayer, f); };
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => e.preventDefault());
function say(msg) { S.note = msg; readout(); clearTimeout(say.t); say.t = setTimeout(() => { S.note = ''; readout(); }, 4000); }
function loadSamples(layer, mono, name) {
  E.setRaw(layer, mono.length > E.MAX ? mono.slice(0, E.MAX) : mono, false);
  E.rebuild();
  thumb('A'); thumb('B'); dirty = true;
  say(`${layer} · ${name}${mono.length > E.MAX ? ' · first 30 s' : ''} · loop ${(E.L / E.SR).toFixed(1)} s`);
}
async function loadFile(layer, file) {
  if (!E) return;
  S.loading[layer] = true; syncUI();
  try {
    const ab = await AC.decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(ab.length);
    for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < ab.length; i++) mono[i] += d[i] / ab.numberOfChannels; }
    loadSamples(layer, mono, file.name);
    S.pop = null;
  } catch (err) { say(`Could not read ${file.name}. Try WAV, MP3, OGG or M4A.`); }
  S.loading[layer] = false; syncUI();
}
async function startRec(layer) {
  if (!E) return;
  try {
    if (AC.state === 'suspended') await AC.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = AC.createMediaStreamSource(stream), sp = AC.createScriptProcessor(4096, 1, 1), mute = AC.createGain();
    mute.gain.value = 0;
    rec = { layer, stream, src, sp, mute, buf: new Float32Array(E.MAX), n: 0 };
    sp.onaudioprocess = ev => {
      if (!rec) return;
      const d = ev.inputBuffer.getChannelData(0), k = Math.min(d.length, E.MAX - rec.n);
      rec.buf.set(d.subarray(0, k), rec.n); rec.n += k;
      if (rec.n >= E.MAX) setTimeout(stopRec, 0);
    };
    src.connect(sp); sp.connect(mute); mute.connect(AC.destination);
    syncUI();
  } catch (err) {
    rec = null; syncUI();
    say('The microphone is not available here. Allow it in your browser, or upload a file instead.');
  }
}
function stopRec() {
  const r = rec; if (!r) return; rec = null;
  try { r.src.disconnect(); r.sp.disconnect(); r.mute.disconnect(); } catch (e) {}
  r.stream.getTracks().forEach(t => t.stop());
  $('fRec' + r.layer).style.height = '0';
  if (r.n < AC.sampleRate * 0.3) { syncUI(); say('That recording was too short. Hold on a little longer.'); return; }
  S.loading[r.layer] = true; S.pop = null; syncUI();
  setTimeout(() => { loadSamples(r.layer, r.buf.slice(0, r.n), 'your recording'); S.loading[r.layer] = false; syncUI(); }, 30);
}

/* ───────── buttons + keys ───────── */
const cycleView = () => { S.view = VIEWS[(VIEWS.indexOf(S.view) + 1) % 3]; dirty = true; syncUI(); };
const toggleColor = () => { S.color = !S.color; dirty = true; if (E) { thumb('A'); thumb('B'); } syncUI(); };
$('tView').onclick = cycleView;
$('tDrift').onclick = () => { S.drift = !S.drift; syncUI(); };
$('tColor').onclick = toggleColor;
$('tMode').onclick = () => toggleModes();
$('tPlay').onclick = togglePlay;
$('tInfo').onclick = () => toggleInfo(true);
$('infoClose').onclick = () => toggleInfo(false);
$('info').addEventListener('click', e => { if (e.target.id === 'info') toggleInfo(false); });

const bump = (k, d, lo, hi) => { P[k] = Math.max(lo, Math.min(hi, +(P[k] + d).toFixed(3))); dirty = true; readout(); };
const nudgeT = d => { if (!E) return; P.dt = (((P.dt + d) % E.F) + E.F) % E.F; dirty = true; readout(); };
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'Escape') { toggleInfo(false); toggleModes(false); S.pop = null; syncUI(); return; }
  if (!$('info').hidden) return;
  if (e.target instanceof HTMLButtonElement && (k === ' ' || k === 'Enter')) return;
  if (k === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'm' || k === 'M') { const i = BLEND_NAMES.indexOf(P.mode), n = BLEND_NAMES.length; setMode(BLEND_NAMES[i < 0 ? 0 : (i + (k === 'm' ? 1 : -1) + n) % n]); }
  else if (BOOL_KEYS[k]) setMode(BOOL_KEYS[k]);
  else if (k === 'o') setMix(-0.1); else if (k === 'O') setMix(0.1);
  else if (k === 'v') cycleView();
  else if (k === 'c') toggleColor();
  else if (k === 'd') { S.drift = !S.drift; syncUI(); }
  else if (k === '0') { P.dt = 0; P.st = 0; dirty = true; readout(); }
  else if (k === '?') toggleInfo(true);
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); if (E) nudgeT((k === 'ArrowRight' ? 1 : -1) * E.F / (e.shiftKey ? 32 : 160)); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); bump('st', k === 'ArrowUp' ? 1 : -1, -12, 12); }
});

/* ───────── drag the picture to move B ───────── */
let drag = null, lastTap = 0;
cv.addEventListener('pointerdown', e => {
  if (e.button !== 0) return; if (!$('modeRow').hidden) toggleModes(false); if (S.pop) { S.pop = null; syncUI(); }
  const now = performance.now(); if (now - lastTap < 300) { P.dt = 0; P.st = 0; dirty = true; readout(); lastTap = 0; return; } lastTap = now;
  if (!E) return; e.preventDefault(); cv.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, dt: P.dt, st: P.st }; cv.style.cursor = 'grabbing';
});
cv.addEventListener('pointermove', e => {
  if (!drag) return; const pl = plot();
  P.dt = (((drag.dt + (e.clientX - drag.x) / pl.w * E.F) % E.F) + E.F) % E.F;
  P.st = Math.max(-12, Math.min(12, Math.round(drag.st - (e.clientY - drag.y) * 12 * Math.log2(FMAX / FMIN) / pl.h)));
  dirty = true; readout();
});
const endDrag = () => { drag = null; cv.style.cursor = 'grab'; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

/* ───────── audio ───────── */
async function boot() {
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (err) { $('r2').textContent = 'This browser has no Web Audio'; return; }
  const eng = makeEngine(AC.sampleRate);
  await new Promise(r => setTimeout(r, 0)); eng.setRaw('A', GEN.voice(AC.sampleRate, eng.L), true);
  await new Promise(r => setTimeout(r, 0)); eng.setRaw('B', GEN.rain(AC.sampleRate, eng.L), true);
  eng.rebuild();
  Object.assign(eng.p, P); P = eng.p; E = eng;
  master = AC.createGain(); master.gain.value = 0;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
  const verb = AC.createConvolver(), len = Math.floor(AC.sampleRate * 2.4), ir = AC.createBuffer(2, len, AC.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
  verb.buffer = ir;
  const dry = AC.createGain(), wet = AC.createGain(); dry.gain.value = 0.9; wet.gain.value = 0.18;
  master.connect(dry); dry.connect(comp); master.connect(verb); verb.connect(wet); wet.connect(comp); comp.connect(AC.destination);
  const proc = AC.createScriptProcessor(2048, 0, 2);
  proc.onaudioprocess = ev => { const l = ev.outputBuffer.getChannelData(0); E.render(l); ev.outputBuffer.getChannelData(1).set(l); };
  proc.connect(master);
  thumb('A'); thumb('B');
  S.ready = true; dirty = true; syncUI();
}
function togglePlay() {
  if (!S.ready) return;
  S.playing = !S.playing; if (AC.state === 'suspended') AC.resume();
  const t = AC.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(S.playing ? 0.9 : 0, t + 0.25);
  syncUI();
}

function start(data) {
  if (data && data.p) Object.assign(P, data.p, { a: 'A', b: 'B' });
  if (data && data.view) S.view = data.view;
  if (data && data.color) S.color = true;
  resize(); syncUI(); requestAnimationFrame(draw); boot();
  if (document.fonts) document.fonts.load('13px "JetBrains Mono"').then(() => { dirty = true; }).catch(() => {});
}
window.claude?.hot?.snapshot?.(() => ({ p: { ...P }, view: S.view, color: S.color }));
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
