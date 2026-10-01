import type {
  AmbienceFrame,
  AmbientSoundHandle,
  HatchPhase,
  AmbienceGiftSound,
  SnakePaintOptions,
} from '../engine/types-api.ts';
import type { Point, Weather } from '../engine/types.ts';

type RGB = [number, number, number];
type RidgeFn = (x: number) => number;
type GroundPainterFn = (g: CanvasRenderingContext2D, ridge: RidgeFn, k: number) => void;

interface Puddle {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

interface LightKey {
  readonly t: number;
  readonly name: string;
  readonly top: RGB;
  readonly mid: RGB;
  readonly bottom: RGB;
  readonly glow: RGB;
  readonly glowAlpha: number;
  readonly glowX: number;
  readonly glowY: number;
  readonly glowRadius: number;
  readonly ray: RGB;
  readonly rayAlpha: number;
  readonly rayX: number;
  readonly pt: RGB;
  readonly ptA: number;
  readonly ptR: number;
  readonly ptHalo: number;
  readonly veil: RGB;
  readonly veilAlpha: number;
  readonly vignette: number;
}

interface AmbienceState {
  name: string;
  top: RGB;
  mid: RGB;
  bottom: RGB;
  glow: RGB;
  glowAlpha: number;
  glowX: number;
  glowY: number;
  glowRadius: number;
  ray: RGB;
  rayAlpha: number;
  rayX: number;
  pt: RGB;
  ptA: number;
  ptR: number;
  ptHalo: number;
  veil: RGB;
  veilAlpha: number;
  vignette: number;
}

interface WeatherSpec {
  readonly tint: RGB;
  readonly k: number;
  readonly pt?: number;
  readonly glow?: number;
}

interface GroundSpec {
  readonly tones: readonly [
    readonly [string, string],
    readonly [string, string],
    readonly [string, string],
  ];
  readonly rim: string;
  readonly rimAlpha?: number;
  readonly wind?: number;
  puddles?: Puddle[];
  readonly before?: GroundPainterFn;
  readonly after?: GroundPainterFn;
  readonly glow?: GroundPainterFn;
}

interface GroundLayerObj {
  before: HTMLCanvasElement | null;
  body: HTMLCanvasElement;
  glow: HTMLCanvasElement | null;
}

interface TintEntry {
  c: HTMLCanvasElement;
  key: string;
}

function getCtx(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (g === null) throw new Error('canvas 2d unavailable');
  return g;
}

// Forest Rain Ambience (v3): figurative foliage outside the grid, soft surface inside, slow rain in two depth layers.
// The surface frame must track the board ring exactly (the HUD ring); otherwise the surface and
// its border drift away from the ring. Ring: X0-14 to X0+COLS*CELL+14 = 150..930,
// Y0-14 to Y0+ROWS*CELL+14 = 264..1232. Hard-coded here because this module ignores the base
// geometry; update these values if the board scale changes.
let W = 1080,
  H = 1920,
  GX0 = 150,
  GX1 = 930,
  GY0 = 264,
  GY1 = 1232;
// The frame follows the game format (portrait 9:16 or landscape 16:9): re-read each frame; if it
// changes, all size-dependent pre-renders are discarded and rebuilt.
function setFrame(e: AmbienceFrame): void {
  if (e.W === 0 || (e.W === W && e.H === H && e.x0 - 14 === GX0)) return;
  W = e.W;
  H = e.H;
  GX0 = e.x0 - 14;
  GX1 = e.x0 + e.cols * e.cell + 14;
  GY0 = e.y0 - 14;
  GY1 = e.y0 + e.rows * e.cell + 14;
  snowdriftImg = null;
  groundsImg = {};
  rayWhite = null;
  rayTinted = null;
  rayCacheKey = '';
  canopy = null;
  halo = null;
  dropTemplate = null;
  tintCache = {};
  skyCanvas = null;
  skyCacheKey = '';
  vignette = null;
  vignetteCacheKey = -1;
  grainPattern = null;
}

function pinkNoise(ac: AudioContext, duration: number): AudioBuffer {
  const sr = ac.sampleRate,
    n = Math.ceil(sr * duration),
    buf = ac.createBuffer(1, n, sr),
    d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
  }
  return buf;
}

// Foliage and grain pre-rendered once.
function paintFrond(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  span: number,
  color: string,
): void {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(span * 0.5, -span * 0.12, span, 0);
  g.stroke();
  for (let i = 1; i < 12; i++) {
    const u = i / 12,
      px = span * u,
      py = -span * 0.12 * 4 * u * (1 - u) * 0.5,
      l = span * 0.22 * (1 - u * 0.7);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(px + l * 0.35, py + s * l * 0.45, l * 0.55, l * 0.16, s * 0.9, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}
// ---- Day cycle: four distinct lighting states in the same forest. --------------------------
// Same green, four lights. Each key holds its own sky, light source, and floating particles.
function lerpColor(a: RGB, c: RGB, k: number): RGB {
  return [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k];
}
function rgb(c: RGB): string {
  return `rgb(${String(Math.round(c[0]))},${String(Math.round(c[1]))},${String(Math.round(c[2]))})`;
}
function rgba(c: RGB, a: number): string {
  return `rgba(${String(Math.round(c[0]))},${String(Math.round(c[1]))},${String(Math.round(c[2]))},${String(a)})`;
}
function rand(i: number, d: number): number {
  const v = Math.sin(i * 12.9898 + d * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

const KEYS: readonly LightKey[] = [
  {
    t: 0.0,
    name: 'night',
    top: [14, 26, 23],
    mid: [10, 17, 15],
    bottom: [6, 10, 9],
    glow: [64, 104, 96],
    glowAlpha: 0.12,
    glowX: 0.5,
    glowY: 0.4,
    glowRadius: 0.64,
    ray: [150, 186, 196],
    rayAlpha: 0.03,
    rayX: 0.52,
    pt: [214, 232, 176],
    ptA: 0.7,
    ptR: 1.0,
    ptHalo: 1.0,
    veil: [30, 52, 64],
    veilAlpha: 0.1,
    vignette: 0.6,
  },
  {
    t: 0.22,
    name: 'dawn',
    top: [56, 54, 52],
    mid: [32, 46, 38],
    bottom: [13, 23, 18],
    glow: [226, 150, 104],
    glowAlpha: 0.2,
    glowX: 0.16,
    glowY: 0.52,
    glowRadius: 0.74,
    ray: [248, 196, 142],
    rayAlpha: 0.075,
    rayX: 0.18,
    pt: [248, 224, 182],
    ptA: 0.34,
    ptR: 0.8,
    ptHalo: 0.55,
    veil: [178, 138, 110],
    veilAlpha: 0.055,
    vignette: 0.54,
  },
  {
    t: 0.5,
    name: 'day',
    top: [58, 86, 64],
    mid: [36, 58, 42],
    bottom: [17, 30, 22],
    glow: [186, 214, 150],
    glowAlpha: 0.17,
    glowX: 0.5,
    glowY: 0.14,
    glowRadius: 0.82,
    ray: [226, 240, 198],
    rayAlpha: 0.05,
    rayX: 0.5,
    pt: [240, 246, 214],
    ptA: 0.2,
    ptR: 0.62,
    ptHalo: 0.3,
    veil: [130, 164, 124],
    veilAlpha: 0.05,
    vignette: 0.46,
  },
  {
    t: 0.78,
    name: 'dusk',
    top: [70, 50, 40],
    mid: [40, 44, 33],
    bottom: [14, 22, 17],
    glow: [238, 132, 74],
    glowAlpha: 0.2,
    glowX: 0.86,
    glowY: 0.56,
    glowRadius: 0.72,
    ray: [250, 176, 110],
    rayAlpha: 0.085,
    rayX: 0.84,
    pt: [250, 206, 150],
    ptA: 0.4,
    ptR: 0.86,
    ptHalo: 0.7,
    veil: [186, 112, 76],
    veilAlpha: 0.065,
    vignette: 0.54,
  },
];

// Forest weather variants. Same forest, same snakes, same UI: only the background tint and falling
// particles change per weather.
let weather: Weather = 'rain',
  previousWeather: Weather = 'rain',
  weatherStartTime = -99,
  weatherMix = 1;
const WEATHERS: Record<Weather, WeatherSpec | null> = {
  rain: null,
  snow: { tint: [132, 160, 190], k: 0.34 },
  autumn: { tint: [104, 60, 30], k: 0.27 },
  summer: { tint: [112, 128, 44], k: 0.22, pt: 2.2, glow: 1.6 },
  spring: { tint: [132, 150, 120], k: 0.2, glow: 1.3 },
  storm: { tint: [16, 20, 38], k: 0.5 },
  stars: { tint: [8, 14, 44], k: 0.42 },
  aurora: { tint: [6, 20, 40], k: 0.46 },
  fireflies: { tint: [10, 30, 22], k: 0.4, pt: 1.4 },
  embers: { tint: [70, 22, 14], k: 0.42 },
  mist: { tint: [120, 132, 130], k: 0.3 },
  sea: { tint: [40, 118, 148], k: 0.24, glow: 1.4 },
};
// Weight of a weather at the current frame: 1 when fully settled, 0..1 during the 3.5 s crossfade.
// Everything drawn multiplies by this weight so nothing snaps in.
function weight(m: string): number {
  return (
    (m === weather ? weatherMix : 0) +
    (m === previousWeather && previousWeather !== weather ? 1 - weatherMix : 0)
  );
}
const rainFactor = () => weight('rain') + 1.7 * weight('storm');
// Winter snowdrift, painted once: three snow layers each with gradient, shadow cast on the layer behind,
// cold-light rim on the crest, and fine grain. At render time: a single drawImage.
const SNOWDRIFT_H = 340;
const RIDGES: readonly [RidgeFn, RidgeFn, RidgeFn] = [
  (x: number) => 214 + 34 * Math.sin(x * 0.0041 + 0.6) + 14 * Math.sin(x * 0.013 + 2.0),
  (x: number) => 162 + 30 * Math.sin(x * 0.0052 + 2.4) + 12 * Math.sin(x * 0.017),
  (x: number) => 112 + 28 * Math.sin(x * 0.0046 + 4.1) + 10 * Math.sin(x * 0.02 + 1.0),
];
function ridgeAt(k: number): RidgeFn {
  return RIDGES[k] ?? (() => 0);
}
let snowdriftImg: HTMLCanvasElement | null = null;
function snowdrift(): HTMLCanvasElement {
  if (snowdriftImg) return snowdriftImg;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = SNOWDRIFT_H;
  const g = getCtx(c);
  const TONS: readonly [string, string][] = [
    ['#8fa3bd', '#5f7593'],
    ['#c2d2e6', '#8197b5'],
    ['#f6faff', '#aec2dc'],
  ];
  RIDGES.forEach((ridge, k) => {
    const trace = (dy: number): void => {
      g.beginPath();
      g.moveTo(-20, SNOWDRIFT_H + 20);
      for (let x = -20; x <= W + 20; x += 8) g.lineTo(x, SNOWDRIFT_H - ridge(x) + dy);
      g.lineTo(W + 20, SNOWDRIFT_H + 20);
      g.closePath();
    };
    // Shadow this layer casts on the one behind it.
    g.save();
    g.shadowColor = 'rgba(14,30,58,0.55)';
    g.shadowBlur = 30;
    g.shadowOffsetY = -8;
    g.fillStyle = 'rgba(14,30,58,0.35)';
    trace(6);
    g.fill();
    g.restore();
    const lg = g.createLinearGradient(0, SNOWDRIFT_H - 250, 0, SNOWDRIFT_H);
    const [ton0, ton1] = TONS[k] ?? ['#000', '#000'];
    lg.addColorStop(0, ton0);
    lg.addColorStop(1, ton1);
    g.fillStyle = lg;
    trace(0);
    g.fill();
    // Cold-light rim on the crest.
    g.save();
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 10;
    g.strokeStyle = `rgba(255,255,255,${String(0.35 + 0.25 * k)})`;
    g.lineWidth = 2.5;
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 8) {
      const y = SNOWDRIFT_H - ridge(x) + 1.5;
      if (x === -20) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
    // Snow grain: bright sparkles and blue-tinted dips, below the crest only.
    for (let i = 0; i < 260; i++) {
      const x = rand(i, 601 + k) * W,
        top = SNOWDRIFT_H - ridge(x),
        y = top + 6 + rand(i, 611 + k) * (SNOWDRIFT_H - top - 6);
      g.fillStyle = i % 3 ? 'rgba(255,255,255,0.22)' : 'rgba(70,100,150,0.14)';
      g.beginPath();
      g.arc(x, y, 0.8 + rand(i, 621 + k) * 1.6, 0, Math.PI * 2);
      g.fill();
    }
  });
  snowdriftImg = c;
  return c;
}

// Season ground layers, same recipe as the snowdrift: three layers each painted once in two images,
// what sticks above the crest (grass, ferns, pines, reeds: "before") and the hill body (shadow,
// gradient, rim, decoration). At render time, "before" is redrawn in tilted slices so the wind animates it.
function paintLeaf(g: CanvasRenderingContext2D, T: number, tone: string): void {
  g.fillStyle = tone;
  g.beginPath();
  g.moveTo(-T, 0);
  g.quadraticCurveTo(-T * 0.1, -T * 0.72, T, 0);
  g.quadraticCurveTo(-T * 0.1, T * 0.72, -T, 0);
  g.fill();
  g.strokeStyle = 'rgba(40,20,8,0.38)';
  g.lineWidth = Math.max(0.8, T * 0.08);
  g.beginPath();
  g.moveTo(-T * 0.85, 0);
  g.lineTo(T * 0.9, 0);
  g.stroke();
}
function paintBlades(
  g: CanvasRenderingContext2D,
  ridge: RidgeFn,
  k: number,
  rootColor: string,
  tipColor: string,
  hmax: number,
  step: number,
  seed: number,
): void {
  let i = 0;
  for (let x = -10; x < W + 10; x += step * (0.5 + rand(i, seed)), i++) {
    const top = SNOWDRIFT_H - ridge(x),
      h = hmax * (0.3 + 0.7 * rand(i, seed + 1)) * (0.6 + 0.2 * k),
      lean = (rand(i, seed + 2) - 0.5) * h * 0.7,
      w = 1.6 + 1.6 * rand(i, seed + 3);
    const lg = g.createLinearGradient(0, top + 6, 0, top - h);
    lg.addColorStop(0, rootColor);
    lg.addColorStop(1, tipColor);
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x - w, top + 8);
    g.quadraticCurveTo(x + lean * 0.25, top - h * 0.6, x + lean, top - h);
    g.quadraticCurveTo(x + lean * 0.45 + w, top - h * 0.5, x + w, top + 8);
    g.closePath();
    g.fill();
  }
}
function paintPines(g: CanvasRenderingContext2D, ridge: RidgeFn, k: number, color: string): void {
  if (k > 1) return;
  let i = 0;
  for (let x = 20; x < W; x += 60 + 90 * rand(i, 701 + k), i++) {
    const hT = (70 + 90 * rand(i, 703 + k)) * (0.6 + 0.3 * k),
      base = SNOWDRIFT_H - ridge(x) + 10;
    g.fillStyle = color;
    for (let j = 0; j < 3; j++) {
      const y1 = base - hT * j * 0.27,
        l = hT * 0.3 * (1 - j * 0.24),
        y0 = y1 - hT * 0.48;
      g.beginPath();
      g.moveTo(x - l, y1);
      g.lineTo(x, y0);
      g.lineTo(x + l, y1);
      g.closePath();
      g.fill();
    }
  }
}
function paintFlower(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rr: number,
  tone: string,
): void {
  g.fillStyle = tone;
  for (let q = 0; q < 5; q++) {
    g.beginPath();
    g.arc(x + Math.cos(q * 1.2566) * rr, y + Math.sin(q * 1.2566) * rr, rr * 0.78, 0, 6.2832);
    g.fill();
  }
  g.fillStyle = '#f2b530';
  g.beginPath();
  g.arc(x, y, rr * 0.6, 0, 6.2832);
  g.fill();
}
const FLOWER_TONES = ['#ffffff', '#f7b6c8', '#ffe27a', '#d2c2ff'];
// Ember crack network: veins that wander and branch while thinning. Drawn twice with the same random
// draws: dark groove in the body, live lava in the pulsing glow image.
const GROUNDS: Record<string, GroundSpec> = {
  rain: {
    tones: [
      ['#1c3026', '#0e1a14'],
      ['#264234', '#12221a'],
      ['#34583f', '#182c20'],
    ],
    rim: '190,230,200',
    rimAlpha: 0.7,
    wind: 0.07,
    before(g, ridge, k) {
      paintBlades(
        g,
        ridge,
        k,
        ['#12221a', '#182c20', '#20382a'][k] ?? '#000',
        ['#264234', '#34583f', '#4a7a56'][k] ?? '#000',
        20,
        7,
        801 + k * 5,
      );
      if (k === 0) return;
      let i = 0;
      for (let x = 40; x < W; x += 90 + 120 * rand(i, 811 + k), i++) {
        const top = SNOWDRIFT_H - ridge(x),
          color = ['', '#1e3a2a', '#2c5238'][k] ?? '',
          ech = 0.42 + 0.14 * k;
        for (let q = 0; q < 4; q++) {
          const side = q % 2 ? 1 : -1,
            ang = -Math.PI / 2 + side * (0.35 + 0.55 * rand(i * 4 + q, 813 + k));
          g.save();
          g.translate(x, top + 8);
          g.scale(ech, ech);
          paintFrond(g, 0, 0, ang, 150 + 110 * rand(i * 4 + q, 815 + k), color);
          g.restore();
        }
      }
    },
  },
  // The seashore: bare dunes at the back, the beach in front, shells and a starfish left by the
  // tide. The sea itself lies behind, painted with the front layers (paintSea).
  sea: {
    tones: [
      ['#a8946c', '#6d5d45'],
      ['#c4aa7c', '#8a7352'],
      ['#e6cf9c', '#ad9066'],
    ],
    rim: '255,248,226',
    rimAlpha: 0.9,
    wind: 0.09,
    after(g, ridge, k) {
      if (k !== 2) return;
      // Pebbles, shells and one or two starfish, half sunk in the wet sand.
      for (let i = 0; i < 70; i++) {
        const x = rand(i, 911) * W,
          y = SNOWDRIFT_H - ridge(x) + 18 + rand(i, 913) * 150,
          s = 4 + rand(i, 915) * 7,
          kind = rand(i, 917);
        g.save();
        g.translate(x, y);
        g.rotate(rand(i, 919) * 6.28);
        if (kind < 0.55) {
          g.fillStyle = ['#8d8474', '#a79c88', '#6f6a5e'][i % 3] ?? '#888';
          g.beginPath();
          g.ellipse(0, 0, s, s * 0.65, 0, 0, Math.PI * 2);
          g.fill();
        } else if (kind < 0.93) {
          // A scallop: a fan with ribs.
          g.fillStyle = ['#f2e4cf', '#efd2c0', '#e8dcc8'][i % 3] ?? '#eee';
          g.beginPath();
          g.moveTo(0, s * 0.9);
          g.arc(0, 0, s * 1.3, Math.PI * 1.1, Math.PI * 1.9);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(150,120,100,0.45)';
          g.lineWidth = 0.8;
          for (let r = -2; r <= 2; r++) {
            g.beginPath();
            g.moveTo(0, s * 0.9);
            g.lineTo(Math.sin(r * 0.3) * s * 1.2, -s * 0.9);
            g.stroke();
          }
        } else {
          // A starfish.
          g.fillStyle = '#d9864a';
          g.strokeStyle = 'rgba(120,56,24,0.6)';
          g.lineWidth = 1.2;
          g.beginPath();
          for (let p = 0; p < 10; p++) {
            const a = (p / 10) * Math.PI * 2,
              rr = p % 2 ? s * 0.8 : s * 2.4;
            if (p) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          g.closePath();
          g.fill();
          g.stroke();
        }
        g.restore();
      }
    },
  },
  autumn: {
    tones: [
      ['#5a3420', '#2e1a10'],
      ['#8a4a22', '#4a2814'],
      ['#b8702c', '#6a3a18'],
    ],
    rim: '255,206,130',
    after(g, ridge, k) {
      const PAL: string[] =
        [
          ['#6a3c20', '#4e2a16', '#7a4a24'],
          ['#9a5426', '#7c3e1c', '#b07030'],
          ['#c8822e', '#a04e22', '#d8a446', '#8a3a1c'],
        ][k] ?? [];
      for (let i = 0; i < 260; i++) {
        const x = rand(i, 711 + k) * W,
          top = SNOWDRIFT_H - ridge(x),
          y = top - 6 + Math.pow(rand(i, 713 + k), 1.6) * (SNOWDRIFT_H - top);
        g.save();
        g.translate(x, y);
        g.rotate(rand(i, 715 + k) * 6.28);
        g.scale(1, 0.55 + 0.45 * rand(i, 717 + k));
        paintLeaf(g, (7 + 9 * rand(i, 719 + k)) * (0.7 + 0.25 * k), PAL[i % PAL.length] ?? '#000');
        g.restore();
      }
    },
  },
  spring: {
    tones: [
      ['#3f6a48', '#25432f'],
      ['#5c8f55', '#35603c'],
      ['#86b868', '#4d7c46'],
    ],
    rim: '235,255,200',
    wind: 0.1,
    before(g, ridge, k) {
      paintBlades(
        g,
        ridge,
        k,
        ['#35603c', '#4d7c46', '#6a9c56'][k] ?? '#000',
        ['#5c8f55', '#86b868', '#b4dc88'][k] ?? '#000',
        34,
        7,
        721 + k * 5,
      );
      for (let i = 0; i < 18 * k; i++) {
        const x = rand(i, 731 + k) * W,
          top = SNOWDRIFT_H - ridge(x),
          y = top - 8 - rand(i, 733 + k) * 24;
        g.strokeStyle = '#4d7c46';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x, top + 6);
        g.lineTo(x, y);
        g.stroke();
        paintFlower(
          g,
          x,
          y,
          (2.6 + 1.8 * rand(i, 737 + k)) * (0.8 + 0.2 * k),
          FLOWER_TONES[i % 4] ?? '#000',
        );
      }
    },
    after(g, ridge, k) {
      for (let i = 0; i < 18 * k; i++) {
        const x = rand(i, 739 + k) * W,
          top = SNOWDRIFT_H - ridge(x);
        paintFlower(
          g,
          x,
          top + 14 + rand(i, 735 + k) * 110,
          (2.4 + 1.8 * rand(i, 741 + k)) * (0.8 + 0.2 * k),
          FLOWER_TONES[(i + 1) % 4] ?? '#000',
        );
      }
    },
  },
  summer: {
    tones: [
      ['#3c5a2a', '#22381a'],
      ['#587a30', '#324a1c'],
      ['#7e9c3a', '#465e22'],
    ],
    rim: '255,236,150',
    wind: 0.14,
    before(g, ridge, k) {
      paintBlades(
        g,
        ridge,
        k,
        ['#324a1c', '#465e22', '#5e7a2a'][k] ?? '#000',
        ['#a89a44', '#d2bc58', '#f0dc7a'][k] ?? '#000',
        70,
        6,
        741 + k * 5,
      );
    },
  },
  storm: {
    tones: [
      ['#1a2234', '#0e1420'],
      ['#222c42', '#121a2a'],
      ['#2c3852', '#161e30'],
    ],
    rim: '170,190,255',
    rimAlpha: 0.6,
    wind: 0.03,
    puddles: [],
    before(g, ridge, k) {
      paintPines(g, ridge, k, ['#121a2a', '#18213a'][k] ?? '#000');
    },
    after(g, ridge, k) {
      if (k === 0) return;
      for (let i = 0; i < 4 + 3 * k; i++) {
        const x = rand(i, 751 + k) * W,
          top = SNOWDRIFT_H - ridge(x),
          y = top + 34 + rand(i, 753 + k) * Math.max(10, SNOWDRIFT_H - top - 60),
          rx = 50 + 80 * rand(i, 755 + k),
          ry = 5 + 6 * rand(i, 757 + k);
        const lg = g.createLinearGradient(0, y - ry, 0, y + ry);
        lg.addColorStop(0, 'rgba(150,180,240,0.30)');
        lg.addColorStop(1, 'rgba(60,80,130,0.10)');
        g.fillStyle = lg;
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, 0, 6.2832);
        g.fill();
        g.strokeStyle = 'rgba(220,235,255,0.5)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
        if (k === 2) GROUNDS.storm?.puddles?.push({ x, y, rx, ry });
      }
    },
  },
  embers: {
    tones: [
      ['#241614', '#120b0a'],
      ['#30201c', '#18100e'],
      ['#3e2a24', '#1e1412'],
    ],
    rim: '255,170,110',
    rimAlpha: 0.7,
    after(g, ridge, k) {
      // Ash: warm grey grain and the dark bed beneath each ember.
      for (let i = 0; i < 220; i++) {
        const x = rand(i, 851 + k) * W,
          top = SNOWDRIFT_H - ridge(x);
        g.fillStyle = i % 2 ? 'rgba(150,120,105,0.16)' : 'rgba(0,0,0,0.22)';
        g.beginPath();
        g.arc(
          x,
          top + 6 + rand(i, 853 + k) * (SNOWDRIFT_H - top - 6),
          0.8 + 1.8 * rand(i, 855 + k),
          0,
          6.2832,
        );
        g.fill();
      }
    },
  },
  night: {
    tones: [
      ['#16243e', '#0a1222'],
      ['#1c2e4c', '#0c1628'],
      ['#26395a', '#101c30'],
    ],
    rim: '170,200,255',
    rimAlpha: 0.8,
    wind: 0.022,
    before(g, ridge, k) {
      paintPines(g, ridge, k, ['#0d1728', '#132036'][k] ?? '#000');
    },
  },
  aurora: {
    tones: [
      ['#3a4f74', '#1c2a46'],
      ['#5a7299', '#2a3c5e'],
      ['#8aa4c8', '#3c5278'],
    ],
    rim: '150,255,200',
    rimAlpha: 1.1,
    wind: 0.022,
    before(g, ridge, k) {
      paintPines(g, ridge, k, ['#0f1c30', '#16263e'][k] ?? '#000');
    },
  },
  fireflies: {
    tones: [
      ['#12261c', '#08140e'],
      ['#183424', '#0c1a12'],
      ['#20442e', '#0e2016'],
    ],
    rim: '190,255,150',
    rimAlpha: 0.6,
    wind: 0.12,
    before(g, ridge, k) {
      paintBlades(
        g,
        ridge,
        k,
        ['#0c1a12', '#0e2016', '#16301f'][k] ?? '#000',
        ['#1c3a28', '#285238', '#3a7048'][k] ?? '#000',
        56,
        6,
        781 + k * 5,
      );
    },
  },
  mist: {
    tones: [
      ['#6e7a78', '#4c5654'],
      ['#8a9694', '#5e6a68'],
      ['#a8b4b0', '#727e7a'],
    ],
    rim: '235,245,240',
    rimAlpha: 0.7,
    wind: 0.06,
    before(g, ridge, k) {
      if (k === 0) return;
      let i = 0;
      for (let x = 30; x < W; x += 30 + 70 * rand(i, 791 + k), i++) {
        const top = SNOWDRIFT_H - ridge(x),
          h = 60 + 70 * rand(i, 793 + k),
          lean = (rand(i, 795 + k) - 0.5) * 16;
        g.strokeStyle = ['', '#56605e', '#69736f'][k] ?? '';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, top + 6);
        g.quadraticCurveTo(x + lean * 0.3, top - h * 0.5, x + lean, top - h);
        g.stroke();
        g.fillStyle = ['', '#4a5250', '#5a6460'][k] ?? '';
        g.beginPath();
        g.ellipse(x + lean, top - h + 4, 3.6, 13, lean * 0.02, 0, 6.2832);
        g.fill();
      }
    },
  },
};
// Sea: the open water between the board and the beach, in the hour's light. Its colour comes from
// the sky of the moment, the sun (or the moon) lays a trail of glitter on it where the light
// stands, slow swells cross it, and gulls glide overhead while it is light.
function paintSea(
  g: CanvasRenderingContext2D,
  e: AmbienceFrame,
  A: AmbienceState,
  P: number,
): void {
  const horizon = GY1 + 140,
    bottom = H - 120,
    // 0 at midnight, 1 at noon: the water keeps the sky's colour, blue only as the light allows.
    day = Math.sin(Math.PI * ((((e.hour || 0) % 1) + 1) % 1));
  g.save();
  g.globalAlpha = P;
  const deep = lerpColor(A.bottom, [18, 70, 92], 0.15 + 0.4 * day),
    far = lerpColor(
      lerpColor(A.mid, [70, 140, 160], 0.1 + 0.35 * day),
      A.glow,
      0.2 + 1.2 * A.glowAlpha * (1 - 0.5 * day),
    );
  // A soft haze first, so the water does not start on a hard line under the board.
  // It starts at the foot of the board and thickens slowly, until it is the water's own colour.
  const hazeH = 150,
    haze = g.createLinearGradient(0, horizon - hazeH, 0, horizon);
  haze.addColorStop(0, rgba(far, 0));
  haze.addColorStop(0.35, rgba(far, 0.08));
  haze.addColorStop(0.7, rgba(far, 0.34));
  haze.addColorStop(0.92, rgba(far, 0.8));
  haze.addColorStop(1, rgba(far, 1));
  g.fillStyle = haze;
  g.fillRect(0, horizon - hazeH, W, hazeH);
  const water = g.createLinearGradient(0, horizon, 0, bottom);
  water.addColorStop(0, rgb(far));
  water.addColorStop(1, rgb(deep));
  g.fillStyle = water;
  g.fillRect(0, horizon, W, bottom - horizon);
  // The sun, or the moon once the light is gone, standing on the horizon on the light's side of the
  // sky: low and half sunk at dawn and dusk, clear of the water around noon.
  const sun = Math.min(1, Math.max(0, (day - 0.25) / 0.2)),
    discX = W * A.glowX,
    paintDisc = (r: number, lift: number, core: RGB, a: number): void => {
      if (a < 0.01) return;
      const y = horizon - lift,
        aura = g.createRadialGradient(discX, y, r * 0.6, discX, y, r * 3.2);
      aura.addColorStop(0, rgba(core, 0.4 * a));
      aura.addColorStop(1, rgba(core, 0));
      g.fillStyle = aura;
      g.fillRect(discX - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
      g.fillStyle = rgba(core, a);
      g.beginPath();
      g.arc(discX, y, r, 0, Math.PI * 2);
      g.fill();
    };
  g.save();
  g.beginPath();
  g.rect(0, 0, W, horizon);
  g.clip();
  paintDisc(
    30,
    4 + 30 * Math.max(0, (day - 0.64) / 0.36),
    lerpColor(A.glow, [255, 244, 214], 0.6),
    sun,
  );
  paintDisc(24, 30, [228, 236, 242], 1 - sun);
  if (sun < 0.99) {
    // The moon's seas, three soft grey patches.
    g.fillStyle = rgba([150, 164, 178], 0.35 * (1 - sun));
    for (const [dx, dy, r] of [
      [-8, -6, 6],
      [7, 3, 8],
      [-4, 10, 4],
    ] as const) {
      g.beginPath();
      g.arc(discX + dx, horizon - 30 + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  // The light's glow low on the water: warm at dawn and dusk, pale under the moon. A flat ellipse,
  // so it dies out on every side instead of being cut off above the horizon.
  const cx0 = W * A.glowX,
    haloR = W * 0.55,
    halo = g.createRadialGradient(0, 0, 10, 0, 0, haloR);
  halo.addColorStop(0, rgba(A.glow, 0.5 * Math.min(1, A.glowAlpha * 3.5)));
  halo.addColorStop(1, rgba(A.glow, 0));
  g.save();
  g.translate(cx0, horizon);
  g.scale(1, 0.42);
  g.fillStyle = halo;
  g.fillRect(-haloR, -haloR, haloR * 2, haloR * 2);
  g.restore();
  // Swells: lighter lines, flat and close far away, wider and slower near the shore.
  g.globalCompositeOperation = 'lighter';
  for (let row = 0; row < 11; row++) {
    const k = row / 10,
      y = horizon + 10 + Math.pow(k, 1.5) * (bottom - horizon - 40),
      amp = 1.5 + k * 7,
      len = 0.02 - k * 0.012;
    g.strokeStyle = rgba(lerpColor(far, [255, 255, 255], 0.35), (0.07 + 0.08 * (1 - k)) * P);
    g.lineWidth = 1 + k * 1.5;
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 18) {
      const yy = y + Math.sin(x * len + e.t * (0.5 + 0.4 * k) + row * 1.9) * amp;
      if (x === -20) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  // The glitter trail under the sun or the moon, following the light's side of the sky.
  const cx = W * A.glowX,
    trail = lerpColor(A.glow, [255, 255, 255], 0.35);
  for (let i = 0; i < 90; i++) {
    const k = rand(i, 931),
      y = horizon + 4 + Math.pow(k, 1.3) * (bottom - horizon - 30),
      spread = 30 + k * 170,
      x = cx + (rand(i, 933) - 0.5) * 2 * spread,
      on = Math.max(0, Math.sin(e.t * (1.6 + rand(i, 935) * 2.4) + i * 2.3));
    g.fillStyle = rgba(trail, Math.min(1, (0.25 + A.glowAlpha * 3) * on * on) * P);
    g.fillRect(x, y, 6 + k * 18, 1.5 + k * 2);
  }
  g.restore();
  // Gulls gliding while it is light, a few slow wingbeats, far and small.
  if (day < 0.2) return;
  g.save();
  g.strokeStyle = rgba(
    lerpColor(A.bottom, [30, 36, 40], 0.5),
    0.75 * P * Math.min(1, (day - 0.2) * 2),
  );
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const span = W + 400,
      x = ((rand(i, 941) * span + e.t * (14 + rand(i, 943) * 10)) % span) - 200,
      y = (i < 2 ? 70 + i * 60 : horizon - 140 + i * 30) + Math.sin(e.t * 0.5 + i) * 12,
      s = i < 2 ? 1.3 : 0.7,
      flap = Math.sin(e.t * (2.2 + i * 0.4) + i) * 5 * s;
    g.lineWidth = 2.4 * s;
    g.beginPath();
    g.moveTo(x - 18 * s, y - flap);
    g.quadraticCurveTo(x - 8 * s, y - 8 * s - flap * 0.5, x, y);
    g.quadraticCurveTo(x + 8 * s, y - 8 * s - flap * 0.5, x + 18 * s, y - flap);
    g.stroke();
  }
  g.restore();
}

const GROUND_FOR: Record<string, string> = {
  rain: 'rain',
  autumn: 'autumn',
  spring: 'spring',
  summer: 'summer',
  storm: 'storm',
  embers: 'embers',
  stars: 'night',
  aurora: 'aurora',
  fireflies: 'fireflies',
  mist: 'mist',
  sea: 'sea',
};
let groundsImg: Record<string, { layers: GroundLayerObj[] }> = {};
function groundLayer(key: string): { layers: GroundLayerObj[] } {
  const cached = groundsImg[key];
  if (cached !== undefined) return cached;
  const D = GROUNDS[key];
  if (D === undefined) throw new Error('unknown ground key: ' + key);
  const makeCanvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = SNOWDRIFT_H;
    return c;
  };
  const layers = RIDGES.map((ridge, k) => {
    const pl: GroundLayerObj = { before: null, body: makeCanvas(), glow: null };
    const g = getCtx(pl.body);
    const trace = (dy: number): void => {
      g.beginPath();
      g.moveTo(-20, SNOWDRIFT_H + 20);
      for (let x = -20; x <= W + 20; x += 8) g.lineTo(x, SNOWDRIFT_H - ridge(x) + dy);
      g.lineTo(W + 20, SNOWDRIFT_H + 20);
      g.closePath();
    };
    if (D.before) {
      pl.before = makeCanvas();
      D.before(getCtx(pl.before), ridge, k);
    }
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 30;
    g.shadowOffsetY = -8;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    trace(6);
    g.fill();
    g.restore();
    const lg = g.createLinearGradient(0, SNOWDRIFT_H - 250, 0, SNOWDRIFT_H);
    const toneRow = D.tones[k] ?? D.tones[0];
    lg.addColorStop(0, toneRow[0]);
    lg.addColorStop(1, toneRow[1]);
    g.fillStyle = lg;
    trace(0);
    g.fill();
    g.save();
    g.shadowColor = 'rgba(' + D.rim + ',0.9)';
    g.shadowBlur = 10;
    g.strokeStyle =
      'rgba(' + D.rim + ',' + Math.min(1, (0.16 + 0.17 * k) * (D.rimAlpha ?? 1)).toFixed(3) + ')';
    g.lineWidth = 2.2;
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 8) {
      const y = SNOWDRIFT_H - ridge(x) + 1.5;
      if (x === -20) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
    if (D.after) D.after(g, ridge, k);
    if (D.glow) {
      pl.glow = makeCanvas();
      D.glow(getCtx(pl.glow), ridge, k);
    }
    return pl;
  });
  const result = { layers: layers };
  groundsImg[key] = result;
  return result;
}
// Ground at render time: the three layers, wind in the above-crest elements, then season-specific life.
function paintGround(g: CanvasRenderingContext2D, e: AmbienceFrame, m: string, P: number): void {
  const key = GROUND_FOR[m] ?? m;
  const D = GROUNDS[key];
  if (D === undefined) return;
  const S = groundLayer(key),
    advance = Math.min(1, Math.max(0, e.subStep));
  const riseOffset = (1 - (0.5 + 0.5 * advance)) * 100 + (1 - P) * 160,
    y0 = H - SNOWDRIFT_H + riseOffset,
    t = e.t,
    calm = e.reduced ? 0 : 1;
  halo ??= buildHaloModel();
  g.save();
  if (m === 'mist') {
    const mistImg = tint('mist', halo, [196, 210, 208], 64, 64);
    for (let i = 0; i < 2; i++) {
      g.globalAlpha = 0.2 * P;
      g.drawImage(
        mistImg,
        ((t * (14 + 9 * i) + i * 700) % (W + 1400)) - 1000,
        H - 540 + riseOffset + i * 60,
        1400,
        380,
      );
    }
  }
  g.globalAlpha = Math.min(1, P * 1.6);
  const A = g.globalAlpha;
  S.layers.forEach((pl, k) => {
    if (pl.before) {
      if (D.wind && calm) {
        const cw = 30;
        for (let x = 0; x < W; x += cw) {
          const xc = x + cw / 2,
            yb = y0 + SNOWDRIFT_H - ridgeAt(k)(xc) + 8;
          const sh =
            D.wind *
            (0.6 * Math.sin(t * 1.4 + xc * 0.011 + k * 1.7) +
              0.4 * Math.sin(t * 0.55 + xc * 0.0035) +
              wind / 80);
          g.save();
          g.transform(1, 0, -sh, 1, sh * yb, 0);
          g.drawImage(pl.before, x, 0, cw + 1, SNOWDRIFT_H, x, y0, cw + 1, SNOWDRIFT_H);
          g.restore();
        }
      } else g.drawImage(pl.before, 0, y0);
    }
    g.drawImage(pl.body, 0, y0);
    if (pl.glow) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha =
        Math.max(
          0.15,
          Math.min(1, 0.55 + 0.3 * Math.sin(t * 1.1 + k * 1.9) + 0.15 * Math.sin(t * 3.7 + k)),
        ) * P;
      g.drawImage(pl.glow, 0, y0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = A;
    }
  });
  const ridgeLine = (x: number): number => y0 + SNOWDRIFT_H - ridgeAt(2)(x);
  if (m === 'autumn' && calm) {
    // Leaves that the wind drives and bounces across the ground.
    const PAL = ['#c8822e', '#a04e22', '#d8a446', '#8a3a1c'];
    for (let i = 0; i < 12; i++) {
      const x = ((rand(i, 801) * W + t * (50 + 90 * rand(i, 803))) % (W + 80)) - 40,
        saut =
          Math.abs(Math.sin(t * (1.6 + 1.8 * rand(i, 805)) + i * 2.3)) * (8 + 22 * rand(i, 807));
      g.save();
      g.translate(x, ridgeLine(x) - 3 - saut);
      g.rotate(t * (2.5 + 2 * rand(i, 809)) + i);
      g.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(t * 2.1 + i)));
      g.globalAlpha = 0.95 * P;
      paintLeaf(g, 8 + 6 * rand(i, 811), PAL[i % 4] ?? '#000');
      g.restore();
    }
  }
  if ((m === 'rain' || m === 'storm') && calm) {
    // Rain hits the ground: a ring that expands, two droplets that bounce.
    g.strokeStyle = 'rgba(200,225,240,1)';
    g.fillStyle = 'rgba(200,225,240,1)';
    g.lineWidth = 1.5;
    const n = m === 'storm' ? 22 : 13;
    for (let i = 0; i < n; i++) {
      const cadence = 1.1 + 0.9 * rand(i, 821),
        ph = t * cadence + rand(i, 823) * 9,
        u = ph % 1,
        turn = Math.floor(ph);
      const x = rand(i * 53 + turn, 825) * W,
        y = ridgeLine(x) + 6 + rand(i * 53 + turn, 827) * 90;
      if (y > H) continue;
      g.globalAlpha = 0.5 * (1 - u) * P;
      g.beginPath();
      g.ellipse(x, y, 4 + 24 * u, (4 + 24 * u) * 0.3, 0, 0, 6.2832);
      g.stroke();
      if (u < 0.4) {
        const v = u / 0.4,
          hy = Math.sin(v * Math.PI) * 14;
        g.globalAlpha = 0.7 * (1 - v) * P;
        g.beginPath();
        g.arc(x - 7 * v - 2, y - hy, 1.6, 0, 6.2832);
        g.arc(x + 9 * v + 2, y - hy * 0.8, 1.3, 0, 6.2832);
        g.fill();
      }
    }
  }
  g.globalCompositeOperation = 'lighter';
  if (m === 'storm') {
    // Rings in the puddles, and the whole ground lit by lightning.
    g.strokeStyle = 'rgba(210,228,255,1)';
    g.lineWidth = 1.3;
    D.puddles?.forEach((f, i) => {
      const u = (t * (0.7 + 0.4 * rand(i, 831)) + rand(i, 833) * 5) % 1;
      g.globalAlpha = 0.45 * (1 - u) * P;
      g.beginPath();
      g.ellipse(
        f.x + (rand(i, 835) - 0.5) * f.rx,
        y0 + f.y,
        f.rx * 0.5 * u + 3,
        (((f.rx * 0.5 * u + 3) * f.ry) / f.rx) * 1.6,
        0,
        0,
        6.2832,
      );
      g.stroke();
    });
    const I = lightning(t);
    if (I > 0.02) {
      g.globalAlpha = 0.8 * I * P;
      S.layers.forEach((pl) => {
        if (pl.before) g.drawImage(pl.before, 0, y0);
        g.drawImage(pl.body, 0, y0);
      });
    }
  }
  if (m === 'embers') {
    // Scattered embers in the ash: each breathes at its own pace, a bright core inside a small halo.
    const hb = tint('emberGround', halo, [255, 120, 40], 64, 64),
      hc = tint('emberCore', halo, [255, 214, 150], 64, 64);
    for (let i = 0; i < 34; i++) {
      const k = i % 3,
        x = rand(i, 861) * W,
        top = y0 + SNOWDRIFT_H - ridgeAt(k)(x),
        y = top + 10 + rand(i, 863) * 120;
      if (y > H + 10 || (k < 2 && y > y0 + SNOWDRIFT_H - ridgeAt(k + 1)(x) - 4)) continue;
      const v =
          0.35 +
          0.65 *
            Math.pow(0.5 + 0.5 * Math.sin(t * (0.5 + 0.9 * rand(i, 865)) + rand(i, 867) * 6.28), 2),
        R = (7 + 9 * rand(i, 869)) * (0.7 + 0.2 * k);
      g.globalAlpha = 0.55 * v * P;
      g.drawImage(hb, x - R * 2.2, y - R * 1.3, R * 4.4, R * 2.6);
      g.globalAlpha = 0.9 * v * P;
      g.drawImage(hc, x - R * 0.7, y - R * 0.45, R * 1.4, R * 0.9);
    }
  }
  if (m === 'aurora') {
    // Snow reflects the aurora: a green shimmer breathing along the crests.
    g.globalAlpha = (0.13 + 0.06 * Math.sin(t * 0.4)) * P;
    g.drawImage(
      tint('glint', halo, [110, 255, 190], 64, 64),
      -200 + Math.sin(t * 0.13) * 160,
      y0 - 40,
      W + 400,
      320,
    );
  }
  g.restore();
}

// Lightning: 0 most of the time, a soft double flash every 8 to 14 seconds.
function lightning(t: number): number {
  const k = Math.floor(t / 11),
    tf = t - k * 11 - 1 - rand(k, 5) * 6;
  if (tf < 0 || tf > 0.7) return 0;
  return Math.max(Math.exp(-tf * 9), tf > 0.2 ? 0.75 * Math.exp(-(tf - 0.2) * 11) : 0);
}

function ambience(h: number): AmbienceState {
  h = ((h % 1) + 1) % 1;
  let i = 0;
  for (let k = 0; k < KEYS.length; k++) if ((KEYS[k]?.t ?? 0) <= h) i = k;
  const A = KEYS[i];
  const B = KEYS[(i + 1) % KEYS.length];
  if (A === undefined || B === undefined) throw new Error('KEYS index out of range');
  const t0 = A.t,
    t1 = B.t <= A.t ? B.t + 1 : B.t;
  let u = (h - t0) / (t1 - t0);
  u = u * u * (3 - 2 * u); // Smooth cubic ease, no hard edge.
  const o: AmbienceState = {
    name: u < 0.5 ? A.name : B.name,
    top: lerpColor(A.top, B.top, u),
    mid: lerpColor(A.mid, B.mid, u),
    bottom: lerpColor(A.bottom, B.bottom, u),
    glow: lerpColor(A.glow, B.glow, u),
    ray: lerpColor(A.ray, B.ray, u),
    pt: lerpColor(A.pt, B.pt, u),
    veil: lerpColor(A.veil, B.veil, u),
    glowAlpha: A.glowAlpha + (B.glowAlpha - A.glowAlpha) * u,
    glowX: A.glowX + (B.glowX - A.glowX) * u,
    glowY: A.glowY + (B.glowY - A.glowY) * u,
    glowRadius: A.glowRadius + (B.glowRadius - A.glowRadius) * u,
    rayAlpha: A.rayAlpha + (B.rayAlpha - A.rayAlpha) * u,
    rayX: A.rayX + (B.rayX - A.rayX) * u,
    ptA: A.ptA + (B.ptA - A.ptA) * u,
    ptR: A.ptR + (B.ptR - A.ptR) * u,
    ptHalo: A.ptHalo + (B.ptHalo - A.ptHalo) * u,
    veilAlpha: A.veilAlpha + (B.veilAlpha - A.veilAlpha) * u,
    vignette: A.vignette + (B.vignette - A.vignette) * u,
  };
  const pairs: [WeatherSpec | null, number][] = [
    [WEATHERS[previousWeather], 1 - weatherMix],
    [WEATHERS[weather], weatherMix],
  ];
  const applyTint = (base: RGB, kk: number): RGB => {
    let r = 0,
      g = 0,
      b = 0;
    for (const [spec, mix] of pairs) {
      const v: RGB = spec !== null ? lerpColor(base, spec.tint, spec.k * kk) : base;
      r += v[0] * mix;
      g += v[1] * mix;
      b += v[2] * mix;
    }
    return [r, g, b];
  };
  o.top = applyTint(o.top, 1);
  o.mid = applyTint(o.mid, 1);
  o.bottom = applyTint(o.bottom, 1);
  o.veil = applyTint(o.veil, 1);
  o.glow = applyTint(o.glow, 0.5);
  let fpt = 0,
    flu = 0;
  for (const [spec, mix] of pairs) {
    fpt += (spec?.pt ?? 1) * mix;
    flu += (spec?.glow ?? 1) * mix;
  }
  o.ptA = Math.min(1, o.ptA * fpt);
  o.glowAlpha = o.glowAlpha * flu;
  return o;
}

// Light ray, pre-rendered once in white on a small canvas.
// Each frame just places, rotates, and stretches it: one drawImage instead of nine gradients.
const RW = 96,
  RH = 512;
let rayWhite: HTMLCanvasElement | null = null,
  rayTinted: HTMLCanvasElement | null = null,
  rayCacheKey = '';
function buildRayModel(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = RW;
  c.height = RH;
  const g = getCtx(c);
  const d = g.createImageData(RW, RH),
    p = d.data;
  for (let y = 0; y < RH; y++) {
    const v = y / (RH - 1);
    // Along the ray: brightens below the canopy, peaks, then fades into the air.
    const lg = v < 0.14 ? (v / 0.14) * (v / 0.14) : Math.pow(1 - (v - 0.14) / 0.86, 1.7);
    for (let x = 0; x < RW; x++) {
      const u = ((x + 0.5) / RW) * 2 - 1;
      // Across the ray: cosine rolloff, soft edges with no blur needed.
      const edge = Math.cos((u * Math.PI) / 2);
      // The ray widens downward, so the active width is narrower near the top.
      const large = 0.35 + 0.65 * v;
      const dedans = Math.max(0, 1 - Math.abs(u) / large);
      const a = lg * edge * edge * dedans;
      const i = (y * RW + x) * 4;
      p[i] = p[i + 1] = p[i + 2] = 255;
      p[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}
// White model takes the current hour's color: one tint per frame, not one per ray.
function tintRay(color: RGB): HTMLCanvasElement {
  rayWhite ??= buildRayModel();
  const cacheKey = `${String(Math.round(color[0]))},${String(Math.round(color[1]))},${String(Math.round(color[2]))}`;
  if (rayTinted && rayCacheKey === cacheKey) return rayTinted;
  if (!rayTinted) {
    rayTinted = document.createElement('canvas');
    rayTinted.width = RW;
    rayTinted.height = RH;
  }
  const g = getCtx(rayTinted);
  g.clearRect(0, 0, RW, RH);
  g.drawImage(rayWhite, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = rgb(color);
  g.fillRect(0, 0, RW, RH);
  g.globalCompositeOperation = 'source-over';
  rayCacheKey = cacheKey;
  return rayTinted;
}

// Canopy shadow. Replaces bright animated light rays, which competed with the snake for attention.
// A dark mass conveys the same thing (foliage above, light behind) but raises contrast instead of
// reducing it. Pre-rendered once, placed with a single drawImage.
const KW = 512,
  KH = 256;
let canopy: HTMLCanvasElement | null = null;
function buildCanopyModel(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = KW;
  c.height = KH;
  const g = getCtx(c);
  // Soft blobs anchored to the top edge, growing sparser downward.
  for (let i = 0; i < 26; i++) {
    const x = rand(i, 3) * KW;
    const y = -KH * 0.12 + Math.pow(rand(i, 5), 1.9) * KH * 0.95;
    const r = KH * (0.16 + rand(i, 9) * 0.34);
    const a = 0.3 * (1 - y / (KH * 1.05));
    if (a <= 0) continue;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')');
    rg.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.45).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Continuous top strip so the frame edge is never visible.
  const lg = g.createLinearGradient(0, 0, 0, KH * 0.5);
  lg.addColorStop(0, 'rgba(0,0,0,0.42)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg;
  g.fillRect(0, 0, KW, KH * 0.5);
  return c;
}

// Pre-rendered halo replaces shadowBlur, the most expensive canvas 2D call.
let halo: HTMLCanvasElement | null = null;
function buildHaloModel(): HTMLCanvasElement {
  const n = 64,
    c = document.createElement('canvas');
  c.width = c.height = n;
  const g = getCtx(c);
  const rg = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  rg.addColorStop(0.0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  rg.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  rg.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, n, n);
  return c;
}
// Pre-rendered raindrop: bulging head at the bottom, narrowing trail toward the top.
let dropTemplate: HTMLCanvasElement | null = null;
function buildDropModel(): HTMLCanvasElement {
  const w = 24,
    h = 128,
    c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = getCtx(c);
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, 'rgba(255,255,255,0)');
  lg.addColorStop(0.65, 'rgba(255,255,255,0.55)');
  lg.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = lg;
  const x = w / 2,
    la = w * 0.34,
    y = h - la * 0.8;
  g.beginPath();
  g.moveTo(x, 0);
  g.quadraticCurveTo(x + la * 0.9, y * 0.58, x + la, y - la * 0.6);
  g.quadraticCurveTo(x + la * 0.85, y + la * 0.55, x, y + la * 0.75);
  g.quadraticCurveTo(x - la * 0.85, y + la * 0.55, x - la, y - la * 0.6);
  g.quadraticCurveTo(x - la * 0.9, y * 0.58, x, 0);
  g.fill();
  return c;
}
// Generic tint: a white model takes a color once and is cached.
let tintCache: Record<string, TintEntry> = {};
function tint(
  key: string,
  modele: HTMLCanvasElement,
  color: RGB,
  w: number,
  h: number,
): HTMLCanvasElement {
  const cacheKey = `${String(Math.round(color[0]))},${String(Math.round(color[1]))},${String(Math.round(color[2]))}`;
  let e = tintCache[key];
  if (e === undefined) {
    e = tintCache[key] = { c: document.createElement('canvas'), key: '' };
    e.c.width = w;
    e.c.height = h;
  }
  if (e.key === cacheKey) return e.c;
  const g = getCtx(e.c);
  g.clearRect(0, 0, w, h);
  g.drawImage(modele, 0, 0, w, h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = rgb(color);
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  e.key = cacheKey;
  return e.c;
}

// Sky: gradient, glow, and veil are three full-screen passes that only change with the hour.
// Painted once into a half-resolution canvas; each frame uses a single drawImage.
const CW = 270,
  CH = 480;
let skyCanvas: HTMLCanvasElement | null = null,
  skyCacheKey = '';
function paintSky(A: AmbienceState, progress: number): HTMLCanvasElement {
  // Only recalculate when the hour or tension have shifted by a perceptible step.
  const cacheKey =
    `${weather}${previousWeather}` +
    Math.round(weatherMix * 40).toString() +
    (
      Math.round((A.glowX + A.glowAlpha * 7 + A.veilAlpha * 11 + A.top[1] / 255) * 400) * 8
    ).toString() +
    Math.round(progress * 20).toString();
  if (skyCanvas && skyCacheKey === cacheKey) return skyCanvas;
  if (!skyCanvas) {
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = CW;
    skyCanvas.height = CH;
  }
  const g = getCtx(skyCanvas);
  const d = 0.18 * progress;
  const topColor = lerpColor(A.top, [24, 30, 28], d),
    midColor = lerpColor(A.mid, [18, 23, 21], d),
    bottomColor = lerpColor(A.bottom, [10, 13, 12], d);
  const lg = g.createLinearGradient(0, 0, 0, CH);
  lg.addColorStop(0, rgb(topColor));
  lg.addColorStop(0.45, rgb(midColor));
  lg.addColorStop(1, rgb(bottomColor));
  g.fillStyle = lg;
  g.fillRect(0, 0, CW, CH);
  const R = CH * A.glowRadius,
    lx0 = CW * A.glowX,
    ly0 = CH * A.glowY;
  const rg = g.createRadialGradient(lx0, ly0, 0, lx0, ly0, R);
  rg.addColorStop(0, rgba(A.glow, A.glowAlpha));
  rg.addColorStop(0.55, rgba(A.glow, A.glowAlpha * 0.32));
  rg.addColorStop(1, rgba(A.glow, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, CW, CH);
  g.globalAlpha = A.veilAlpha;
  g.fillStyle = rgb(A.veil);
  g.fillRect(0, 0, CW, CH);
  g.globalAlpha = 1;
  skyCacheKey = cacheKey;
  return skyCanvas;
}

// Vignette tracks game tension, not round progress: it closes when space runs out and
// reopens as soon as the snake has room.
let vignette: HTMLCanvasElement | null = null,
  vignetteCacheKey = -1;
function paintVignette(A: AmbienceState, tension: number): HTMLCanvasElement {
  const f = A.vignette + 0.34 * tension;
  const cacheKey = Math.round(f * 200) * 40 + Math.round(tension * 20);
  if (vignette && vignetteCacheKey === cacheKey) return vignette;
  if (!vignette) {
    vignette = document.createElement('canvas');
    vignette.width = CW;
    vignette.height = CH;
  }
  const g = getCtx(vignette);
  g.clearRect(0, 0, CW, CH);
  const vg = g.createRadialGradient(
    CW / 2,
    CH * 0.4,
    CH * (0.21 - 0.1 * tension),
    CW / 2,
    CH * 0.44,
    CH * 0.72,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,' + f.toFixed(3) + ')');
  g.fillStyle = vg;
  g.fillRect(0, 0, CW, CH);
  vignetteCacheKey = cacheKey;
  return vignette;
}

// Grain: a tile computed once then tiled. It eliminates color banding.
let grainPattern: CanvasPattern | null = null;
function grainTile(): HTMLCanvasElement {
  const n = 128,
    c = document.createElement('canvas');
  c.width = c.height = n;
  const x = getCtx(c),
    d = x.createImageData(n, n),
    p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    p[i] = p[i + 1] = p[i + 2] = v;
    p[i + 3] = 26;
  }
  x.putImageData(d, 0, 0);
  return c;
}

// Rain: pre-allocated arrays, no allocation per frame.
// Drops are distributed across vertical columns, one drop per column; without this the hash
// clusters them at the center. A drop that falls back spawns in its column, shifted by one turn.
const N_FAR = 48,
  N_NEAR = 18,
  N = N_FAR + N_NEAR;
const gx = new Float32Array(N),
  gy = new Float32Array(N),
  gv = new Float32Array(N),
  ga = new Float32Array(N);
const dropTurns = new Int16Array(N);
// Each near drop hits at its own depth on the board, not all on the same line.
const dropImpactY = new Float32Array(N);
function columnX(i: number, n: number, d: number): number {
  return ((i + 0.15 + 0.7 * rand(i, d)) / n) * W;
}
function seedDrop(i: number, topColor: boolean): void {
  const isNear = i >= N_FAR,
    ix = isNear ? i - N_FAR : i,
    n = isNear ? N_NEAR : N_FAR;
  gx[i] = columnX(ix, n, 101 + (dropTurns[i] ?? 0) * 13);
  gy[i] = topColor ? -40 - Math.random() * 200 : ((ix + 0.5) / n) * H;
  gv[i] = isNear ? 450 + rand(i, 75) * 250 : 320 + rand(i, 77) * 80;
  ga[i] = 0.7 + rand(i, 79) * 0.3;
  // The board has depth: impact happens somewhere between the middle and bottom of the board.
  dropImpactY[i] = GY0 + (0.34 + 0.64 * rand(i, 131 + (dropTurns[i] ?? 0) * 7)) * (GY1 - GY0);
}
for (let i = 0; i < N; i++) seedDrop(i, false);
// Ripples land on the board, not below it: GY1 is the bottom of the area the audience sees.
const RMAX = 14,
  rx = new Float32Array(RMAX),
  ry = new Float32Array(RMAX),
  rt = new Float32Array(RMAX).fill(1);
const rp = new Float32Array(RMAX).fill(1); // Impact depth: a distant ripple is small.
const EMAX = 26,
  ex = new Float32Array(EMAX),
  ey = new Float32Array(EMAX);
const evx = new Float32Array(EMAX),
  evy = new Float32Array(EMAX),
  et = new Float32Array(EMAX).fill(9);
let wind = 0;
// Lens drops: they slide on the image, not in the scene.
const LMAX = 5,
  lx: number[] = [],
  ly: number[] = [],
  lr: number[] = [],
  lv: number[] = [],
  lph: number[] = [];
for (let i = 0; i < LMAX; i++) {
  lx.push(rand(i, 81) * W);
  ly.push(rand(i, 83) * H);
  lr.push(6 + rand(i, 85) * 14);
  lv.push(8 + rand(i, 87) * 28);
  lph.push(rand(i, 89) * 6.2832);
}

function activeCounts(e: AmbienceFrame): { nl: number; np: number } {
  const density = e.worldKind === 'downpour' ? 1 + 1.2 * e.world : 1;
  return {
    nl: Math.min(N_FAR, Math.round(N_FAR * density)),
    np: Math.min(N_NEAR, Math.round(N_NEAR * density)),
  };
}

(window.AMBIENCES = window.AMBIENCES ?? []).push({
  id: 'forest',
  name: 'Rainy forest',
  intention: 'Pluie lente sur la mousse, feuillages flous hors du jeu',
  accent: '#b4d4de',
  scaleName: 'Sol pentatonique majeur',
  scale: [392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77, 1174.66, 1318.51],
  gifts: {
    help: { name: 'Fruit', effect: 'fruit' },
    hinder: { name: 'Pierre', effect: 'stone' },
    world: { name: 'Averse' },
  },

  paintBack(g, e) {
    setFrame(e);
    const mv: Weather = Object.hasOwn(WEATHERS, e.weather) ? e.weather : 'rain';
    if (mv !== weather) {
      previousWeather = weather;
      weather = mv;
      weatherStartTime = e.t;
    }
    if (e.t < weatherStartTime || e.weatherSnap) weatherStartTime = -99; // A round opens with its weather already settled: never two seasons in one frame.
    {
      const u = Math.min(1, Math.max(0, (e.t - weatherStartTime) / 3.5));
      weatherMix = u * u * (3 - 2 * u);
    }
    const A = ambience(e.hour || 0),
      progress = Math.min(1, Math.max(0, e.progression || 0));
    // The full sky (gradient, glow, veil) fits in a single cached image.
    g.drawImage(paintSky(A, progress), 0, 0, W, H);

    // Canopy shadow at the top, drifting very slowly. Stronger when the light behind it is
    // brighter: leaves cut sharply at noon, dissolve into darkness at night.
    // One image placed, no bright moving object.
    {
      canopy ??= buildCanopyModel();
      const dense = 0.55 + 6.5 * A.rayAlpha; // rayAlpha drives backlight intensity.
      const lh = H * 0.46,
        marge = W * 0.16;
      // Slides within its margin and leans opposite the light source.
      // Clamped: the image is W + margin wide and must always cover 0..W. Without the clamp, at
      // dusk (glowX 0.86) it drifted 37 px right and left a bright strip on the left edge.
      const dx = Math.max(
        -marge,
        Math.min(
          0,
          -marge / 2 + Math.sin(e.t * 0.017) * marge * 0.42 + (A.glowX - 0.5) * marge * 0.8,
        ),
      );
      g.save();
      g.globalAlpha = Math.min(1, dense);
      g.drawImage(canopy, dx, -H * 0.03, W + marge, lh);
      g.restore();
    }

    // Floating particles: fireflies at night, spores in daylight.
    // Halo is pre-rendered; shadowBlur costs ten times as much for the same result.
    halo ??= buildHaloModel();
    const ptImg = tint('pt', halo, A.pt, 64, 64);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const ph = rand(i, 31) * 6.2832,
        speed = 0.18 + rand(i, 33) * 0.25;
      const x = W * (0.1 + 0.8 * rand(i, 35)) + Math.sin(e.t * speed + ph) * W * 0.13;
      const y = H * (0.06 + rand(i, 37) * 0.88) + Math.cos(e.t * speed * 0.7 + ph) * 80;
      const pulse = Math.max(0, Math.sin(e.t * (0.5 + rand(i, 39) * 0.6) + ph));
      const r = (3.2 + rand(i, 41) * 4.8) * A.ptR;
      g.globalAlpha = A.ptA * (0.22 + 0.78 * pulse * pulse * A.ptHalo + 0.3 * (1 - A.ptHalo));
      const R = r * (1.25 + 1.35 * A.ptHalo);
      g.drawImage(ptImg, x - R, y - R, R * 2, R * 2);
    }
    g.restore();

    // Night sky: breathing stars (stars, aurora, slight contribution from fireflies).
    const Pciel = Math.min(
      1,
      weight('stars') + 0.8 * weight('aurora') + 0.35 * weight('fireflies'),
    );
    if (Pciel > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const starImg = tint('star', halo, [226, 234, 255], 64, 64);
      for (let i = 0; i < 70; i++) {
        const x = rand(i, 201) * W,
          y = rand(i, 203) * H,
          tw = 0.5 + 0.5 * Math.sin(e.t * (0.6 + rand(i, 205) * 1.4) + rand(i, 207) * 6.28);
        const R = 3 + rand(i, 209) * 6;
        g.globalAlpha = (0.16 + 0.5 * rand(i, 211)) * (0.45 + 0.55 * tw) * Pciel;
        g.drawImage(starImg, x - R, y - R, R * 2, R * 2);
      }
      const Pf = weight('stars');
      for (let q = 0; q < 2 && Pf > 0.01; q++) {
        const per = 5.5 + q * 3.1,
          k = Math.floor(e.t / per),
          tf = (e.t - k * per - rand(k, 221 + q) * (per - 1.2)) / 1.0;
        if (tf < 0 || tf > 1) continue;
        const x0 = W * (0.08 + 0.7 * rand(k, 223 + q)),
          y0 = H * (0.04 + 0.5 * rand(k, 225 + q)),
          an = 0.42 + 0.35 * rand(k, 227 + q);
        const d = 140 + tf * 620,
          L = 250,
          cx = Math.cos(an),
          sy = Math.sin(an);
        const x1 = x0 + cx * d,
          y1 = y0 + sy * d,
          lg = g.createLinearGradient(x1 - cx * L, y1 - sy * L, x1, y1);
        lg.addColorStop(0, 'rgba(226,234,255,0)');
        lg.addColorStop(
          1,
          'rgba(240,244,255,' + (0.85 * Math.sin(tf * Math.PI) * Pf).toFixed(3) + ')',
        );
        g.globalAlpha = 1;
        g.strokeStyle = lg;
        g.lineWidth = 3.2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x1 - cx * L, y1 - sy * L);
        g.lineTo(x1, y1);
        g.stroke();
        g.globalAlpha = 0.9 * Math.sin(tf * Math.PI) * Pf;
        g.drawImage(starImg, x1 - 11, y1 - 11, 22, 22);
      }
      g.restore();
    }
    // Aurora: three slow veils, green to violet, rippling across the top of the frame.
    halo ??= buildHaloModel();
    const auroraHalo = halo;
    const Pau = weight('aurora');
    if (Pau > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const VOILES: readonly [RGB, RGB, RGB] = [
        [96, 240, 170],
        [110, 200, 255],
        [190, 120, 255],
      ];
      for (let v = 0; v < 3; v++) {
        // invariant: v is 0, 1, or 2 (loop bound)
        const RGB_BLACK: RGB = [0, 0, 0];
        const im = tint(`aurora${String(v)}`, auroraHalo, VOILES[v] ?? RGB_BLACK, 64, 64);
        for (let x = -80; x < W + 80; x += 16) {
          const o1 = Math.sin(x * 0.0052 + e.t * 0.16 + v * 2.1),
            o2 = Math.sin(x * 0.013 - e.t * 0.23 + v);
          const y = H * (0.1 + 0.13 * v) + o1 * 90 + o2 * 30,
            hh = 330 + 120 * o2;
          g.globalAlpha =
            (0.026 + 0.02 * (0.5 + 0.5 * Math.sin(x * 0.006 + e.t * 0.5 + v * 1.7))) * Pau;
          g.drawImage(im, x - 110, y - hh * 0.3, 220, hh);
        }
      }
      g.restore();
    }
    // Summer: broad diagonal sun rays crossing the forest.
    const Pete = weight('summer') + 0.6 * weight('spring');
    if (Pete > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      // Soft rays: the pre-rendered model (cosine edges, born under the canopy, fading down),
      // never a polygon. Unequal widths and lengths, slow out-of-phase breath, barely perceptible drift.
      const ray = tintRay([255, 238, 176]);
      for (let i = 0; i < 6; i++) {
        const x0 =
          W * (0.22 + 0.17 * i + 0.05 * rand(i, 371)) + Math.sin(e.t * 0.04 + i * 1.3) * 50;
        const dropWidth = 190 + 260 * rand(i, 373),
          dropLen = H * (0.62 + 0.3 * rand(i, 375));
        const breath = 0.55 + 0.45 * Math.sin(e.t * (0.16 + 0.1 * rand(i, 377)) + i * 2.1);
        g.save();
        g.translate(x0, -90);
        g.rotate(0.4 + 0.05 * Math.sin(e.t * 0.03 + i) + 0.04 * (rand(i, 379) - 0.5));
        g.globalAlpha = (0.1 + 0.13 * rand(i, 381)) * (0.6 + 0.4 * breath) * Pete;
        g.drawImage(ray, -dropWidth / 2, 0, dropWidth, dropLen);
        g.restore();
      }
      g.restore();
    }
    // Autumn: leaves already settled on the ground, behind the snakes.
    const Pau2 = weight('autumn');
    if (Pau2 > 0.01) {
      const TONS = ['#b8702c', '#9a4a26', '#c89a44', '#7e5a2a'];
      for (let i = 0; i < 46; i++) {
        g.save();
        g.translate(rand(i, 381) * W, H * (0.12 + 0.86 * rand(i, 383)));
        g.rotate(rand(i, 385) * 6.28);
        g.globalAlpha = (0.1 + 0.1 * rand(i, 387)) * Pau2;
        g.fillStyle = TONS[i % 4] ?? '#000';
        const T = 10 + rand(i, 389) * 10;
        g.beginPath();
        g.ellipse(0, 0, T, T * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    const Por = weight('storm');
    if (Por > 0.01) {
      const I = lightning(e.t) * Por;
      if (I > 0.02) {
        // The lightning bolt, far behind the board, then the glow it casts over the whole forest.
        const k = Math.floor(e.t / 11);
        let x = W * (0.15 + 0.7 * rand(k, 231)),
          y = -10;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = 'rgba(214,226,255,' + (0.55 * I).toFixed(3) + ')';
        g.lineWidth = 3;
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 9; j++) {
          x += (rand(k * 9 + j, 233) - 0.5) * 150;
          y += 60 + rand(k * 9 + j, 235) * 70;
          g.lineTo(x, y);
        }
        g.stroke();
        g.fillStyle = 'rgba(190,206,255,' + (0.17 * I).toFixed(3) + ')';
        g.fillRect(0, 0, W, H);
        g.restore();
      }
    }

    // Board: a slightly lighter surface and its border.
    g.save();
    g.globalAlpha = 0.05;
    g.fillStyle = rgba(lerpColor(A.glow, [255, 255, 255], 0.2), 0.22);
    g.fillRect(GX0, GY0, GX1 - GX0, GY1 - GY0);
    g.restore();
    g.strokeStyle = rgba(A.ray, 0.035);
    g.lineWidth = 2;
    g.strokeRect(GX0, GY0, GX1 - GX0, GY1 - GY0);

    if (e.worldKind === 'downpour' && e.world > 0) {
      g.fillStyle = `rgba(6,10,8,${String(0.18 * e.world)})`;
      g.fillRect(0, 0, W, H);
    }
  },

  paintFruit(g, x, y, c, e, f) {
    const px = e.x0 + x * c + c / 2,
      py = e.y0 + y * c + c / 2,
      r = f?.nickname !== undefined ? 19 : 16;
    g.save();
    g.shadowColor = 'rgba(159,199,164,0.55)';
    g.shadowBlur = 18;
    g.fillStyle = '#9FC7A4';
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(232,241,220,0.45)';
    g.beginPath();
    g.arc(px - r * 0.35, py - r * 0.35, r * 0.28, 0, Math.PI * 2);
    g.fill();
  },

  paintObstacle(g, x, y, c, e, o) {
    const px = e.x0 + x * c + c / 2,
      py = e.y0 + y * c + c / 2;
    g.fillStyle = '#D9A27A';
    if (o?.kind === 'branch') {
      g.save();
      g.translate(px, py);
      g.rotate((((x * 7 + y * 3) % 5) - 2) * 0.09);
      g.beginPath();
      g.moveTo(-30, -9);
      g.lineTo(30, -6);
      g.lineTo(28, 8);
      g.lineTo(-29, 10);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(80,50,30,0.35)';
      g.fillRect(-26, 2, 50, 3);
      g.restore();
    } else {
      const j = ((x * 13 + y * 7) % 7) - 3;
      g.beginPath();
      g.moveTo(px + j * 2, py - 24);
      g.lineTo(px + 25, py + 18 + j);
      g.lineTo(px - 23, py + 20 - j);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(80,50,30,0.28)';
      g.beginPath();
      g.moveTo(px + j * 2, py - 24);
      g.lineTo(px + 25, py + 18 + j);
      g.lineTo(px + 4, py + 19);
      g.closePath();
      g.fill();
    }
  },

  paintSnake(g: CanvasRenderingContext2D, pts: readonly Point[], _c: number, e: SnakePaintOptions) {
    if (pts.length < 2) return;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Dark outline under the body was removed: invisible on the old very dark background, it
    // read as a drop shadow once the background lightened.
    // 34, not 38: cell size dropped from 52 to 47; snake keeps the same fill ratio.
    if (e.tint !== undefined) {
      // Parse a '#rrggbb' hex string to [r,g,b].
      const hex2rgb = (h: string): RGB => [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
      ];
      // Linear interpolation between two RGB arrays.
      const baseRgb = hex2rgb('#d9e7cc');
      const tintRgb = hex2rgb(e.tint);
      const bodyRgb = lerpColor(baseRgb, tintRgb, 0.85);
      g.strokeStyle = rgb(bodyRgb);
      g.lineWidth = 34;
      g.beginPath();
      for (const [i, pt] of pts.entries()) {
        if (i === 0) {
          g.moveTo(pt.x, pt.y);
        } else {
          g.lineTo(pt.x, pt.y);
        }
      }
      g.stroke();
      const FALLBACK_PT: Point = { x: 0, y: 0 };
      const h = pts[0] ?? FALLBACK_PT,
        n = pts[Math.min(2, pts.length - 1)] ?? FALLBACK_PT;
      let dx = h.x - n.x,
        dy = h.y - n.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      g.fillStyle = e.tint;
      g.beginPath();
      g.arc(h.x, h.y, 21, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b2a1f';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(h.x + dx * 8 - dy * 7 * s, h.y + dy * 8 + dx * 7 * s, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.strokeStyle = '#d9e7cc';
      g.lineWidth = 34;
      g.beginPath();
      for (const [i, pt] of pts.entries()) {
        if (i === 0) {
          g.moveTo(pt.x, pt.y);
        } else {
          g.lineTo(pt.x, pt.y);
        }
      }
      g.stroke();
      const FALLBACK_PT2: Point = { x: 0, y: 0 };
      const h = pts[0] ?? FALLBACK_PT2,
        n = pts[Math.min(2, pts.length - 1)] ?? FALLBACK_PT2;
      let dx = h.x - n.x,
        dy = h.y - n.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      g.fillStyle = '#e8f1dc';
      g.beginPath();
      g.arc(h.x, h.y, 21, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b2a1f';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(h.x + dx * 8 - dy * 7 * s, h.y + dy * 8 + dx * 7 * s, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  },

  paintFront(g, e) {
    const A = ambience(e.hour || 0),
      progress = Math.min(1, Math.max(0, e.progression || 0));
    const layers = [];
    const tx = e.head.x,
      ty = e.head.y,
      k = activeCounts(e),
      silenceFactor = 1 - 0.7 * (e.silence || 0);
    // Rain takes the current hour's color and strengthens slightly as the round progresses.
    const color = lerpColor([180, 212, 222], A.ray, 0.55),
      force = (1 + 0.35 * progress) * silenceFactor * (e.reduced ? 0.5 : 1) * rainFactor();

    {
      g.save();
      halo ??= buildHaloModel();
      const halos: HTMLCanvasElement = halo;
      const headProximity = (x: number, y: number): number => {
        const d = Math.hypot(x - tx, y - ty);
        return d < 92 ? 0 : d < 224 ? (d - 92) / 132 : 1;
      };
      // Rotating fallers: autumn leaves and spring petals.
      const paintFalling = (
        P: number,
        n: number,
        seed: number,
        tons: readonly string[],
        size: number,
        al: number,
      ): void => {
        for (let i = 0; i < n && P > 0.01; i++) {
          const pr = rand(i, seed),
            v = 60 + pr * 70,
            T = size * (0.7 + 0.7 * pr);
          const y = ((rand(i, seed + 2) * (H + 80) + e.t * v) % (H + 80)) - 40;
          const x =
            rand(i, seed + 4) * W +
            Math.sin(e.t * (0.5 + rand(i, seed + 6) * 0.5) + rand(i, seed + 8) * 6.28) *
              (50 + 50 * pr) +
            wind * 0.8;
          g.save();
          g.translate(x, y);
          g.rotate(e.t * (0.6 + rand(i, seed + 10)) + rand(i, seed + 12) * 6.28);
          g.globalAlpha = (al + al * pr) * headProximity(x, y) * silenceFactor * P;
          g.scale(1, 0.3 + 0.7 * Math.abs(Math.sin(e.t * 1.3 + i)));
          paintLeaf(g, T, tons[i % tons.length] ?? '#000');
          g.restore();
        }
      };
      paintFalling(
        weight('autumn'),
        30,
        321,
        ['#c8822e', '#a04e22', '#d8a446', '#8a3a1c'],
        13,
        0.3,
      );
      paintFalling(weight('spring'), 34, 421, ['#f4c2d0', '#f7d6de', '#eaa6bc'], 8, 0.24);
      const Pn = weight('snow');
      if (Pn > 0.01) {
        const advance = Math.min(1, Math.max(0, e.subStep || 0));
        const snowflakeImg = tint('flake', halo, [236, 244, 255], 64, 64);
        // Three depths. Far: a dust of crisp points, slow, nearly vertical.
        g.fillStyle = '#eef4ff';
        for (let i = 0; i < 130; i++) {
          const v = 24 + rand(i, 501) * 22,
            y = ((rand(i, 503) * (H + 40) + e.t * v) % (H + 40)) - 20;
          const x = rand(i, 505) * W + Math.sin(e.t * 0.3 + rand(i, 507) * 6.28) * 12 + wind * 0.25;
          g.globalAlpha = (0.2 + 0.3 * rand(i, 509)) * headProximity(x, y) * silenceFactor * Pn;
          g.beginPath();
          g.arc(x, y, 1.0 + rand(i, 511) * 1.3, 0, Math.PI * 2);
          g.fill();
        }
        // Mid-range: soft swaying snowflakes. Density increases as the round progresses.
        const midCount = Math.round(46 + 34 * advance);
        for (let i = 0; i < midCount; i++) {
          const pr = rand(i, 301),
            v = 56 + pr * 80,
            R = 3.5 + pr * 6;
          const y = ((rand(i, 303) * (H + 80) + e.t * v) % (H + 80)) - 40;
          const x =
            rand(i, 305) * W +
            Math.sin(e.t * (0.35 + rand(i, 307) * 0.5) + rand(i, 309) * 6.28) * (26 + 40 * pr) +
            wind * 0.6;
          g.globalAlpha = (0.2 + 0.4 * pr) * headProximity(x, y) * silenceFactor * Pn;
          g.drawImage(snowflakeImg, x - R, y - R, R * 2, R * 2);
        }
        // Very close to the lens: a few large blurry flakes, fast, barely visible.
        for (let i = 0; i < 9; i++) {
          const v = 190 + rand(i, 521) * 90,
            R = 20 + rand(i, 523) * 20;
          const y = ((rand(i, 525) * (H + 200) + e.t * v) % (H + 200)) - 100;
          const x =
            ((rand(i, 527) * W + e.t * (30 + wind * 0.5)) % (W + 120)) -
            60 +
            Math.sin(e.t * 0.7 + i) * 30;
          g.globalAlpha = (0.07 + 0.06 * rand(i, 529)) * headProximity(x, y) * silenceFactor * Pn;
          g.drawImage(snowflakeImg, x - R, y - R, R * 2, R * 2);
        }
        // Cold breath at ground level, then the snowdrift rising with the round.
        const riseOffset = (1 - (0.36 + 0.64 * advance)) * 120 + (1 - Pn) * 80;
        // (Drawn last, above the vignette: snow catches light and must not be dimmed in the dark corners.)
        layers.push(() => {
          g.save();
          g.globalAlpha = 0.16 * Pn;
          g.drawImage(snowflakeImg, -200, H - 420 + riseOffset, W + 400, 300);
          g.globalAlpha = Pn;
          g.drawImage(snowdrift(), 0, H - SNOWDRIFT_H + riseOffset);
          for (let i = 0; i < 6 && !e.reduced; i++) {
            const lw = 260 + 200 * rand(i, 841),
              x = ((rand(i, 843) * (W + lw) + e.t * (70 + 70 * rand(i, 845))) % (W + lw)) - lw;
            const yc = H - ridgeAt(2)(x + lw / 2) + riseOffset,
              life = 0.5 + 0.5 * Math.sin(e.t * (0.5 + 0.4 * rand(i, 847)) + i * 2);
            g.globalAlpha = 0.3 * life * Pn;
            g.drawImage(snowflakeImg, x, yc - 26, lw, 40);
          }
          // Snow glittering: small four-pointed stars along the front crest.
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1.6;
          g.lineCap = 'round';
          for (let i = 0; i < 18; i++) {
            const x = rand(i, 541) * W,
              y = H - ridgeAt(2)(x) + riseOffset + 8 + rand(i, 543) * 60;
            const tw = Math.pow(
                Math.max(0, Math.sin(e.t * (0.9 + rand(i, 545) * 1.3) + rand(i, 547) * 6.28)),
                8,
              ),
              L = 3 + 8 * tw;
            if (tw < 0.03 || y > H) continue;
            g.globalAlpha = 0.95 * tw * Pn;
            g.beginPath();
            g.moveTo(x - L, y);
            g.lineTo(x + L, y);
            g.moveTo(x, y - L);
            g.lineTo(x, y + L);
            g.stroke();
            g.drawImage(snowflakeImg, x - L * 1.4, y - L * 1.4, L * 2.8, L * 2.8);
          }
          g.globalCompositeOperation = 'source-over';
          g.restore();
        });
        // Frost in the two top corners only: the bottom belongs to the snowdrift.
        const frostCorners: [number, number][] = [
          [0, 0],
          [W, 0],
        ];
        frostCorners.forEach(([qx, qy]) => {
          g.globalAlpha = 0.18 * Pn;
          g.drawImage(snowflakeImg, qx - 420, qy - 420, 840, 840);
        });
      }
      // The sea behind the beach, under the ground layers.
      const Psea = weight('sea');
      if (Psea > 0.01)
        layers.push(() => {
          paintSea(g, e, A, Psea);
        });
      // Season ground layer at the front, rising with the round and animated.
      Object.keys(GROUND_FOR).forEach((m) => {
        const P = weight(m);
        if (P > 0.01)
          layers.push(() => {
            paintGround(g, e, m, P);
          });
      });
      // Rising luminous particles: summer spores, embers, fireflies.
      const paintRising = (
        P: number,
        n: number,
        seed: number,
        color: RGB,
        key: string,
        speed: number,
        R0: number,
        al: number,
        twinkle: number,
      ): void => {
        if (P <= 0.01) return;
        const im = tint(key, halos, color, 64, 64);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n; i++) {
          const pr = rand(i, seed),
            R = R0 * (0.6 + pr);
          const y = H + 40 - ((rand(i, seed + 2) * (H + 80) + e.t * speed * (0.5 + pr)) % (H + 80));
          const x =
            rand(i, seed + 4) * W +
            Math.sin(e.t * 0.4 * (1 + twinkle) + rand(i, seed + 6) * 6.28) * (40 + 60 * twinkle);
          const cl = Math.max(0, Math.sin(e.t * (1.1 + twinkle * 2 * rand(i, seed + 8)) + i * 1.7));
          g.globalAlpha =
            Math.min(1, (al + al * 2 * pr) * (twinkle ? cl * cl : 0.6 + 0.4 * cl)) *
            headProximity(x, y) *
            silenceFactor *
            P;
          g.drawImage(im, x - R, y - R, R * 2, R * 2);
        }
        g.globalCompositeOperation = 'source-over';
      };
      paintRising(weight('summer'), 34, 341, [250, 232, 160], 'spore', 30, 5, 0.12, 0);
      paintRising(weight('embers'), 46, 441, [255, 140, 60], 'ember', 120, 6, 0.34, 0.5);
      paintRising(weight('fireflies'), 60, 461, [210, 255, 120], 'firefly', 10, 10, 0.32, 1);
      // Sea spray: a few fine droplets drifting up from the shore.
      paintRising(weight('sea'), 26, 491, [230, 246, 255], 'spray', 16, 4, 0.1, 0);
      const Pb = weight('mist');
      if (Pb > 0.01) {
        const mistImg = tint('mist', halo, [196, 210, 208], 64, 64);
        for (let i = 0; i < 6; i++) {
          const lw = 900 + rand(i, 351) * 500,
            lh = 240 + rand(i, 353) * 200;
          const x = ((rand(i, 355) * (W + lw) + e.t * (10 + rand(i, 357) * 16)) % (W + lw)) - lw;
          const y = H * (0.1 + 0.8 * rand(i, 359)) + Math.sin(e.t * 0.2 + i) * 30;
          g.globalAlpha = (0.13 + 0.07 * rand(i, 361)) * Pb;
          g.drawImage(mistImg, x, y - lh / 2, lw, lh);
        }
      }
      g.restore();
    }
    g.save();
    // Ripples on the board, where the audience is watching.
    g.lineWidth = 2.6;
    for (let i = 0; i < RMAX; i++) {
      if ((rt[i] ?? 0) >= 1) continue;
      const pf = 0.42 + 0.58 * (rp[i] ?? 0);
      g.globalAlpha = 0.11 * (1 - (rt[i] ?? 0)) * force * pf;
      g.strokeStyle = rgb(color);
      g.beginPath();
      g.ellipse(
        rx[i] ?? 0,
        ry[i] ?? 0,
        (14 + (rt[i] ?? 0) * 76) * pf,
        (5 + (rt[i] ?? 0) * 22) * pf,
        0,
        0,
        Math.PI * 2,
      );
      g.stroke();
    }
    // Short, bright splash fragments.
    for (let i = 0; i < EMAX; i++) {
      if ((et[i] ?? 0) > 0.45) continue;
      const u = 1 - (et[i] ?? 0) / 0.45;
      g.globalAlpha = 0.22 * u * force;
      g.fillStyle = rgb(color);
      g.beginPath();
      g.arc(ex[i] ?? 0, ey[i] ?? 0, 3 * u + 1, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Drops: rain parts around the snake's head.
    dropTemplate ??= buildDropModel();
    const gImg = tint('drop', dropTemplate, color, 24, 128);
    const traceDrops = (i0: number, i1: number, isNear: boolean): void => {
      const dropLen = isNear ? 40 : 22,
        narrowWidth = (dropLen * 24) / 128;
      for (let i = i0; i < i1; i++) {
        if (isNear && (gy[i] ?? 0) > (dropImpactY[i] ?? 0)) continue;
        const d = Math.hypot((gx[i] ?? 0) - tx, (gy[i] ?? 0) - ty);
        if (d < 92) continue;
        const f = d < 224 ? (d - 92) / 132 : 1;
        g.globalAlpha = (isNear ? 0.13 : 0.055) * (ga[i] ?? 0) * f * force;
        g.drawImage(
          gImg,
          (gx[i] ?? 0) - wind * 0.05 - narrowWidth / 2,
          (gy[i] ?? 0) - dropLen,
          narrowWidth,
          dropLen,
        );
      }
    };
    traceDrops(0, k.nl, false);
    traceDrops(N_FAR, N_FAR + k.np, true);
    g.restore();

    if (e.worldKind === 'moonlight' && e.world > 0) {
      g.save();
      g.globalAlpha = 0.75 * e.world;
      g.shadowColor = 'rgba(220,230,245,0.8)';
      g.shadowBlur = 30;
      g.fillStyle = '#e6ecf4';
      g.beginPath();
      g.arc(140, 80, 34, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // Grain: eliminates banding and gives the image its texture.
    if (!grainPattern) {
      try {
        grainPattern = g.createPattern(grainTile(), 'repeat');
      } catch {
        grainPattern = null;
      }
    }
    if (grainPattern) {
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = grainPattern;
      g.fillRect(0, 0, W, H);
      g.restore();
    }

    // Vignette tracks real tension; falls back to progression when tension is not provided.
    const tension = Math.min(1, Math.max(0, e.tension));
    g.drawImage(paintVignette(A, tension), 0, 0, W, H);

    // Lens drops: they slide on the image, not in the scene.
    g.save();
    for (let i = 0; i < (rainFactor() > 0.4 ? LMAX : 0); i++) {
      const y = (((ly[i] ?? 0) + e.t * (lv[i] ?? 0)) % (H + 160)) - 80,
        x = (lx[i] ?? 0) + Math.sin(e.t * 0.5 + (lph[i] ?? 0)) * 8,
        r = lr[i] ?? 0;
      const c = lerpColor([226, 242, 248], A.ray, 0.45);
      g.globalAlpha = 0.13;
      const rg2 = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      rg2.addColorStop(0, rgba(c, 0.85));
      rg2.addColorStop(0.7, rgba(lerpColor(c, [120, 150, 160], 0.6), 0.28));
      rg2.addColorStop(1, rgba(lerpColor(c, [120, 150, 160], 0.6), 0.05));
      g.fillStyle = rg2;
      g.beginPath();
      g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.09;
      g.strokeStyle = rgba(c, 0.9);
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.04;
      const tg = g.createLinearGradient(x, y - r * 5, x, y);
      tg.addColorStop(0, rgba(c, 0));
      tg.addColorStop(1, rgba(c, 0.6));
      g.fillStyle = tg;
      g.fillRect(x - r * 0.32, y - r * 5, r * 0.64, r * 5);
    }
    g.restore();
    g.globalAlpha = 1;
    // In 16:9, the foreground (ground, snowdrift) would overlap the board: clip it around the ring
    // so it only grows on the sides. In 9:16 it passes entirely under the board, no clipping needed.
    // 10 px margin around the ring so the full ring border is preserved, not just its interior.
    if (W > H) {
      g.save();
      g.beginPath();
      g.rect(0, 0, W, H);
      g.rect(GX0 - 10, GY0 - 10, GX1 - GX0 + 20, GY1 - GY0 + 20);
      g.clip('evenodd');
    }
    layers.forEach((f) => {
      f();
    });
    if (W > H) g.restore();
  },

  update(dt, e) {
    if (e.reduced) return;
    wind = Math.sin((e.t / 15) * Math.PI * 2) * 40;
    const k = activeCounts(e),
      force = 1 + 0.5 * Math.min(1, Math.max(0, e.progression || 0));
    for (let i = 0; i < N; i++) {
      if ((i < N_FAR && i >= k.nl) || (i >= N_FAR && i >= N_FAR + k.np)) continue;
      const prevY = gy[i] ?? 0;
      gy[i] = (gy[i] ?? 0) + (gv[i] ?? 0) * force * dt;
      gx[i] = (gx[i] ?? 0) + wind * dt;
      if ((gx[i] ?? 0) < 0) gx[i] = (gx[i] ?? 0) + W;
      else if ((gx[i] ?? 0) > W) gx[i] = (gx[i] ?? 0) - W;
      // Impact at the drop's own depth on the board, never all on the same line.
      if (i >= N_FAR && prevY <= (dropImpactY[i] ?? 0) && (gy[i] ?? 0) > (dropImpactY[i] ?? 0)) {
        const prof = ((dropImpactY[i] ?? 0) - GY0) / (GY1 - GY0); // 0 at the back, 1 at the front.
        for (let r = 0; r < RMAX; r++)
          if ((rt[r] ?? 0) >= 1) {
            rx[r] = gx[i] ?? 0;
            ry[r] = dropImpactY[i] ?? 0;
            rt[r] = 0;
            rp[r] = prof;
            break;
          }
        for (let q = 0; q < EMAX; q++)
          if ((et[q] ?? 0) > 0.45) {
            const a = -Math.PI / 2 + (rand(i, 93 + (dropTurns[i] ?? 0)) - 0.5) * 2;
            ex[q] = gx[i] ?? 0;
            ey[q] = dropImpactY[i] ?? 0;
            evx[q] = Math.cos(a) * (60 + rand(i, 95) * 120) * prof;
            evy[q] = Math.sin(a) * (110 + rand(i, 97) * 140) * prof;
            et[q] = 0;
            break;
          }
        // Impact: drop disappears and respawns from the top, like a real raindrop.
        dropTurns[i] = (dropTurns[i] ?? 0) + 1;
        seedDrop(i, true);
        continue;
      }
      if ((gy[i] ?? 0) > H + 30) {
        dropTurns[i] = (dropTurns[i] ?? 0) + 1;
        seedDrop(i, true);
      }
    }
    for (let r = 0; r < RMAX; r++)
      if ((rt[r] ?? 0) < 1) rt[r] = Math.min(1, (rt[r] ?? 0) + dt / 1.1);
    for (let q = 0; q < EMAX; q++)
      if ((et[q] ?? 0) <= 0.45) {
        et[q] = (et[q] ?? 0) + dt;
        ex[q] = (ex[q] ?? 0) + (evx[q] ?? 0) * dt;
        ey[q] = (ey[q] ?? 0) + (evy[q] ?? 0) * dt;
        evy[q] = (evy[q] ?? 0) + 920 * dt;
      }
  },

  ambientSound(
    ac: AudioContext,
    destination: AudioNode,
    opts?: { readonly externalMusic?: boolean },
  ): AmbientSoundHandle {
    const externalMusic = opts?.externalMusic === true,
      base = externalMusic ? 0.25 : 0.55;
    const src = ac.createBufferSource();
    src.buffer = pinkNoise(ac, 6);
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.6;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const gb = ac.createGain();
    gb.gain.value = 0.9;
    const gl = ac.createGain();
    gl.gain.value = 0.5;
    const mainGain = ac.createGain();
    mainGain.gain.value = 0;
    src.connect(bp);
    bp.connect(gb);
    gb.connect(mainGain);
    src.connect(lp);
    lp.connect(gl);
    gl.connect(mainGain);
    mainGain.connect(destination);
    mainGain.gain.setTargetAtTime(base, ac.currentTime, 0.8);
    src.start();
    let timer: ReturnType<typeof setTimeout> | null = null,
      stopped = false;
    const scale = [392, 440, 493.88, 587.33, 659.25, 783.99];
    function chime() {
      if (stopped) return;
      const t0 = ac.currentTime,
        f = (scale[Math.floor(Math.random() * scale.length)] ?? 392) * 2;
      const o = ac.createOscillator(),
        gg = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      gg.gain.setValueAtTime(0, t0);
      gg.gain.linearRampToValueAtTime(0.03, t0 + 0.01);
      gg.gain.exponentialRampToValueAtTime(0.0005, t0 + 2.5);
      o.connect(gg);
      gg.connect(destination);
      o.start(t0);
      o.stop(t0 + 2.6);
      timer = setTimeout(chime, 8000 + Math.random() * 12000);
    }
    if (!externalMusic) timer = setTimeout(chime, 5000);
    return {
      stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        mainGain.gain.setTargetAtTime(0, ac.currentTime, 0.3);
        try {
          src.stop(ac.currentTime + 1.5);
        } catch {
          /* stop may throw if already stopped */
        }
      },
      silence(sec: number) {
        const t0 = ac.currentTime;
        mainGain.gain.cancelScheduledValues(t0);
        mainGain.gain.setTargetAtTime(base * 0.3, t0, 0.08);
        mainGain.gain.setTargetAtTime(base, t0 + 0.3, Math.max(0.1, sec / 3));
      },
    };
  },

  biteSound(ac: AudioContext, destination: AudioNode, freq: number) {
    const t0 = ac.currentTime;
    const biteSpecs: [OscillatorType, number, number][] = [
      ['sine', freq, 0.12],
      ['triangle', freq * 2, 0.04],
    ];
    biteSpecs.forEach(([type, f, v]) => {
      const o = ac.createOscillator(),
        gg = ac.createGain();
      o.type = type;
      o.frequency.value = f;
      gg.gain.setValueAtTime(0, t0);
      gg.gain.linearRampToValueAtTime(v, t0 + 0.005);
      gg.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.35);
      o.connect(gg);
      gg.connect(destination);
      o.start(t0);
      o.stop(t0 + 0.4);
    });
  },

  // Hatch sound: dry cracks during the split, then a warm chord opening.
  hatchSound(ac: AudioContext, destination: AudioNode, phase: HatchPhase) {
    const t0 = ac.currentTime;
    if (phase === 'crack') {
      const o = ac.createOscillator(),
        gg = ac.createGain(),
        f = 1400 + Math.random() * 700;
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 0.45, t0 + 0.05);
      gg.gain.setValueAtTime(0.045, t0);
      gg.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.09);
      o.connect(gg);
      gg.connect(destination);
      o.start(t0);
      o.stop(t0 + 0.12);
      return;
    }
    // Hatch tone: a bass rising under a fifth chord, long and soft.
    const bass = ac.createOscillator(),
      gb = ac.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(98, t0);
    bass.frequency.exponentialRampToValueAtTime(196, t0 + 0.5);
    gb.gain.setValueAtTime(0.0001, t0);
    gb.gain.exponentialRampToValueAtTime(0.11, t0 + 0.06);
    gb.gain.exponentialRampToValueAtTime(0.0004, t0 + 1.1);
    bass.connect(gb);
    gb.connect(destination);
    bass.start(t0);
    bass.stop(t0 + 1.2);
    const hatchNotes: [number, number, number][] = [
      [392, 0, 0.075],
      [587.33, 0.06, 0.055],
      [783.99, 0.12, 0.04],
    ];
    hatchNotes.forEach(([f, d, v]) => {
      const o = ac.createOscillator(),
        gg = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      gg.gain.setValueAtTime(0.0001, t0 + d);
      gg.gain.exponentialRampToValueAtTime(v, t0 + d + 0.05);
      gg.gain.exponentialRampToValueAtTime(0.0004, t0 + d + 1.4);
      o.connect(gg);
      gg.connect(destination);
      o.start(t0 + d);
      o.stop(t0 + d + 1.5);
    });
  },

  giftSound(ac: AudioContext, destination: AudioNode, type: AmbienceGiftSound) {
    const t0 = ac.currentTime;
    if (type === 'help') {
      [1174.66, 1760].forEach((f, i) => {
        const o = ac.createOscillator(),
          gg = ac.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        gg.gain.setValueAtTime(0, t0);
        gg.gain.linearRampToValueAtTime(i ? 0.03 : 0.07, t0 + 0.01);
        gg.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.2);
        o.connect(gg);
        gg.connect(destination);
        o.start(t0);
        o.stop(t0 + 1.3);
      });
    } else if (type === 'hinder') {
      const o = ac.createOscillator(),
        gg = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t0);
      o.frequency.exponentialRampToValueAtTime(62, t0 + 0.35);
      gg.gain.setValueAtTime(0.16, t0);
      gg.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.45);
      o.connect(gg);
      gg.connect(destination);
      o.start(t0);
      o.stop(t0 + 0.5);
      const n = ac.createBufferSource();
      n.buffer = pinkNoise(ac, 0.2);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const gn = ac.createGain();
      gn.gain.setValueAtTime(0.12, t0);
      gn.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.18);
      n.connect(f);
      f.connect(gn);
      gn.connect(destination);
      n.start(t0);
    } else {
      const n = ac.createBufferSource();
      n.buffer = pinkNoise(ac, 2.4);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.7;
      f.frequency.setValueAtTime(400, t0);
      f.frequency.exponentialRampToValueAtTime(1600, t0 + 2);
      const gn = ac.createGain();
      gn.gain.setValueAtTime(0, t0);
      gn.gain.linearRampToValueAtTime(0.18, t0 + 1.8);
      gn.gain.linearRampToValueAtTime(0, t0 + 2.4);
      n.connect(f);
      f.connect(gn);
      gn.connect(destination);
      n.start(t0);
    }
  },
});
