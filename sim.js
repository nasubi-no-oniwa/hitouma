// ヒトウマ：指の歩き方（フォーム）から、レースの走りを計算する。
// ゲームの画面とランキングの確かめで同じものを使う。同じフォーム・同じ距離なら、結果は必ず同じ。
export const VER = 1;
export const DIST = { b: [100, 200], q: [1000, 2000] };
export const TRAIN = { b: 10, q: 50 };          // 調教の距離（m）
export const MPP = { b: 10 / 4500, q: 50 / 14000 }; // 指を1pxすべらせたときに進む調教の距離（m）
export const BOARDS = ['b100', 'b200', 'q1000', 'q2000'];
// フォームの並び：q fs L C R A B D G FB M T
const KEYS = ['q', 'fs', 'L', 'C', 'R', 'A', 'B', 'D', 'G', 'FB', 'M', 'T'];
const LIM = { q: [0, 1], fs: [0, 9000], L: [0, 2000], C: [0, 3000], R: [0, 3000], A: [0, 100], B: [0, 100], D: [-100, 100], G: [0, 5], FB: [0, 100], M: [0, 1], T: [0, 120000] };
export const FORM_RE = /^-?[0-9]{1,6}(,-?[0-9]{1,6}){11}$/;
export function encode(f) { return KEYS.map(k => Math.round(f[k] || 0)).join(','); }
export function decode(s) {
  if (typeof s !== 'string' || !FORM_RE.test(s)) return null;
  const a = s.split(',').map(Number), f = {};
  for (let i = 0; i < KEYS.length; i++) { const k = KEYS[i], v = a[i]; if (!(v >= LIM[k][0] && v <= LIM[k][1])) return null; f[k] = v; }
  return f;
}
const cl = (v, a, b) => v < a ? a : v > b ? b : v;

// ===== 指の動きからフォームを作る =====
// steps: [{leg, t0, t1, len, dx, rev}]（ms・px）。q=0 は2本脚、1 は4本脚
export function extract(steps, q, T) {
  const f = { q, fs: 0, L: 0, C: 0, R: 0, A: 0, B: 50, D: 0, G: 0, FB: 50, M: 0, T: Math.round(T) };
  const st = steps.filter(s => s.len + s.rev >= 6).sort((a, b) => a.t0 - b.t0);
  if (st.length < 3) return null;
  let push = 0, rev = 0, dx = 0, left = 0, front = 0;
  for (const s of st) { push += s.len; rev += s.rev; dx += s.dx; const l = q ? (s.leg === 0 || s.leg === 2) : s.leg === 0; if (l) left += Math.max(s.len, s.rev); if (q && s.leg < 2) front += Math.max(s.len, s.rev); }
  const moon = rev > push;
  const main = moon ? rev : push;
  f.M = moon ? 1 : 0;
  f.fs = cl(main / Math.max(0.3, T / 1000), 0, 9000);
  f.L = cl(main / st.length, 0, 2000);
  f.B = cl(100 * left / Math.max(1, main), 0, 100);
  f.D = cl(100 * dx / Math.max(1, main), -100, 100);
  // まとまり（同時に押した足をひとつの拍とみる）
  let beats = [];
  if (q) { for (const s of st) { const b = beats[beats.length - 1]; if (b && s.t0 - b.t <= 90) b.legs.push(s.leg); else beats.push({ t: s.t0, legs: [s.leg] }); } }
  else beats = st.map(s => ({ t: s.t0, legs: [s.leg] }));
  const iv = [];
  for (let i = 1; i < beats.length; i++) iv.push(beats[i].t - beats[i - 1].t);
  if (iv.length) {
    const mu = iv.reduce((a, b) => a + b, 0) / iv.length;
    const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mu) * (b - mu), 0) / iv.length);
    f.C = cl(100000 / Math.max(30, mu), 0, 3000);
    f.R = cl(1000 * sd / Math.max(1, mu), 0, 3000);
  }
  if (!q) {
    let alt = 0; for (let i = 1; i < st.length; i++) if (st[i].leg !== st[i - 1].leg) alt++;
    f.A = Math.round(100 * alt / Math.max(1, st.length - 1));
  } else {
    f.FB = cl(100 * front / Math.max(1, main), 0, 100);
    const P = { bound: 0, trot: 0, pace: 0 }; let pairs = 0;
    for (const b of beats) {
      const s = new Set(b.legs);
      const h = (x, y) => s.has(x) && s.has(y);
      if (h(0, 1)) { P.bound++; pairs++; } if (h(2, 3)) { P.bound++; pairs++; }
      if (h(0, 3)) { P.trot++; pairs++; } if (h(1, 2)) { P.trot++; pairs++; }
      if (h(0, 2)) { P.pace++; pairs++; } if (h(1, 3)) { P.pace++; pairs++; }
    }
    if (pairs < beats.length * 0.35) { f.G = f.R < 380 ? 4 : 5; f.A = Math.round(100 * (1 - Math.min(1, f.R / 800))); }
    else {
      const best = Object.entries(P).sort((a, b) => b[1] - a[1])[0];
      const co = best[1] / pairs;
      f.A = Math.round(100 * co);
      f.G = co < 0.5 ? 5 : best[0] === 'bound' ? 1 : best[0] === 'trot' ? 2 : 3;
    }
  }
  for (const k of KEYS) f[k] = Math.round(f[k]);
  return f;
}

// ===== フォームから走りの力を決める =====
const GAIT = { 0: [1, 1], 1: [1.10, 1.15], 2: [1.00, 0.80], 3: [1.04, 0.92], 4: [0.90, 0.82], 5: [0.86, 1.12] };
export function stats(f) {
  const q = f.q === 1;
  const r = f.R / 1000, c = Math.max(0.3, f.C / 100);
  const effR = cl(1 - 0.9 * Math.max(0, r - 0.15), 0.5, 1);
  const bd = Math.abs(f.B / 100 - 0.5) * 2;
  const limpF = 1 - 0.25 * Math.pow(bd, 1.5);
  let v, CS, W, tau, costMul, stumble, altF = 1, fbF = 1, gs = 1, gc = 1;
  if (!q) {
    const alt = f.A / 100;
    altF = 0.7 + 0.3 * Math.min(1, alt / 0.8);
    costMul = cl(Math.pow(c / 4.5, 0.4), 0.6, 1.7);
    v = (4 + 7.2 * (1 - Math.exp(-f.fs / 1500))) * altF * limpF * (0.92 + 0.08 * effR);
    CS = 6.0 * effR * (0.85 + 0.15 * limpF);
    W = 85 * effR / costMul;
    tau = 0.55 + 0.9 * Math.sqrt(4 / c);
  } else {
    [gs, gc] = GAIT[f.G] || GAIT[5];
    const fbd = Math.abs(f.FB / 100 - 0.5) * 2;
    fbF = 1 - 0.2 * Math.pow(fbd, 1.5);
    costMul = cl(Math.pow(c / 3, 0.3), 0.6, 1.7) * gc;
    v = (9 + 9.5 * (1 - Math.exp(-f.fs / 2600))) * gs * fbF * limpF * (0.92 + 0.08 * effR);
    CS = 11.5 * effR * (0.85 + 0.15 * limpF) * (0.9 + 0.1 * fbF);
    W = 420 * effR / costMul;
    tau = 1.1 + 1.3 * Math.sqrt(2.5 / c);
  }
  stumble = 0.003 + 0.1 * Math.max(0, r - 0.2) + (q && f.G === 5 ? 0.012 : 0);
  const longF = cl(f.L / (q ? 160 : 220), 0.3, 3);
  const drift = cl(f.D / 100, -1, 1) * 0.06;
  return { q, v, CS, W, tau, vex: CS * 0.62, stumble, longF, drift, moon: f.M === 1, effR, limpF, altF, fbF };
}

function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ===== レース =====
// keep=true のとき、絵を作るための毎コマの位置も返す
export const DT = 1 / 60;
export const RAIL = 4.4;
export function race(formStr, dist, keep) {
  const f = typeof formStr === 'string' ? decode(formStr) : formStr;
  if (!f) return null;
  const S = stats(f), str = typeof formStr === 'string' ? formStr : encode(f);
  const R = rng(hash(str + '|' + dist));
  const ev = [];
  const xs = keep ? [] : null, ls = keep ? [] : null, vs = keep ? [] : null, ss = keep ? [] : null;
  if (S.moon) {
    // ムーンウォーク：前を向いたまま、後ろへすべっていく
    let x = 0, t = 0, vv = 0;
    ev.push({ t: 0.8, x: 0, k: 'moon' });
    for (let i = 0; i < 60 * 40; i++) { vv += (2.2 - vv) * (1 - Math.exp(-DT / 1.2)); x -= vv * DT; t += DT; if (keep) { xs.push(x); ls.push(0); vs.push(-vv); ss.push(0); } }
    return { ms: null, moon: true, ev, xs, ls, vs, ss, S, diag: { moon: true } };
  }
  let x = 0, lat = 0, v = 0, W = S.W, ex = false, t = 0, stT = 0, flT = 0, bpT = 0, tired = null, nSt = 0, nFl = 0, nRl = 0, ms = null;
  const lim = 60 * 900;
  for (let i = 0; i < lim; i++) {
    let tgt = ex ? S.vex : S.v;
    if (!ex && W < 0.2 * S.W) tgt *= 0.9 + 0.1 * (W / (0.2 * S.W));
    if (flT > 0) { flT -= DT; v = 0; } else v += (tgt - v) * (1 - Math.exp(-DT / S.tau));
    let ve = v, st = 0;
    if (flT > 0) { ve = 0; st = 2; }
    else if (stT > 0) { stT -= DT; ve = v * 0.45; st = 1; }
    if (bpT > 0) { bpT -= DT; ve *= 0.35; st = st || 3; }
    if (!ex) { W -= Math.max(0, ve - S.CS) * DT; if (W <= 0) { W = 0; ex = true; tired = x; ev.push({ t, x, k: 'tired' }); } }
    if (t > 1 && flT <= 0 && stT <= 0) {
      const p = (S.stumble + (ex ? (S.q ? 0.01 : 0.03) * S.longF : 0)) * DT;
      if (R() < p) {
        if (R() < 0.18) { flT = 1.9; nFl++; ev.push({ t, x, k: 'fall' }); }
        else { stT = 0.7; nSt++; ev.push({ t, x, k: 'stumble' }); }
      }
    }
    lat += S.drift * ve * DT;
    if (Math.abs(lat) > RAIL && bpT <= 0) { bpT = 0.55; nRl++; lat = Math.sign(lat) * (RAIL - 0.5); ev.push({ t, x, k: 'rail' }); }
    const nx = x + ve * DT;
    if (nx >= dist) { ms = Math.round((t + (dist - x) / Math.max(1e-6, ve)) * 1000); x = nx; t += DT; if (keep) { xs.push(x); ls.push(lat); vs.push(ve); ss.push(st); } break; }
    x = nx; t += DT;
    if (keep) { xs.push(x); ls.push(lat); vs.push(ve); ss.push(st); }
  }
  if (ms == null) ms = 900000;
  return { ms, moon: false, ev, xs, ls, vs, ss, S, diag: { tired, nSt, nFl, nRl, left: W / S.W } };
}
export function timeOf(formStr, dist) { const r = race(formStr, dist, false); return r ? r.ms : null; }
