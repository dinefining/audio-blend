// Audio Blend engine: sound generators, spectral analysis, blend modes and resynthesis.
const N = 2048, HOP = 512, BINS = N / 2 + 1, LOOP_SEC = 8, DB = 60;
const SOUNDS = ['voice', 'rain', 'bell', 'sea', 'organ', 'birds'];
const WIN = new Float64Array(N);
for (let i = 0; i < N; i++) WIN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
const REV = new Uint32Array(N);
{ const bits = Math.log2(N); for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); REV[i] = r; } }
const COS = new Float64Array(N / 2), SIN = new Float64Array(N / 2);
for (let i = 0; i < N / 2; i++) { COS[i] = Math.cos(2 * Math.PI * i / N); SIN[i] = Math.sin(2 * Math.PI * i / N); }

function fft(re, im, inverse) {
  for (let i = 0; i < N; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < half; j++) {
        const k = j * step, wr = COS[k], wi = inverse ? SIN[k] : -SIN[k];
        const a = i + j, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  if (inverse) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
}

function rng(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const foldLoop = (buf, L) => { const o = new Float32Array(L); for (let i = 0; i < buf.length; i++) o[i % L] += buf[i]; return o; };
const xfadeLoop = (buf, L, X) => { const o = new Float32Array(L); for (let i = 0; i < L; i++) o[i] = buf[i]; for (let i = 0; i < X; i++) { const a = i / X; o[i] = buf[i] * a + buf[L + i] * (1 - a); } return o; };
const onePole = (fc, SR) => 1 - Math.exp(-2 * Math.PI * fc / SR);
function normalize(o, target = 0.1) {
  let s = 0, pk = 0; for (let i = 0; i < o.length; i++) { s += o[i] * o[i]; pk = Math.max(pk, Math.abs(o[i])); }
  let g = target / Math.sqrt(s / o.length + 1e-12); if (pk * g > 0.95) g = 0.95 / pk;
  for (let i = 0; i < o.length; i++) o[i] *= g; return o;
}

// Every sound is in D minor and loops seamlessly, so overlaps have something to share.
const GEN = {
  rain(SR, L) {
    const r = rng(11), X = Math.floor(SR * 0.1), T = Math.floor(SR * 0.4);
    const hiss = new Float32Array(L + X), a1 = onePole(6500, SR), a2 = onePole(900, SR);
    let l1 = 0, l2 = 0;
    for (let i = 0; i < L + X; i++) { const w = r() * 2 - 1; l1 += a1 * (w - l1); l2 += a2 * (w - l2); hiss[i] = (l1 - l2) * (1 + 0.3 * Math.sin(2 * Math.PI * 3 * i / L)); }
    const drops = new Float32Array(L + T);
    for (let n = 0; n < 260; n++) {
      const t0 = Math.floor(r() * L), low = r() < 0.2;
      const f = low ? 250 + r() * 400 : 1400 * Math.pow(2, r() * 2), tau = low ? 0.035 : 0.008 + r() * 0.01;
      const amp = low ? 0.5 : 0.2 + r() * 0.5, len = Math.floor(tau * 6 * SR);
      let ph = 0;
      for (let j = 0; j < len; j++) { const tt = j / SR; ph += 2 * Math.PI * f * (1 - 0.3 * j / len) / SR; drops[t0 + j] += amp * Math.exp(-tt / tau) * (1 - Math.exp(-tt * 2000)) * Math.sin(ph); }
    }
    const h = xfadeLoop(hiss, L, X), d = foldLoop(drops, L), o = new Float32Array(L);
    for (let i = 0; i < L; i++) o[i] = h[i] * 0.35 + d[i];
    return normalize(o);
  },
  bell(SR, L) {
    const notes = [293.66, 440, 349.23, 523.25, 587.33, 440, 392, 349.23];
    const ratios = [0.5, 1, 2, 3, 4.2, 5.4], amps = [0.35, 1, 0.5, 0.3, 0.18, 0.1], taus = [3, 2.2, 1.4, 0.9, 0.6, 0.4];
    const T = Math.floor(SR * 6), buf = new Float32Array(L + T), every = L / notes.length;
    notes.forEach((f, n) => {
      const t0 = Math.floor(n * every);
      ratios.forEach((ra, p) => {
        const w = 2 * Math.PI * f * ra / SR, tau = taus[p] * SR;
        for (let j = 0; j < T; j++) buf[t0 + j] += amps[p] * Math.exp(-j / tau) * Math.min(1, j / (0.003 * SR)) * Math.sin(w * j);
      });
    });
    const fade = Math.floor(SR); for (let j = 0; j < fade; j++) buf[L + T - 1 - j] *= j / fade;
    return normalize(foldLoop(buf, L));
  },
  voice(SR, L) {
    const V = { a: [800, 1150, 2900], e: [400, 1600, 2700], i: [300, 2300, 3000], o: [450, 800, 2830], u: [325, 700, 2530] };
    const score = [[293.66, 2, 'a'], [349.23, 1.5, 'o'], [440, 1, 'e'], [392, 1.5, 'i'], [349.23, 2, 'a']];
    const Lsec = L / SR, k = Lsec / 8, starts = []; let acc = 0;
    score.forEach(s => { starts.push(acc); acc += s[1] * k; });
    const X = Math.floor(SR * 0.08), buf = new Float32Array(L + X), BL = 32;
    let ph = 0; const amps = new Float64Array(40); let K = 1, f0 = 293.66, gain = 0;
    for (let i = 0; i < L + X; i++) {
      if (i % BL === 0) {
        const t = (i / SR) % Lsec;
        let n = score.length - 1; while (n > 0 && starts[n] > t) n--;
        const lt = t - starts[n], dur = score[n][1] * k, prev = score[(n + score.length - 1) % score.length], nxt = score[(n + 1) % score.length];
        const g = Math.min(1, lt / 0.09);
        f0 = prev[0] * Math.pow(score[n][0] / prev[0], g * g * (3 - 2 * g));
        f0 *= 1 + 0.006 * Math.sin(2 * Math.PI * 5.3 * t) * Math.min(1, lt / 0.3);
        const morph = Math.max(0, (lt / dur - 0.65) / 0.35), va = V[score[n][2]], vb = V[nxt[2]];
        const F = va.map((v, j) => v + (vb[j] - v) * morph);
        gain = (1 - 0.55 * Math.exp(-lt / 0.06)) * (1 - 0.4 * Math.pow(Math.max(0, (lt - dur + 0.12) / 0.12), 2));
        K = Math.min(39, Math.floor(4800 / f0));
        for (let h = 1; h <= K; h++) {
          const fh = h * f0;
          const g0 = (fh - F[0]) / 110, g1 = (fh - F[1]) / 140, g2 = (fh - F[2]) / 190;
          amps[h] = gain * (Math.exp(-g0 * g0) + 0.7 * Math.exp(-g1 * g1) + 0.35 * Math.exp(-g2 * g2) + 0.12 / h);
        }
      }
      ph += 2 * Math.PI * f0 / SR; if (ph > 2 * Math.PI) ph -= 2 * Math.PI;
      const c = 2 * Math.cos(ph); let s0 = 0, s1 = Math.sin(ph), sum = 0;
      for (let h = 1; h <= K; h++) { sum += amps[h] * s1; const s2 = c * s1 - s0; s0 = s1; s1 = s2; }
      buf[i] = sum;
    }
    return normalize(xfadeLoop(buf, L, X));
  },
  sea(SR, L) {
    const r = rng(7), X = Math.floor(SR * 0.3), buf = new Float32Array(L + X);
    let b = 0, lp = 0, hl = 0; const ah = onePole(2000, SR);
    for (let i = 0; i < L + X; i++) {
      const w = r() * 2 - 1; b = 0.997 * b + 0.03 * w;
      const s = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * 2 * i / L), 1.5);
      lp += onePole(250 + 1400 * s, SR) * (b - lp);
      hl += ah * (w - hl);
      buf[i] = lp * (0.25 + 0.75 * s) * 3 + (w - hl) * Math.pow(s, 4) * 0.25;
    }
    return normalize(xfadeLoop(buf, L, X));
  },
  organ(SR, L) {
    const chords = [[146.83, 220, 293.66, 349.23], [130.81, 196, 261.63, 329.63]];
    const X = Math.floor(SR * 0.3), buf = new Float32Array(L + X), half = L / 2, H = 8;
    const hamp = []; for (let h = 1; h <= H; h++) hamp[h] = 1 / Math.pow(h, 1.3);
    const ph = chords.map(c => c.map(() => [0, 0]));
    for (let i = 0; i < L + X; i++) {
      const pos = (i % L) / half, which = Math.floor(pos) % 2, lt = (pos % 1) * half / SR;
      const fadeIn = Math.min(1, lt / 0.3), trem = 1 + 0.12 * Math.sin(2 * Math.PI * 0.3 * i / SR);
      let sum = 0;
      for (let c = 0; c < 2; c++) {
        let env = c === which ? fadeIn : (lt < 0.3 ? 1 - fadeIn : 0);
        if (env <= 0) continue;
        chords[c].forEach((f, n) => {
          for (let d = 0; d < 2; d++) {
            const p = ph[c][n]; p[d] += 2 * Math.PI * f * (d ? 1.001 : 0.999) / SR; if (p[d] > 2 * Math.PI) p[d] -= 2 * Math.PI;
            const cc = 2 * Math.cos(p[d]); let s0 = 0, s1 = Math.sin(p[d]);
            for (let h = 1; h <= H; h++) { sum += env * hamp[h] * s1; const s2 = cc * s1 - s0; s0 = s1; s1 = s2; }
          }
        });
      }
      buf[i] = sum * trem;
    }
    return normalize(xfadeLoop(buf, L, X));
  },
  birds(SR, L) {
    const r = rng(23), T = Math.floor(SR * 1.5), buf = new Float32Array(L + T);
    for (let p = 0; p < 8; p++) {
      let t = Math.floor((p + r() * 0.6) * L / 8); const n = 3 + Math.floor(r() * 4), base = 2400 + r() * 2200;
      for (let c = 0; c < n; c++) {
        const dur = 0.05 + r() * 0.08, len = Math.floor(dur * SR), fa = base * (0.9 + r() * 0.2), fb = fa * (0.65 + r() * 0.8);
        let ph = 0;
        for (let j = 0; j < len; j++) { const u = j / len; ph += 2 * Math.PI * (fa + (fb - fa) * u * u) / SR; const w = Math.pow(Math.sin(Math.PI * u), 2); buf[t + j] += w * (Math.sin(ph) + 0.15 * Math.sin(2 * ph)); }
        t += len + Math.floor((0.03 + r() * 0.09) * SR);
      }
    }
    return normalize(foldLoop(buf, L));
  },
};



/* Blend modes, applied to spectrogram brightness (0 = −60 dB, 1 = loudest) exactly as an image editor applies them to pixels. a = base layer A, b = top layer B. */
const BLEND = {
  normal: (a, b) => b,
  darken: (a, b) => Math.min(a, b),
  multiply: (a, b) => a * b,
  'color burn': (a, b) => b <= 0 ? 0 : Math.max(0, 1 - (1 - a) / b),
  lighten: (a, b) => Math.max(a, b),
  screen: (a, b) => 1 - (1 - a) * (1 - b),
  'color dodge': (a, b) => b >= 1 ? 1 : Math.min(1, a / (1 - b)),
  add: (a, b) => Math.min(1, a + b),
  overlay: (a, b) => a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b),
  'soft light': (a, b) => (1 - 2 * b) * a * a + 2 * b * a,
  'hard light': (a, b) => b < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b),
  difference: (a, b) => Math.abs(a - b),
  exclusion: (a, b) => a + b - 2 * a * b,
  subtract: (a, b) => Math.max(0, a - b),
  divide: (a, b) => b < 0.05 ? a : Math.min(1, a / b),
};
const sm = (th, x) => { const t = Math.max(0, Math.min(1, (x - th + 0.04) / 0.08)); return t * t * (3 - 2 * t); };
const BOOL = {
  union: (a, b, th) => Math.max(a * sm(th, a), b * sm(th, b)),
  intersect: (a, b, th) => Math.min(a, b) * sm(th, a) * sm(th, b),
  minus: (a, b, th) => a * sm(th, a) * (1 - sm(th, b)),
  exclude: (a, b, th) => { const sa = sm(th, a), sb = sm(th, b); return Math.max(a * sa * (1 - sb), b * sb * (1 - sa)); },
};
function blendValue(p, a, b) {
  const f = BLEND[p.mode];
  const r = f ? f(a, b) : BOOL[p.mode](a, b, p.th);
  return f ? a + (r - a) * p.op : r;   // opacity applies to blend modes; boolean modes use the threshold instead
}

function analyse(x, L) {
  const F = L / HOP, re = new Float64Array(N), im = new Float64Array(N), TW = 2 * Math.PI, K = 20 / Math.LN10;
  const mag = new Float32Array(F * BINS), ph = new Float32Array(F * BINS);
  for (let f = 0; f < F; f++) {
    let s = f * HOP - N / 2; s = ((s % L) + L) % L;
    for (let n = 0; n < N; n++) { let j = s + n; if (j >= L) j -= L; re[n] = x[j] * WIN[n]; im[n] = 0; }
    fft(re, im, false);
    const o = f * BINS;
    for (let k = 0; k < BINS; k++) { const r = re[k], q = im[k]; mag[o + k] = Math.sqrt(r * r + q * q); ph[o + k] = Math.atan2(q, r); }
  }
  const rr = rng(5), smp = new Float32Array(20000); for (let i = 0; i < smp.length; i++) smp[i] = mag[Math.floor(rr() * mag.length)];
  smp.sort();
  const scale = 1 / (smp[Math.floor(smp.length * 0.995)] + 1e-9);
  const v = new Float32Array(F * BINS), ifq = new Float32Array(F * BINS), adv = TW * HOP / N, back = N / (TW * HOP);
  for (let f = 0; f < F; f++) {
    const pf = ((f - 1 + F) % F) * BINS, o = f * BINS;
    for (let k = 0; k < BINS; k++) {
      const i = o + k, m = mag[i] * scale;
      const db = m > 1e-12 ? K * Math.log(m) : -240;
      v[i] = db <= -DB ? 0 : db >= 0 ? 1 : (db + DB) / DB;
      let dd = ph[i] - ph[pf + k] - adv * k; dd -= TW * Math.round(dd / TW);
      ifq[i] = k + dd * back;
    }
  }
  return { v, ifq, scale };
}

function makeEngine(SR) {
  const L = Math.round(LOOP_SEC * SR / HOP) * HOP, F = L / HOP;
  const E = {
    SR, L, F, sources: {}, frame: 0,
    p: { a: 'voice', b: 'rain', mode: 'multiply', op: 0.75, th: 0.725, dt: Math.round(F / 16), st: 0 },
    phi: new Float64Array(BINS), acc: new Float32Array(N), re: new Float64Array(N), im: new Float64Array(N),
    om: new Float32Array(BINS), fifo: new Float32Array(16384), fr: 0, fw: 0, agc: 1,
  };
  E.addSource = (id, x) => { E.sources[id] = analyse(x, E.L); };
  // The loop runs as long as the longer layer (up to 30 s); the shorter one repeats to fill it.
  E.MAX = Math.round(30 * SR / HOP) * HOP;
  E.raw = {};
  E.setRaw = (id, mono, seamless) => { E.raw[id] = { x: mono, seamless }; };
  E.rebuild = () => {
    const lens = Object.values(E.raw).map(r => r.x.length);
    const Lnew = Math.max(HOP * 16, Math.round(Math.min(E.MAX, Math.max(...lens)) / HOP) * HOP), X = Math.floor(SR * 0.05), srcs = {};
    for (const id in E.raw) {
      const { x, seamless } = E.raw[id], n = x.length;
      let y = x;
      if (!seamless) { y = x.slice(); const fz = Math.min(Math.floor(SR * 0.01), n >> 2); for (let i = 0; i < fz; i++) { const g = i / fz; y[i] *= g; y[n - 1 - i] *= g; } }
      const raw = new Float32Array(Lnew + X);
      for (let i = 0; i < Lnew + X; i++) raw[i] = y[i % n];
      srcs[id] = analyse(normalize(xfadeLoop(raw, Lnew, X)), Lnew);
    }
    E.L = Lnew; E.F = Lnew / HOP; E.sources = srcs; E.frame %= E.F; E.p.dt = ((E.p.dt % E.F) + E.F) % E.F;
  };
  // Value of layer B at frame f, bin position kb (fractional), after time offset and pitch shift.
  E.sampleB = (B, f, kb) => {
    const i0 = Math.floor(kb); if (i0 < 0 || i0 >= BINS - 1) return 0;
    const F = E.F, fb = (((f - Math.round(E.p.dt)) % F) + F) % F, fr = kb - i0, o = fb * BINS;
    return B.v[o + i0] * (1 - fr) + B.v[o + i0 + 1] * fr;
  };
  E.step = () => {
    const p = E.p, A = E.sources[p.a], B = E.sources[p.b], fi = E.frame, re = E.re, im = E.im, om = E.om;
    const F = E.F, ratio = Math.pow(2, p.st / 12), fb = (((fi - Math.round(p.dt)) % F) + F) % F, TW = 2 * Math.PI;
    let outE = 0, refE = 0;
    for (let k = 0; k < BINS; k++) {
      const a = A.v[fi * BINS + k], kb = k / ratio, b = E.sampleB(B, fi, kb);
      const vo = blendValue(p, a, b);
      const m = vo < 0.004 ? 0 : Math.pow(10, (vo - 1) * DB / 20);
      const i0 = Math.min(BINS - 1, Math.floor(kb));
      const fq = a >= b ? A.ifq[fi * BINS + k] : B.ifq[fb * BINS + i0] * ratio;
      E.phi[k] += TW * fq * HOP / N; if (E.phi[k] > 1e4) E.phi[k] %= TW;
      om[k] = m; outE += m * m;
      if (a > 0.004) refE += Math.pow(10, (a - 1) * DB / 10);
      if (b > 0.004) refE += Math.pow(10, (b - 1) * DB / 10);
    }
    // keep loudness steady across modes: quiet results are lifted, loud ones tamed
    const want = outE > 1e-9 ? Math.max(0.25, Math.min(10, 0.75 * Math.sqrt(refE / outE))) : E.agc;
    E.agc += (want - E.agc) * 0.05;
    const g = E.agc * 2 / (A.scale + B.scale);
    for (let k = 0; k < BINS; k++) { re[k] = om[k] * g * Math.cos(E.phi[k]); im[k] = om[k] * g * Math.sin(E.phi[k]); }
    im[0] = 0; im[N / 2] = 0;
    for (let k = 1; k < N / 2; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    fft(re, im, true);
    const acc = E.acc, cap = E.fifo.length;
    for (let n = 0; n < N; n++) acc[n] += re[n] * WIN[n] / 1.5;
    for (let n = 0; n < HOP; n++) { E.fifo[E.fw] = acc[n]; E.fw = (E.fw + 1) % cap; }
    acc.copyWithin(0, HOP); acc.fill(0, N - HOP);
    E.frame = (fi + 1) % F;
  };
  E.render = out => {
    const cap = E.fifo.length;
    while (((E.fw - E.fr + cap) % cap) < out.length) E.step();
    for (let i = 0; i < out.length; i++) { out[i] = E.fifo[E.fr]; E.fr = (E.fr + 1) % cap; }
  };
  return E;
}
