import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* =========================================================
   DERRAPE PARK — carreras de carros arcade 3D
   Mismo motor visual que Remate Park y Jonrón Park: materiales
   toon con contorno, pilotos chibi y pistas hechas con primitivas.
   ========================================================= */

// ---------- utilidades ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const angDamp = (a, b, k, dt) => a + wrapA(b - a) * (1 - Math.exp(-k * dt));
const SM = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const DEG = Math.PI / 180;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || /[?&]touch=1/.test(location.search);
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const fmtTime = (t) => {
  if (!(t >= 0) || !isFinite(t)) return '-:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
};

// ---------- reglas y física ----------
const STEP = 1 / 60;
const TURN_FALL = 0.42;            // a toda velocidad el carro gira un 42% menos (derrapando, mucho menos)
const G = 22;                    // gravedad (arcade)
const KMH = 4.4;                 // m/s → "km/h" del velocímetro (arcade)
const MAX_CARS = 8, MAX_HUMANS = 6;
const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const CAR_R = 0.98, CAR_OFF = 0.85;   // cada carro choca como dos círculos (delante y detrás)
const NITRO_COST = 33.4;
const INTRO_T = 2.4, COUNT_T = 3;     // presentación de la pista y semáforo
const DIFF = [
  { name: 'Fácil', v: 0.86, corner: 0.9, nitro: 0.35, start: 0.25, drift: 0.2 },
  { name: 'Normal', v: 0.95, corner: 1, nitro: 0.7, start: 0.5, drift: 0.5 },
  { name: 'Difícil', v: 1.01, corner: 1.08, nitro: 1, start: 0.8, drift: 0.85 },
];

// ---------- carros (cada modelo con su estilo) ----------
// valoraciones 1-10: vel velocidad punta, acel aceleración, man manejo, peso, tierra (fuera del asfalto)
const MODELS = [
  { id: 'chispa', name: 'Chispa', kind: 'compacto', lv: 1, desc: 'Equilibrado', s: { vel: 6, acel: 7, man: 7, peso: 5, tierra: 5 } },
  { id: 'rayo', name: 'Rayo', kind: 'deportivo', lv: 1, desc: 'Muy rápido', s: { vel: 8, acel: 6, man: 6, peso: 5, tierra: 4 } },
  { id: 'duna', name: 'Duna', kind: 'buggy', lv: 2, desc: 'Arranca rápido y va bien por tierra', s: { vel: 6, acel: 9, man: 6, peso: 4, tierra: 9 } },
  { id: 'bala', name: 'Bala', kind: 'formula', lv: 4, desc: 'Agarre de carreras', s: { vel: 8, acel: 7, man: 9, peso: 3, tierra: 3 } },
  { id: 'toro', name: 'Toro', kind: 'muscle', lv: 6, desc: 'Pesado y potente', s: { vel: 9, acel: 6, man: 5, peso: 8, tierra: 4 } },
  { id: 'mula', name: 'Mula', kind: 'camion', lv: 8, desc: 'Ruedas gigantes, nadie lo mueve', s: { vel: 7, acel: 6, man: 5, peso: 10, tierra: 9 } },
];
const MODEL_BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m]));
const modelOf = (id) => MODEL_BY_ID[id] || MODELS[0];
function modelPhys(id) {
  const s = modelOf(id).s;
  return {
    vmax: 33 + s.vel * 0.55, acc: 10 + s.acel * 1.15, turn: 1.6 + s.man * 0.07, grip: 6.5 + s.man * 0.45,
    dgrip: 2.2 + s.man * 0.08, mass: 0.75 + s.peso * 0.07, off: 0.5 + s.tierra * 0.04,
  };
}
const STAT_LABEL = { vel: 'Velocidad', acel: 'Aceleración', man: 'Manejo', peso: 'Peso', tierra: 'Por tierra' };

// ---------- personalización (se desbloquea por nivel) ----------
const OPTS = {
  model: MODELS.map((m) => ({ v: m.id, n: m.name, lv: m.lv })),
  paint: [['#ff4f4f', 1], ['#3a7bff', 1], ['#2fd27a', 1], ['#ffc93a', 1], ['#ff4f9a', 2], ['#7e57c2', 3], ['#ff7a2f', 4], ['#f1f3f8', 5], ['#2b2f45', 6], ['#18b6a5', 7], ['#9be15d', 9]].map(([v, lv]) => ({ v, lv })),
  stripe: [['none', 'Sin franja', 1], ['#ffffff', '', 1], ['#1d2340', '', 1], ['#ffc93a', '', 2], ['#ff4f4f', '', 3], ['#25b8ff', '', 5], ['#ff4f9a', '', 7]].map(([v, n, lv]) => ({ v, n, lv })),
  wheel: [['#d7dbe4', 1], ['#1d2340', 1], ['#ffc93a', 3], ['#ff4f4f', 5], ['#25b8ff', 7], ['#2fd27a', 9]].map(([v, lv]) => ({ v, lv })),
  spoiler: [['none', 'Nada', 1], ['small', 'Pequeño', 1], ['big', 'Grande', 3], ['wing', 'Doble ala', 6]].map(([v, n, lv]) => ({ v, n, lv })),
  helmet: [['#ffffff', 1], ['#e8413a', 1], ['#3a7bff', 1], ['#ffc93a', 2], ['#2fd27a', 3], ['#ff4f9a', 4], ['#1d2340', 5], ['#7a4cff', 7]].map(([v, lv]) => ({ v, lv })),
  skin: ['#ffdcc0', '#f3c48e', '#d8a06b', '#b47a4c', '#8b5a36', '#5f3b23'].map((v) => ({ v, lv: 1 })),
  hair: [['short', 'Corto', 1], ['long', 'Melena', 1], ['buns', 'Moño', 1], ['curly', 'Rizos', 2], ['mohawk', 'Cresta', 5]].map(([v, n, lv]) => ({ v, n, lv })),
  hairColor: [['#2b1d14', 1], ['#6b3e1f', 1], ['#e8c25a', 1], ['#d9502f', 2], ['#f2f2f2', 3], ['#7a4cff', 4], ['#25b8ff', 6], ['#ff5fb0', 8]].map(([v, lv]) => ({ v, lv })),
  acc: [['none', 'Nada', 1], ['shades', 'Gafas', 1], ['mustache', 'Bigote', 2], ['antenna', 'Antena', 3], ['horns', 'Cuernos', 5], ['crown', 'Corona', 10]].map(([v, n, lv]) => ({ v, n, lv })),
  trail: [['#ff8a1a', 'Fuego', 1], ['#25b8ff', 'Azul', 2], ['#7a4cff', 'Morado', 4], ['#2fd27a', 'Verde', 6], ['#ff4f9a', 'Rosa', 8], ['rainbow', 'Arcoíris', 12]].map(([v, n, lv]) => ({ v, n, lv })),
  horn: [['bip', 'Bip bip', 1], ['doble', 'Doble', 2], ['trompeta', 'Trompeta', 4], ['gallo', 'Gallo', 7], ['tren', 'Tren', 10]].map(([v, n, lv]) => ({ v, n, lv })),
};
const OPT_LABEL = { model: 'Carro', paint: 'Pintura', stripe: 'Franja', wheel: 'Llantas', spoiler: 'Alerón', helmet: 'Casco', skin: 'Piel', hair: 'Pelo', hairColor: 'Color de pelo', acc: 'Accesorio', trail: 'Llama del nitro', horn: 'Claxon' };
const DEFAULT_LOOK = { model: 'chispa', paint: '#ff4f4f', stripe: '#ffffff', wheel: '#d7dbe4', spoiler: 'small', helmet: '#ffffff', skin: '#f3c48e', hair: 'short', hairColor: '#2b1d14', acc: 'none', trail: '#ff8a1a', horn: 'bip' };
function sanitizeLook(l) {
  const out = {};
  for (const k of Object.keys(OPTS)) out[k] = l && OPTS[k].some((o) => o.v === l[k]) ? l[k] : DEFAULT_LOOK[k];
  return out;
}
const CPU_NAMES = ['Lucía', 'Mateo', 'Vale', 'Nico', 'Sofi', 'Tomás', 'Cami', 'Bruno', 'Pau', 'Leo', 'Martina', 'Gael',
  'Abril', 'Iker', 'Noa', 'Thiago', 'Emma', 'Dante', 'Mía', 'Santi', 'Lola', 'Hugo', 'Zoe', 'Rocco', 'Maite', 'Joaco',
  'Yadier', 'Liván', 'Yuli', 'Orestes', 'Dayana', 'Alexei', 'Yasmany', 'Osmani', 'Leidy', 'Frank'];
function randomLook(rng = Math.random) {
  const pk = (a) => a[Math.floor(rng() * a.length)];
  return {
    model: pk(['chispa', 'chispa', 'rayo', 'rayo', 'duna', 'bala', 'toro', 'mula']), paint: pk(OPTS.paint).v, stripe: pk(OPTS.stripe).v,
    wheel: pk(OPTS.wheel.slice(0, 4)).v, spoiler: pk(['none', 'small', 'small', 'big']), helmet: pk(OPTS.helmet).v,
    skin: pk(OPTS.skin).v, hair: pk(OPTS.hair).v, hairColor: pk(OPTS.hairColor).v, acc: rng() < 0.6 ? 'none' : pk(OPTS.acc.slice(1, 5)).v,
    trail: pk(OPTS.trail.slice(0, 4)).v, horn: pk(['bip', 'doble', 'trompeta']),
  };
}

// ---------- pistas ----------
// puntos de control [x, z, altura]; la curva pasa por todos (Catmull-Rom cerrada)
const TRACKS = [
  {
    id: 'parque', name: 'Parque Verde', emoji: '🌳', venue: 'parque', col: '#2fd27a', w: 13, sc: 1.55,
    desc: 'Fácil, con una lomita',
    pts: [[0, 0], [50, 0], [95, 8], [125, 35], [128, 75], [105, 105], [72, 112, 1], [42, 100, 3.2], [14, 110, 1], [-15, 135], [-55, 140], [-88, 117], [-102, 75], [-92, 35], [-58, 5]],
    pads: [[0.12, 0], [0.55, -2.5], [0.83, 2.5]], jumps: [[0.72, 16, 1.7]],
  },
  {
    id: 'playa', name: 'Costa Playa', emoji: '🏖️', venue: 'playa', col: '#ffc93a', w: 13, sc: 1.45,
    desc: 'Rectas largas y un salto en la duna',
    pts: [[0, 0], [80, 0], [150, 0], [190, 15], [206, 50], [186, 82], [148, 84, 1], [128, 74, 3], [110, 66, 4.6], [94, 63, 0.6], [62, 72], [32, 98], [-8, 106], [-44, 88], [-58, 48], [-42, 12]],
    pads: [[0.06, 0], [0.42, 2.5], [0.77, -2]], jumps: [[0.1, 18, 2.4], [0.885, 14, 1.4]],
  },
  {
    id: 'ciudad', name: 'Ciudad Neón', emoji: '🌃', venue: 'noche', col: '#7a4cff', w: 12.5, sc: 1.45,
    desc: 'Calles de noche, curvas cerradas',
    pts: [[0, 0], [60, 0], [100, 2], [118, 18], [121, 48], [117, 80], [100, 96], [72, 96, 2], [56, 80, 4], [50, 60, 3], [36, 48, 1], [10, 50], [-14, 62], [-30, 86], [-56, 99], [-86, 91], [-99, 61], [-95, 26], [-75, 5], [-40, 0]],
    pads: [[0.02, 0], [0.3, 0], [0.7, 0]], jumps: [[0.21, 14, 1.5]],
  },
  {
    id: 'canon', name: 'Cañón Rojo', emoji: '🏜️', venue: 'canon', col: '#ff7a2f', w: 13, sc: 1.5,
    desc: 'Subidas, bajadas y un gran salto',
    pts: [[0, 0], [60, 0], [100, -10, 2], [135, 10, 5], [150, 50, 8], [136, 90, 6.5], [104, 108, 3.5], [78, 103, 5], [62, 99, 6.2], [46, 96, 1.2], [20, 118], [-20, 130], [-60, 112, 2], [-76, 72, 6], [-66, 32, 3], [-36, 6]],
    pads: [[0.1, 0], [0.415, 0], [0.86, 2.5]], jumps: [[0.446, 20, 2.4], [0.771, 16, 2]],
  },
  {
    id: 'nieve', name: 'Pico Nevado', emoji: '🏔️', venue: 'nieve', col: '#25b8ff', w: 13, sc: 1.5, grip: 0.88,
    desc: 'Nieve resbalosa y una horquilla',
    pts: [[0, 0], [60, 0], [105, 14, 1], [126, 50, 3], [112, 86, 5], [76, 98, 7], [44, 84, 8], [14, 86, 9], [-6, 112, 8], [-36, 128, 6], [-76, 117, 4], [-97, 86, 3], [-92, 46, 1], [-60, 12]],
    pads: [[0.08, 0], [0.38, 0], [0.7, -2.5]], jumps: [[0.121, 16, 1.8], [0.72, 16, 2]],
  },
];
const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
const trackOf = (id) => TRACK_BY_ID[id] || TRACKS[0];

// ---------- guardado ----------
const SAVE_KEY = 'derrapepark_v1';
function defaultSave() {
  return {
    name: 'Piloto' + randi(10, 99), look: Object.assign({}, DEFAULT_LOOK),
    xp: 0, level: 1, wins: 0, races: 0, podiums: 0, streak: 0, cups: 0,
    track: 'parque', laps: 3, rivals: 5, diff: 1, muted: false, quality: 'auto', tags: 'auto', vib: true, seenHelp: false,
    autoGas: IS_TOUCH ? 1 : 0, steerMode: 'joy', cam: 0, recs: {},
  };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.look) { const o = Object.assign(defaultSave(), s); o.look = sanitizeLook(Object.assign({}, DEFAULT_LOOK, s.look)); o.recs = s.recs || {}; return o; }
  } catch (e) { /* sin almacenamiento */ }
  return defaultSave();
}
const SAVE = loadSave();
function storeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* ignorar */ } }
const xpNeed = (lv) => 250 + lv * 150;
const recOf = (id) => SAVE.recs[id] || (SAVE.recs[id] = { lap: 0, race: 0 });
function loadGhost(id) { try { const g = JSON.parse(localStorage.getItem('derrapepark_ghost_' + id)); return g && Array.isArray(g.f) ? g : null; } catch (e) { return null; } }
function storeGhost(id, g) { try { localStorage.setItem('derrapepark_ghost_' + id, JSON.stringify(g)); } catch (e) { /* lleno */ } }

// ---------- sonido (sintetizado, sin archivos) ----------
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false, loops = null;
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      buildLoops();
    } catch (e) { ctx = null; }
  }
  function loopNoise(type, freq, q) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f).connect(g).connect(master); s.start();
    return { s, f, g };
  }
  // motor: dos osciladores filtrados que siguen las revoluciones; derrape, viento y piso
  function buildLoops() {
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    o1.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(master);
    o1.start(); o2.start();
    loops = { o1, o2, f, g, skid: loopNoise('bandpass', 1650, 4), wind: loopNoise('highpass', 1900, 0.4), rumble: loopNoise('lowpass', 240, 1.2) };
  }
  function env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }
  function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, type = 'lowpass', freq = 1000, q = 1, delay = 0, attack = 0.003) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, attack, vol, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random()); s.stop(t + dur + attack + 0.05);
  }
  const HORNS = {
    bip: (v) => { tone(520, 0.13, 'square', 0.1 * v); tone(655, 0.13, 'square', 0.08 * v); tone(520, 0.13, 'square', 0.1 * v, null, 0.18); tone(655, 0.13, 'square', 0.08 * v, null, 0.18); },
    doble: (v) => { tone(392, 0.32, 'sawtooth', 0.07 * v); tone(494, 0.32, 'sawtooth', 0.07 * v); },
    trompeta: (v) => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i === 3 ? 0.3 : 0.11, 'square', 0.07 * v, null, i * 0.11)); },
    gallo: (v) => { tone(700, 0.12, 'square', 0.07 * v, 1100); tone(1100, 0.12, 'square', 0.07 * v, 1300, 0.14); tone(1300, 0.4, 'square', 0.07 * v, 800, 0.3); },
    tren: (v) => { tone(311, 0.6, 'sawtooth', 0.06 * v); tone(370, 0.6, 'sawtooth', 0.06 * v); tone(466, 0.6, 'sawtooth', 0.05 * v); },
  };
  return {
    resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    get muted() { return muted; },
    set muted(v) { muted = v; },
    // estado continuo del carro que sigues: rpm 0-1, carga 0-1, derrape, viento, piso de tierra
    engine(on, rpm, load, skid, wind, rumble) {
      if (!ctx || !loops) return;
      const t = ctx.currentTime, vol = muted || !on ? 0 : 1;
      const fr = 48 + rpm * 135;
      loops.o1.frequency.setTargetAtTime(fr, t, 0.04);
      loops.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.04);
      loops.f.frequency.setTargetAtTime(300 + rpm * 1300 + load * 700, t, 0.06);
      loops.g.gain.setTargetAtTime(vol * (0.045 + load * 0.075), t, 0.06);
      loops.skid.g.gain.setTargetAtTime(vol * skid * 0.17, t, 0.04);
      loops.skid.f.frequency.setTargetAtTime(1500 + skid * 500, t, 0.1);
      loops.wind.g.gain.setTargetAtTime(vol * wind * 0.09, t, 0.12);
      loops.rumble.g.gain.setTargetAtTime(vol * rumble * 0.5, t, 0.05);
    },
    beep(hi) { tone(hi ? 880 : 440, hi ? 0.5 : 0.22, 'square', 0.12); if (hi) tone(1320, 0.5, 'triangle', 0.08); },
    bump(v = 1) { tone(110, 0.14, 'sine', 0.5 * v, 50); noise(0.12, 0.45 * v, 'lowpass', 800, 0.8); },
    wall(v = 1) { noise(0.22, 0.4 * v, 'bandpass', 2200, 1.2); tone(90, 0.16, 'square', 0.1 * v, 50); },
    hop() { noise(0.08, 0.16, 'lowpass', 600); },
    land(v = 1) { tone(80, 0.18, 'sine', 0.5 * v, 40); noise(0.16, 0.35 * v, 'lowpass', 500); },
    tier(n) { tone([0, 700, 880, 1100][n] || 700, 0.08, 'triangle', 0.12); },
    boost(n = 1) { noise(0.5 + n * 0.15, 0.32, 'bandpass', 900, 0.7, 0, 0.02); tone(220, 0.4, 'sawtooth', 0.06, 660); },
    nitro() { noise(0.9, 0.4, 'bandpass', 700, 0.6, 0, 0.03); tone(150, 0.7, 'sawtooth', 0.08, 520); },
    pad() { tone(520, 0.08, 'square', 0.08, 1040); noise(0.4, 0.25, 'highpass', 2000, 0.5); },
    trick() { [660, 880, 1175].forEach((f, i) => tone(f, 0.09, 'triangle', 0.12, null, i * 0.05)); },
    lap() { [660, 880].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, null, i * 0.1)); },
    finalLap() { [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.07, null, i * 0.1)); },
    finish(good) {
      if (good) { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i === 6 ? 0.5 : 0.14, 'square', 0.07, null, i * 0.12)); noise(1.8, 0.22, 'bandpass', 1400, 0.6, 0.2, 0.2); }
      else[523, 494, 440, 392].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, null, i * 0.14));
    },
    record() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.13, null, i * 0.07)); },
    horn(kind, v = 1) { if (!ctx || muted) return; (HORNS[kind] || HORNS.bip)(clamp(v, 0, 1)); },
    wrong() { tone(300, 0.15, 'square', 0.07); },
    perfect() { [660, 880, 1320].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, null, i * 0.05)); },
    cheer(v = 1) { noise(1.5, 0.2 * v, 'bandpass', 1100, 0.6, 0, 0.25); noise(1.1, 0.12 * v, 'bandpass', 2500, 0.8, 0.1, 0.2); },
    ui() { tone(700, 0.06, 'triangle', 0.14, 950); },
    levelUp() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'square', 0.07, null, i * 0.08)); },
  };
})();
SFX.muted = !!SAVE.muted;

// =========================================================
//  RENDER Y MUNDO
// =========================================================
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
camera.position.set(0, 30, 40);
// garaje: escena aparte para personalizar el carro
const garage = new THREE.Scene();
const garageCam = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  garageCam.aspect = w / h; garageCam.updateProjectionMatrix();
}
addEventListener('resize', onResize);
onResize();

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const hemi = new THREE.HemisphereLight(0xe8f6ff, 0x4f9a3f, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e5, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);
const SUN_OFF = new THREE.Vector3(24, 48, 18);

// materiales toon
const toonGrad = (() => {
  const d = new Uint8Array([105, 105, 105, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const matCache = new Map();
function toon(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: toonGrad }, opts || {})));
  return matCache.get(key);
}
const basicCache = new Map();
function basic(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!basicCache.has(key)) basicCache.set(key, new THREE.MeshBasicMaterial(Object.assign({ color }, opts || {})));
  return basicCache.get(key);
}
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1d2340, side: THREE.BackSide });
function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}
let OUTLINES = true;
function outline(m, s = 1.08) {
  const o = new THREE.Mesh(m.geometry, outlineMat);
  o.userData.ol = true; o.visible = OUTLINES;
  if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]);
  m.add(o);
  return m;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _col = new THREE.Color(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const blobGeo = new THREE.IcosahedronGeometry(1, 1);
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
function inst(geo, mat, list, shadow = false) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  list.forEach((it, i) => {
    _m4.compose(_p3.set(it.x, it.y || 0, it.z), _q.setFromEuler(_e.set(it.rx || 0, it.ry || 0, it.rz || 0)), _s3.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1));
    im.setMatrixAt(i, _m4);
    if (it.c !== undefined) im.setColorAt(i, _col.set(it.c));
  });
  im.castShadow = shadow;
  return im;
}
const speckle = (g, w, h, n, cols, sz = 2) => { for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); g.fillRect(Math.random() * w, Math.random() * h, sz, sz); } };
const radialTex = canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x1d2340, transparent: true, opacity: 0.3, depthWrite: false });

// cielo: esfera con degradado (no le afecta la niebla)
const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 14), skyMat);
sky.renderOrder = -1;
scene.add(sky);
function setSky(cols) {
  if (skyMat.map) skyMat.map.dispose();
  skyMat.map = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.32, cols[1]); gr.addColorStop(0.5, cols[2]); gr.addColorStop(1, cols[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  skyMat.needsUpdate = true;
}
const STARS = (() => {
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), e = rand(0.08, 1.4), r = 560;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  p.visible = false;
  scene.add(p);
  return p;
})();

// ---------- partículas (instancias que se encogen y desaparecen) ----------
let PART_SCALE = 1;
class Pool {
  constructor(n, mat, geo = BOX_GEO) {
    this.n = n; this.k = 0;
    this.im = new THREE.InstancedMesh(geo, mat, n);
    this.im.frustumCulled = false;
    this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.items = [];
    _m4.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) { this.items.push({ life: 0 }); this.im.setMatrixAt(i, _m4); this.im.setColorAt(i, _col.set(0xffffff)); }
    scene.add(this.im);
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, o = {}) {
    const i = this.k; this.k = (this.k + 1) % this.n;
    const it = this.items[i];
    it.x = x; it.y = y; it.z = z; it.vx = vx; it.vy = vy; it.vz = vz; it.life = it.max = life; it.size = size;
    it.grav = o.grav ?? 0; it.drag = o.drag ?? 0; it.grow = o.grow ?? 0; it.spin = o.spin ?? 0; it.r = rand(0, 6); it.floor = o.floor ?? -99;
    this.im.setColorAt(i, _col.set(color));
    this.im.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (it.life <= 0) { if (it.dead === false) { it.dead = true; _m4.makeScale(0, 0, 0); this.im.setMatrixAt(i, _m4); any = true; } continue; }
      it.dead = false;
      it.life -= dt;
      it.vy -= it.grav * dt;
      const dr = Math.exp(-it.drag * dt);
      it.vx *= dr; it.vy *= dr; it.vz *= dr;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      if (it.y < it.floor) { it.y = it.floor; it.vy *= -0.4; it.vx *= 0.7; it.vz *= 0.7; }
      it.r += it.spin * dt;
      const k = clamp(it.life / it.max, 0, 1);
      const s = it.size * (it.grow ? 1 + (1 - k) * it.grow : 1) * (it.grow ? Math.min(1, k * 2.2) : k);
      _m4.compose(_p3.set(it.x, it.y, it.z), _q.setFromEuler(_e.set(it.r, it.r * 0.7, 0)), _s3.set(s, s, s));
      this.im.setMatrixAt(i, _m4);
      any = true;
    }
    if (any) this.im.instanceMatrix.needsUpdate = true;
  }
}
const SPARKS = new Pool(500, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
const SMOKE = new Pool(380, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), blobGeo);
const CONF = new Pool(320, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), new THREE.PlaneGeometry(1, 0.6));
function confetti(x, y, z, n = 120, spread = 6) {
  const cols = ['#ff4f4f', '#ffc93a', '#2fd27a', '#3a7bff', '#ff4f9a', '#7a4cff', '#ffffff'];
  for (let i = 0; i < n * PART_SCALE; i++) CONF.spawn(x + rand(-spread, spread), y + rand(0, 3), z + rand(-spread, spread), rand(-3, 3), rand(5, 13), rand(-3, 3), rand(2, 3.6), rand(0.22, 0.34), pick(cols), { grav: 7, drag: 1.4, spin: rand(4, 9) });
}
function sparkBurst(x, y, z, n, color, sp = 6) {
  for (let i = 0; i < n * PART_SCALE; i++) SPARKS.spawn(x, y, z, rand(-sp, sp), rand(1, sp), rand(-sp, sp), rand(0.25, 0.55), rand(0.08, 0.16), color, { grav: 14, drag: 2 });
}
function dustBurst(x, y, z, n, color, sp = 3) {
  for (let i = 0; i < n * PART_SCALE; i++) SMOKE.spawn(x + rand(-1, 1), y + 0.3, z + rand(-1, 1), rand(-sp, sp), rand(0.5, 2), rand(-sp, sp), rand(0.6, 1.1), rand(0.5, 0.9), color, { drag: 2.5, grow: 1.4 });
}

// =========================================================
//  PISTA: curva, superficie, paredes y consultas
// =========================================================
let TR = null;
function buildTrackData(def) {
  const sc = def.sc || 1;
  const cp = def.pts.map(([x, z, y = 0]) => new THREE.Vector3(x * sc, y, z * sc));
  const curve = new THREE.CatmullRomCurve3(cp, true, 'centripetal');
  const N = Math.max(120, Math.round(curve.getLength() / 2));
  const sp = curve.getSpacedPoints(N); sp.pop();
  const F = () => new Float32Array(N);
  const px = F(), py = F(), pz = F(), tx = F(), tz = F(), rx = F(), rz = F(), seg = F(), kap = F(), head = F(), cum = new Float32Array(N + 1);
  for (let i = 0; i < N; i++) { px[i] = sp[i].x; py[i] = Math.max(0, sp[i].y); pz[i] = sp[i].z; }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l; rx[i] = -tz[i]; rz[i] = tx[i]; head[i] = Math.atan2(tx[i], tz[i]);
  }
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; seg[i] = Math.hypot(px[j] - px[i], pz[j] - pz[i]) || 0.01; cum[i + 1] = cum[i] + seg[i]; }
  // rampas de salto: suben poco a poco y terminan en un borde (el carro sale volando)
  const lips = [];
  for (const [f, len, hh] of def.jumps || []) {
    const s0 = f * cum[N];
    let lip = -1, far = -1;
    for (let i = 0; i < N; i++) { let s = cum[i] - s0; if (s < 0) s += cum[N]; if (s <= len) { py[i] += hh * Math.pow(s / len, 1.4); if (s > far) { far = s; lip = i; } } }
    if (lip >= 0) lips.push(lip);
  }
  const raw = F();
  for (let i = 0; i < N; i++) raw[i] = wrapA(head[(i + 1) % N] - head[i]) / seg[i];
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -3; k <= 3; k++) s += raw[(i + k + N) % N]; kap[i] = s / 7; }
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }
  const w = def.w || 13;
  return {
    def, N, px, py, pz, tx, tz, rx, rz, seg, kap, head, cum, L: cum[N], w, half: w / 2, wall: w / 2 + 5, grip: def.grip || 1,
    minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, rad: Math.hypot(maxX - minX, maxZ - minZ) / 2, pads: [], lips,
  };
}
// coloca un objeto {x,z,si} sobre la pista: índice, fracción, desvío lateral (d, + = derecha) y altura del piso
function locate(o, full) {
  const T = TR, N = T.N;
  let bi = o.si | 0, bd = Infinity;
  if (full) {
    for (let i = 0; i < N; i++) { const dx = o.x - T.px[i], dz = o.z - T.pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
  } else {
    const base = bi;
    for (let k = -6; k <= 14; k++) { const i = (base + k + N) % N, dx = o.x - T.px[i], dz = o.z - T.pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
  }
  let i = bi, j = (i + 1) % N;
  let ax = T.px[i], az = T.pz[i], bx = T.px[j], bz = T.pz[j];
  let t = ((o.x - ax) * (bx - ax) + (o.z - az) * (bz - az)) / (T.seg[i] * T.seg[i]);
  if (t < 0) {
    i = (bi - 1 + N) % N; j = bi;
    ax = T.px[i]; az = T.pz[i]; bx = T.px[j]; bz = T.pz[j];
    t = ((o.x - ax) * (bx - ax) + (o.z - az) * (bz - az)) / (T.seg[i] * T.seg[i]);
  }
  t = clamp(t, 0, 1);
  o.si = i; o.st = t;
  const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
  o.d = (o.x - cx) * lerp(T.rx[i], T.rx[j], t) + (o.z - cz) * lerp(T.rz[i], T.rz[j], t);
  o.gy = lerp(T.py[i], T.py[j], t);
  return T.cum[i] + t * T.seg[i];
}
function trackPoint(along, lat = 0) {
  const T = TR;
  along = ((along % T.L) + T.L) % T.L;
  let lo = 0, hi = T.N - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T.cum[m] <= along) lo = m; else hi = m - 1; }
  const i = lo, j = (i + 1) % T.N, t = clamp((along - T.cum[i]) / T.seg[i], 0, 1);
  const rx = lerp(T.rx[i], T.rx[j], t), rz = lerp(T.rz[i], T.rz[j], t);
  return {
    x: lerp(T.px[i], T.px[j], t) + rx * lat, y: lerp(T.py[i], T.py[j], t), z: lerp(T.pz[i], T.pz[j], t) + rz * lat,
    h: Math.atan2(lerp(T.tx[i], T.tx[j], t), lerp(T.tz[i], T.tz[j], t)), i, t, rx, rz,
  };
}
// salida escalonada: dos carros por fila detrás de la meta
function gridPos(slot) {
  const row = Math.floor(slot / 2), side = slot % 2 ? 1 : -1;
  return trackPoint(-9 - row * 7.5 - (side > 0 ? 2.6 : 0), side * TR.w * 0.24);
}
function freeSpot(x, z, margin) {
  const T = TR;
  for (let i = 0; i < T.N; i += 2) {
    const dx = x - T.px[i], dz = z - T.pz[i], c = T.wall + 1.5 + T.py[i] * 1.6 + margin;
    if (dx * dx + dz * dz < c * c) return false;
  }
  return true;
}
function scatter(n, margin, pad = 140, filter) {
  const T = TR, out = [];
  for (let k = 0; k < n * 10 && out.length < n; k++) {
    const x = rand(T.minX - pad, T.maxX + pad), z = rand(T.minZ - pad, T.maxZ + pad);
    if (filter && !filter(x, z)) continue;
    if (!freeSpot(x, z, margin)) continue;
    out.push({ x, z });
  }
  return out;
}

// cinta que sigue la pista entre dos desvíos laterales (o0 < o1) y dos alturas (relativas o absolutas)
function ribbonGeo(T, o0, o1, h0, h1, vLen, abs0 = false, abs1 = false) {
  const N = T.N, reps = Math.max(1, Math.round(T.L / vLen)), vk = reps / T.L;
  const pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
  const F = (f, i) => (typeof f === 'function' ? f(i) : f);
  for (let k = 0; k <= N; k++) {
    const i = k % N, a = F(o0, i), b = F(o1, i), ya = F(h0, i), yb = F(h1, i);
    pos[k * 6] = T.px[i] + T.rx[i] * a; pos[k * 6 + 1] = abs0 ? ya : T.py[i] + ya; pos[k * 6 + 2] = T.pz[i] + T.rz[i] * a;
    pos[k * 6 + 3] = T.px[i] + T.rx[i] * b; pos[k * 6 + 4] = abs1 ? yb : T.py[i] + yb; pos[k * 6 + 5] = T.pz[i] + T.rz[i] * b;
    const v = (k === N ? T.L : T.cum[i]) * vk;
    uv[k * 4] = 0; uv[k * 4 + 1] = v; uv[k * 4 + 2] = 1; uv[k * 4 + 3] = v;
    if (k < N) { const A = k * 2, B = A + 1, C = A + 2, D = A + 3; idx.push(A, B, C, B, D, C); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- texturas de la pista ----------
function roadTex(V) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = V.road; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2200, V.roadSpk, 2);
    g.fillStyle = V.line; g.fillRect(7, 0, 6, h); g.fillRect(w - 13, 0, 6, h);
    g.fillStyle = V.mid; g.fillRect(w / 2 - 3, 0, 6, h * 0.5);
  });
}
function stripeTex(c1, c2, n = 2, w = 16) {
  return canvasTex(w, 64, (g, W, H) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(0, (i * H) / n, W, H / n); } });
}
function grassTex(cols) {
  return canvasTex(128, 128, (g, w, h) => { g.fillStyle = cols[0]; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, cols.slice(1), 3); });
}
const checkerTex = canvasTex(128, 32, (g, w, h) => { const n = 16, m = 4; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { g.fillStyle = (i + j) % 2 ? '#1d2340' : '#ffffff'; g.fillRect((i * w) / n, (j * h) / m, w / n, h / m); } });
const arrowTex = (() => {
  const t = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#ff7a2f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe14d';
    for (let k = 0; k < 2; k++) { const y = k * 64 + 12; g.beginPath(); g.moveTo(8, y); g.lineTo(32, y + 26); g.lineTo(56, y); g.lineTo(56, y + 16); g.lineTo(32, y + 42); g.lineTo(8, y + 16); g.closePath(); g.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const bannerTex = canvasTex(512, 64, (g, w, h) => {
  g.fillStyle = '#1d2340'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#1d2340' : '#ffffff'; g.fillRect(i * 8, j * 16, 8, 16); g.fillRect(w - 64 + i * 8, j * 16, 8, 16); }
  g.fillStyle = '#ffffff'; g.font = '700 40px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('DERRAPE PARK', w / 2, h / 2 + 2);
});

// =========================================================
//  ESCENARIOS (cielo, luz, suelo y paisaje de cada pista)
// =========================================================
function hillsRing(g, color, n = 16, extra = 160) {
  const mat = new THREE.MeshLambertMaterial({ color });
  const T = TR, r = T.rad + extra;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    h.position.set(T.cx + Math.cos(a) * r, -2, T.cz + Math.sin(a) * r);
    h.scale.set(rand(60, 100), rand(22, 46), rand(40, 60));
    g.add(h);
  }
}
function cloudsLayer(g, color = 0xffffff, emissive = 0x9fb8cc, n = 14) {
  const list = [], T = TR;
  for (let c = 0; c < n; c++) {
    const a = rand(0, Math.PI * 2), r = rand(T.rad + 120, T.rad + 260), y = rand(60, 100);
    const cx = T.cx + Math.cos(a) * r, cz = T.cz + Math.sin(a) * r;
    for (let j = 0; j < 5; j++) { const s = rand(9, 15); list.push({ x: cx + rand(-18, 18), y: y + rand(-4, 5), z: cz + rand(-10, 10), sx: s * 1.4, sy: s * 0.8, sz: s }); }
  }
  g.add(inst(blobGeo, new THREE.MeshLambertMaterial({ color, fog: false, emissive }), list));
}
function treesLayer(g, spots, greens = ['#4caf3f', '#5bbf45', '#3f9e3a', '#6cc24a']) {
  const trunks = [], crowns = [];
  spots.forEach((t, i) => {
    const s = rand(1.3, 2.4);
    trunks.push({ x: t.x, y: 1.3 * s, z: t.z, s });
    for (const o of [[0, 3.6, 0, 2.0], [1.1, 3.0, 0.4, 1.5], [-1.0, 3.1, -0.3, 1.5], [0.2, 4.4, -0.5, 1.4]])
      crowns.push({ x: t.x + o[0] * s, y: o[1] * s, z: t.z + o[2] * s, rx: rand(0, 3), ry: rand(0, 3), sx: o[3] * s, sy: o[3] * s * 0.9, sz: o[3] * s, c: _col.set(greens[i % greens.length]).offsetHSL(0, 0, rand(-0.04, 0.04)).getHex() });
  });
  g.add(inst(new THREE.CylinderGeometry(0.28, 0.4, 2.6, 7), toon('#8a5a36'), trunks, true));
  g.add(inst(blobGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad }), crowns, true));
}
function palmsLayer(g, spots) {
  const trunks = [], leaves = [], cocos = [];
  spots.forEach((p) => {
    const h = rand(7, 11), lean = rand(-0.25, 0.25), ry = rand(0, 6);
    for (let k = 0; k < 6; k++) trunks.push({ x: p.x + Math.sin(lean) * k * h / 6 * Math.cos(ry), y: k * h / 6 + 0.7, z: p.z + Math.sin(lean) * k * h / 6 * Math.sin(ry), rz: lean, s: 1.4 - k * 0.08 });
    const tx = p.x + Math.sin(lean) * h * Math.cos(ry), tz = p.z + Math.sin(lean) * h * Math.sin(ry);
    for (let k = 0; k < 7; k++) leaves.push({ x: tx, y: h + 0.4, z: tz, ry: (k / 7) * Math.PI * 2 + ry, s: 1.5, c: pick(['#3f9e3a', '#4caf3f', '#5bbf45']) });
    for (let k = 0; k < 3; k++) cocos.push({ x: tx + rand(-0.4, 0.4), y: h, z: tz + rand(-0.4, 0.4), s: 0.3 });
  });
  g.add(inst(new THREE.CylinderGeometry(0.22, 0.28, 1.45, 7), toon('#a7784a'), trunks, true));
  const leafGeo = new THREE.ConeGeometry(0.55, 3.4, 4, 1);
  leafGeo.rotateZ(-Math.PI / 2 - 0.35); leafGeo.translate(1.6, -0.5, 0); leafGeo.scale(1, 0.35, 1);
  g.add(inst(leafGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad }), leaves, true));
  g.add(inst(blobGeo, toon('#6b4a2a'), cocos));
}
function pinesLayer(g, spots, snow) {
  const trunks = [], cones = [], caps = [];
  spots.forEach((p) => {
    const s = rand(1.2, 2.3);
    trunks.push({ x: p.x, y: 0.8 * s, z: p.z, s });
    for (let k = 0; k < 3; k++) {
      const y = (1.8 + k * 1.5) * s, r = (2.2 - k * 0.55) * s;
      cones.push({ x: p.x, y, z: p.z, sx: r, sy: 2.2 * s, sz: r, ry: rand(0, 3), c: _col.set(pick(['#2f7d4a', '#2a6e42', '#378a52'])).getHex() });
      if (snow) caps.push({ x: p.x, y: y + 0.55 * s, z: p.z, sx: r * 0.62, sy: 1.1 * s, sz: r * 0.62, ry: rand(0, 3) });
    }
  });
  g.add(inst(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6), toon('#7a4e2e'), trunks));
  g.add(inst(new THREE.ConeGeometry(1, 1, 8), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad }), cones, true));
  if (caps.length) g.add(inst(new THREE.ConeGeometry(1, 1, 8), toon('#ffffff'), caps));
}
function rocksLayer(g, spots, cols) {
  const list = spots.map((p) => { const s = rand(1, 4); return { x: p.x, y: s * 0.4, z: p.z, sx: s * rand(1, 1.6), sy: s * rand(0.6, 1), sz: s, rx: rand(0, 3), ry: rand(0, 3), c: pick(cols) }; });
  g.add(inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad }), list, true));
}
function standsAtStart(g, V) {
  // gradas con público en el lado libre de la recta de meta
  const T = TR, list = [], fans = [];
  let side = 1;
  const probe = (s) => { for (let a = -36; a <= 36; a += 6) for (const off of [3, 8.5]) { const p = trackPoint(a, s * (T.wall + off)); if (!freeSpot(p.x, p.z, 0)) return false; } return true; };
  if (!probe(1)) side = probe(-1) ? -1 : 0;
  if (!side) return null;
  const fanCols = ['#ff4f4f', '#3a7bff', '#ffc93a', '#2fd27a', '#ff4f9a', '#ffffff', '#7a4cff', '#ff7a2f'];
  for (let a = -36; a <= 36; a += 2.4) {
    const base = trackPoint(a, 0);
    for (let r = 0; r < 4; r++) {
      const lat = side * (T.wall + 3 + r * 1.6), p = trackPoint(a, lat);
      list.push({ x: p.x, y: base.y + 0.4 + r * 0.8, z: p.z, sx: 2.5, sy: 0.8 + r * 1.6, sz: 1.6, ry: p.h, c: r % 2 ? V.stand[0] : V.stand[1] });
      if (Math.random() < 0.85) {
        const f = trackPoint(a + rand(-0.7, 0.7), lat);
        fans.push({ x: f.x, y: base.y + 0.8 + r * 1.6 + 0.4, z: f.z, s: 0.42, c: pick(fanCols) });
      }
    }
  }
  const stands = inst(BOX_GEO, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad }), list, true);
  g.add(stands);
  const fm = inst(blobGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad }), fans);
  g.add(fm);
  return fm;
}
function lampsLayer(g, night) {
  // farolas por fuera de las paredes; de noche iluminan la pista
  const T = TR, poles = [], heads = [], pools = [];
  const step = 34;
  for (let a = 0, k = 0; a < T.L - 6; a += step, k++) {
    const s = k % 2 ? 1 : -1, p = trackPoint(a, s * (T.wall + 1.2));
    poles.push({ x: p.x, y: p.y + 3.5, z: p.z });
    const hp = trackPoint(a, s * (T.wall - 1.4));
    heads.push({ x: hp.x, y: p.y + 7, z: hp.z, sx: 1.6, sy: 0.3, sz: 0.7, ry: p.h });
    if (night) { const q = trackPoint(a, s * (T.half - 1)); pools.push({ x: q.x, y: q.y + 0.09, z: q.z, s: 9, rx: -Math.PI / 2 }); }
  }
  g.add(inst(new THREE.CylinderGeometry(0.14, 0.2, 7, 6), toon('#4a5068'), poles));
  g.add(inst(BOX_GEO, night ? basic('#fff3c4') : toon('#4a5068'), heads));
  if (night) {
    const pm = new THREE.MeshBasicMaterial({ map: radialTex, color: 0xffe9a8, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
    g.add(inst(new THREE.PlaneGeometry(1, 1), pm, pools));
  }
}
const winTex = canvasTex(64, 128, (c, w, h) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  for (let y = 6; y < h - 6; y += 12) for (let x = 6; x < w - 6; x += 12) { c.fillStyle = Math.random() < 0.55 ? '#ffe7a3' : '#3a3f63'; c.fillRect(x, y, 7, 8); }
});
function buildingsLayer(g, spots, night, cols) {
  const list = spots.map((p) => { const h = rand(14, 48), w = rand(9, 16); return { x: p.x, y: h / 2, z: p.z, sx: w, sy: h, sz: rand(9, 16), ry: rand(0, 3), c: pick(cols) }; });
  const mat = night ? new THREE.MeshBasicMaterial({ map: winTex, color: 0xffffff }) : new THREE.MeshToonMaterial({ map: winTex, gradientMap: toonGrad, color: 0xffffff });
  g.add(inst(BOX_GEO, mat, list, !night));
  const roofs = list.map((b) => ({ x: b.x, y: b.sy + 0.4, z: b.z, sx: b.sx * 0.5, sy: 0.8, sz: b.sz * 0.5, ry: b.ry, c: '#2b2f45' }));
  g.add(inst(BOX_GEO, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad }), roofs));
}
function neonSigns(g) {
  const cols = ['#ff4fd8', '#25b8ff', '#ffe14d', '#2fd27a'];
  const T = TR;
  for (let a = 60, k = 0; a < T.L - 40; a += 95, k++) {
    const s = k % 2 ? -1 : 1, p = trackPoint(a, s * (T.wall + 5));
    const c = cols[k % cols.length];
    const sign = mesh(new THREE.BoxGeometry(7, 2.2, 0.3), basic(c), false);
    sign.position.set(p.x, p.y + 6.5, p.z); sign.rotation.y = p.h + Math.PI / 2;
    g.add(sign);
    const post = mesh(new THREE.CylinderGeometry(0.15, 0.15, 5.4, 6), toon('#2b2f45'), false);
    post.position.set(p.x, p.y + 2.7, p.z); g.add(post);
  }
}
function mesasLayer(g) {
  const T = TR, list = [];
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), r = rand(T.rad + 50, T.rad + 190);
    const x = T.cx + Math.cos(a) * r, z = T.cz + Math.sin(a) * r;
    if (!freeSpot(x, z, 30)) continue;
    const h = rand(18, 46), s = rand(18, 40);
    list.push({ x, y: h / 2, z, sx: s, sy: h, sz: s * rand(0.6, 1), ry: rand(0, 3), c: pick(['#c8643c', '#d9774a', '#b9573a']) });
    list.push({ x, y: h + 0.8, z, sx: s * 1.02, sy: 1.6, sz: s * 0.62, ry: rand(0, 3), c: '#e8a06b' });
  }
  g.add(inst(new THREE.CylinderGeometry(0.5, 0.56, 1, 7), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad }), list, true));
}
function cactiLayer(g, spots) {
  const parts = [];
  spots.forEach((p) => {
    const h = rand(2.6, 5);
    parts.push({ x: p.x, y: h / 2, z: p.z, sx: 0.5, sy: h, sz: 0.5 });
    if (Math.random() < 0.8) { const s = pick([-1, 1]); parts.push({ x: p.x + s * 0.7, y: h * 0.55, z: p.z, sx: 0.36, sy: h * 0.35, sz: 0.36 }); parts.push({ x: p.x + s * 0.4, y: h * 0.4, z: p.z, sx: 0.8, sy: 0.32, sz: 0.32 }); }
  });
  g.add(inst(new THREE.CapsuleGeometry(0.5, 1, 4, 8), toon('#3f9e3a'), parts.map((q) => ({ ...q, sy: q.sy / 2 })), true));
}
function mountainsRing(g, snowCap) {
  const T = TR, base = [], caps = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand(-0.1, 0.1), r = T.rad + rand(170, 260);
    const h = rand(70, 140), s = rand(50, 90);
    base.push({ x: T.cx + Math.cos(a) * r, y: h / 2 - 2, z: T.cz + Math.sin(a) * r, sx: s, sy: h, sz: s, ry: rand(0, 3), c: pick(['#7d8aa8', '#6f7c9c', '#8a96b3']) });
    if (snowCap) caps.push({ x: T.cx + Math.cos(a) * r, y: h * 0.78 - 2, z: T.cz + Math.sin(a) * r, sx: s * 0.47, sy: h * 0.45, sz: s * 0.47, ry: base[base.length - 1].ry });
  }
  g.add(inst(new THREE.ConeGeometry(0.5, 1, 7), new THREE.MeshLambertMaterial({ color: 0xffffff }), base));
  if (caps.length) g.add(inst(new THREE.ConeGeometry(0.5, 1, 7), new THREE.MeshLambertMaterial({ color: 0xffffff }), caps));
}
function snowmenLayer(g, spots) {
  const balls = [], noses = [];
  spots.forEach((p) => {
    balls.push({ x: p.x, y: 0.9, z: p.z, s: 1 }, { x: p.x, y: 2.2, z: p.z, s: 0.7 }, { x: p.x, y: 3.2, z: p.z, s: 0.48 });
    const a = rand(0, 6);
    noses.push({ x: p.x + Math.sin(a) * 0.5, y: 3.2, z: p.z + Math.cos(a) * 0.5, sx: 0.12, sy: 0.5, sz: 0.12, rx: Math.PI / 2, ry: a });
  });
  g.add(inst(blobGeo, toon('#ffffff'), balls, true));
  g.add(inst(new THREE.ConeGeometry(1, 1, 6), toon('#ff7a2f'), noses));
}
function balloonsLayer(g) {
  const T = TR, list = [];
  for (let i = 0; i < 6; i++) {
    const a = rand(0, Math.PI * 2), r = rand(T.rad * 0.4, T.rad + 60);
    const b = new THREE.Group();
    const env = outline(mesh(new THREE.SphereGeometry(4, 16, 12), toon(pick(['#ff4f4f', '#ffc93a', '#3a7bff', '#ff4f9a', '#2fd27a']))), 1.04);
    env.scale.y = 1.15; b.add(env);
    const band = mesh(new THREE.CylinderGeometry(4.05, 4.05, 1.2, 16, 1, true), toon('#ffffff', { side: THREE.DoubleSide }), false); b.add(band);
    const basket = outline(mesh(new THREE.BoxGeometry(1.4, 1, 1.4), toon('#8a5a36')), 1.06); basket.position.y = -6; b.add(basket);
    b.position.set(T.cx + Math.cos(a) * r, rand(38, 60), T.cz + Math.sin(a) * r);
    b.userData.ph = rand(0, 6);
    g.add(b); list.push(b);
  }
  return list;
}

const VENUES = {
  parque: {
    name: 'Parque', sky: ['#3fa7f5', '#8fd3ff', '#dff4ff'], fog: [0xd4efff, 140, 520], hemi: [0xe8f6ff, 0x4f9a3f, 1.15], sun: [0xfff6e5, 1.7],
    ground: '#58b94d', grass: ['#5cc451', '#52b648', '#6ccf5c'], bank: '#4ea544', road: '#5d6170', roadSpk: ['#666a7a', '#545867', '#6e7282'], line: '#ffffff', mid: '#ffffff',
    curb: ['#ff4f4f', '#ffffff'], wall: ['#ff4f4f', '#f4f6fb'], stand: ['#d6dbe8', '#c3c9da'], dust: 0xc9d9a0,
    decor(g) {
      treesLayer(g, scatter(150, 4));
      hillsRing(g, 0x7cc767);
      cloudsLayer(g);
      return { balloons: balloonsLayer(g) };
    },
  },
  playa: {
    name: 'Playa', sky: ['#1f8fe6', '#7fd0ff', '#fff1d6'], fog: [0xf1ead9, 160, 560], hemi: [0xfff4e0, 0xd9b77a, 1.15], sun: [0xfff0d0, 1.85],
    ground: '#efd29a', grass: ['#efd29a', '#e4c27f', '#f7e2b5'], bank: '#e2c085', road: '#62677a', roadSpk: ['#6b7083', '#585d70', '#74798b'], line: '#ffffff', mid: '#ffd23a',
    curb: ['#2a7fd6', '#ffffff'], wall: ['#2a7fd6', '#ffffff'], stand: ['#ffffff', '#ffe9b0'], dust: 0xf3dcaa, sandy: true,
    decor(g) {
      const T = TR, shore = T.minZ - 34;
      const seaTex = canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#1aa7d6'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
        for (let i = 0; i < 6; i++) { c.beginPath(); for (let x = 0; x <= w; x += 4) c.lineTo(x, i * 22 + 8 + Math.sin(x / 10) * 3); c.stroke(); }
      }, [60, 24]);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 700), new THREE.MeshLambertMaterial({ map: seaTex }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(T.cx, 0.03, shore - 350);
      g.add(sea);
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(1600, 2.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      foam.rotation.x = -Math.PI / 2; foam.position.set(T.cx, 0.06, shore);
      g.add(foam);
      palmsLayer(g, scatter(70, 3, 120, (x, z) => z > shore + 6));
      // sombrillas
      for (const p of scatter(16, 2, 60, (x, z) => z > shore + 4 && z < shore + 40)) {
        const col = pick(['#ff4f9a', '#ffd23a', '#2fd27a', '#3a7bff', '#ff7a2f']);
        const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), toon('#ffffff')); pole.position.set(p.x, 1.4, p.z); g.add(pole);
        const top = outline(mesh(new THREE.ConeGeometry(1.7, 0.8, 10), toon(col))); top.position.set(p.x, 2.85, p.z); g.add(top);
      }
      // un barco a lo lejos
      const boat = new THREE.Group();
      const hull = outline(mesh(new THREE.BoxGeometry(10, 2, 3.4), toon('#ffffff'))); hull.position.y = 1; boat.add(hull);
      const sail = mesh(new THREE.ConeGeometry(3, 8, 3), toon('#ff4f4f')); sail.position.y = 6; boat.add(sail);
      boat.position.set(T.cx + 40, 0, shore - 120); g.add(boat);
      cloudsLayer(g, 0xffffff, 0xb8c8d8, 10);
      return { update(dt, t) { seaTex.offset.y = (t * 0.03) % 1; foam.material.opacity = 0.6 + Math.sin(t * 1.3) * 0.25; boat.position.x = T.cx + 40 + Math.sin(t * 0.05) * 60; boat.rotation.z = Math.sin(t * 0.9) * 0.04; } };
    },
  },
  noche: {
    name: 'Ciudad', night: true, sky: ['#070b24', '#1d2260', '#5a3d8a'], fog: [0x1a1c3c, 90, 400], hemi: [0x8fa0ff, 0x1d2040, 0.62], sun: [0xb8c6ff, 0.7],
    ground: '#2b2f45', grass: ['#3a3f58', '#343850', '#41465f'], bank: '#30344a', road: '#3f4354', roadSpk: ['#484c5e', '#373a4a', '#50546a'], line: '#ffe14d', mid: '#ffffff',
    curb: ['#ffde3a', '#1d2340'], wall: ['#ff4fd8', '#25b8ff'], wallGlow: true, stand: ['#5d6272', '#4f5464'], dust: 0x8a8fa8,
    decor(g) {
      buildingsLayer(g, scatter(90, 10, 110), true, ['#4b4f7a', '#3d4068', '#5a4f86', '#2f3a6b', '#45507d']);
      lampsLayer(g, true);
      neonSigns(g);
      return {};
    },
  },
  canon: {
    name: 'Cañón', sky: ['#3d98e0', '#a3dcff', '#ffe2b8'], fog: [0xf2d2ad, 150, 520], hemi: [0xfff1dc, 0xc0703f, 1.1], sun: [0xffe8c8, 1.9],
    ground: '#d9884a', grass: ['#dd9658', '#cf8247', '#e6a46b'], bank: '#c97a42', road: '#6a6370', roadSpk: ['#736c79', '#5f5966', '#7b7482'], line: '#ffffff', mid: '#ffc93a',
    curb: ['#ffc93a', '#1d2340'], wall: ['#ffc93a', '#1d2340'], stand: ['#e8c9a0', '#d4b38a'], dust: 0xe0a46b, sandy: true,
    decor(g) {
      mesasLayer(g);
      cactiLayer(g, scatter(70, 2, 110));
      rocksLayer(g, scatter(60, 2, 110), ['#b9573a', '#c8643c', '#a64c32', '#d9774a']);
      cloudsLayer(g, 0xffffff, 0xc8b8a8, 7);
      return {};
    },
  },
  nieve: {
    name: 'Nieve', sky: ['#5fa8e8', '#c9e6ff', '#f2f8ff'], fog: [0xe8f2ff, 120, 480], hemi: [0xffffff, 0x9fb4d0, 1.2], sun: [0xffffff, 1.55],
    ground: '#f4f8ff', grass: ['#f2f6ff', '#e3ecfa', '#ffffff'], bank: '#e4ecf8', road: '#6b7187', roadSpk: ['#757b90', '#62687d', '#7f859a', '#c9d3e6'], line: '#ffffff', mid: '#ffffff',
    curb: ['#3a7bff', '#ffffff'], wall: ['#3a7bff', '#ffffff'], stand: ['#c9d3e6', '#b8c3d9'], dust: 0xffffff, snowy: true,
    decor(g) {
      pinesLayer(g, scatter(150, 3), true);
      snowmenLayer(g, scatter(10, 2, 60));
      mountainsRing(g, true);
      cloudsLayer(g, 0xffffff, 0xc8d4e4, 10);
      return {};
    },
  },
};

let WORLD = null;
function buildWorld(id) {
  const def = trackOf(id);
  if (WORLD && WORLD.id === def.id) return;
  if (WORLD) {
    scene.remove(WORLD.group);
    WORLD.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }
  const V = VENUES[def.venue];
  TR = buildTrackData(def);
  const T = TR, g = new THREE.Group();
  scene.add(g);
  setSky(V.sky);
  scene.fog = new THREE.Fog(V.fog[0], V.fog[1], V.fog[2]);
  hemi.color.set(V.hemi[0]); hemi.groundColor.set(V.hemi[1]); hemi.intensity = V.hemi[2];
  sun.color.set(V.sun[0]); sun.intensity = V.sun[1];
  renderer.setClearColor(V.fog[0]);
  STARS.visible = !!V.night;
  const own = (m) => { m.userData.own = true; return m; };
  // suelo
  const gt = grassTex([V.ground, ...V.grass.slice(1)]);
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), own(new THREE.MeshLambertMaterial({ map: gt })));
  ground.rotation.x = -Math.PI / 2; ground.position.set(T.cx, -0.06, T.cz); ground.receiveShadow = true;
  g.add(ground);
  // superficie de la pista
  const surf = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m); return m; };
  const rt = roadTex(V); rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
  surf(ribbonGeo(T, -T.half, T.half, 0.05, 0.05, 9), own(new THREE.MeshLambertMaterial({ map: rt })));
  const ct = stripeTex(V.curb[0], V.curb[1]); ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
  const curbMat = own(new THREE.MeshLambertMaterial({ map: ct }));
  surf(ribbonGeo(T, -T.half - 1.1, -T.half, 0.08, 0.06, 4), curbMat);
  surf(ribbonGeo(T, T.half, T.half + 1.1, 0.06, 0.08, 4), curbMat);
  const st = grassTex(V.grass); st.wrapS = st.wrapT = THREE.RepeatWrapping;
  const shMat = own(new THREE.MeshLambertMaterial({ map: st }));
  surf(ribbonGeo(T, -T.wall - 0.5, -T.half - 1.1, 0.03, 0.03, 6), shMat);
  surf(ribbonGeo(T, T.half + 1.1, T.wall + 0.5, 0.03, 0.03, 6), shMat);
  const bankMat = own(new THREE.MeshLambertMaterial({ color: V.bank, side: THREE.DoubleSide }));
  const bw = (i) => T.wall + 0.5 + 0.5 + T.py[i] * 1.6;
  surf(ribbonGeo(T, (i) => -bw(i), -T.wall - 0.5, -0.06, 0.03, 10, true, false), bankMat);
  surf(ribbonGeo(T, T.wall + 0.5, bw, 0.03, -0.06, 10, false, true), bankMat);
  // paredes (cara interior, tapa y cara exterior)
  const wt = stripeTex(V.wall[0], V.wall[1]); wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  const wallMat = own(V.wallGlow ? new THREE.MeshBasicMaterial({ map: wt, side: THREE.DoubleSide }) : new THREE.MeshToonMaterial({ map: wt, gradientMap: toonGrad, side: THREE.DoubleSide }));
  const WH = 1.0, WT = 0.5;
  for (const s of [-1, 1]) {
    const inner = s * T.wall, outer = s * (T.wall + WT);
    const wall = (o0, o1, h0, h1) => { const m = surf(ribbonGeo(T, o0, o1, h0, h1, 6), wallMat); m.castShadow = true; };
    wall(inner, inner, 0, WH); wall(outer, outer, 0, WH);
    wall(Math.min(inner, outer), Math.max(inner, outer), WH, WH);
  }
  // meta: cuadros, pórtico y semáforo
  const sp = trackPoint(0, 0);
  const startG = new THREE.Group(); startG.position.set(sp.x, sp.y, sp.z); startG.rotation.y = sp.h; g.add(startG);
  const chk = new THREE.Mesh(new THREE.PlaneGeometry(T.w, 2.6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: checkerTex }));
  chk.position.y = 0.075; chk.receiveShadow = true; startG.add(chk);
  for (const s of [-1, 1]) {
    const post = outline(mesh(new THREE.BoxGeometry(0.7, 7.4, 0.7), toon('#f4f6fb')), 1.06);
    post.position.set(s * (T.half + 2.3), 3.7, 0); startG.add(post);
  }
  const beam = outline(mesh(new THREE.BoxGeometry(T.w + 5.4, 1.5, 0.9), toon('#1d2340')), 1.04);
  beam.position.set(0, 7.2, 0); startG.add(beam);
  for (const s of [-1, 1]) {
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(T.w + 4, 1.2), new THREE.MeshBasicMaterial({ map: bannerTex }));
    ban.position.set(0, 7.2, s * 0.47); if (s < 0) ban.rotation.y = Math.PI; startG.add(ban);
  }
  const lights = [];
  for (let k = 0; k < 3; k++) {
    const housing = mesh(new THREE.BoxGeometry(1.2, 1.2, 0.5), toon('#2b2f45'), false);
    housing.position.set((k - 1) * 1.6, 8.6, -0.3); startG.add(housing);
    const lm = new THREE.MeshBasicMaterial({ color: 0x3a1418 });
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), lm);
    l.position.set((k - 1) * 1.6, 8.6, -0.56); l.rotation.y = Math.PI; startG.add(l);
    lights.push(lm);
  }
  // marcas de la parrilla
  const gm = basic('#ffffff');
  for (let s = 0; s < MAX_CARS; s++) {
    const p = gridPos(s), q = trackPoint(-9 - Math.floor(s / 2) * 7.5 - (s % 2 ? 2.6 : 0) + 2.1, (s % 2 ? 1 : -1) * T.w * 0.24);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.28).rotateX(-Math.PI / 2), gm);
    m.position.set(q.x, q.y + 0.07, q.z); m.rotation.y = p.h; g.add(m);
  }
  // flechas de turbo
  const padMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, opacity: 0.95 });
  for (const [f, lat] of T.def.pads || []) {
    const along = f * T.L, p = trackPoint(along, lat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6).rotateX(-Math.PI / 2), padMat);
    m.position.set(p.x, p.y + 0.085, p.z); m.rotation.y = p.h; g.add(m);
    T.pads.push({ along, lat });
  }
  // borde de las rampas: franja amarilla y negra
  const hz = stripeTex('#ffc93a', '#1d2340', 8); hz.wrapS = hz.wrapT = THREE.RepeatWrapping;
  const hzMat = own(new THREE.MeshLambertMaterial({ map: hz }));
  for (const i of T.lips) {
    const j = (i - 1 + T.N) % T.N, slope = (T.py[i] - T.py[j]) / T.seg[j];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, T.w).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), hzMat);
    m.rotation.order = 'YXZ'; m.rotation.set(-Math.atan(slope), T.head[i], 0);
    const p = trackPoint(T.cum[i] - 0.9, 0);
    m.position.set(p.x, T.py[i] - slope * 0.9 + 0.09, p.z);
    g.add(m);
  }
  if (!V.night) lampsLayer(g, false);
  const fans = standsAtStart(g, V);
  const extra = V.decor(g) || {};
  WORLD = { id: def.id, group: g, V, fans, lights, update: extra.update, balloons: extra.balloons || [], cheer: 0 };
}
function setStartLights(n) {
  // n: 0 apagado · 1-3 luces rojas · 4 verde
  if (!WORLD) return;
  WORLD.lights.forEach((m, k) => m.color.set(n === 4 ? 0x2fff6a : k < n ? 0xff2a2a : 0x3a1418));
}
function updateWorld(dt, t) {
  if (!WORLD) return;
  arrowTex.offset.y = (arrowTex.offset.y + dt * 1.6) % 1;
  if (WORLD.fans) { WORLD.cheer = Math.max(0, WORLD.cheer - dt); WORLD.fans.position.y = Math.abs(Math.sin(t * (WORLD.cheer > 0 ? 11 : 3))) * (WORLD.cheer > 0 ? 0.45 : 0.08); }
  for (const b of WORLD.balloons) { b.position.y += Math.sin(t * 0.4 + b.userData.ph) * dt * 0.6; b.rotation.y += dt * 0.05; }
  if (WORLD.update) WORLD.update(dt, t);
}

// =========================================================
//  CARROS Y PILOTOS (toon, hechos con primitivas)
//  ejes locales: +z adelante, +x a la izquierda del piloto, +y arriba
// =========================================================
const CG = {
  cylX: new THREE.CylinderGeometry(0.5, 0.5, 1, 18).rotateZ(Math.PI / 2),
  cylY: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cylZ: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateX(Math.PI / 2),
  armZ: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5),
  sph: new THREE.SphereGeometry(0.5, 20, 14),
  helmet: new THREE.SphereGeometry(0.5, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  flame: new THREE.ConeGeometry(0.5, 1, 10, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2),
  nose: new THREE.CylinderGeometry(0.7071 * 0.42, 0.7071, 1, 4, 1).rotateY(Math.PI / 4).rotateX(Math.PI / 2),
  torus: new THREE.TorusGeometry(0.2, 0.038, 8, 22),
  blob: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
};
const RB_CACHE = new Map();
function rbox(w, h, d, r) {
  const key = [w, h, d, r].map((v) => v.toFixed(3)).join('|');
  if (!RB_CACHE.has(key)) RB_CACHE.set(key, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
  return RB_CACHE.get(key);
}
// pieza con contorno de grosor parejo aunque la pieza esté estirada
function part(par, geo, mat, x, y, z, sx, sy, sz, ol = 0.04, rx = 0, ry = 0, rz = 0) {
  const m = mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
  if (ol) outline(m, [1 + (2 * ol) / sx, 1 + (2 * ol) / sy, 1 + (2 * ol) / sz]);
  par.add(m);
  return m;
}
function rpart(par, w, h, d, r, mat, x, y, z, ol = 0.04, rx = 0, ry = 0, rz = 0) {
  const m = mesh(rbox(w, h, d, r), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (ol) outline(m, [1 + (2 * ol) / w, 1 + (2 * ol) / h, 1 + (2 * ol) / d]);
  par.add(m);
  return m;
}
// medidas de cada carrocería (metros)
const KINDS = {
  compacto: { L: 3.4, W: 1.8, wr: 0.4, wrR: 0.4, ww: 0.34, wb: 2.15, tw: 1.62, clr: 0.3, bodyH: 0.6, seatY: 0.62, seatZ: -0.2, bar: true },
  deportivo: { L: 3.9, W: 1.92, wr: 0.4, wrR: 0.42, ww: 0.38, wb: 2.4, tw: 1.7, clr: 0.24, bodyH: 0.48, seatY: 0.46, seatZ: -0.35, bar: true },
  buggy: { L: 2.9, W: 1.4, wr: 0.56, wrR: 0.58, ww: 0.44, wb: 2.05, tw: 1.95, clr: 0.5, bodyH: 0.46, seatY: 0.72, seatZ: -0.1, bar: false },
  formula: { L: 4.1, W: 0.95, wr: 0.4, wrR: 0.46, ww: 0.46, wb: 2.65, tw: 1.78, clr: 0.16, bodyH: 0.42, seatY: 0.28, seatZ: -0.25, bar: false },
  muscle: { L: 4.2, W: 1.95, wr: 0.42, wrR: 0.47, ww: 0.42, wb: 2.55, tw: 1.68, clr: 0.28, bodyH: 0.6, seatY: 0.6, seatZ: -0.55, bar: true },
  camion: { L: 4.0, W: 2.05, wr: 0.68, wrR: 0.68, ww: 0.56, wb: 2.45, tw: 2.1, clr: 0.76, bodyH: 0.72, seatY: 1.2, seatZ: 0.05, bar: true },
};
const shade = (hex, l) => '#' + _col.set(hex).offsetHSL(0, 0, l).getHexString();
function carMats(look) {
  return {
    paint: toon(look.paint), dark: toon(shade(look.paint, -0.16)), trim: toon('#2b2f45'), chrome: toon('#d7dbe4'),
    glass: toon('#bfe9ff', { transparent: true, opacity: 0.55 }), stripe: look.stripe === 'none' ? null : toon(look.stripe),
    tire: toon('#2a2d3a'), rim: toon(look.wheel), head: basic('#fff6c8'),
  };
}
function stripes(c, M, K, y, zf, lf, zr, lr, double) {
  if (!M.stripe) return;
  for (const x of double ? [-0.24, 0.24] : [0]) {
    if (lf > 0) rpart(c.body, double ? 0.2 : 0.36, 0.03, lf, 0.01, M.stripe, x, y, zf, 0);
    if (lr > 0) rpart(c.body, double ? 0.2 : 0.36, 0.03, lr, 0.01, M.stripe, x, y, zr, 0);
  }
}
function rollBar(c, M, y, z, w, h) {
  for (const s of [-1, 1]) part(c.body, CG.cylY, M.trim, s * w / 2, y + h / 2, z, 0.09, h, 0.09, 0.03);
  part(c.body, CG.cylX, M.trim, 0, y + h, z, w + 0.09, 0.09, 0.09, 0.03);
}
function windshield(c, M, K, y, z, w, h, tilt) {
  const g = part(c.body, CG.box, M.glass, 0, y + h / 2 * Math.cos(tilt), z, w, h, 0.05, 0.025, -tilt);
  g.castShadow = false;
  part(c.body, CG.box, M.trim, 0, y + h * Math.cos(tilt), z - h * Math.sin(tilt) * 0.5, w + 0.06, 0.07, 0.07, 0.025, -tilt);
}
const BUILD = {
  compacto(c, K, M) {
    const top = K.clr + K.bodyH;
    rpart(c.body, K.W, K.bodyH, K.L, 0.24, M.paint, 0, K.clr + K.bodyH / 2, 0);
    rpart(c.body, K.W * 0.86, 0.2, K.L * 0.34, 0.09, M.paint, 0, top - 0.02, K.L * 0.29, 0.03);
    rpart(c.body, K.W * 0.86, 0.22, K.L * 0.24, 0.09, M.paint, 0, top - 0.01, -K.L * 0.35, 0.03);
    rpart(c.body, K.W * 0.64, 0.06, 1.15, 0.03, M.trim, 0, top + 0.0, K.seatZ, 0);
    for (const z of [K.L / 2 - 0.08, -K.L / 2 + 0.08]) rpart(c.body, K.W * 1.02, 0.22, 0.26, 0.09, M.trim, 0, K.clr + 0.12, z, 0.03);
    windshield(c, M, K, top, K.seatZ + 0.8, K.W * 0.74, 0.42, 0.45);
    stripes(c, M, K, top + 0.09, K.L * 0.29, K.L * 0.34, -K.L * 0.35, K.L * 0.24);
  },
  deportivo(c, K, M) {
    const top = K.clr + K.bodyH;
    rpart(c.body, K.W, K.bodyH, K.L * 0.78, 0.18, M.paint, 0, K.clr + K.bodyH / 2, -K.L * 0.1);
    rpart(c.body, K.W * 0.96, K.bodyH * 0.64, K.L * 0.34, 0.14, M.paint, 0, K.clr + K.bodyH * 0.32, K.L * 0.33);
    for (const s of [-1, 1]) {
      rpart(c.body, 0.34, K.bodyH * 0.95, 1.15, 0.13, M.paint, s * (K.W / 2 - 0.05), K.clr + K.bodyH * 0.52, -K.wb / 2, 0.03);
      rpart(c.body, 0.05, 0.16, 0.6, 0.02, M.trim, s * (K.W / 2 + 0.01), K.clr + K.bodyH * 0.5, 0.05, 0);
    }
    rpart(c.body, K.W * 0.62, 0.05, 1.2, 0.02, M.trim, 0, top, K.seatZ, 0);
    rpart(c.body, K.W * 1.0, 0.14, 0.26, 0.06, M.trim, 0, K.clr + 0.08, K.L / 2 - 0.06, 0.03);
    rpart(c.body, K.W * 0.9, 0.18, 0.2, 0.06, M.trim, 0, K.clr + 0.12, -K.L / 2 + 0.06, 0.03);
    windshield(c, M, K, top, K.seatZ + 0.85, K.W * 0.78, 0.34, 0.8);
    stripes(c, M, K, top + 0.005, K.L * 0.12, K.L * 0.32, -K.L * 0.38, K.L * 0.18);
    stripes(c, M, K, K.clr + K.bodyH * 0.64 + 0.005, K.L * 0.36, K.L * 0.26, 0, 0);
  },
  buggy(c, K, M) {
    const top = K.clr + K.bodyH;
    rpart(c.body, K.W * 0.9, K.bodyH, K.L * 0.74, 0.16, M.paint, 0, K.clr + K.bodyH / 2, 0.05);
    rpart(c.body, K.W * 0.7, 0.28, 0.5, 0.1, M.paint, 0, K.clr + 0.3, K.L * 0.42, 0.03);
    rpart(c.body, K.W * 0.62, 0.05, 1.0, 0.02, M.trim, 0, top, K.seatZ, 0);
    // jaula
    const cy = top + 0.95, xs = K.W * 0.4, z0 = K.seatZ + 0.55, z1 = K.seatZ - 0.55;
    for (const s of [-1, 1]) for (const z of [z0, z1]) part(c.body, CG.cylY, M.trim, s * xs, top + 0.475, z, 0.08, 0.95, 0.08, 0.025);
    for (const s of [-1, 1]) part(c.body, CG.cylZ, M.trim, s * xs, cy, (z0 + z1) / 2, 0.08, 0.08, z0 - z1 + 0.08, 0.025);
    for (const z of [z0, z1]) part(c.body, CG.cylX, M.trim, 0, cy, z, xs * 2 + 0.08, 0.08, 0.08, 0.025);
    // defensa, motor y rueda de repuesto
    part(c.body, CG.cylX, M.chrome, 0, K.clr + 0.25, K.L / 2 + 0.02, K.W * 0.8, 0.09, 0.09, 0.025);
    rpart(c.body, 0.8, 0.46, 0.6, 0.1, M.trim, 0, top + 0.12, -K.L * 0.38, 0.03);
    for (const s of [-1, 1]) part(c.body, CG.cylY, M.chrome, s * 0.22, top + 0.55, -K.L * 0.44, 0.09, 0.5, 0.09, 0.025);
    // guardabarros sobre las ruedas (van por fuera de la carrocería)
    for (const s of [-1, 1]) for (const z of [K.wb / 2, -K.wb / 2]) rpart(c.body, K.ww + 0.16, 0.08, K.wr * 1.7, 0.03, M.paint, s * K.tw / 2, K.wr * 2 + 0.04, z, 0.025);
    stripes(c, M, K, K.clr + 0.45, K.L * 0.42, 0.5, 0, 0);
  },
  formula(c, K, M) {
    const top = K.clr + K.bodyH;
    part(c.body, CG.nose, M.paint, 0, K.clr + 0.2, K.L * 0.27, 0.66, 0.34, K.L * 0.42, 0.035);
    rpart(c.body, K.W * 0.78, K.bodyH, 1.9, 0.14, M.paint, 0, K.clr + K.bodyH / 2, -0.25);
    for (const s of [-1, 1]) rpart(c.body, 0.44, K.bodyH * 0.8, 1.4, 0.12, M.dark, s * (K.W * 0.39 + 0.2), K.clr + K.bodyH * 0.4, -0.4, 0.03);
    rpart(c.body, 0.62, 0.5, 1.25, 0.2, M.paint, 0, K.clr + 0.42, -1.2, 0.03);
    rpart(c.body, 0.32, 0.46, 0.56, 0.1, M.paint, 0, top + 0.4, K.seatZ - 0.62, 0.03);
    rpart(c.body, K.W * 0.5, 0.05, 0.9, 0.02, M.trim, 0, top, K.seatZ + 0.05, 0);
    // alerones
    const fw = rpart(c.body, K.tw + 0.36, 0.06, 0.5, 0.02, M.dark, 0, K.clr + 0.06, K.L / 2 - 0.2, 0.025);
    fw.castShadow = true;
    for (const s of [-1, 1]) rpart(c.body, 0.05, 0.24, 0.55, 0.02, M.trim, s * (K.tw / 2 + 0.18), K.clr + 0.14, K.L / 2 - 0.2, 0.02);
    const wingC = M.stripe || M.dark;
    rpart(c.body, 1.5, 0.08, 0.5, 0.03, wingC, 0, 1.12, -K.L / 2 + 0.25, 0.025);
    for (const s of [-1, 1]) { rpart(c.body, 0.05, 0.42, 0.6, 0.02, M.trim, s * 0.75, 1.0, -K.L / 2 + 0.25, 0.02); part(c.body, CG.cylY, M.trim, s * 0.2, 0.86, -K.L / 2 + 0.3, 0.06, 0.5, 0.06, 0.02); }
    // brazos de suspensión
    for (const s of [-1, 1]) for (const z of [K.wb / 2, -K.wb / 2]) part(c.body, CG.cylX, M.trim, s * (K.tw / 4 + 0.1), K.clr + 0.22, z, K.tw / 2 - 0.2, 0.05, 0.05, 0);
    stripes(c, M, K, K.clr + 0.38, K.L * 0.3, K.L * 0.3, -0.25, 1.2);
  },
  muscle(c, K, M) {
    const top = K.clr + K.bodyH;
    rpart(c.body, K.W, K.bodyH, K.L, 0.2, M.paint, 0, K.clr + K.bodyH / 2, 0);
    rpart(c.body, K.W * 1.03, 0.32, 1.25, 0.12, M.paint, 0, K.clr + K.bodyH * 0.74, -K.wb / 2, 0.03);
    rpart(c.body, 0.62, 0.18, 0.86, 0.07, M.trim, 0, top + 0.06, K.L * 0.2, 0.03);
    rpart(c.body, K.W * 0.66, 0.05, 1.25, 0.02, M.trim, 0, top, K.seatZ, 0);
    rpart(c.body, K.W * 0.86, K.bodyH * 0.5, 0.06, 0.02, M.trim, 0, K.clr + K.bodyH * 0.5, K.L / 2 + 0.01, 0);
    for (const z of [K.L / 2 - 0.02, -K.L / 2 + 0.02]) rpart(c.body, K.W * 1.03, 0.16, 0.2, 0.07, M.chrome, 0, K.clr + 0.1, z, 0.03);
    windshield(c, M, K, top, K.seatZ + 0.85, K.W * 0.76, 0.38, 0.55);
    stripes(c, M, K, top + 0.005, K.L * 0.27, K.L * 0.44, -K.L * 0.38, K.L * 0.22, true);
  },
  camion(c, K, M) {
    const top = K.clr + K.bodyH;
    rpart(c.body, K.W * 0.6, 0.26, K.L * 0.86, 0.06, M.trim, 0, K.clr - 0.06, 0, 0.03);
    rpart(c.body, K.W, K.bodyH, K.L * 0.56, 0.2, M.paint, 0, K.clr + K.bodyH / 2, K.L * 0.21);
    rpart(c.body, K.W, 0.2, K.L * 0.44, 0.05, M.dark, 0, K.clr + 0.12, -K.L * 0.27, 0.03);
    for (const s of [-1, 1]) rpart(c.body, 0.12, K.bodyH * 0.72, K.L * 0.44, 0.04, M.paint, s * (K.W / 2 - 0.06), K.clr + 0.22 + K.bodyH * 0.36, -K.L * 0.27, 0.03);
    rpart(c.body, K.W, K.bodyH * 0.72, 0.12, 0.04, M.paint, 0, K.clr + 0.22 + K.bodyH * 0.36, -K.L / 2 + 0.06, 0.03);
    rpart(c.body, K.W * 0.62, 0.05, 1.0, 0.02, M.trim, 0, top, K.seatZ, 0);
    rpart(c.body, K.W * 0.8, K.bodyH * 0.6, 0.12, 0.04, M.chrome, 0, K.clr + K.bodyH * 0.55, K.L / 2 + 0.02, 0.03);
    rpart(c.body, K.W * 1.04, 0.22, 0.24, 0.08, M.chrome, 0, K.clr + 0.08, K.L / 2 + 0.05, 0.03);
    windshield(c, M, K, top, K.seatZ + 0.75, K.W * 0.8, 0.45, 0.3);
    stripes(c, M, K, top + 0.005, K.L * 0.38, K.L * 0.2, 0, 0);
  },
};
const TIER_COL = ['#fff2b0', '#3ab4ff', '#ff9a1a', '#c06bff'];
const GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.3, depthWrite: false });
const SHADOW_MAT = new THREE.MeshBasicMaterial({ map: radialTex, color: 0x1d2340, transparent: true, opacity: 0.55, depthWrite: false });
const BEAM_MAT = new THREE.MeshBasicMaterial({ map: radialTex, color: 0xfff1c0, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending });

function buildDriver(c, look, K) {
  const d = new THREE.Group();
  d.position.set(0, K.seatY, K.seatZ);
  c.body.add(d);
  const suit = toon(look.helmet === '#ffffff' ? look.paint : look.helmet);
  part(d, CG.sph, suit, 0, 0.22, 0, 0.62, 0.64, 0.5, 0.035);
  const head = new THREE.Group();
  head.position.set(0, 0.84, 0.02);
  d.add(head);
  part(head, CG.sph, toon(look.skin), 0, 0, 0, 0.78, 0.76, 0.76, 0.035);
  const ink = toon('#1d2340');
  for (const s of [-1, 1]) {
    part(head, CG.sph, ink, s * 0.13, 0.02, 0.33, 0.085, 0.12, 0.05, 0).castShadow = false;
    part(head, CG.sph, basic('#ffffff'), s * 0.13 + 0.022, 0.05, 0.355, 0.03, 0.03, 0.02, 0).castShadow = false;
    part(head, CG.sph, toon('#ff9db0'), s * 0.22, -0.09, 0.29, 0.1, 0.06, 0.04, 0).castShadow = false;
  }
  part(head, CG.box, toon('#7a2b2b'), 0, -0.13, 0.36, 0.1, 0.03, 0.02, 0).castShadow = false;
  const hm = toon(look.helmet), hair = toon(look.hairColor);
  // pelo que asoma del casco
  if (look.hair === 'short' || look.hair === 'buns' || look.hair === 'curly') part(head, CG.sph, hair, 0, 0.17, 0.27, 0.5, 0.13, 0.18, 0.025, -0.3);
  if (look.hair === 'long') part(head, CG.sph, hair, 0, -0.17, -0.25, 0.64, 0.52, 0.42, 0.03);
  if (look.hair === 'buns') part(head, CG.sph, hair, 0, 0.06, -0.44, 0.26, 0.26, 0.26, 0.03);
  if (look.hair === 'curly') for (let i = 0; i < 9; i++) { const a = Math.PI * (0.25 + (i / 8) * 1.5); part(head, CG.sph, hair, Math.cos(a) * 0.36, -0.12, Math.sin(a) * -0.3 - 0.04, 0.17, 0.17, 0.17, 0); }
  // casco abierto (deja ver la cara)
  part(head, CG.helmet, hm, 0, 0.02, -0.02, 0.86, 0.86, 0.86, 0.035, -0.6);
  part(head, CG.sph, toon('#25b8ff'), -0.12, 0.33, 0.25, 0.17, 0.13, 0.1, 0.02, -0.5);
  part(head, CG.sph, toon('#25b8ff'), 0.12, 0.33, 0.25, 0.17, 0.13, 0.1, 0.02, -0.5);
  if (look.hair === 'mohawk') for (let i = 0; i < 4; i++) part(head, CG.box, hair, 0, 0.44 - i * 0.03, 0.12 - i * 0.16, 0.08, 0.2, 0.14, 0.02, -0.2 - i * 0.25);
  if (look.acc === 'shades') {
    for (const s of [-1, 1]) part(head, CG.box, ink, s * 0.14, 0.04, 0.37, 0.19, 0.11, 0.04, 0);
    part(head, CG.box, ink, 0, 0.07, 0.38, 0.12, 0.03, 0.03, 0);
  } else if (look.acc === 'mustache') {
    part(head, CG.box, toon(look.hairColor === '#f2f2f2' ? '#d9d9d9' : look.hairColor), 0, -0.07, 0.375, 0.2, 0.05, 0.04, 0);
  } else if (look.acc === 'antenna') {
    part(head, CG.cylY, ink, 0, 0.62, -0.06, 0.025, 0.42, 0.025, 0);
    part(head, CG.sph, toon(look.paint), 0, 0.86, -0.06, 0.14, 0.14, 0.14, 0.02);
  } else if (look.acc === 'horns') {
    for (const s of [-1, 1]) part(head, CG.cone, toon('#fff3d6'), s * 0.3, 0.38, -0.02, 0.12, 0.3, 0.12, 0.02, 0, 0, s * -0.6);
  } else if (look.acc === 'crown') {
    const gold = toon('#ffcf3a');
    part(head, new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true), toon('#ffcf3a', { side: THREE.DoubleSide }), 0, 0.48, -0.04, 0.38, 0.13, 0.38, 0.02);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(head, CG.cone, gold, Math.cos(a) * 0.17, 0.6, Math.sin(a) * 0.17 - 0.04, 0.09, 0.14, 0.09, 0); }
  }
  // volante y brazos
  const sw = new THREE.Group();
  sw.position.set(0, 0.44, 0.46); sw.rotation.x = -0.35;
  d.add(sw);
  const ring = new THREE.Group(); sw.add(ring);
  part(ring, CG.torus, ink, 0, 0, 0, 1, 1, 1, 0);
  part(ring, CG.box, ink, 0, 0, 0, 0.36, 0.05, 0.03, 0);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.rotation.order = 'YXZ';
    a.position.set(s * 0.27, 0.42, 0.02); d.add(a);
    const up = part(a, CG.armZ, suit, 0, 0, 0, 0.13, 0.13, 1, 0.025);
    const hand = part(a, CG.sph, toon('#ffffff'), 0, 0, 1, 0.14, 0.14, 0.14, 0.02);
    arms.push({ g: a, up, hand, s });
  }
  return { d, head, sw, ring, arms };
}
const _hv = new THREE.Vector3();
class CarView {
  constructor(look, o = {}) {
    look = sanitizeLook(look);
    this.look = look;
    this.model = modelOf(look.model);
    const K = KINDS[this.model.kind];
    this.K = K;
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    (o.parent || scene).add(this.root);
    // rollG: pivote a media altura para las vueltas de campana (carrocería y ruedas giran juntas)
    this.rollG = new THREE.Group(); this.rollG.position.y = 0.75; this.root.add(this.rollG);
    this.body = new THREE.Group(); this.rollG.add(this.body);
    const M = carMats(look);
    BUILD[this.model.kind](this, K, M, look);
    const top = K.clr + K.bodyH;
    if (K.bar) rollBar(this, M, top, K.seatZ - 0.5, K.W * 0.54, 0.62);
    // alerón
    if (this.model.kind !== 'formula' && look.spoiler !== 'none') {
      const big = look.spoiler !== 'small', h = big ? 0.5 : 0.24, z = -K.L / 2 + 0.28, ww = K.W * (big ? 0.96 : 0.82);
      const wingM = M.stripe || M.dark;
      for (const s of [-1, 1]) part(this.body, CG.box, M.trim, s * ww * 0.32, top + h / 2, z, 0.06, h, 0.12, 0.02);
      rpart(this.body, ww, 0.08, big ? 0.5 : 0.38, 0.03, wingM, 0, top + h, z, 0.025);
      if (big) for (const s of [-1, 1]) rpart(this.body, 0.05, 0.3, 0.55, 0.02, M.trim, s * ww / 2, top + h + 0.05, z, 0.02);
      if (look.spoiler === 'wing') rpart(this.body, ww * 0.9, 0.07, 0.36, 0.03, wingM, 0, top + h + 0.24, z - 0.04, 0.025);
    }
    // luces
    const ly = K.clr + K.bodyH * (this.model.kind === 'formula' ? 0.3 : 0.62);
    for (const s of [-1, 1]) {
      if (this.model.kind !== 'formula') part(this.body, CG.sph, M.head, s * K.W * 0.32, ly, K.L / 2 - 0.02, 0.34, 0.24, 0.12, 0.02);
    }
    this.tail = new THREE.MeshBasicMaterial({ color: 0x9a1020 });
    if (this.model.kind === 'formula') part(this.body, CG.box, this.tail, 0, K.clr + 0.32, -K.L / 2 + 0.02, 0.22, 0.12, 0.05, 0);
    else for (const s of [-1, 1]) part(this.body, CG.box, this.tail, s * K.W * 0.33, ly, -K.L / 2 + 0.01, 0.34, 0.14, 0.06, 0.02);
    // escapes y llamas del nitro
    this.flames = [];
    this.flameMat = new THREE.MeshBasicMaterial({ color: look.trail === 'rainbow' ? 0xff4f4f : look.trail, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const exY = this.model.kind === 'buggy' ? top + 0.8 : K.clr + 0.16, exZ = this.model.kind === 'buggy' ? -K.L * 0.44 : -K.L / 2 - 0.02;
    for (const s of this.model.kind === 'formula' ? [0] : [-1, 1]) {
      const x = this.model.kind === 'buggy' ? s * 0.22 : s * 0.36;
      if (this.model.kind !== 'buggy') part(this.body, CG.cylZ, M.chrome, x, exY, exZ, 0.13, 0.13, 0.3, 0.02);
      const f = new THREE.Mesh(CG.flame, this.flameMat); f.position.set(x, exY, exZ - 0.1);
      const core = new THREE.Mesh(CG.flame, this.coreMat); core.scale.set(0.5, 0.5, 0.55); f.add(core);
      if (this.model.kind === 'buggy') f.rotation.x = -1.1;
      f.visible = false; this.body.add(f); this.flames.push(f);
    }
    this.exhaust = { y: exY, z: exZ };
    // ruedas
    this.wheels = [];
    for (const front of [true, false]) for (const s of [-1, 1]) {
      const r = front ? K.wr : K.wrR, z = front ? K.wb / 2 : -K.wb / 2;
      const pivot = new THREE.Group(); pivot.position.set(s * K.tw / 2, r - 0.75, z); this.rollG.add(pivot);
      const spin = new THREE.Group(); pivot.add(spin);
      part(spin, CG.cylX, M.tire, 0, 0, 0, K.ww, r * 2, r * 2, 0.035);
      part(spin, CG.cylX, M.rim, s * 0.012, 0, 0, K.ww * 1.04, r * 1.12, r * 1.12, 0);
      part(spin, CG.box, M.trim, s * 0.02, 0, 0, K.ww * 1.08, r * 0.24, r * 1.0, 0);
      this.wheels.push({ pivot, spin, front, r, s, y0: r - 0.75 });
    }
    this.drv = buildDriver(this, look, K);
    // sombra de contacto (siempre, aunque no haya sombras reales)
    this.shadow = new THREE.Mesh(CG.blob, SHADOW_MAT);
    this.shadow.scale.set(K.tw + K.ww + 0.5, 1, K.L * 1.12); this.shadow.position.y = 0.06; this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
    if (o.night) {
      this.beam = new THREE.Mesh(CG.blob, BEAM_MAT);
      this.beam.scale.set(5, 1, 11); this.beam.position.set(0, 0.1, K.L / 2 + 5.2);
      this.root.add(this.beam);
    }
    this.tagY = (this.model.kind === 'camion' ? 3.2 : this.model.kind === 'formula' ? 2.1 : 2.6);
    Object.assign(this, { spin: 0, susp: 0, suspV: 0, vyE: 0, lastY: null, lastH: undefined, pitch: 0, roll: 0, slip: 0, trickT: 0, wasAir: false, airT: 0, t: rand(0, 9), emit: 0, honkT: 0, hue: 0 });
    if (o.ghost) this.makeGhost();
  }
  makeGhost() {
    this.ghost = true;
    this.root.traverse((m) => { if (!m.isMesh) return; if (m.userData.ol || m === this.shadow || m === this.beam) m.visible = false; else { m.material = GHOST_MAT; m.castShadow = false; } });
  }
  setVisible(v) { this.root.visible = v; }
  dispose() {
    this.root.removeFromParent();
    this.tail.dispose(); this.flameMat.dispose(); this.coreMat.dispose();
  }
  // s: { x, y, z, h, v, steer, drift, tier, boost, nitro, brake, air, trick, off, cel, horn, blink }
  update(dt, s, fx = true) {
    const K = this.K;
    this.t += dt;
    this.root.position.set(s.x, s.y, s.z);
    this.slip = damp(this.slip, s.drift ? -s.drift * 0.3 : 0, 7, dt);
    this.root.rotation.y = s.h + this.slip;
    if (this.lastY === null || Math.abs(s.y - this.lastY) > 4) this.lastY = s.y;
    const vy = dt > 0 ? (s.y - this.lastY) / dt : 0;
    this.lastY = s.y;
    this.vyE = damp(this.vyE, clamp(vy, -30, 30), 12, dt);
    const v = s.v, av = Math.abs(v);
    this.pitch = damp(this.pitch, clamp(-Math.atan2(this.vyE, Math.max(6, av)), -0.5, 0.5), 10, dt);
    this.root.rotation.x = this.pitch;
    const yr = this.lastH === undefined || dt <= 0 ? 0 : wrapA(s.h - this.lastH) / dt;
    this.lastH = s.h;
    this.roll = damp(this.roll, clamp(yr * av * 0.0055, -0.13, 0.13), 6, dt);
    // suspensión: se aplasta al caer de un salto
    if (s.air) this.airT += dt;
    if (this.wasAir && !s.air) { this.suspV -= Math.min(3.5, 0.4 + this.airT * 5); this.airT = 0; }
    this.wasAir = !!s.air;
    this.suspV += (-this.susp * 140 - this.suspV * 13) * dt;
    this.susp += this.suspV * dt;
    if (s.horn && this.honkT <= 0) this.honkT = 0.35;
    this.honkT -= dt;
    const honk = this.honkT > 0 ? Math.sin(this.honkT * 40) * 0.03 : 0;
    // truco en el aire: una vuelta de campana
    if (s.trick && this.trickT <= 0) this.trickT = 0.5;
    let trickR = 0;
    if (this.trickT > 0) { this.trickT -= dt; trickR = SM(1 - Math.max(0, this.trickT) / 0.5) * Math.PI * 2; }
    const dive = (s.brake && v > 3 ? 0.04 : 0) - (s.boost || s.nitro ? 0.035 : 0);
    this.body.position.y = -0.75 + this.susp + honk + (s.air ? 0.06 : Math.sin(this.t * 31) * 0.005 * Math.min(1, av / 15));
    this.body.rotation.set(dive, 0, this.roll);
    this.rollG.rotation.z = trickR;
    // ruedas
    this.spin += (v / K.wr) * dt;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.spin * (K.wr / w.r);
      if (w.front) w.pivot.rotation.y = -(s.steer || 0) * 0.42;
      w.pivot.position.y = w.y0 + (s.air ? -0.1 : 0);
    }
    // nitro / turbo
    const fl = s.nitro ? 1.3 : s.boost ? 0.95 : 0;
    if (this.look.trail === 'rainbow' && fl) { this.hue = (this.hue + dt * 2) % 1; this.flameMat.color.setHSL(this.hue, 1, 0.55); }
    for (const f of this.flames) {
      f.visible = fl > 0;
      if (fl) { const k = fl * (0.75 + Math.random() * 0.5); f.scale.set(0.26 * k, 0.26 * k, (0.7 + Math.random() * 0.5) * k); }
    }
    this.tail.color.set(s.brake ? 0xff2a2a : 0x9a1020);
    this.shadow.visible = !this.ghost;
    this.shadow.position.y = 0.06 - (s.air ? Math.min(2.5, Math.max(0, s.y - (s.gy ?? s.y))) : 0);
    this.root.visible = !(s.blink && Math.floor(this.t * 12) % 2);
    // piloto
    const D = this.drv, st = s.steer || 0;
    D.ring.rotation.z = st * 1.4;
    D.head.rotation.z = damp(D.head.rotation.z, -this.roll * 2.2, 8, dt);
    D.head.rotation.y = damp(D.head.rotation.y, s.cel ? Math.sin(this.t * 6) * 0.5 : -st * 0.3, 6, dt);
    for (const a of D.arms) {
      let tx, ty, tz;
      if (s.cel) { tx = a.s * 0.5; ty = 0.42 + 0.62 + Math.sin(this.t * 10 + a.s) * 0.08; tz = 0.2; }
      else {
        const ang = st * 1.4 + (a.s > 0 ? 0 : Math.PI);
        _hv.set(Math.cos(ang) * 0.19, Math.sin(ang) * 0.19, 0).applyEuler(D.sw.rotation).add(D.sw.position);
        tx = _hv.x; ty = _hv.y; tz = _hv.z;
      }
      const dx = tx - a.g.position.x, dy = ty - a.g.position.y, dz = tz - a.g.position.z, len = Math.hypot(dx, dy, dz);
      a.g.rotation.y = Math.atan2(dx, dz);
      a.g.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
      a.up.scale.z = len; a.up.children[0] && a.up.children[0].scale.set(a.up.children[0].scale.x, a.up.children[0].scale.y, 1 + 0.05 / Math.max(0.1, len));
      a.hand.position.z = len;
    }
    if (fx && !this.ghost) this.effects(dt, s);
  }
  effects(dt, s) {
    const d2 = (s.x - camera.position.x) ** 2 + (s.z - camera.position.z) ** 2;
    if (d2 > 140 * 140) return;
    const K = this.K, av = Math.abs(s.v);
    this.root.updateMatrixWorld();
    this.emit += dt * 60 * PART_SCALE;
    if (this.emit < 1) return;
    const n = Math.floor(this.emit); this.emit -= n;
    const V = WORLD ? WORLD.V : VENUES.parque;
    for (let k = 0; k < n; k++) {
      if (s.drift && !s.air && Math.random() < 0.8) {
        const sx = pick([-1, 1]) * K.tw / 2;
        this.root.localToWorld(_v1.set(sx, 0.12, -K.wb / 2));
        const c = TIER_COL[s.tier || 0];
        SPARKS.spawn(_v1.x, _v1.y, _v1.z, rand(-2, 2) - s.drift * Math.cos(s.h) * 2, rand(1.5, 4), rand(-2, 2), rand(0.18, 0.4), (s.tier ? 0.16 : 0.1) * rand(0.7, 1.2), c, { grav: 10, drag: 3 });
        if (Math.random() < 0.35) SMOKE.spawn(_v1.x, _v1.y + 0.2, _v1.z, rand(-0.6, 0.6), rand(0.4, 1.2), rand(-0.6, 0.6), rand(0.6, 1.0), rand(0.35, 0.55), V.snowy ? '#ffffff' : '#e8ebf2', { drag: 2, grow: 2.2 });
      }
      if (s.off && !s.air && av > 6 && Math.random() < 0.45) {
        this.root.localToWorld(_v1.set(pick([-1, 1]) * K.tw / 2, 0.2, -K.wb / 2 - 0.2));
        SMOKE.spawn(_v1.x, _v1.y, _v1.z, rand(-1, 1), rand(0.6, 2), rand(-1, 1), rand(0.5, 0.9), rand(0.4, 0.7) * Math.min(1.4, av / 20), V.dust, { drag: 2.2, grow: 2 });
      }
      if ((s.nitro || s.boost) && Math.random() < 0.6) {
        this.root.localToWorld(_v1.set(rand(-0.3, 0.3), this.exhaust.y, this.exhaust.z - 0.5));
        SPARKS.spawn(_v1.x, _v1.y, _v1.z, rand(-1, 1), rand(0, 1.5), rand(-1, 1), rand(0.15, 0.3), rand(0.08, 0.15), this.look.trail === 'rainbow' ? '#' + this.flameMat.color.getHexString() : this.look.trail, { drag: 4 });
      }
    }
  }
}

// =========================================================
//  SIMULACIÓN DE LA CARRERA
// =========================================================
const R = {
  on: false, mode: 'menu', net: 'off', cars: [], me: -1, time: 0, goAt: 0, laps: 3, diff: 1, phase: 'off', order: [],
  events: [], ended: false, endAt: 0, results: null, cup: null, demo: false, firstFin: 0, lastCount: 99,
  ghost: null, ghostView: null, recT: 0, trackId: 'parque',
};
// controles del jugador local (los llena la parte de controles cada cuadro)
const LOCAL = { steer: 0, gas: 0, brake: 0, drift: false, nitro: false, horn: false, reset: false, trick: false };
const raceT = () => R.time - R.goAt;

function makeCar(id, o) {
  const look = sanitizeLook(o.look);
  return {
    id, key: o.key ?? 'c' + id, name: String(o.name || 'Piloto').slice(0, 12), look, P: modelPhys(look.model), human: !!o.human, local: !!o.local, remote: !!o.remote, cpu: !o.human, pid: o.pid || null, cid: o.cid || '',
    x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, vy: 0, vF: 0, steer: 0, air: false, airT: 0, hop: false, gy: 0, si: 0, st: 0, d: 0, along: 0,
    lap: 0, maxLap: 0, half: true, prog: 0, finished: false, finT: 0, lapT0: 0, lapTimes: [], best: 0, place: id + 1,
    drift: 0, dCharge: 0, tier: 0, driftLock: false, boostT: 0, nitro: NITRO_COST, nitroT: 0, off: false, draft: 0, ghostT: 0, stuckT: 0, wrongT: 0,
    stallT: 0, trick: false, trickDone: false, padCD: 0, gasT0: -1, started: false, cel: false, dnf: false, est: false, prevDrift: false, prevNitro: false, rec: [],
    inp: { steer: 0, gas: 0, brake: 0, drift: false, nitro: false, horn: false, reset: false, trick: false },
    ai: { lane: 0, laneGoal: 0, laneT: 0, vk: 1, skill: 1, nitroCD: rand(2, 6), driftCD: 0, wantDrift: false, startQ: 0, trickT: 0 },
    view: null, buf: [], rx: null,
  };
}
// o: { mode, track, laps, diff, grid:[{name, look, human, local, remote, pid, cid}], net, demo, goIn }
function newRace(o) {
  for (const c of R.cars) if (c.view) c.view.dispose();
  if (R.ghostView) { R.ghostView.dispose(); R.ghostView = null; }
  buildWorld(o.track);
  Object.assign(R, {
    on: true, mode: o.mode, net: o.net || 'off', laps: o.laps, diff: o.diff ?? 1, demo: !!o.demo, trackId: TR.def.id, events: [], ended: false, endAt: 0,
    results: null, firstFin: 0, lastCount: 99, time: 0, goAt: o.demo ? -1 : (o.goIn ?? INTRO_T + COUNT_T), ghost: null, recT: 0, order: [],
  });
  R.cars = o.grid.map((g, i) => makeCar(i, g));
  R.me = R.cars.findIndex((c) => c.local);
  const night = !!WORLD.V.night, D = DIFF[R.diff];
  for (const c of R.cars) {
    const p = gridPos(c.id);
    Object.assign(c, { x: p.x, y: p.y, z: p.z, h: p.h, si: p.i, gy: p.y });
    c.along = locate(c, true);
    c.prog = c.lap * TR.L + c.along;
    c.view = new CarView(c.look, { night });
    c.ai.skill = c.human ? 1 : rand(0.92, 1.03);
    c.ai.vk = D.v * c.ai.skill;
    c.ai.lane = c.ai.laneGoal = c.d;
    c.ai.startQ = Math.random() < D.start ? 1 : Math.random() < 0.4 ? -1 : 0;
  }
  if (R.mode === 'trial') {
    R.ghost = loadGhost(TR.def.id);
    if (R.ghost) R.ghostView = new CarView(R.ghost.look, { ghost: true });
  }
  rankCars();
}
function phaseOf() {
  if (R.demo) return 'race';
  if (R.ended) return 'done';
  const t = raceT();
  return t < -COUNT_T ? 'intro' : t < 0 ? 'count' : 'race';
}
function simStep(dt) {
  R.time += dt;
  const ph = phaseOf();
  R.phase = ph;
  if (!R.demo && (ph === 'count' || ph === 'race') && R.lastCount > 0) {
    const n = Math.max(0, Math.ceil(R.goAt - R.time));
    if (n !== R.lastCount && n <= 3) { R.lastCount = n; R.events.push({ t: 'count', n }); }
  }
  for (const c of R.cars) {
    if (c.remote) continue;
    if (c.local && !c.finished && R.phase !== 'done' && !R.autopilot) Object.assign(c.inp, LOCAL);
    else aiThink(c, dt);
    if (ph === 'intro' || ph === 'count') {
      if (c.local) { if (c.inp.gas > 0) { if (c.gasT0 < 0) c.gasT0 = R.time; } else c.gasT0 = -1; }
      c.vx = c.vz = c.vF = 0;
      continue;
    }
    stepCar(c, dt);
  }
  if (ph === 'race' || ph === 'done') { collide(); drafting(dt); }
  rankCars();
  endCheck();
  // contrarreloj: graba la vuelta actual para el fantasma
  const me = R.cars[R.me];
  if (R.mode === 'trial' && me && me.lap >= 1 && !me.finished) {
    R.recT += dt;
    if (R.recT >= 0.05) { R.recT -= 0.05; me.rec.push([Math.round(me.x * 100) / 100, Math.round(me.y * 100) / 100, Math.round(me.z * 100) / 100, Math.round(me.h * 1000) / 1000]); }
  }
}
function startResult(c) {
  if (c.remote || R.demo) return;
  if (c.local) {
    if (c.gasT0 >= 0) {
      const held = R.goAt - c.gasT0;
      if (held <= 0.55) { c.boostT = 1.2; R.events.push({ t: 'start', id: c.id, good: true }); }
      else if (held > 1.7) { c.stallT = 0.9; R.events.push({ t: 'start', id: c.id, good: false }); }
    }
  } else if (c.ai.startQ > 0) c.boostT = 0.9;
  else if (c.ai.startQ < 0) c.stallT = 0.45;
}
function endDrift(c, give) {
  const tier = c.tier;
  c.drift = 0; c.dCharge = 0; c.tier = 0;
  if (give && tier > 0) { c.boostT = Math.max(c.boostT, [0, 0.55, 0.95, 1.45][tier]); R.events.push({ t: 'boost', id: c.id, n: tier }); }
}
function respawn(c) {
  const T = TR, back = c.along > 8 ? 5 : 0;
  const p = trackPoint(c.along - back, clamp(c.d, -T.half + 2, T.half - 2) * 0.3);
  Object.assign(c, { x: p.x, z: p.z, y: p.y, h: p.h, vx: 0, vz: 0, vy: 0, vF: 0, air: false, hop: false, drift: 0, dCharge: 0, tier: 0, ghostT: 1.8, stuckT: 0, wrongT: 0, si: p.i, boostT: 0, nitroT: 0 });
  c.along = locate(c);
  c.prog = c.lap * T.L + c.along;
  R.events.push({ t: 'respawn', id: c.id });
}
function stepCar(c, dt) {
  const P = c.P, inp = c.inp, T = TR;
  if (!c.started) { c.started = true; startResult(c); }
  if (inp.reset && c.ghostT <= 0.3) { respawn(c); inp.reset = false; return; }
  c.ghostT = Math.max(0, c.ghostT - dt);
  c.stallT = Math.max(0, c.stallT - dt);
  c.padCD -= dt;
  const driftEdge = inp.drift && !c.prevDrift; c.prevDrift = inp.drift;
  const nitroEdge = inp.nitro && !c.prevNitro; c.prevNitro = inp.nitro;
  // nitro
  if (nitroEdge && c.nitro >= NITRO_COST && c.nitroT <= 0) { c.nitro -= NITRO_COST; c.nitroT = 1.5; R.events.push({ t: 'nitro', id: c.id }); }
  c.nitro = Math.min(100, c.nitro + 0.9 * dt);
  let vmax = P.vmax * (c.cpu || c.finished ? c.ai.vk : 1), acc = P.acc;
  if (c.off) vmax *= P.off;
  if (c.draft > 0.4) vmax *= 1.06;
  let mult = 1;
  if (c.boostT > 0) { c.boostT -= dt; mult += 0.22; acc += 26; }
  if (c.nitroT > 0) { c.nitroT -= dt; mult += 0.3; acc += 30; }
  vmax *= Math.min(mult, 1.42);
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  let vF = c.vx * fx + c.vz * fz, vL = -c.vx * fz + c.vz * fx;
  const gas = c.stallT > 0 ? 0 : inp.gas, brake = inp.brake;
  if (!c.air || c.hop) {
    if (gas > 0 && vF < vmax) vF += acc * gas * dt * (vF < 0 ? 2.2 : 1 - 0.55 * (vF / vmax) ** 2);
    if (brake > 0) { if (vF > 0.5) vF -= 30 * brake * dt; else if (gas <= 0) vF = Math.max(-9, vF - 14 * brake * dt); }
    if (gas <= 0 && brake <= 0) vF -= Math.sign(vF) * Math.min(Math.abs(vF), (2.5 + Math.abs(vF) * 0.04) * dt);
    if (vF > vmax) vF = damp(vF, vmax, c.off ? 2.4 : 0.9, dt);
    if (c.drift) vF -= 1.4 * dt;
  }
  c.steer = damp(c.steer, inp.steer, 10, dt);
  // derrape: salto pequeño y luego desliza
  if (!c.drift && inp.drift && (!c.air || c.hop) && vF > 11 && Math.abs(c.steer) > 0.3 && !c.driftLock && !c.hop) {
    c.drift = Math.sign(c.steer); c.dCharge = 0; c.tier = 0;
    c.vy = 3.4; c.air = true; c.hop = true; c.airT = 0;
    R.events.push({ t: 'hop', id: c.id });
  }
  if (!inp.drift) c.driftLock = false;
  if (c.drift && (!inp.drift || vF < 8)) endDrift(c, !inp.drift && vF >= 8);
  const av = Math.abs(vF);
  const sp = clamp(av / 7, 0, 1) * (1 - (c.drift ? 0.15 : TURN_FALL) * clamp(av / P.vmax, 0, 1.2));
  let st = c.steer;
  if (c.drift) st = c.drift * (0.6 + 0.5 * clamp(st * c.drift, -1, 1));
  const rate = P.turn * (c.drift ? 1.25 : 1) * (c.air && !c.hop ? 0.3 : 1);
  c.h = wrapA(c.h - st * rate * sp * (vF < -0.5 ? -1 : 1) * dt);
  if (c.drift && !(c.air && !c.hop)) {
    c.dCharge += dt * (0.55 + 0.55 * Math.abs(c.steer));
    const tier = c.dCharge > 2.7 ? 3 : c.dCharge > 1.7 ? 2 : c.dCharge > 0.85 ? 1 : 0;
    if (tier !== c.tier) { c.tier = tier; R.events.push({ t: 'tier', id: c.id, n: tier }); }
    c.nitro = Math.min(100, c.nitro + 6 * dt);
  }
  // agarre lateral medido en el rumbo nuevo: así el carro desliza
  const wx = fx * vF - fz * vL, wz = fz * vF + fx * vL;
  const fx2 = Math.sin(c.h), fz2 = Math.cos(c.h);
  const vF2 = wx * fx2 + wz * fz2;
  let vL2 = -wx * fz2 + wz * fx2;
  const grip = c.air && !c.hop ? 0.5 : c.drift ? P.dgrip : P.grip * T.grip * (c.off ? 0.75 : 1);
  vL2 *= Math.exp(-grip * dt);
  c.vx = fx2 * vF2 - fz2 * vL2; c.vz = fz2 * vF2 + fx2 * vL2;
  c.vF = vF2;
  c.x += c.vx * dt; c.z += c.vz * dt;
  const prev = c.along;
  c.along = locate(c);
  // paredes
  const lim = T.wall - 1.0;
  if (Math.abs(c.d) > lim) {
    const s = Math.sign(c.d), over = Math.abs(c.d) - lim, i = c.si;
    const nx = T.rx[i] * s, nz = T.rz[i] * s;
    c.x -= nx * over; c.z -= nz * over;
    const vn = c.vx * nx + c.vz * nz;
    if (vn > 0) {
      c.vx -= 1.3 * vn * nx; c.vz -= 1.3 * vn * nz;
      const k = clamp(1 - vn * 0.02, 0.75, 0.97); c.vx *= k; c.vz *= k;
      if (vn > 3) R.events.push({ t: 'wall', id: c.id, v: vn, x: c.x + nx, y: c.y + 0.5, z: c.z + nz });
      if (vn > 9 && c.drift) { c.drift = 0; c.dCharge = 0; c.tier = 0; c.driftLock = true; }
    }
    const th = T.head[i], fwd = Math.cos(c.h - th) > 0;
    c.h = angDamp(c.h, fwd ? th : th + Math.PI, 2.2, dt);
    c.d = s * lim;
  }
  c.off = Math.abs(c.d) > T.half + 0.9;
  // flechas de turbo
  for (const p of T.pads) {
    let da = c.along - p.along;
    if (da > T.L / 2) da -= T.L; else if (da < -T.L / 2) da += T.L;
    if (Math.abs(da) < 3.2 && Math.abs(c.d - p.lat) < 2.1 && c.padCD <= 0 && !c.air) { c.boostT = Math.max(c.boostT, 1.0); c.padCD = 0.7; R.events.push({ t: 'pad', id: c.id }); }
  }
  // altura: el carro sigue el piso; si el piso cae más rápido que la gravedad, sale volando
  const gy = c.gy;
  const trickIn = inp.trick || driftEdge;
  if (!c.air) {
    const pred = c.y + c.vy * dt - 0.5 * G * dt * dt;
    if (gy < pred - 0.05) { c.air = true; c.hop = false; c.airT = 0; c.trickDone = false; c.y = pred; c.vy -= G * dt; }
    else { c.vy = clamp((gy - c.y) / dt, -25, 25); c.y = gy; }
  } else {
    c.vy -= G * dt; c.y += c.vy * dt; c.airT += dt;
    if (!c.hop && trickIn && !c.trickDone && c.airT > 0.08) { c.trickDone = true; c.trick = true; R.events.push({ t: 'trickStart', id: c.id }); }
    if (c.y <= gy) {
      const fall = -c.vy;
      c.y = gy; c.air = false;
      if (!c.hop && c.airT > 0.35) {
        R.events.push({ t: 'land', id: c.id, v: fall });
        c.nitro = Math.min(100, c.nitro + 6);
        if (c.trick) { c.boostT = Math.max(c.boostT, 0.9); c.nitro = Math.min(100, c.nitro + 10); R.events.push({ t: 'trick', id: c.id }); }
      }
      c.trick = false; c.hop = false; c.vy = 0;
    }
  }
  // sentido contrario y atascos
  const dot = Math.cos(c.h - T.head[c.si]);
  if (dot < -0.3 && c.vF > 3) c.wrongT += dt; else c.wrongT = Math.max(0, c.wrongT - dt * 2);
  if (!c.local && !c.remote) {
    if (Math.abs(c.vF) < 1.5 && raceT() > 2) c.stuckT += dt; else c.stuckT = 0;
    if (c.stuckT > 2.5 || c.wrongT > 2) respawn(c);
  }
  lapCheck(c, prev);
  c.brakeL = brake > 0 && c.vF > 1;
  c.horn = !!inp.horn;
}
function lapCheck(c, prev) {
  const L = TR.L, a = c.along;
  if (prev > L * 0.7 && a < L * 0.3) { if (c.half) { c.lap++; c.half = false; onLap(c); } }
  else if (prev < L * 0.3 && a > L * 0.7) { c.lap--; c.half = true; }
  if (a > L * 0.42 && a < L * 0.58) c.half = true;
  c.prog = c.lap * L + a;
}
function onLap(c) {
  if (c.lap <= c.maxLap) return;
  c.maxLap = c.lap;
  const t = raceT();
  if (c.lap >= 2) {
    const lt = t - c.lapT0;
    c.lapTimes.push(lt);
    const rec = !c.best || lt < c.best;
    if (rec) c.best = lt;
    R.events.push({ t: 'lap', id: c.id, lap: c.lap, time: lt, best: rec });
    if (c.local && R.mode === 'trial' && (!R.ghost || lt < R.ghost.time) && c.rec.length > 20) {
      R.ghost = { time: lt, look: c.look, f: c.rec.slice() };
      storeGhost(TR.def.id, R.ghost);
      if (R.ghostView) R.ghostView.dispose();
      R.ghostView = new CarView(c.look, { ghost: true });
    }
  }
  c.rec = [];
  c.lapT0 = t;
  if (R.demo) return;
  if (c.lap > R.laps && !c.finished) { c.finished = true; c.finT = t; c.cel = true; R.events.push({ t: 'finish', id: c.id }); }
  else if (c.lap === R.laps && R.laps > 1) R.events.push({ t: 'final', id: c.id });
}

// ---------- IA de la PC ----------
function humanProg() {
  let best = null;
  for (const c of R.cars) if (c.human && !c.finished && (best === null || c.prog > best)) best = c.prog;
  return best;
}
function aiThink(c, dt) {
  const T = TR, ai = c.ai, P = c.P, N = T.N, inp = c.inp, D = DIFF[R.diff];
  const v = Math.max(0, c.vF);
  ai.laneT -= dt;
  if (ai.laneT <= 0) { ai.laneT = rand(1.5, 4); ai.laneGoal = rand(-0.45, 0.45) * T.half; }
  // curva que viene: por dentro
  let ks = 0;
  for (let k = 4; k < 22; k += 2) ks += T.kap[(c.si + k) % N];
  let goal = ai.laneGoal * 0.6 - clamp(ks * 5, -1, 1) * (T.half - 2.4) * 0.5;
  // esquivar al de adelante
  for (const o of R.cars) {
    if (o === c) continue;
    const da = o.prog - c.prog, dd = o.d - c.d;
    if (Math.abs(dd) >= 2.6 || da <= -4 || da >= 14) continue;
    goal = da < 4 ? c.d - Math.sign(dd || 1) * 2.5 : o.d > 0 ? o.d - 3.3 : o.d + 3.3;
    break;
  }
  goal = clamp(goal, -T.half + 1.6, T.half - 1.6);
  ai.lane = damp(ai.lane, goal, 1.6, dt);
  const ti = (c.si + Math.round((5 + v * 0.32) / 2)) % N;
  const tx = T.px[ti] + T.rx[ti] * ai.lane, tz = T.pz[ti] + T.rz[ti] * ai.lane;
  const err = wrapA(Math.atan2(tx - c.x, tz - c.z) - c.h);
  inp.steer = clamp(-err * 2.4, -1, 1);
  // velocidad: la que permite tomar las curvas que vienen
  if (c.human && c.finished) ai.vk = 0.8;
  else {
    const hp = humanProg();
    ai.vk = D.v * ai.skill * (hp === null ? 1 : clamp(1 - (c.prog - hp) * 0.0006, 0.92, 1.07));
  }
  const tc = P.turn * D.corner;
  let vdes = 99;
  for (let k = 2; k < 64; k += 2) {
    const kap = Math.abs(T.kap[(c.si + k) % N]) + 1e-4;
    const vc = ((tc * T.grip) / (kap + (tc * T.grip * TURN_FALL) / P.vmax)) * 0.9;
    const va = Math.sqrt(vc * vc + 2 * 24 * k * 2);
    if (va < vdes) vdes = va;
  }
  inp.gas = c.vF < vdes - 0.5 ? 1 : 0;
  inp.brake = c.vF > vdes + 2.5 ? 1 : 0;
  // derrape en curvas largas
  ai.driftCD -= dt;
  if (!c.drift && Math.abs(ks) > 0.12 && v > 18 && ai.driftCD <= 0 && Math.sign(inp.steer) === -Math.sign(ks) && Math.abs(inp.steer) > 0.35 && Math.random() < D.drift * dt * 4) ai.wantDrift = true;
  if (c.drift && (Math.abs(ks) < 0.05 || (c.tier >= (R.diff > 1 ? 2 : 1) && Math.abs(ks) < 0.1))) { ai.wantDrift = false; ai.driftCD = rand(1.5, 3); }
  if (!c.drift && ai.wantDrift && Math.abs(ks) < 0.06) ai.wantDrift = false;
  inp.drift = ai.wantDrift;
  // nitro en las rectas
  ai.nitroCD -= dt;
  inp.nitro = false;
  if (c.nitro >= NITRO_COST && ai.nitroCD <= 0 && Math.abs(ks) < 0.04 && v > 15 && raceT() > 1) { if (Math.random() < D.nitro) inp.nitro = true; ai.nitroCD = rand(3, 8); }
  // trucos en los saltos
  inp.trick = c.air && !c.hop && c.airT > 0.12 && !c.trickDone && Math.random() < D.drift * 0.6;
  inp.reset = false;
}

// ---------- choques entre carros ----------
function collide() {
  const cs = R.cars, n = cs.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = cs[i], b = cs[j];
    if ((a.remote && b.remote) || a.ghostT > 0 || b.ghostT > 0 || Math.abs(a.y - b.y) > 1.6) continue;
    const dx0 = b.x - a.x, dz0 = b.z - a.z;
    if (dx0 * dx0 + dz0 * dz0 > 36) continue;
    let bd = 99, nx = 0, nz = 0;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const ax = a.x + Math.sin(a.h) * CAR_OFF * sa, az = a.z + Math.cos(a.h) * CAR_OFF * sa;
      const bx = b.x + Math.sin(b.h) * CAR_OFF * sb, bz = b.z + Math.cos(b.h) * CAR_OFF * sb;
      const d = Math.hypot(bx - ax, bz - az);
      if (d < bd) { bd = d; nx = (bx - ax) / (d || 1); nz = (bz - az) / (d || 1); }
    }
    if (bd >= 2 * CAR_R) continue;
    if (bd < 1e-3) { nx = Math.sin(a.h + 1.57); nz = Math.cos(a.h + 1.57); }
    const over = 2 * CAR_R - bd;
    const ma = a.remote ? 1e6 : a.P.mass, mb = b.remote ? 1e6 : b.P.mass;
    const wa = mb / (ma + mb), wb = ma / (ma + mb);
    a.x -= nx * over * wa; a.z -= nz * over * wa;
    b.x += nx * over * wb; b.z += nz * over * wb;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const J = (-(1 + 0.35) * rv) / (1 / ma + 1 / mb);
      a.vx -= (J / ma) * nx; a.vz -= (J / ma) * nz;
      b.vx += (J / mb) * nx; b.vz += (J / mb) * nz;
      if (-rv > 3) R.events.push({ t: 'bump', a: a.id, b: b.id, v: -rv, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.6, z: (a.z + b.z) / 2 });
    }
  }
}
// rebufo: pegado detrás de otro carro vas más rápido y cargas nitro
function drafting(dt) {
  for (const c of R.cars) {
    if (c.remote) continue;
    let dr = false;
    if (c.vF > 18) for (const o of R.cars) { if (o === c) continue; const da = o.prog - c.prog; if (da > 3 && da < 20 && Math.abs(o.d - c.d) < 2.2) { dr = true; break; } }
    c.draft = dr ? Math.min(1, c.draft + dt * 1.5) : Math.max(0, c.draft - dt * 3);
    if (c.draft > 0.4) c.nitro = Math.min(100, c.nitro + 5 * dt);
  }
}
function rankCars() {
  const arr = R.cars.slice().sort((a, b) => (a.finished && b.finished ? a.finT - b.finT : a.finished ? -1 : b.finished ? 1 : b.prog - a.prog));
  arr.forEach((c, i) => { c.place = i + 1; });
  R.order = arr;
}
function endCheck() {
  if (R.demo || R.ended || R.net === 'client' || R.phase !== 'race') return;
  const humans = R.cars.filter((c) => c.human);
  if (R.mode === 'online') {
    if (!R.firstFin && humans.some((c) => c.finished)) R.firstFin = R.time;
    if (!R.endAt && humans.length && humans.every((c) => c.finished)) R.endAt = R.time + 2.5;
    if (!R.endAt && R.firstFin && R.time > R.firstFin + 35) R.endAt = R.time;
  } else {
    const me = R.cars[R.me];
    if (me && me.finished && !R.endAt) R.endAt = R.time + (R.mode === 'trial' ? 2 : 3.2);
  }
  if (R.endAt && R.time >= R.endAt) finishRace();
}
function finishRace() {
  R.ended = true; R.phase = 'done';
  const t = raceT();
  for (const c of R.cars) if (!c.finished) {
    const left = Math.max(0, (R.laps + 1) * TR.L - c.prog);
    c.finT = t + left / (c.P.vmax * 0.82);
    if (c.human && R.mode === 'online') c.dnf = true; else c.est = true;
  }
  const arr = R.cars.slice().sort((a, b) => (a.dnf !== b.dnf ? (a.dnf ? 1 : -1) : a.dnf ? b.prog - a.prog : a.finT - b.finT));
  R.results = arr.map((c, i) => ({ id: c.id, name: c.name, look: c.look, human: c.human, time: c.finT, best: c.best, est: c.est, dnf: c.dnf, place: i + 1 }));
  R.events.push({ t: 'end' });
}

// =========================================================
//  JUEGO: controles, cámara, HUD y pantallas
// =========================================================
const GAME = { mode: 'menu', screen: 'scrMenu', paused: false };

// ---------- controles ----------
const KEYS = {};
const INPUT = { joyX: 0, tl: false, tr: false, tGas: false, tBrake: false, tDrift: false, tNitro: false, nitroQ: false, resetQ: false, back: false, gpPrev: [] };
const racing = () => R.on && GAME.mode !== 'menu' && !GAME.paused && GAME.screen !== 'scrEnd';
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
  if (KEYS[k]) return;
  KEYS[k] = true;
  SFX.resume();
  if (k === 'Escape' || k === 'KeyP') togglePause();
  else if (k === 'KeyF') toggleFullscreen();
  else if (k === 'KeyM') toggleMute();
  else if (k === 'KeyC' && racing()) cycleCam();
  else if (k === 'KeyR' && racing()) INPUT.resetQ = true;
  else if ((k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyN') && racing()) INPUT.nitroQ = true;
});
addEventListener('keyup', (e) => { KEYS[e.code] = false; });
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; });
function readInput() {
  const k = KEYS;
  let steer = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  let gas = k.KeyW || k.ArrowUp ? 1 : 0, brake = k.KeyS || k.ArrowDown ? 1 : 0;
  let drift = !!k.Space, nitro = !!(k.ShiftLeft || k.ShiftRight || k.KeyN), horn = !!k.KeyH, back = !!k.KeyQ;
  if (IS_TOUCH) {
    steer += SAVE.steerMode === 'btn' ? (INPUT.tr ? 1 : 0) - (INPUT.tl ? 1 : 0) : INPUT.joyX;
    if (SAVE.autoGas) { if (!INPUT.tBrake) gas = 1; } else if (INPUT.tGas) gas = 1;
    if (INPUT.tBrake) brake = 1;
    drift = drift || INPUT.tDrift; nitro = nitro || INPUT.tNitro;
  }
  // mando
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of gps) if (g && g.connected) { gp = g; break; }
  if (gp) {
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), bv = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.14) steer += (ax - Math.sign(ax) * 0.14) / 0.86;
    if (b(14)) steer -= 1; if (b(15)) steer += 1;
    gas = Math.max(gas, bv(7), b(12) ? 1 : 0); brake = Math.max(brake, bv(6), b(13) ? 1 : 0);
    drift = drift || b(0) || b(5) || b(4); nitro = nitro || b(2) || b(1); back = back || b(10) || b(11);
    const edge = (i) => b(i) && !INPUT.gpPrev[i];
    if (edge(3) && racing()) cycleCam();
    if (edge(9)) togglePause();
    if (edge(8) && racing()) INPUT.resetQ = true;
    INPUT.gpPrev = gp.buttons.map((x) => x.pressed);
    if (gp.axes.some((a) => Math.abs(a) > 0.3) || gp.buttons.some((x) => x.pressed)) SFX.resume();
  }
  LOCAL.steer = clamp(steer, -1, 1); LOCAL.gas = clamp(gas, 0, 1); LOCAL.brake = clamp(brake, 0, 1);
  LOCAL.drift = drift; LOCAL.nitro = nitro || INPUT.nitroQ; LOCAL.horn = horn;
  LOCAL.reset = INPUT.resetQ; LOCAL.trick = false;
  INPUT.nitroQ = false; INPUT.resetQ = false; INPUT.back = back;
}
// táctil: joystick o botones ◀ ▶, más acelerar / freno / derrape / nitro
(() => {
  const zone = $('#joyZone'), joy = $('#joy'), knob = $('#joyKnob');
  let id = null, cx = 0;
  const RJ = 55;
  zone.addEventListener('pointerdown', (e) => {
    id = e.pointerId; zone.setPointerCapture(id);
    const r = zone.getBoundingClientRect();
    cx = e.clientX;
    joy.style.left = e.clientX - r.left - 65 + 'px'; joy.style.top = e.clientY - r.top - 65 + 'px'; joy.style.bottom = 'auto';
    SFX.resume();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dx = clamp(e.clientX - cx, -RJ, RJ);
    knob.style.transform = `translate(${dx}px,0)`;
    const v = dx / RJ;
    INPUT.joyX = Math.sign(v) * Math.min(1, Math.abs(v) * 1.15);
  });
  const end = (e) => { if (e.pointerId !== id) return; id = null; INPUT.joyX = 0; knob.style.transform = ''; };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  const hold = (sel, key, onDown) => {
    const el = $(sel);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('down'); INPUT[key] = true; SFX.resume(); if (onDown) onDown(); });
    const up = () => { el.classList.remove('down'); INPUT[key] = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  };
  hold('#tbLeft', 'tl'); hold('#tbRight', 'tr');
  hold('#tbGas', 'tGas'); hold('#tbBrake', 'tBrake'); hold('#tbDrift', 'tDrift');
  hold('#tbNitro', 'tNitro', () => { INPUT.nitroQ = true; });
})();
function applyTouchPrefs() {
  document.body.classList.toggle('autogas', !!SAVE.autoGas);
  document.body.classList.toggle('btnsteer', SAVE.steerMode === 'btn');
}
function buzz(p) { if (IS_TOUCH && SAVE.vib !== false && navigator.vibrate && !(navigator.userActivation && !navigator.userActivation.hasBeenActive)) try { navigator.vibrate(p); } catch (e) { /* sin vibración */ } }

// ---------- cámara ----------
const CAM_MODES = [{ n: 'Normal', d: 7.4, h: 2.9, la: 1.3 }, { n: 'Lejos', d: 10.8, h: 4.3, la: 1.6 }, { n: 'Cerca', d: 4.8, h: 1.95, la: 1.15 }];
const CAM = { pos: new THREE.Vector3(0, 30, 40), look: new THREE.Vector3(), yaw: 0, mode: clamp(SAVE.cam | 0, 0, 2), shake: 0, kick: 0, fov: 62, shot: 0, shotT: 0, target: 0 };
function cycleCam() {
  CAM.mode = (CAM.mode + 1) % CAM_MODES.length;
  SAVE.cam = CAM.mode; storeSave(); syncPauseBtns();
  toast('🎥 Cámara: ' + CAM_MODES[CAM.mode].n, 1200);
}
const _look = new THREE.Vector3(), _want = new THREE.Vector3();
function camSnapBehind(c) {
  const m = CAM_MODES[CAM.mode];
  CAM.yaw = c.h;
  CAM.pos.set(c.x - Math.sin(c.h) * m.d, c.y + m.h, c.z - Math.cos(c.h) * m.d);
}
function updateCamera(dt) {
  if (!R.on || !R.cars.length) return;
  const me = R.cars[R.me];
  let fovT = 62;
  if (R.demo || !me) {
    // menú: cámara de televisión que cambia de carro cada pocos segundos
    CAM.shotT -= dt;
    if (CAM.shotT <= 0 || !R.cars[CAM.target]) {
      CAM.shotT = rand(6, 9); CAM.shot = (CAM.shot + 1) % 4;
      CAM.target = R.order.length ? R.order[randi(0, Math.min(3, R.order.length - 1))].id : 0;
      const c = R.cars[CAM.target];
      CAM.snap = true; CAM.yaw = c ? c.h : 0;
    }
    const c = R.cars[CAM.target];
    const off = [0.7, -2.5, Math.PI, 1.9][CAM.shot], dist = [9, 8, 10, 13][CAM.shot], hh = [3.2, 2.4, 3.6, 7][CAM.shot];
    CAM.yaw = angDamp(CAM.yaw, c.h, 2.5, dt);
    const a = CAM.yaw + off;
    _want.set(c.x - Math.sin(a) * dist, c.y + hh, c.z - Math.cos(a) * dist);
    if (CAM.snap) { CAM.pos.copy(_want); CAM.snap = false; }
    CAM.pos.x = damp(CAM.pos.x, _want.x, 4, dt); CAM.pos.y = damp(CAM.pos.y, _want.y, 4, dt); CAM.pos.z = damp(CAM.pos.z, _want.z, 4, dt);
    _look.set(c.x + Math.sin(c.h) * 2, c.y + 1, c.z + Math.cos(c.h) * 2);
    CAM.look.lerp(_look, 1 - Math.exp(-8 * dt));
  } else {
    const c = me, m = CAM_MODES[CAM.mode];
    const ph = R.phase;
    if (ph === 'intro') {
      const k = SM(clamp((raceT() + INTRO_T + COUNT_T) / INTRO_T, 0, 1));
      const a = c.h + Math.PI * 1.15 * (1 - k), dist = lerp(9, m.d, k), hh = lerp(3.2, m.h, k);
      CAM.pos.set(c.x - Math.sin(a) * dist, c.y + hh, c.z - Math.cos(a) * dist);
      CAM.yaw = c.h;
      CAM.look.set(c.x, c.y + lerp(1, m.la, k), c.z);
    } else if (c.finished || R.ended) {
      CAM.yaw += dt * 0.35;
      const a = CAM.yaw;
      _want.set(c.x - Math.sin(a) * 8.5, c.y + 3, c.z - Math.cos(a) * 8.5);
      CAM.pos.lerp(_want, 1 - Math.exp(-3 * dt));
      _look.set(c.x, c.y + 1, c.z);
      CAM.look.lerp(_look, 1 - Math.exp(-8 * dt));
    } else {
      const slip = c.view ? c.view.slip * 0.55 : 0;
      CAM.yaw = angDamp(CAM.yaw, c.h + slip, c.air && !c.hop ? 2 : 5.5, dt);
      const yaw = CAM.yaw + (INPUT.back ? Math.PI : 0);
      const dist = m.d + clamp(c.vF / 40, 0, 1) * 0.8 + (c.nitroT > 0 || c.boostT > 0 ? 0.6 : 0);
      _want.set(c.x - Math.sin(yaw) * dist, c.y + m.h, c.z - Math.cos(yaw) * dist);
      if (INPUT.back !== CAM.wasBack) { CAM.pos.copy(_want); CAM.wasBack = INPUT.back; }
      CAM.pos.x = damp(CAM.pos.x, _want.x, 14, dt); CAM.pos.z = damp(CAM.pos.z, _want.z, 14, dt);
      CAM.pos.y = damp(CAM.pos.y, _want.y, c.air ? 5 : 9, dt);
      _look.set(c.x + Math.sin(yaw) * 3, c.y + m.la, c.z + Math.cos(yaw) * 3);
      CAM.look.lerp(_look, 1 - Math.exp(-16 * dt));
      fovT = 60 + clamp(c.vF / 40, 0, 1) * 8 + (c.nitroT > 0 ? 10 : c.boostT > 0 ? 7 : 0);
    }
  }
  CAM.fov = damp(CAM.fov, fovT, 4, dt);
  if (Math.abs(camera.fov - CAM.fov) > 0.05) { camera.fov = CAM.fov; camera.updateProjectionMatrix(); }
  CAM.shake = Math.max(0, CAM.shake - dt * 2.5);
  const sh = CAM.shake * CAM.shake * 0.5;
  camera.position.set(CAM.pos.x + rand(-sh, sh), CAM.pos.y + rand(-sh, sh), CAM.pos.z + rand(-sh, sh));
  camera.lookAt(CAM.look);
  sky.position.copy(camera.position); STARS.position.copy(camera.position);
  // la luz del sol (y su sombra) sigue a la cámara
  sun.target.position.set(CAM.look.x, CAM.look.y, CAM.look.z);
  sun.position.copy(sun.target.position).add(SUN_OFF);
}

// ---------- HUD ----------
const HUD = { pos: 0, boardT: 0, tagEls: new Map(), lapKey: '', hintT: 0, ctrlT: 0 };
const MINI = { key: '', sc: 1, ox: 0, oy: 0 };
function drawMini() {
  const cv = $('#mini'), g = cv.getContext('2d'), W = cv.width, H = cv.height, T = TR;
  if (MINI.key !== T.def.id) {
    const span = Math.max(T.maxX - T.minX, T.maxZ - T.minZ) || 1;
    MINI.sc = (W - 46) / span; MINI.ox = W / 2 - T.cx * MINI.sc; MINI.oy = H / 2 - T.cz * MINI.sc; MINI.key = T.def.id;
  }
  const X = (x) => MINI.ox + x * MINI.sc, Y = (z) => MINI.oy + z * MINI.sc;
  g.clearRect(0, 0, W, H);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= T.N; i += 3) { const j = i % T.N; if (i === 0) g.moveTo(X(T.px[j]), Y(T.pz[j])); else g.lineTo(X(T.px[j]), Y(T.pz[j])); }
  g.closePath();
  g.lineWidth = 20; g.strokeStyle = 'rgba(29,35,64,.8)'; g.stroke();
  g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.stroke();
  const s = trackPoint(0, 0);
  g.lineWidth = 6; g.strokeStyle = '#1d2340';
  g.beginPath(); g.moveTo(X(s.x + s.rx * 9), Y(s.z + s.rz * 9)); g.lineTo(X(s.x - s.rx * 9), Y(s.z - s.rz * 9)); g.stroke();
  const me = R.cars[R.me];
  for (const c of R.cars) {
    if (c === me) continue;
    g.beginPath(); g.arc(X(c.x), Y(c.z), c.human ? 9 : 7, 0, Math.PI * 2);
    g.fillStyle = c.look.paint; g.fill(); g.lineWidth = 3; g.strokeStyle = c.human ? '#ffc93a' : '#1d2340'; g.stroke();
  }
  if (R.ghostView && R.ghostView.root.visible) { const p = R.ghostView.root.position; g.beginPath(); g.arc(X(p.x), Y(p.z), 7, 0, Math.PI * 2); g.fillStyle = 'rgba(159,216,255,.8)'; g.fill(); }
  if (me) {
    g.save(); g.translate(X(me.x), Y(me.z)); g.rotate(-me.h + Math.PI);
    g.beginPath(); g.moveTo(0, 15); g.lineTo(11, -10); g.lineTo(0, -5); g.lineTo(-11, -10); g.closePath();
    g.fillStyle = me.look.paint; g.fill(); g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.stroke();
    g.restore();
  }
}
function updateHud(dt) {
  const me = R.cars[R.me];
  if (!me) return;
  const n = R.cars.length;
  if (me.place !== HUD.pos) {
    const el = $('#hPos');
    if (HUD.pos && R.phase === 'race' && me.place < HUD.pos) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    HUD.pos = me.place; el.textContent = me.place + 'º';
  }
  $('#hPosOf').textContent = R.mode === 'trial' ? '' : '/' + n;
  if (R.mode === 'trial') $('#hPos').textContent = '⏱️';
  const lapK = me.finished ? 'META' : `VUELTA ${clamp(me.lap, 1, R.laps)}/${R.laps}`;
  if (lapK !== HUD.lapKey) { HUD.lapKey = lapK; $('#hLap').textContent = lapK; $('#hLap').classList.toggle('final', !me.finished && me.lap === R.laps && R.laps > 1); }
  const t = me.finished ? me.finT : Math.max(0, raceT());
  $('#hTime').textContent = fmtTime(t);
  HUD.bestT = Math.max(0, (HUD.bestT || 0) - dt);
  const rec = recOf(R.trackId).lap;
  $('#hBest').textContent = (me.best ? 'Mejor vuelta ' + fmtTime(me.best) : 'Mejor vuelta —') + (R.mode === 'trial' && rec ? ' · Récord ' + fmtTime(rec) : '');
  $('#hBest').classList.toggle('flash', HUD.bestT > 0);
  $('#hSpd').textContent = Math.round(Math.abs(me.vF) * KMH);
  const bars = $$('#nitroBar i');
  for (let i = 0; i < 3; i++) { const f = clamp((me.nitro - i * NITRO_COST) / NITRO_COST, 0, 1); bars[i].style.setProperty('--f', Math.round(f * 100) + '%'); bars[i].classList.toggle('full', f >= 1); }
  $('#nitroBar').classList.toggle('go', me.nitroT > 0);
  $('#tbNitro').classList.toggle('ready', me.nitro >= NITRO_COST);
  $('#wrong').classList.toggle('on', me.wrongT > 1.2 && !me.finished);
  $('#speedFx').style.opacity = me.nitroT > 0 ? 0.7 : me.boostT > 0 ? 0.5 : me.draft > 0.4 ? 0.28 : 0;
  // tabla de posiciones
  HUD.boardT -= dt;
  if (HUD.boardT <= 0 && R.mode !== 'trial') {
    HUD.boardT = 0.25;
    const lead = R.order[0];
    $('#board').innerHTML = R.order.map((c) => {
      const gap = c === lead || c.finished ? '' : ' <small style="opacity:.6">' + (c.place > 1 ? '+' + Math.max(0, (lead.prog - c.prog) / Math.max(15, lead.vF || 25)).toFixed(1) : '') + '</small>';
      return `<div class="${c === me ? 'me' : ''}${c.finished ? ' fin' : ''}"><b>${c.place}</b><i style="background:${c.look.paint}"></i>${escapeHtml(c.name)}${c.human && c !== me ? ' 🎮' : ''}${c.finished ? ' 🏁' : gap}</div>`;
    }).join('');
  }
  if (R.mode === 'trial') $('#board').innerHTML = '';
  drawMini();
  updateTags();
  HUD.hintT -= dt;
  if (HUD.hintT <= 0) $('#hint').classList.remove('on');
  HUD.ctrlT -= dt;
  if (HUD.ctrlT <= 0) $('#ctrlCard').classList.add('hide');
}
function updateTags() {
  const me = R.cars[R.me], mode = SAVE.tags || 'auto', box = $('#tags');
  const W = innerWidth, H = innerHeight;
  for (const c of R.cars) {
    let el = HUD.tagEls.get(c.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'tag' + (c.human ? ' hum' : '');
      el.innerHTML = `<span class="dot" style="background:${c.look.paint}"></span>${escapeHtml(c.name)}`;
      box.appendChild(el); HUD.tagEls.set(c.id, el);
    }
    const dist = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
    let show = c !== me && mode !== 'ninguno' && GAME.mode !== 'menu' && R.phase !== 'intro' && dist < (mode === 'todos' || c.human ? 140 : 45);
    if (show) {
      _v1.set(c.x, c.y + c.view.tagY, c.z).project(camera);
      if (_v1.z > 1 || Math.abs(_v1.x) > 1.1 || Math.abs(_v1.y) > 1.1) show = false;
      else {
        const s = clamp(26 / Math.max(1, dist), 0.65, 1.15);
        el.style.transform = `translate(${((_v1.x + 1) / 2) * W}px,${((1 - _v1.y) / 2) * H}px) translate(-50%,-100%) scale(${s})`;
      }
    }
    el.style.display = show ? '' : 'none';
  }
}
function clearTags() { for (const el of HUD.tagEls.values()) el.remove(); HUD.tagEls.clear(); }
function pop(text, cls, c) {
  const d = document.createElement('div');
  let x = innerWidth / 2, y = innerHeight * 0.42;
  if (c) { _v1.set(c.x, c.y + 2.2, c.z).project(camera); if (_v1.z < 1) { x = ((_v1.x + 1) / 2) * innerWidth; y = ((1 - _v1.y) / 2) * innerHeight; } }
  d.className = 'pop ' + (cls || '');
  d.textContent = text;
  d.style.left = clamp(x, 80, innerWidth - 80) + 'px'; d.style.top = clamp(y, 110, innerHeight - 60) + 'px';
  $('#pops').appendChild(d);
  setTimeout(() => d.remove(), 1100);
}
function banner(text, sub = '', quick = false) {
  const b = $('#banner');
  b.innerHTML = escapeHtml(text) + (sub ? `<small>${escapeHtml(sub)}</small>` : '');
  b.classList.remove('show', 'quick'); void b.offsetWidth;
  b.classList.add('show'); if (quick) b.classList.add('quick');
}
function hint(text, s = 4) { $('#hint').textContent = text; $('#hint').classList.add('on'); HUD.hintT = s; }
let toastT = null;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- eventos → sonido, partículas y textos ----------
function camDist(c) { return Math.hypot(c.x - camera.position.x, c.z - camera.position.z); }
function handleEvent(e) {
  const me = R.cars[R.me], c = e.id !== undefined ? R.cars[e.id] : null, mine = !!c && c === me && !R.demo;
  const near = c && camDist(c) < 50;
  switch (e.t) {
    case 'count':
      setStartLights(e.n === 0 ? 4 : 4 - e.n);
      banner(e.n ? String(e.n) : '¡YA!', '', true);
      SFX.beep(e.n === 0);
      if (e.n === 0) { setTimeout(() => setStartLights(0), 1500); hint(IS_TOUCH ? 'Mantén DERRAPE mientras giras para cargar turbo' : 'W acelerar · A D girar · Espacio derrapar · Shift nitro', 4.5); }
      if (e.n === 1) hint('¡Acelera ahora para una salida perfecta!', 1.2);
      break;
    case 'start':
      if (mine) { if (e.good) { pop('¡Salida perfecta!', 'gold', c); SFX.perfect(); SFX.boost(2); } else { pop('Motor ahogado', 'bad', c); SFX.wrong(); } }
      break;
    case 'hop': if (mine) SFX.hop(); break;
    case 'tier': if (mine) SFX.tier(e.n); break;
    case 'boost':
      if (c) sparkBurst(c.x, c.y + 0.5, c.z, 10, TIER_COL[e.n], 4);
      if (mine) { SFX.boost(e.n); pop(['', '¡Turbo!', '¡Súper turbo!', '¡Ultra turbo!'][e.n], 't' + e.n, c); CAM.shake = Math.max(CAM.shake, 0.25); }
      break;
    case 'nitro': if (mine) { SFX.nitro(); buzz(30); CAM.shake = Math.max(CAM.shake, 0.3); } break;
    case 'pad': if (mine) { SFX.pad(); pop('¡Turbo!', 't1', c); } break;
    case 'wall':
      sparkBurst(e.x, e.y, e.z, Math.min(18, e.v * 1.4), '#ffe9a8', 5);
      if (mine) { SFX.wall(Math.min(1, e.v / 14)); CAM.shake = Math.max(CAM.shake, Math.min(0.8, e.v / 16)); buzz(Math.min(60, e.v * 4)); }
      else if (near) SFX.wall(0.25);
      break;
    case 'bump': {
      sparkBurst(e.x, e.y, e.z, Math.min(16, e.v * 1.5), '#ffffff', 5);
      const mineB = me && (e.a === me.id || e.b === me.id) && !R.demo;
      if (mineB) { SFX.bump(Math.min(1, e.v / 12)); CAM.shake = Math.max(CAM.shake, Math.min(0.7, e.v / 14)); buzz(40); }
      else if (Math.hypot(e.x - camera.position.x, e.z - camera.position.z) < 40) SFX.bump(0.3);
      break;
    }
    case 'land':
      if (c) dustBurst(c.x, c.y, c.z, 8, WORLD.V.dust, 3);
      if (mine) { SFX.land(Math.min(1, e.v / 12)); CAM.shake = Math.max(CAM.shake, Math.min(0.5, e.v / 20)); buzz(30); }
      break;
    case 'trickStart': if (mine) SFX.hop(); break;
    case 'trick': if (mine) { pop('¡Truco!', 'good', c); SFX.trick(); } break;
    case 'lap':
      if (!mine) break;
      if (e.lap <= R.laps) SFX.lap();
      if (e.best) { HUD.bestT = 2; if (e.lap > 2) pop('¡Mejor vuelta!', 'good'); }
      {
        const rec = recOf(R.trackId);
        if (!rec.lap || e.time < rec.lap) {
          const had = rec.lap; rec.lap = e.time; storeSave();
          if (had) { SFX.record(); banner('¡Récord de vuelta!', fmtTime(e.time)); }
        }
      }
      break;
    case 'final': if (mine) { banner('¡Última vuelta!'); SFX.finalLap(); } break;
    case 'finish':
      if (mine) {
        const pl = me.place;
        if (R.mode === 'trial') banner('¡Meta!', fmtTime(me.finT));
        else banner(pl === 1 ? '¡GANASTE!' : pl + 'º lugar', 'META');
        SFX.finish(R.mode === 'trial' || pl <= 3);
        if (pl <= 3 || R.mode === 'trial') { confetti(c.x, c.y + 2, c.z, 140, 7); SFX.cheer(1); }
        if (WORLD) WORLD.cheer = 4;
        if (R.net === 'client') netSendFin();
      } else if (c && c.human && R.mode === 'online') toast(`🏁 ${c.name} llegó a la meta (${c.place}º)`, 2000);
      break;
    case 'respawn': if (mine) { pop('De vuelta a la pista', 'bad', c); } break;
    case 'end':
      if (R.net === 'host') netSendEnd();
      showEndScreen();
      break;
  }
}

// ---------- dibujar los carros ----------
const VS = {};
function viewState(c) {
  const s = VS[c.id] || (VS[c.id] = {});
  s.x = c.x; s.y = c.y; s.z = c.z; s.h = c.h; s.v = c.vF; s.steer = c.steer; s.drift = c.drift; s.tier = c.tier;
  s.boost = c.boostT > 0; s.nitro = c.nitroT > 0; s.brake = c.brakeL; s.air = c.air; s.trick = c.trick; s.off = c.off;
  s.cel = c.cel && (c.finished || R.ended); s.horn = c.horn; s.blink = c.ghostT > 0; s.gy = c.gy;
  return s;
}
const GS = { x: 0, y: 0, z: 0, h: 0, v: 0, steer: 0 };
function renderCars(dt) {
  for (const c of R.cars) {
    c.view.update(dt, viewState(c));
    // claxon
    if (c.horn && !c.hornPrev) { const d = camDist(c); if (c.local || d < 70) SFX.horn(c.look.horn, c.local ? 1 : 1 - d / 70); }
    c.hornPrev = c.horn;
  }
  // fantasma de la contrarreloj
  const me = R.cars[R.me], G0 = R.ghost, gv = R.ghostView;
  if (gv) {
    let vis = false;
    if (G0 && me && me.lap >= 1 && !me.finished && R.phase === 'race') {
      const gt = raceT() - me.lapT0, f = gt / 0.05, i = Math.floor(f), k = f - i;
      const a = G0.f[i], b = G0.f[i + 1] || a;
      if (a) {
        vis = true;
        GS.x = lerp(a[0], b[0], k); GS.y = lerp(a[1], b[1], k); GS.z = lerp(a[2], b[2], k);
        GS.h = a[3] + wrapA(b[3] - a[3]) * k; GS.v = Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.05;
        gv.update(dt, GS, false);
      }
    }
    gv.setVisible(vis);
  }
}
let ENG_T = 0;
function engineSound(dt) {
  const c = R.cars[R.me];
  if (!c || GAME.mode === 'menu' || GAME.paused || GAME.screen === 'scrEnd' || GAME.screen === 'scrCustom' || document.hidden) { SFX.engine(false, 0, 0, 0, 0, 0); return; }
  const v = Math.abs(c.vF), gv = (c.P.vmax * 1.25) / 5, g = Math.min(4, Math.floor(v / gv));
  const rpm = v < 1 ? 0.12 + c.inp.gas * 0.25 : clamp(0.22 + ((v - g * gv) / gv) * 0.62 + g * 0.05, 0, 1.1) + (c.nitroT > 0 ? 0.1 : 0);
  ENG_T = damp(ENG_T, rpm, 10, dt);
  const fx = Math.sin(c.h), fz = Math.cos(c.h), lat = Math.abs(-c.vx * fz + c.vz * fx);
  const skid = c.drift && !c.air ? 1 : !c.air && v > 8 ? clamp((lat - 2.5) / 6, 0, 0.8) : 0;
  SFX.engine(true, ENG_T, c.inp.gas, skid, clamp(v / 42, 0, 1) * (c.nitroT > 0 ? 1.5 : 1), c.off && !c.air && v > 4 ? clamp(v / 25, 0, 1) : 0);
}

// ---------- pantallas ----------
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  const prev = GAME.screen;
  GAME.screen = id || '';
  if (id === 'scrMenu') refreshMenu();
  if (id === 'scrSetup') syncChips();
  if (id === 'scrHelp' && !SAVE.seenHelp) { SAVE.seenHelp = true; storeSave(); }
  if (id === 'scrCustom' && prev !== 'scrCustom') openCustom();
  if (id !== 'scrCustom' && prev === 'scrCustom') closeCustom();
}
function refreshMenu() {
  $('#mLvl').textContent = SAVE.level;
  $('#mName').textContent = SAVE.name;
  const need = xpNeed(SAVE.level);
  $('#mXp').style.width = Math.round((SAVE.xp / need) * 100) + '%';
  $('#mXpTxt').textContent = `${SAVE.xp} / ${need} XP para el nivel ${SAVE.level + 1}`;
  $('#mStats').textContent = SAVE.races ? `🏆 ${SAVE.wins} victorias · 🥉 ${SAVE.podiums} podios` + (SAVE.cups ? ` · 🏅 ${SAVE.cups} copas` : '') : '¡Corre tu primera carrera!';
  $('#bMute').textContent = SFX.muted ? '🔇' : '🔊';
  $('#helpBadge').style.display = SAVE.seenHelp ? 'none' : '';
}
function syncChips() {
  $$('[data-opt]').forEach((row) => {
    const k = row.dataset.opt;
    row.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', c.dataset.v === String(SAVE[k])));
  });
}
// tarjetas de pistas: emoji, nombre, descripción y récord
function renderTrackPicker(box, sel, onPick) {
  if (!box) return;
  const key = sel + '|' + (onPick ? 1 : 0);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.innerHTML = TRACKS.map((T) => {
    const r = SAVE.recs[T.id];
    return `<button class="tcard${T.id === sel ? ' sel' : ''}${onPick ? '' : ' off'}" data-id="${T.id}" style="--tc:${T.col}"><span class="tb2">${T.emoji}</span><b>${T.name}</b><small>${T.desc}</small>${r && r.lap ? `<small>⏱️ ${fmtTime(r.lap)}</small>` : ''}</button>`;
  }).join('');
  if (onPick) box.querySelectorAll('.tcard').forEach((b) => b.addEventListener('click', () => { box.dataset.key = ''; onPick(b.dataset.id); }));
}
let SETUP_MODE = 'race';
function openSetup(mode) {
  SETUP_MODE = mode;
  $('#sTitle').textContent = { race: '🏁 Carrera contra la PC', cup: '🏆 Copa Derrape', trial: '⏱️ Contrarreloj' }[mode];
  $('#sTrackWrap').style.display = mode === 'cup' ? 'none' : '';
  $('#sCupWrap').style.display = mode === 'cup' ? '' : 'none';
  $('#sRivWrap').style.display = mode === 'trial' ? 'none' : '';
  $('#sCup').innerHTML = TRACKS.map((t, i) => `${i + 1}. ${t.emoji} <b>${t.name}</b> — ${t.desc}`).join('<br>') + '<br><small>Puntos: 10, 8, 6, 5, 4, 3, 2, 1. Gana quien sume más.</small>';
  $('#bPlay').textContent = mode === 'cup' ? '🏆 ¡Empezar la copa!' : mode === 'trial' ? '⏱️ ¡A por el récord!' : '🏁 ¡A correr!';
  renderTrackPicker($('#sTracks'), SAVE.track, pickSetupTrack);
  showScreen('scrSetup');
}
function pickSetupTrack(id) {
  SAVE.track = id; storeSave(); SFX.ui();
  renderTrackPicker($('#sTracks'), id, pickSetupTrack);
  if (GAME.mode === 'menu') startDemo();
}
function toggleMute() {
  SFX.muted = !SFX.muted; SAVE.muted = SFX.muted; storeSave();
  $('#bMute').textContent = SFX.muted ? '🔇' : '🔊';
  toast(SFX.muted ? 'Sonido apagado' : 'Sonido encendido', 1200);
}
function togglePause() {
  if (GAME.mode === 'menu') { if (!['scrMenu', 'scrLobby'].includes(GAME.screen)) showScreen(NET.role === 'off' ? 'scrMenu' : 'scrLobby'); return; }
  if (GAME.screen === 'scrEnd') return;
  GAME.paused = !GAME.paused;
  syncPauseBtns();
  $('#bResume').textContent = R.mode === 'online' ? 'Volver a la carrera (sigue en línea)' : 'Continuar';
  $('#bRestart').style.display = R.mode === 'online' ? 'none' : '';
  showScreen(GAME.paused ? 'scrPause' : null);
}
// rivales de la PC con nombre y carro (con semilla: en la copa son siempre los mismos)
function cpuGrid(n, seed) {
  const rng = mulberry32(seed >>> 0), names = CPU_NAMES.slice(), out = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rng() * names.length);
    out.push({ name: names.splice(k, 1)[0], look: randomLook(rng), human: false, key: 'cpu' + i });
  }
  return out;
}
function myEntry() { return { name: SAVE.name, look: SAVE.look, human: true, local: true, key: 'me' }; }
function startRace(mode) {
  let grid, track = SAVE.track;
  if (mode === 'trial') grid = [myEntry()];
  else if (mode === 'cup') {
    const C = R.cup;
    track = C.tracks[C.i];
    grid = C.rivals.concat([myEntry()]).sort((a, b) => (C.pts[a.key] || 0) - (C.pts[b.key] || 0) || C.order.indexOf(a.key) - C.order.indexOf(b.key));
  } else {
    grid = cpuGrid(SAVE.rivals, (Math.random() * 1e9) | 0);
    grid.splice(Math.max(0, grid.length - 1), 0, myEntry());
  }
  GAME.mode = mode;
  newRace({ mode, track, laps: SAVE.laps, diff: SAVE.diff, grid });
  enterRaceUI();
}
function startCup() {
  const rivals = cpuGrid(SAVE.rivals, (Math.random() * 1e9) | 0);
  R.cup = { tracks: TRACKS.map((t) => t.id), i: 0, rivals, pts: {}, order: rivals.map((r) => r.key).concat('me').sort(() => Math.random() - 0.5), names: {} };
  startRace('cup');
}
function enterRaceUI() {
  GAME.paused = false;
  showScreen(null);
  clearTags();
  $('#hud').classList.add('on');
  $('#touchUI').classList.toggle('on', IS_TOUCH);
  applyTouchPrefs();
  HUD.pos = 0; HUD.lapKey = ''; HUD.boardT = 0; HUD.bestT = 0;
  setStartLights(0);
  const me = R.cars[R.me];
  if (me) camSnapBehind(me);
  CAM.fov = 62;
  const T = trackOf(R.trackId);
  banner(T.emoji + ' ' + T.name, R.mode === 'trial' ? 'Contrarreloj' : R.mode === 'cup' ? `Copa · carrera ${R.cup.i + 1} de ${R.cup.tracks.length}` : `${R.laps} vuelta${R.laps > 1 ? 's' : ''}`);
  if (!IS_TOUCH) {
    $('#ctrlCard').innerHTML = '<div class="ttl">Controles</div><b>W ↑</b>acelerar<br><b>A D ← →</b>girar<br><b>S ↓</b>frenar<br><b>Espacio</b>derrapar<br><b>Shift</b>nitro<br><b>R</b>volver a la pista';
    $('#ctrlCard').classList.remove('hide');
    HUD.ctrlT = SAVE.races < 3 ? 14 : 6;
  }
  $('#netInfo').style.display = R.net !== 'off' ? 'block' : 'none';
  SFX.resume();
  if (IS_TOUCH && innerHeight > innerWidth) toast('📱 Gira el teléfono en horizontal para ver mejor la pista', 3500);
}
function startDemo() {
  GAME.mode = 'menu';
  const grid = cpuGrid(8, (Math.random() * 1e9) | 0);
  newRace({ mode: 'demo', track: SAVE.track, laps: 999, diff: 1, grid, demo: true });
  CAM.shotT = 0;
  clearTags();
}
function leaveToMenu() {
  netReset();
  GAME.paused = false;
  $('#hud').classList.remove('on');
  $('#touchUI').classList.remove('on');
  $('#speedFx').style.opacity = 0;
  $('#wrong').classList.remove('on');
  R.cup = null;
  startDemo();
  showScreen('scrMenu');
}

// ---------- pantalla final + experiencia ----------
function grantXp(xp, oldLv) {
  SAVE.xp += xp;
  while (SAVE.xp >= xpNeed(SAVE.level)) { SAVE.xp -= xpNeed(SAVE.level); SAVE.level++; }
  storeSave();
  $('#eLvl').textContent = SAVE.level;
  $('#eXp').style.width = '0%';
  setTimeout(() => { $('#eXp').style.width = Math.round((SAVE.xp / xpNeed(SAVE.level)) * 100) + '%'; }, 350);
  $('#eXpTxt').textContent = `${SAVE.xp} / ${xpNeed(SAVE.level)} XP para el nivel ${SAVE.level + 1}`;
  const unlocks = [];
  for (const k of Object.keys(OPTS)) for (const o of OPTS[k]) if (o.lv > oldLv && o.lv <= SAVE.level) unlocks.push(`${OPT_LABEL[k]}: ${o.n || '<span style="display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:middle;background:' + o.v + '"></span>'}`);
  $('#eUnlocks').innerHTML = (SAVE.level > oldLv ? `<div class="unlock">⬆️ ¡Subiste al nivel ${SAVE.level}!</div>` : '') + unlocks.map((u) => `<div class="unlock">🔓 Nuevo — ${u}</div>`).join('');
  if (SAVE.level > oldLv) SFX.levelUp();
}
function resultRows(res) {
  return '<tr><th>#</th><th>Piloto</th><th>Tiempo</th><th>Mejor vuelta</th></tr>' + res.map((r) => {
    const mine = r.id === R.me;
    const tm = r.dnf ? 'No llegó' : (r.est ? '≈ ' : '') + fmtTime(r.time);
    return `<tr class="${mine ? 'me' : ''}"><td>${r.place}</td><td><i style="background:${escapeHtml(r.look.paint)}"></i>${escapeHtml(r.name)}${mine ? ' <small style="opacity:.6">(tú)</small>' : r.human ? ' 🎮' : ''}</td><td>${tm}</td><td>${r.best ? fmtTime(r.best) : '—'}</td></tr>`;
  }).join('');
}
function showEndScreen() {
  setTimeout(() => {
    if (GAME.mode === 'menu' || !R.results) return;
    const oldLv = SAVE.level, res = R.results, mine = res.find((r) => r.id === R.me);
    const me = R.cars[R.me];
    const T = trackOf(R.trackId), rec = recOf(R.trackId);
    $('#eCup').innerHTML = '';
    let xp = 0;
    if (R.mode === 'trial') {
      const tot = me.finT, newRec = !rec.race || tot < rec.race;
      if (newRec) { rec.race = tot; storeSave(); }
      $('#eTitle').textContent = newRec ? '⏱️ ¡Nuevo récord!' : '⏱️ Contrarreloj';
      $('#eTitle').style.color = '#7e57c2';
      $('#eSub').textContent = `${T.emoji} ${T.name} · ${R.laps} vuelta${R.laps > 1 ? 's' : ''}`;
      $('#eTable').innerHTML = '<tr><th>Vuelta</th><th>Tiempo</th><th></th><th></th></tr>' + me.lapTimes.map((t, i) => `<tr class="${t === me.best ? 'me' : ''}"><td>${i + 1}</td><td>${fmtTime(t)}</td><td>${t === me.best ? '⭐ mejor' : ''}</td><td></td></tr>`).join('');
      $('#eMvp').innerHTML = `Total <b>${fmtTime(tot)}</b> · récord de la pista <b>${fmtTime(rec.race)}</b> · mejor vuelta histórica <b>${fmtTime(rec.lap)}</b>`;
      xp = 40 + R.laps * 15 + (newRec ? 60 : 0);
      $('#bAgain').textContent = '⏱️ Otra vez';
    } else {
      const pl = mine ? mine.place : res.length;
      $('#eTitle').textContent = pl === 1 ? '🏆 ¡VICTORIA!' : pl <= 3 ? `🥉 ¡${pl}º lugar!` : `${pl}º lugar`;
      $('#eTitle').style.color = pl === 1 ? '#ff7a2f' : pl <= 3 ? '#3a7bff' : '#8a93b5';
      $('#eSub').textContent = `${T.emoji} ${T.name} · ${R.laps} vuelta${R.laps > 1 ? 's' : ''}` + (R.mode === 'online' ? ' · en línea' : ` · ${DIFF[R.diff].name}`);
      $('#eTable').innerHTML = resultRows(res);
      const bestLap = res.filter((r) => r.best).sort((a, b) => a.best - b.best)[0];
      $('#eMvp').innerHTML = bestLap ? `⚡ Vuelta más rápida: <b>${escapeHtml(bestLap.name)}</b> ${fmtTime(bestLap.best)}${bestLap.id === R.me ? ' — ¡eres tú!' : ''}` : '';
      const base = [150, 110, 85, 70, 60, 50, 45, 40][pl - 1] || 40;
      xp = base * Math.sqrt(R.laps / 3) + (bestLap && bestLap.id === R.me ? 30 : 0);
      xp *= R.mode === 'online' ? 1.3 : [0.75, 1, 1.35][R.diff] || 1;
      SAVE.races++;
      if (pl === 1) { SAVE.wins++; SAVE.streak++; } else SAVE.streak = 0;
      if (pl <= 3) SAVE.podiums++;
      if (pl === 1 && SAVE.streak >= 2) xp += SAVE.streak * 15;
      if (me && me.finished && (!rec.race || me.finT < rec.race) && R.laps === 3) rec.race = me.finT;
      // copa: puntos y clasificación
      if (R.mode === 'cup' && R.cup) {
        const C = R.cup;
        for (const r of res) { const car = R.cars[r.id]; C.pts[car.key] = (C.pts[car.key] || 0) + (POINTS[r.place - 1] || 0); C.names[car.key] = { name: car.name, paint: car.look.paint }; }
        const st = Object.keys(C.pts).sort((a, b) => C.pts[b] - C.pts[a]);
        const last = C.i >= C.tracks.length - 1;
        const myPos = st.indexOf('me') + 1;
        $('#eCup').innerHTML = `<tr><th>#</th><th>Copa (${C.i + 1}/${C.tracks.length})</th><th>Puntos</th><th></th></tr>` + st.map((k, i) => `<tr class="${k === 'me' ? 'me' : ''}"><td>${i + 1}</td><td><i style="background:${C.names[k].paint}"></i>${escapeHtml(C.names[k].name)}</td><td>${C.pts[k]}</td><td>${last && i === 0 ? '🏆' : ''}</td></tr>`).join('');
        if (last) {
          $('#eTitle').textContent = myPos === 1 ? '🏆 ¡GANASTE LA COPA!' : `Copa: ${myPos}º lugar`;
          xp += myPos === 1 ? 250 : myPos <= 3 ? 120 : 50;
          if (myPos === 1) { SAVE.cups++; confetti(me.x, me.y + 2, me.z, 200, 9); }
        }
        $('#bAgain').textContent = last ? '🏆 Otra copa' : `▶ Siguiente: ${trackOf(C.tracks[C.i + 1]).emoji} ${trackOf(C.tracks[C.i + 1]).name}`;
      } else $('#bAgain').textContent = R.net === 'client' ? 'Esperando al anfitrión…' : '🔄 ¡Revancha!';
      if (pl <= 3) { SFX.cheer(1); }
    }
    xp = Math.round(xp);
    $('#eXpGain').textContent = `+${xp} XP` + (SAVE.streak >= 2 && R.mode !== 'trial' ? ` · 🔥 racha de ${SAVE.streak}` : '');
    grantXp(xp, oldLv);
    $('#bAgain').disabled = R.net === 'client';
    $('#bEndMenu').textContent = R.mode === 'online' ? 'Salir de la sala' : 'Menú';
    $('#bToLobby').style.display = R.net === 'host' ? '' : 'none';
    $('#hud').classList.remove('on');
    $('#touchUI').classList.remove('on');
    $('#speedFx').style.opacity = 0;
    clearTags();
    showScreen('scrEnd');
  }, 1300);
}
$('#bAgain').onclick = () => {
  SFX.ui();
  if (R.net === 'host') { hostStart(); return; }
  if (R.mode === 'cup' && R.cup) { if (R.cup.i < R.cup.tracks.length - 1) { R.cup.i++; startRace('cup'); } else startCup(); return; }
  startRace(R.mode === 'trial' ? 'trial' : 'race');
};
$('#bEndMenu').onclick = () => { SFX.ui(); leaveToMenu(); };
$('#bToLobby').onclick = () => { SFX.ui(); netSendAll({ t: 'tolobby' }); backToLobby(); };

// ---------- personalización (garaje) ----------
let previewCar = null;
const GAR = (() => {
  garage.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3fa7f5'); gr.addColorStop(0.7, '#bfe6ff'); gr.addColorStop(1, '#e8f6ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  garage.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 1.2));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(5, 9, 6); dl.castShadow = true;
  Object.assign(dl.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  dl.shadow.mapSize.set(1024, 1024);
  garage.add(dl);
  const floor = mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.3, 40), toon('#e5e9f5'), false);
  floor.position.y = -0.15; floor.receiveShadow = true; garage.add(floor);
  const ring = mesh(new THREE.TorusGeometry(3.7, 0.08, 8, 48), toon('#ffc93a'), false); ring.rotation.x = Math.PI / 2; garage.add(ring);
  const turn = new THREE.Group(); garage.add(turn);
  return { turn, t: 0 };
})();
function openCustom() { $('#cName').value = SAVE.name; renderCustRows(); rebuildPreview(); }
function closeCustom() {
  const n = $('#cName').value.trim().slice(0, 12);
  if (n) { SAVE.name = n; storeSave(); }
  if (previewCar) { previewCar.dispose(); previewCar = null; }
  garageCam.clearViewOffset();
}
function rebuildPreview() {
  if (previewCar) previewCar.dispose();
  previewCar = new CarView(SAVE.look, { parent: GAR.turn });
}
function renderGarage(dt) {
  GAR.t += dt;
  GAR.turn.rotation.y += dt * 0.5;
  if (previewCar) previewCar.update(dt, { x: 0, y: 0, z: 0, h: 0, v: 0, steer: Math.sin(GAR.t * 0.9) * 0.6, cel: GAR.cel > 0, horn: false }, false);
  GAR.cel = Math.max(0, (GAR.cel || 0) - dt);
  const w = innerWidth, h = innerHeight, narrow = w < 760;
  garageCam.position.set(0, 2.6, narrow ? 10.5 : 9.2);
  garageCam.lookAt(0, 0.8, 0);
  if (narrow) garageCam.setViewOffset(w, h, 0, h * 0.24, w, h);
  else garageCam.setViewOffset(w, h, Math.min(260, w * 0.22), 0, w, h);
  renderer.render(garage, garageCam);
}
function renderCustRows() {
  const box = $('#custRows');
  box.innerHTML = '';
  for (const k of Object.keys(OPTS)) {
    const lab = document.createElement('label');
    lab.className = 't'; lab.textContent = OPT_LABEL[k];
    box.appendChild(lab);
    const row = document.createElement('div');
    row.className = 'row';
    for (const o of OPTS[k]) {
      const locked = o.lv > SAVE.level;
      const el = document.createElement('button');
      if (o.v.startsWith('#') && !o.n) { el.className = 'sw'; el.style.background = o.v; }
      else { el.className = 'chip'; el.innerHTML = (o.v.startsWith('#') ? `<span style="display:inline-block;width:12px;height:12px;border-radius:4px;background:${o.v};vertical-align:middle;margin-right:4px"></span>` : '') + o.n + (locked ? `<small>🔒 Nv ${o.lv}</small>` : ''); }
      if (locked) { el.classList.add('lock'); el.title = 'Se desbloquea en el nivel ' + o.lv; }
      if (SAVE.look[k] === o.v) el.classList.add('sel');
      el.onclick = () => {
        if (locked) { toast('Se desbloquea en el nivel ' + o.lv); return; }
        SAVE.look[k] = o.v; storeSave(); SFX.ui();
        if (k === 'horn') SFX.horn(o.v);
        if (k === 'acc' || k === 'hair') GAR.cel = 2;
        renderCustRows(); rebuildPreview();
      };
      row.appendChild(el);
    }
    box.appendChild(row);
    if (k === 'model') {
      const m = modelOf(SAVE.look.model), st = document.createElement('div');
      st.className = 'stats';
      st.innerHTML = `<b style="grid-column:1/3;opacity:1">${m.name} · ${m.desc}</b>` + Object.keys(STAT_LABEL).map((s) => `<b>${STAT_LABEL[s]}</b><div class="bar"><i style="width:${m.s[s] * 10}%"></i></div>`).join('');
      box.appendChild(st);
    }
  }
}
$('#cName').addEventListener('input', () => { const n = $('#cName').value.trim().slice(0, 12); if (n) { SAVE.name = n; storeSave(); } });

// ---------- botones de menú ----------
$$('[data-go]').forEach((b) => b.addEventListener('click', () => { SFX.resume(); SFX.ui(); showScreen(b.dataset.go); }));
$$('[data-opt]').forEach((row) => row.addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  const k = row.dataset.opt, v = c.dataset.v;
  SAVE[k] = isNaN(+v) ? v : +v;
  storeSave(); syncChips(); SFX.ui();
  if (k === 'autoGas' || k === 'steerMode') { applyTouchPrefs(); syncPauseBtns(); }
}));
$('#bRace').onclick = () => { SFX.resume(); SFX.ui(); openSetup('race'); };
$('#bCup').onclick = () => { SFX.resume(); SFX.ui(); openSetup('cup'); };
$('#bTrial').onclick = () => { SFX.resume(); SFX.ui(); openSetup('trial'); };
$('#bPlay').onclick = () => { SFX.resume(); if (SETUP_MODE === 'cup') startCup(); else startRace(SETUP_MODE); };
$('#bResume').onclick = () => togglePause();
$('#bQuit').onclick = () => leaveToMenu();
$('#bRestart').onclick = () => { if (R.mode === 'online') return; GAME.paused = false; if (R.mode === 'cup' && R.cup) startRace('cup'); else startRace(R.mode === 'trial' ? 'trial' : 'race'); };
$('#pauseBtn').onclick = () => togglePause();
$('#camBtn').onclick = () => cycleCam();
$('#bMute').onclick = () => toggleMute();
const TAG_MODES = { auto: 'Auto', todos: 'Todos', ninguno: 'Ninguno' };
function syncPauseBtns() {
  $('#bTags').textContent = '🏷️ Nombres: ' + TAG_MODES[SAVE.tags || 'auto'];
  $('#bCam').textContent = '🎥 Cámara: ' + CAM_MODES[CAM.mode].n;
  $('#bAutoGas').textContent = '🤖 Acelerar: ' + (SAVE.autoGas ? 'Solo' : 'Con botón');
  $('#bSteer').textContent = (SAVE.steerMode === 'btn' ? '◀ ▶ Volante: Botones' : '🕹️ Volante: Joystick');
  $('#bVib').textContent = '📳 Vibración: ' + (SAVE.vib !== false ? 'Sí' : 'No');
  syncQualityBtn();
}
$('#bCam').onclick = () => { cycleCam(); SFX.ui(); };
$('#bTags').onclick = () => { const ks = Object.keys(TAG_MODES); SAVE.tags = ks[(ks.indexOf(SAVE.tags || 'auto') + 1) % ks.length]; storeSave(); syncPauseBtns(); SFX.ui(); };
$('#bAutoGas').onclick = () => { SAVE.autoGas = SAVE.autoGas ? 0 : 1; storeSave(); applyTouchPrefs(); syncPauseBtns(); SFX.ui(); };
$('#bSteer').onclick = () => { SAVE.steerMode = SAVE.steerMode === 'btn' ? 'joy' : 'btn'; storeSave(); applyTouchPrefs(); syncPauseBtns(); SFX.ui(); };
$('#bVib').onclick = () => { SAVE.vib = SAVE.vib === false; storeSave(); syncPauseBtns(); SFX.ui(); };
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) { toast('En iPhone: toca Compartir y luego "Añadir a pantalla de inicio"; ábrelo desde ahí para jugar a pantalla completa', 5000); return; }
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => { try { if (IS_TOUCH && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* sin bloqueo */ } }).catch(() => toast('Tu navegador no permitió la pantalla completa'));
  } catch (e) { toast('Tu navegador no permitió la pantalla completa'); }
}
function syncFsIcon() {
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  for (const b of [$('#fsBtn'), $('#bFs')]) { b.textContent = on ? '🗗' : '⛶'; b.title = on ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'; }
}
document.addEventListener('fullscreenchange', syncFsIcon);
document.addEventListener('webkitfullscreenchange', syncFsIcon);
$('#fsBtn').onclick = () => toggleFullscreen();
$('#bFs').onclick = () => toggleFullscreen();
document.addEventListener('visibilitychange', () => { if (document.hidden && racing() && R.mode !== 'online') togglePause(); });

// =========================================================
//  EN LÍNEA (PeerJS / WebRTC, con relevo MQTT de respaldo)
//  Hasta 6 pilotos. Cada uno maneja y simula SU carro y manda su
//  estado ~20 veces por segundo; el anfitrión simula los carros de
//  la PC, reparte el estado de todos y decide cuándo termina.
// =========================================================
const PEER_PREFIX = 'derrapepark-v1-';
const PEER_OPTS = {
  debug: 1,
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ],
  },
};
const NET = {
  role: 'off', peer: null, conns: new Map(), hostConn: null, code: '', lobby: [], settings: { track: SAVE.track, laps: 3, cars: 6, diff: 1 },
  started: false, mid: '', snapT: 0, pingT: 0, sendT: 0, relays: [], relayConns: new Map(), via: '', welcomed: false, lastHostMsg: 0, rtt: 0.1,
  reconnecting: false, lostSince: 0, ack: new Set(), startT: 0, anyRelay: false,
};
const CL = { mid: '', finSent: 0, finT: 0 };
const num = (v, a, b) => clamp(Number.isFinite(+v) ? +v : 0, a, b);
function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
function netSendAll(msg) { for (const c of NET.conns.values()) if (c.conn.open) { try { c.conn.send(msg); } catch (e) { /* ignorar */ } } }
function netSend(msg) { if (NET.hostConn && NET.hostConn.open) { try { NET.hostConn.send(msg); } catch (e) { /* ignorar */ } } }
function netReset() {
  const peer = NET.peer;
  if (NET.role === 'host') netSendAll({ t: 'hostbye' });
  try { if (NET.hostConn && NET.hostConn.relay) NET.hostConn.close(); } catch (e) { /* ignorar */ }
  for (const cl of NET.relays) { try { cl.end(); } catch (e) { /* ignorar */ } }
  Object.assign(NET, { relays: [], welcomed: false, via: '', role: 'off', peer: null, hostConn: null, lobby: [], started: false, mid: '', reconnecting: false, lostSince: 0, anyRelay: false });
  NET.relayConns.clear(); NET.conns.clear(); NET.ack.clear();
  Object.assign(CL, { mid: '', finSent: 0, finT: 0 });
  try { if (peer) peer.destroy(); } catch (e) { /* ignorar */ }
}
function linkFor(code) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('sala', code);
  return u.toString();
}
// estado compacto de un carro (enteros): viaja bien hasta por el relevo
function carState(c) {
  const q = (v, k) => Math.round((+v || 0) * k);
  const fl = (c.drift ? 1 : 0) | (c.drift > 0 ? 2 : 0) | (c.boostT > 0 ? 4 : 0) | (c.nitroT > 0 ? 8 : 0) | (c.brakeL ? 16 : 0) | (c.air ? 32 : 0) | (c.horn ? 64 : 0) |
    (c.off ? 128 : 0) | (c.finished ? 256 : 0) | (c.ghostT > 0 ? 512 : 0) | (c.trick ? 1024 : 0) | (c.cel ? 2048 : 0) | (c.hop ? 4096 : 0) | ((c.tier & 3) << 13);
  return [q(c.x, 20), q(c.y, 50), q(c.z, 20), q(c.h, 1000), q(c.vF, 10), q(c.steer, 50), fl, c.lap | 0, q(c.along, 4), q(c.best, 100)];
}
const cleanState = (a) => (Array.isArray(a) && a.length >= 10 ? a.slice(0, 10).map((v) => num(v, -1e7, 1e7)) : null);
function pushRemote(c, a) {
  c.buf.push({ t: performance.now() / 1000, a });
  if (c.buf.length > 30) c.buf.shift();
}
// los carros de otros dispositivos se dibujan un poco en el pasado, interpolando
function updateRemotes(now) {
  if (!TR) return;
  const rt = now - (NET.via === 'relevo' || NET.anyRelay ? 0.17 : 0.11);
  for (const c of R.cars) {
    if (!c.remote || !c.buf.length) continue;
    const B = c.buf;
    let i0 = 0;
    for (let i = B.length - 1; i >= 0; i--) if (B[i].t <= rt) { i0 = i; break; }
    const s0 = B[i0], s1 = B[i0 + 1], a = s0.a, b = s1 ? s1.a : null;
    const k = b ? clamp((rt - s0.t) / Math.max(0.001, s1.t - s0.t), 0, 1) : 0;
    const L = (j, sc) => (b ? lerp(a[j], b[j], k) : a[j]) / sc;
    let x = L(0, 20), z = L(2, 20);
    const h = a[3] / 1000 + (b ? wrapA(b[3] / 1000 - a[3] / 1000) * k : 0);
    if (!b) { const el = Math.min(0.25, rt - s0.t); if (el > 0) { const v = a[4] / 10; x += Math.sin(h) * v * el; z += Math.cos(h) * v * el; } }
    const jump = Math.hypot(x - c.x, z - c.z) > 20;
    c.x = x; c.y = L(1, 50); c.z = z; c.h = h;
    c.vF = L(4, 10); c.steer = L(5, 50);
    const fl = a[6] | 0;
    c.drift = fl & 1 ? (fl & 2 ? 1 : -1) : 0; c.boostT = fl & 4 ? 0.1 : 0; c.nitroT = fl & 8 ? 0.1 : 0; c.brakeL = !!(fl & 16); c.air = !!(fl & 32);
    c.horn = !!(fl & 64); c.off = !!(fl & 128); c.ghostT = fl & 512 ? 0.1 : 0; c.trick = !!(fl & 1024); c.cel = !!(fl & 2048); c.hop = !!(fl & 4096); c.tier = (fl >> 13) & 3;
    if (fl & 256 && !c.finished) { c.finished = true; if (!c.finT) c.finT = Math.max(0, raceT()); }
    c.lap = a[7] | 0; c.along = clamp(a[8] / 4, 0, TR.L); c.prog = c.lap * TR.L + c.along; c.best = a[9] / 100;
    c.vx = Math.sin(c.h) * c.vF; c.vz = Math.cos(c.h) * c.vF;
    locate(c, jump);
  }
}

// ---------- relevo (plan B): si la conexión directa falla, los mensajes viajan por un servidor MQTT público ----------
const RELAY_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const LIB_MQTT = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
const LIB_QR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
const scriptCache = {};
function loadScript(src) {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res;
      s.onerror = () => { delete scriptCache[src]; rej(new Error('no se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }
  return scriptCache[src];
}
const rTopic = (code, k) => `derrapepark/v1/${code}/${k}`;
function relayConnectOne(i) {
  return loadScript(LIB_MQTT).then(() => new Promise((res, rej) => {
    let done = false;
    const cl = window.mqtt.connect(RELAY_BROKERS[i], { clientId: 'dp_' + Math.random().toString(36).slice(2, 12), clean: true, connectTimeout: 7000, reconnectPeriod: 2500, keepalive: 30 });
    cl.on('connect', () => {
      for (const tp of cl.dpTopics || []) cl.subscribe(tp);
      if (!done) { done = true; res(cl); }
    });
    cl.dpSub = (tp) => { cl.dpTopics = (cl.dpTopics || []).concat(tp); cl.subscribe(tp); };
    cl.on('error', () => { /* reintenta solo */ });
    setTimeout(() => { if (!done) { done = true; try { cl.end(true); } catch (e) { /* ignorar */ } rej(new Error('relay timeout')); } }, 8000);
  }));
}
const waitFor = (fn, ms) => new Promise((res) => {
  const t0 = performance.now();
  const iv = setInterval(() => { if (fn()) { clearInterval(iv); res(true); } else if (performance.now() - t0 > ms) { clearInterval(iv); res(false); } }, 100);
});
function hostRelayStart(code) {
  RELAY_BROKERS.forEach((_, i) => {
    relayConnectOne(i).then((cl) => {
      if (NET.role !== 'host' || NET.code !== code) { cl.end(true); return; }
      NET.relays.push(cl);
      cl.dpSub(rTopic(code, 'h'));
      cl.on('message', (tp, payload) => {
        let m;
        try { m = JSON.parse(payload.toString()); } catch (e) { return; }
        if (m && typeof m.f === 'string') hostRelayMsg(cl, m.f.slice(0, 16), m.d);
      });
    }).catch(() => { /* ese servidor no responde: queda el otro */ });
  });
}
function hostRelayMsg(cl, cid, d) {
  const key = 'relay:' + cid;
  let v = NET.relayConns.get(key);
  if (!v) {
    if (!d || d.t !== 'hello') return;
    v = { peer: key, open: true, relay: true, lastT: 0, send(msg) { if (this.open) cl.publish(rTopic(NET.code, 'c/' + cid), JSON.stringify(msg)); }, close() { this.open = false; } };
    NET.relayConns.set(key, v);
  }
  v.lastT = performance.now();
  if (d && d.t === 'bye') { v.open = false; NET.relayConns.delete(key); hostDrop(v); return; }
  hostOnData(v, d);
}
async function clientRelayJoin(code) {
  setJoinStatus('Probando conexión por servidor de relevo…');
  const cid = Math.random().toString(36).slice(2, 12);
  for (let i = 0; i < RELAY_BROKERS.length; i++) {
    let cl;
    try { cl = await relayConnectOne(i); } catch (e) { continue; }
    if (NET.role !== 'client' || NET.code !== code) { cl.end(true); return; }
    const conn = {
      open: true, relay: true,
      send(msg) { if (this.open) cl.publish(rTopic(code, 'h'), JSON.stringify({ f: cid, d: msg })); },
      close() { try { this.send({ t: 'bye' }); } catch (e) { /* ignorar */ } this.open = false; setTimeout(() => { try { cl.end(true); } catch (e) { /* ignorar */ } }, 200); },
    };
    cl.dpSub(rTopic(code, 'c/' + cid));
    cl.on('message', (tp, payload) => {
      if (NET.hostConn !== conn) return;
      let m;
      try { m = JSON.parse(payload.toString()); } catch (e) { return; }
      NET.lastHostMsg = performance.now();
      clientOnData(m);
    });
    NET.relays.push(cl);
    NET.hostConn = conn; NET.via = 'relevo'; NET.welcomed = false;
    NET.lastHostMsg = performance.now();
    conn.send(helloMsg());
    if (await waitFor(() => NET.welcomed, 6000)) { setJoinStatus('¡Conectado (por relevo)!'); return; }
    conn.close();
    if (NET.hostConn === conn) NET.hostConn = null;
  }
  if (NET.role === 'client' && NET.code === code) setJoinStatus('No se pudo conectar. Revisa el código, que la sala siga abierta en el otro dispositivo y tu internet.');
}
// latidos: el anfitrión detecta invitados caídos; el invitado detecta anfitrión caído
setInterval(() => {
  const now = performance.now();
  if (NET.role === 'host') {
    if (R.net !== 'host') netSendAll({ t: 'ping', ts: now });
    for (const [key, v] of NET.relayConns) if (now - v.lastT > 15000) { v.open = false; NET.relayConns.delete(key); hostDrop(v); }
    for (const c of NET.conns.values()) if (!c.conn.relay && c.lastT && now - c.lastT > 20000) { try { c.conn.close(); } catch (e) { /* ignorar */ } hostDrop(c.conn); }
  } else if (NET.role === 'client') {
    if (NET.hostConn && NET.hostConn.open) netSend({ t: 'cping', ts: now });
    if (NET.welcomed && now - NET.lastHostMsg > 6000) clientReconnect();
    if (NET.lostSince && now - NET.lostSince > 40000) { toast('Se perdió la conexión con el anfitrión'); leaveToMenu(); }
  }
}, 2000);
function clientReconnect() {
  if (NET.reconnecting || NET.role !== 'client') return;
  NET.reconnecting = true;
  NET.lostSince = NET.lostSince || performance.now();
  toast('Reconectando con el anfitrión…', 2500);
  const code = NET.code, old = NET.hostConn, peer = NET.peer;
  NET.welcomed = false; NET.hostConn = null; NET.peer = null;
  try { if (old) old.close(); } catch (e) { /* ignorar */ }
  try { if (peer) peer.destroy(); } catch (e) { /* ignorar */ }
  for (const cl of NET.relays) { try { cl.end(true); } catch (e) { /* ignorar */ } }
  NET.relays = [];
  clientRelayJoin(code).finally(() => {
    NET.reconnecting = false;
    if (NET.welcomed) { NET.lostSince = 0; toast('¡Conectado otra vez!', 1500); }
    else NET.lastHostMsg = performance.now() - 4000;
  });
}

// ---------- anfitrión ----------
function hostCreate() {
  netReset();
  NET.role = 'host';
  NET.code = genCode();
  NET.settings = { track: SAVE.track, laps: SAVE.laps, cars: NET.settings.cars || 6, diff: SAVE.diff };
  NET.lobby = [{ pid: 'h', name: SAVE.name, look: SAVE.look, cid: CID }];
  showScreen('scrLobby');
  setLobbyStatus('Creando sala…');
  renderLobby();
  hostRelayStart(NET.code);
  loadScript(LIB_QR).then(renderLobby).catch(() => { /* sin QR */ });
  if (!window.Peer) { setLobbyStatus('Sala lista (por relevo). Comparte el código, el link o el QR.'); return; }
  const peer = new Peer(PEER_PREFIX + NET.code, PEER_OPTS);
  NET.peer = peer;
  peer.on('open', () => { setLobbyStatus('Comparte el código, el link o el QR. Si no entra nadie, corres contra la PC.'); renderLobby(); });
  peer.on('connection', (conn) => {
    conn.on('data', (d) => hostOnData(conn, d));
    conn.on('close', () => hostDrop(conn));
    conn.on('error', () => hostDrop(conn));
  });
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') { hostCreate(); return; }
    if (NET.peer === peer) setLobbyStatus('La conexión directa no está disponible; tus amigos entrarán por relevo.');
  });
  peer.on('disconnected', () => { try { if (NET.peer === peer) peer.reconnect(); } catch (e) { /* ignorar */ } });
}
function hostOnData(conn, d) {
  if (!d || typeof d !== 'object') return;
  const c = NET.conns.get(conn.peer);
  if (c) c.lastT = performance.now();
  switch (d.t) {
    case 'hello': {
      if (c) return;
      const cid = String(d.cid || '').slice(0, 24);
      let entry = cid ? NET.lobby.find((p) => p.cid === cid && p.pid !== 'h') : null;
      if (entry) {
        const old = NET.conns.get(entry.pid);
        if (old) { try { old.conn.close(); } catch (e) { /* ignorar */ } NET.conns.delete(entry.pid); }
        entry.pid = conn.peer;
      } else {
        if (NET.lobby.length >= MAX_HUMANS) { try { conn.send({ t: 'full' }); } catch (e) { /* ignorar */ } setTimeout(() => { try { conn.close(); } catch (e) { /* ignorar */ } }, 400); return; }
        entry = { pid: conn.peer, cid };
        NET.lobby.push(entry);
      }
      entry.name = String(d.name || 'Amigo').slice(0, 12);
      entry.look = sanitizeLook(d.look);
      NET.conns.set(conn.peer, { conn, rtt: 0.1, lastT: performance.now() });
      try { conn.send({ t: 'welcome', code: NET.code }); } catch (e) { /* ignorar */ }
      broadcastLobby();
      toast(entry.name + ' entró a la sala');
      SFX.ui();
      // carrera en marcha y ya tenía carro (se le cortó la conexión): vuelve a manejarlo
      if (R.net === 'host' && R.on && !R.ended && cid) {
        const car = R.cars.find((x) => x.cid === cid);
        if (car) {
          Object.assign(car, { remote: true, cpu: false, human: true, pid: conn.peer, buf: [] });
          NET.ack.delete(conn.peer);
          sendStart(conn, car.id, true);
          toast(entry.name + ' vuelve a la carrera');
        }
      }
      break;
    }
    case 'st': {
      if (!c || R.net !== 'host') return;
      const car = R.cars.find((x) => x.remote && x.pid === conn.peer), a = cleanState(d.c);
      if (car && a) pushRemote(car, a);
      break;
    }
    case 'fin': {
      const car = R.net === 'host' ? R.cars.find((x) => x.remote && x.pid === conn.peer) : null;
      if (car && !car.finished && !R.ended) { car.finished = true; car.finT = num(d.time, 0, 3600); car.best = num(d.best, 0, 3600); car.cel = true; R.events.push({ t: 'finish', id: car.id }); }
      break;
    }
    case 'go': if (c && d.mid === NET.mid) NET.ack.add(conn.peer); break;
    case 'needstart':
      if (c && R.net === 'host' && R.on && !R.ended) { const car = R.cars.find((x) => x.pid === conn.peer); if (car) sendStart(conn, car.id, raceT() > 0); }
      break;
    case 'pong': if (c) c.rtt = clamp((performance.now() - d.ts) / 1000, 0, 1); break;
    case 'cping': try { conn.send({ t: 'cpong', ts: d.ts }); } catch (e) { /* ignorar */ } break;
  }
}
function hostDrop(conn) {
  if (!NET.conns.has(conn.peer)) return;
  NET.conns.delete(conn.peer);
  const i = NET.lobby.findIndex((p) => p.pid === conn.peer);
  const p = i >= 0 ? NET.lobby.splice(i, 1)[0] : null;
  const car = R.net === 'host' ? R.cars.find((x) => x.remote && x.pid === conn.peer) : null;
  if (car) { Object.assign(car, { remote: false, cpu: true, human: false, buf: [], started: true, vy: 0 }); car.ai.vk = DIFF[R.diff].v; }
  if (p) toast(p.name + ' salió' + (car && !R.ended ? ': la PC maneja su carro' : ''));
  broadcastLobby();
}
function broadcastLobby() {
  netSendAll({ t: 'lobby', players: NET.lobby.map((p) => ({ n: p.name, l: p.look, h: p.pid === 'h' ? 1 : 0, cid: p.cid })), settings: NET.settings, started: NET.started && R.on && !R.ended, mid: NET.mid });
  renderLobby();
}
function startMsg(slot, resume) {
  const m = { t: 'start', mid: NET.mid, track: R.trackId, laps: R.laps, diff: R.diff, grid: R.cars.map((c) => ({ n: c.name, l: c.look, hu: c.human ? 1 : 0 })), me: slot, cd: R.goAt - R.time };
  if (resume) { const c = R.cars[slot]; m.res = { s: carState(c), half: c.half ? 1 : 0, maxLap: c.maxLap, lapT0: c.lapT0 }; }
  return m;
}
function sendStart(conn, slot, resume) { try { conn.send(startMsg(slot, resume)); } catch (e) { /* ignorar */ } }
function hostStart() {
  const S = NET.settings;
  const humans = NET.lobby.map((p) => ({ name: p.name, look: p.look, human: true, local: p.pid === 'h', remote: p.pid !== 'h', pid: p.pid, cid: p.cid }));
  const total = Math.min(MAX_CARS, Math.max(humans.length, +S.cars || 6));
  const grid = humans.concat(cpuGrid(total - humans.length, (Math.random() * 1e9) | 0));
  for (let i = grid.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [grid[i], grid[j]] = [grid[j], grid[i]]; }
  NET.mid = genCode() + genCode(); NET.started = true; NET.ack = new Set(); NET.startT = 0; NET.snapT = 0;
  GAME.mode = 'online';
  newRace({ mode: 'online', net: 'host', track: trackOf(S.track).id, laps: +S.laps || 3, diff: +S.diff || 0, grid });
  enterRaceUI();
  for (const car of R.cars) if (car.remote) { const cc = NET.conns.get(car.pid); if (cc) sendStart(cc.conn, car.id, false); }
  NET.startT = 1.2;
  broadcastLobby();
}
// ¿la conexión directa está atascada? (mejor saltarse un estado que acumular retraso)
function connBusy(c) { const dc = c.conn && c.conn.dataChannel; return !!(dc && dc.bufferedAmount > 48000); }
function hostTick(dt) {
  NET.snapT += dt; NET.pingT += dt;
  NET.anyRelay = [...NET.conns.values()].some((c) => c.conn.relay);
  if (NET.snapT >= (NET.anyRelay ? 1 / 12 : 1 / 20)) {
    NET.snapT = 0;
    const s = { t: 's', mid: NET.mid, c: R.cars.map(carState), fin: R.cars.filter((c) => c.finished).map((c) => [c.id, Math.round(c.finT * 1000)]) };
    for (const cc of NET.conns.values()) if (cc.conn.open && !connBusy(cc)) { try { cc.conn.send(s); } catch (e) { /* ignorar */ } }
  }
  if (NET.pingT >= 1) { NET.pingT = 0; netSendAll({ t: 'ping', ts: performance.now() }); }
  // el inicio se repite hasta que cada invitado confirma que lo recibió
  NET.startT -= dt;
  if (NET.startT <= 0 && !R.ended) {
    NET.startT = 1.2;
    for (const car of R.cars) if (car.remote && !NET.ack.has(car.pid)) { const cc = NET.conns.get(car.pid); if (cc) sendStart(cc.conn, car.id, raceT() > 0); }
  }
  const humans = R.cars.filter((c) => c.human).length;
  $('#netInfo').textContent = `🌐 Sala ${NET.code} · ${humans} piloto${humans > 1 ? 's' : ''}`;
}
function netSendEnd() {
  netSendAll({ t: 'end', mid: NET.mid, res: R.results.map((r) => ({ id: r.id, time: Math.round(r.time * 1000), best: Math.round((r.best || 0) * 1000), est: r.est ? 1 : 0, dnf: r.dnf ? 1 : 0, place: r.place })) });
  NET.started = false;
  setTimeout(broadcastLobby, 200);
}

// ---------- invitado ----------
// identificador fijo de este dispositivo: si se corta y vuelve, el anfitrión lo reconoce
const CID = (() => { try { let v = localStorage.getItem('dp_cid'); if (!v) { v = Math.random().toString(36).slice(2, 14); localStorage.setItem('dp_cid', v); } return v; } catch (e) { return Math.random().toString(36).slice(2, 14); } })();
const helloMsg = () => ({ t: 'hello', name: SAVE.name, look: SAVE.look, cid: CID });
let askT = 0;
function askStart() { const now = performance.now(); if (now - askT < 1500) return; askT = now; netSend({ t: 'needstart' }); }
function clientJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) { setJoinStatus('Escribe el código de la sala'); return; }
  netReset();
  NET.role = 'client'; NET.code = code;
  setJoinStatus('Conectando…');
  let fellBack = false;
  const fallback = () => {
    if (fellBack || NET.role !== 'client' || NET.code !== code || NET.welcomed) return;
    fellBack = true;
    const peer = NET.peer;
    NET.peer = null;
    if (NET.hostConn && !NET.hostConn.relay) NET.hostConn = null;
    try { if (peer) peer.destroy(); } catch (e) { /* ignorar */ }
    clientRelayJoin(code);
  };
  if (!window.Peer || new URLSearchParams(location.search).has('relevo')) { fallback(); return; }
  const peer = new Peer(PEER_OPTS);
  NET.peer = peer;
  const to = setTimeout(fallback, 7000);
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    NET.hostConn = conn; NET.via = 'directa';
    conn.on('open', () => { clearTimeout(to); conn.send(helloMsg()); setJoinStatus('¡Conectado!'); });
    conn.on('data', (d) => { NET.lastHostMsg = performance.now(); clientOnData(d); });
    conn.on('close', () => { if (NET.peer === peer && NET.hostConn === conn) { if (NET.welcomed) clientReconnect(); else fallback(); } });
    conn.on('error', fallback);
    setTimeout(() => {
      const pc = conn.peerConnection;
      if (pc) pc.addEventListener('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed') fallback(); });
    }, 0);
  });
  peer.on('error', () => { clearTimeout(to); fallback(); });
}
function clientOnData(d) {
  if (!d || typeof d !== 'object') return;
  NET.lastHostMsg = performance.now();
  switch (d.t) {
    case 'welcome': NET.code = String(d.code || NET.code); NET.welcomed = true; if (GAME.mode === 'menu') showScreen('scrLobby'); renderLobby(); break;
    case 'hostbye': if (NET.role === 'client') { toast('El anfitrión cerró la sala'); leaveToMenu(); } break;
    case 'full': setJoinStatus('La sala ya está llena (6 pilotos)'); break;
    case 'lobby': {
      NET.lobby = (Array.isArray(d.players) ? d.players : []).slice(0, MAX_HUMANS).map((p) => ({ pid: p.h ? 'h' : 'g', name: String(p.n || 'Piloto').slice(0, 12), look: sanitizeLook(p.l), cid: String(p.cid || '') }));
      const s = d.settings || {};
      const prevTrack = NET.settings.track;
      NET.settings = { track: trackOf(s.track).id, laps: clamp(s.laps | 0, 1, 9), cars: clamp(s.cars | 0, 2, MAX_CARS), diff: clamp(s.diff | 0, 0, 2) };
      NET.started = !!d.started;
      if (GAME.mode === 'menu' && prevTrack !== NET.settings.track && GAME.screen === 'scrLobby') { SAVE.track = NET.settings.track; startDemo(); }
      renderLobby();
      if (d.started && d.mid && !(R.net === 'client' && CL.mid === d.mid && R.on)) askStart();
      break;
    }
    case 'start': clientStart(d); break;
    case 's':
      if (R.net === 'client' && d.mid === CL.mid) clientSnap(d);
      else askStart();
      break;
    case 'end': if (R.net === 'client' && d.mid === CL.mid) clientEnd(d); break;
    case 'ping': netSend({ t: 'pong', ts: d.ts }); break;
    case 'cpong': NET.rtt = damp(NET.rtt, clamp((performance.now() - d.ts) / 1000, 0, 1), 3, 1); break;
    case 'tolobby': if (R.net === 'client') backToLobby(); break;
  }
}
function clientStart(d) {
  if (!Array.isArray(d.grid) || !d.grid.length || d.grid.length > MAX_CARS) return;
  const me = clamp(d.me | 0, 0, d.grid.length - 1);
  if (!(R.net === 'client' && CL.mid === d.mid && R.on && !R.ended)) {
    const grid = d.grid.map((g, i) => ({ name: String((g && g.n) || 'Piloto').slice(0, 12), look: sanitizeLook(g && g.l), human: !!(g && g.hu), local: i === me, remote: i !== me }));
    GAME.mode = 'online';
    newRace({ mode: 'online', net: 'client', track: trackOf(d.track).id, laps: clamp(d.laps | 0, 1, 9), diff: clamp(d.diff | 0, 0, 2), grid, goIn: num(d.cd, -3600, 10) - NET.rtt / 2 });
    CL.mid = d.mid; CL.finSent = 0; CL.finT = 0;
    if (d.res && d.res.s) resumeCar(R.cars[me], d.res);
    enterRaceUI();
  }
  netSend({ t: 'go', mid: d.mid });
}
function resumeCar(c, r) {
  const a = cleanState(r.s);
  if (!a) return;
  Object.assign(c, { x: a[0] / 20, y: a[1] / 50, z: a[2] / 20, h: a[3] / 1000, vF: a[4] / 10, lap: a[7] | 0, best: a[9] / 100, half: !!r.half, lapT0: num(r.lapT0, -3600, 3600), started: true, ghostT: 1.5 });
  c.maxLap = Math.max(c.lap, num(r.maxLap, 0, 99) | 0);
  c.vx = Math.sin(c.h) * c.vF; c.vz = Math.cos(c.h) * c.vF;
  c.along = locate(c, true);
  c.prog = c.lap * TR.L + c.along;
  camSnapBehind(c);
}
function clientSnap(s) {
  if (!Array.isArray(s.c)) return;
  s.c.forEach((raw, i) => { const c = R.cars[i], a = cleanState(raw); if (c && c.remote && a) pushRemote(c, a); });
  if (Array.isArray(s.fin)) for (const f of s.fin) { const c = Array.isArray(f) ? R.cars[f[0] | 0] : null; if (c && c.remote) { c.finished = true; c.finT = num(f[1], 0, 3.6e6) / 1000; } }
  $('#netInfo').textContent = `🌐 Sala ${NET.code} · ${NET.via === 'relevo' ? 'por relevo' : 'conexión directa'}`;
}
function clientTick(dt) {
  const me = R.cars[R.me];
  if (!me) return;
  NET.sendT += dt;
  if (NET.sendT >= (NET.via === 'relevo' ? 1 / 15 : 1 / 20)) { NET.sendT = 0; netSend({ t: 'st', c: carState(me) }); }
  if (me.finished && CL.finSent < 5) { CL.finT -= dt; if (CL.finT <= 0) { CL.finT = 0.8; CL.finSent++; netSendFin(); } }
}
function netSendFin() { const me = R.cars[R.me]; if (me && me.finished && R.net === 'client') netSend({ t: 'fin', time: me.finT, best: me.best }); }
function clientEnd(d) {
  if (!Array.isArray(d.res) || R.ended) return;
  R.results = d.res.filter((r) => R.cars[r.id | 0]).map((r) => {
    const c = R.cars[r.id | 0];
    return { id: c.id, name: c.name, look: c.look, human: c.human, time: num(r.time, 0, 3.6e6) / 1000, best: num(r.best, 0, 3.6e6) / 1000, est: !!r.est, dnf: !!r.dnf, place: num(r.place, 1, MAX_CARS) | 0 };
  }).sort((a, b) => a.place - b.place);
  R.ended = true; R.phase = 'done';
  showEndScreen();
}
function backToLobby() {
  GAME.mode = 'menu'; GAME.paused = false;
  $('#hud').classList.remove('on');
  $('#touchUI').classList.remove('on');
  $('#speedFx').style.opacity = 0;
  startDemo();
  if (NET.role !== 'off') { showScreen('scrLobby'); renderLobby(); } else showScreen('scrMenu');
}

// ---------- sala ----------
function setLobbyStatus(s) { $('#lStatus').textContent = s; }
function setJoinStatus(s) { $('#jStatus').textContent = s; }
function renderLobby() {
  $('#lCode').textContent = NET.code || '-----';
  $('#lLink').value = NET.code ? linkFor(NET.code) : '';
  const qrBox = $('#lQr');
  if (NET.code && window.qrcode && qrBox.dataset.code !== NET.code) {
    try { const q = window.qrcode(0, 'M'); q.addData(linkFor(NET.code)); q.make(); qrBox.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); qrBox.dataset.code = NET.code; } catch (e) { /* sin QR */ }
  }
  const host = NET.role === 'host', S = NET.settings;
  $('#qrRow').style.display = NET.code && host ? '' : 'none';
  const total = Math.min(MAX_CARS, Math.max(NET.lobby.length, +S.cars || 6));
  let html = NET.lobby.map((p) => {
    const me = host ? p.pid === 'h' : p.cid === CID;
    return `<div class="pl"><i style="background:${escapeHtml(p.look.paint)}"></i>${escapeHtml(p.name)}${me ? ' <em>(tú)</em>' : ''}${p.pid === 'h' ? ' <em>👑</em>' : ''}<em style="margin-left:auto">${modelOf(p.look.model).name}</em></div>`;
  }).join('');
  for (let i = NET.lobby.length; i < total; i++) html += '<div class="pl cpu"><i style="background:#c3c9da"></i>🤖 PC</div>';
  if (NET.lobby.length < MAX_HUMANS) html += '<div class="pl cpu"><em>Esperando a tus amigos… (hasta 6)</em></div>';
  $('#lPlayers').innerHTML = html;
  renderTrackPicker($('#lTracks'), S.track, host ? pickLobbyTrack : null);
  $('#lHostOpts').style.display = host ? '' : 'none';
  const T = trackOf(S.track);
  $('#lGuestInfo').textContent = host ? '' : `${T.emoji} ${T.name} · ${S.laps} vuelta${S.laps > 1 ? 's' : ''} · ${total} carros · PC ${DIFF[S.diff].name.toLowerCase()}`;
  $('#bStart').style.display = host ? '' : 'none';
  $('#bStart').textContent = NET.lobby.length > 1 ? `¡Empezar carrera! (${NET.lobby.length} pilotos)` : 'Empezar contra la PC';
  $$('[data-lopt]').forEach((row) => {
    const k = row.dataset.lopt;
    row.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', c.dataset.v === String(S[k])));
  });
  if (!host) setLobbyStatus(NET.started ? 'Carrera en marcha: entrando…' : `Esperando a que el anfitrión empiece… · ${NET.via === 'relevo' ? 'conectado por relevo' : 'conexión directa'}`);
}
function pickLobbyTrack(id) {
  if (NET.role !== 'host') return;
  NET.settings.track = id; SAVE.track = id; storeSave(); SFX.ui();
  if (GAME.mode === 'menu') startDemo();
  broadcastLobby();
}
$('#bHost').onclick = () => { SFX.resume(); SFX.ui(); hostCreate(); };
$('#bJoin').onclick = () => { SFX.resume(); clientJoin($('#jCode').value); };
$('#jCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') clientJoin($('#jCode').value); });
$('#bStart').onclick = () => { SFX.resume(); if (NET.role === 'host') hostStart(); };
$('#bLeave').onclick = () => { SFX.ui(); leaveToMenu(); };
$('#bCopy').onclick = () => {
  const v = $('#lLink').value;
  const ok = () => toast('Link copiado: pásaselo a tus amigos');
  if (navigator.clipboard) navigator.clipboard.writeText(v).then(ok).catch(() => { $('#lLink').select(); document.execCommand('copy'); ok(); });
  else { $('#lLink').select(); document.execCommand('copy'); ok(); }
};
$$('[data-lopt]').forEach((row) => row.addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c || NET.role !== 'host') return;
  const k = row.dataset.lopt, v = c.dataset.v;
  NET.settings[k] = isNaN(+v) ? v : +v;
  if (k === 'laps') SAVE.laps = +v;
  if (k === 'diff') SAVE.diff = +v;
  storeSave(); SFX.ui();
  broadcastLobby();
}));

// =========================================================
//  CALIDAD Y BUCLE PRINCIPAL
// =========================================================
const QUALITY = {
  alta: { name: 'Alta', pr: 2, sh: 2048, shadows: true, outlines: true, parts: 1 },
  media: { name: 'Media', pr: 1.25, sh: 1024, shadows: true, outlines: true, parts: 0.7 },
  baja: { name: 'Baja', pr: 1, sh: 512, shadows: false, outlines: false, parts: 0.45 },
};
const Q_ORDER = ['auto', 'alta', 'media', 'baja'];
let QL = '';
const qualityPref = () => SAVE.quality || 'auto';
function applyQuality(name) {
  const q = QUALITY[name];
  if (!q) return;
  QL = name;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
  onResize();
  if (sun.shadow.mapSize.x !== q.sh) { sun.shadow.mapSize.set(q.sh, q.sh); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    for (const sc of [scene, garage]) sc.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  }
  OUTLINES = q.outlines;
  for (const sc of [scene, garage]) sc.traverse((o) => { if (o.userData.ol) o.visible = OUTLINES; });
  PART_SCALE = q.parts;
  syncQualityBtn();
}
function startQuality() { const p = qualityPref(); applyQuality(p === 'auto' ? SAVE.autoQ || (IS_TOUCH ? 'media' : 'alta') : p); }
const FPSM = { t: 0, f: 0, low: 0 };
function autoQuality(rawDt) {
  if (qualityPref() !== 'auto' || GAME.mode === 'menu' || document.hidden || GAME.paused || rawDt > 0.4) { FPSM.t = 0; FPSM.f = 0; return; }
  FPSM.t += rawDt; FPSM.f++;
  if (FPSM.t < 2.5) return;
  const fps = FPSM.f / FPSM.t;
  FPSM.t = 0; FPSM.f = 0;
  if (fps >= 45) { FPSM.low = 0; return; }
  if (++FPSM.low < 2) return;
  FPSM.low = 0;
  const next = QL === 'alta' ? 'media' : QL === 'media' ? 'baja' : null;
  if (!next) return;
  SAVE.autoQ = next; storeSave();
  applyQuality(next);
  toast('⚙️ Calidad ajustada a ' + QUALITY[next].name + ' para que el juego vaya más fluido', 3000);
}
function syncQualityBtn() {
  const p = qualityPref();
  $('#bQuality').textContent = '⚙️ Calidad: ' + (p === 'auto' ? 'Automática (' + (QUALITY[QL] ? QUALITY[QL].name : '…') + ')' : QUALITY[p].name);
}
$('#bQuality').onclick = () => {
  const p = qualityPref();
  SAVE.quality = Q_ORDER[(Q_ORDER.indexOf(p) + 1) % Q_ORDER.length];
  if (SAVE.quality === 'auto') SAVE.autoQ = null;
  storeSave(); startQuality(); SFX.ui();
};

let last = performance.now(), acc = 0, lastRaf = 0, lastWk = 0;
function simAdvance(dt) {
  if (GAME.paused && R.mode !== 'online') { R.events.length = 0; return; }
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 6) { simStep(STEP); acc -= STEP; n++; }
  if (n >= 6) acc = 0;
  for (const e of R.events.splice(0)) handleEvent(e);
  if (R.net === 'host') hostTick(dt);
}
// con la pestaña oculta el navegador frena requestAnimationFrame:
// un worker mantiene viva la carrera del anfitrión para sus amigos
try {
  const wk = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),16)'], { type: 'text/javascript' })));
  wk.onmessage = () => {
    const now = performance.now();
    if (now - lastRaf < 250) { lastWk = now; return; }
    const dt = Math.min(0.12, (now - lastWk) / 1000);
    lastWk = now;
    if (R.on && R.net === 'host') { updateRemotes(now / 1000); simAdvance(dt); }
  };
} catch (e) { /* sin worker: solo funciona con la pestaña visible */ }
function frame(now) {
  requestAnimationFrame(frame);
  lastRaf = performance.now();
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, Math.max(0, rawDt));
  last = now;
  autoQuality(rawDt);
  if (GAME.screen === 'scrCustom') { SFX.engine(false, 0, 0, 0, 0, 0); renderGarage(dt); return; }
  if (R.on) {
    readInput();
    if (R.net !== 'off') updateRemotes(performance.now() / 1000);
    simAdvance(dt);
    if (R.net === 'client') clientTick(dt);
    renderCars(dt);
    if (GAME.mode !== 'menu' && GAME.screen !== 'scrEnd') updateHud(dt);
  }
  updateCamera(dt);
  updateWorld(dt, now / 1000);
  SPARKS.update(dt); SMOKE.update(dt); CONF.update(dt);
  engineSound(dt);
  renderer.render(scene, camera);
}
// para probar: window.__DP.ff(segundos) adelanta la simulación
window.__DP = {
  R, NET, LOCAL, SAVE, get TR() { return TR; },
  ff(s) { for (let i = 0; i < s * 60; i++) simStep(STEP); for (const e of R.events.splice(0)) handleEvent(e); },
  step(n) { const ev = []; for (let i = 0; i < n; i++) { simStep(STEP); for (const e of R.events.splice(0)) ev.push(e); } return ev; },
  startRace, hostStart, trackPoint,
};

// ---------- arranque ----------
if (IS_TOUCH) document.body.classList.add('touch');
applyTouchPrefs();
startQuality();
syncPauseBtns();
startDemo();
showScreen('scrMenu');
{
  const sala = new URLSearchParams(location.search).get('sala');
  if (sala) { showScreen('scrJoin'); $('#jCode').value = sala.toUpperCase(); setTimeout(() => clientJoin(sala), 300); }
}
requestAnimationFrame(frame);
