// Feed the Snake: the rain's own sound, picked in the control room (Setup > Ambience sound) and
// heard only while the weather is rain. Synthesised like the rest (sound.ts), on its own bus that
// sound.ts dips under every bite, gift, alert and full board, so the game always sits on top.
// Each bed keeps out of the game's bands: the berries' knock (300 Hz), their tick (1.4 kHz) and
// the bubble leaving the flower (0.6 to 1.5 kHz).

import { audioContext, bedInput } from './sound.ts';
import type { RainSound } from '../../shared/feed-protocol.ts';

/** Overall level of the rain against the game's sounds (see the levels check in the PR). */
const LEVEL = 0.28;
/** Evens the beds out: measured alone, they sit within a few dB of each other with these. */
const TRIM: Record<RainSound, number> = {
  off: 0,
  leaves: 0.83,
  window: 0.37,
  tent: 1.6,
  pond: 1,
  pad: 0.41,
};

interface Bed {
  readonly id: RainSound;
  readonly bus: GainNode;
  readonly timers: number[];
  readonly stops: (() => void)[];
  dead: boolean;
}

let running: Bed | null = null;
const buffers = new Map<string, AudioBuffer>();

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

function buffer(ac: BaseAudioContext, kind: 'white' | 'brown' | 'pink'): AudioBuffer {
  const key = `${kind}:${String(ac.sampleRate)}`;
  const known = buffers.get(key);
  if (known) return known;
  const n = ac.sampleRate * 4,
    b = ac.createBuffer(1, n, ac.sampleRate),
    d = b.getChannelData(0);
  let last = 0,
    b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      // Paul Kellet's pink filter: the hiss of steady rain.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  buffers.set(key, b);
  return b;
}

/** A looping noise bed through one filter, faded in. */
function loopBed(
  ac: BaseAudioContext,
  bed: Bed,
  kind: 'brown' | 'pink',
  type: BiquadFilterType,
  freq: number,
  gain: number,
): void {
  const src = ac.createBufferSource(),
    f = ac.createBiquadFilter(),
    g = ac.createGain(),
    t = ac.currentTime;
  src.buffer = buffer(ac, kind);
  src.loop = true;
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = 0.5;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 1.5);
  src.connect(f).connect(g).connect(bed.bus);
  src.start(t, rnd(0, 3));
  bed.stops.push(() => {
    const now = ac.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(0, now, 0.25);
    src.stop(now + 1.5);
  });
}

/** A short filtered noise burst: a drop on a leaf, a pane, a tent. */
function tick(
  ac: BaseAudioContext,
  bus: AudioNode,
  at: number,
  freq: number,
  q: number,
  dur: number,
  gain: number,
  kind: 'white' | 'brown' = 'white',
): void {
  const src = ac.createBufferSource(),
    f = ac.createBiquadFilter(),
    g = ac.createGain();
  src.buffer = buffer(ac, kind);
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(at, rnd(0, 3));
  src.stop(at + dur + 0.05);
}

/** A water drop: a sine whose pitch flicks upward. */
function drop(
  ac: BaseAudioContext,
  bus: AudioNode,
  at: number,
  f0: number,
  f1: number,
  dur: number,
  gain: number,
): void {
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.35);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Distant thunder: low-passed brown noise, a slow swell and a long tail. */
function thunder(ac: BaseAudioContext, bus: AudioNode, at: number): void {
  const src = ac.createBufferSource(),
    f = ac.createBiquadFilter(),
    g = ac.createGain(),
    peak = rnd(0.25, 0.45);
  src.buffer = buffer(ac, 'brown');
  f.type = 'lowpass';
  f.frequency.value = rnd(90, 160);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak * 0.4, at + 0.6);
  g.gain.linearRampToValueAtTime(peak, at + 1.8);
  g.gain.exponentialRampToValueAtTime(0.0001, at + rnd(6, 9));
  src.connect(f).connect(g).connect(bus);
  src.start(at, rnd(0, 2));
  src.stop(at + 10);
}

/** Runs `fn` again and again at random gaps (ms) until the bed stops. */
function every(ac: BaseAudioContext, bed: Bed, min: number, max: number, fn: (at: number) => void) {
  const loop = (): void => {
    if (bed.dead) return;
    fn(ac.currentTime + 0.05);
    bed.timers.push(window.setTimeout(loop, rnd(min, max)));
  };
  loop();
}

/** The five beds. Exported for the levels check. */
export function startBed(ac: BaseAudioContext, bed: Bed): void {
  const bus = bed.bus;
  const leaves = (tickGain: number): void => {
    loopBed(ac, bed, 'pink', 'bandpass', 3200, 0.18);
    loopBed(ac, bed, 'brown', 'lowpass', 450, 0.12);
    every(ac, bed, 25, 70, (t) => {
      tick(ac, bus, t, rnd(2200, 6000), rnd(4, 9), rnd(0.03, 0.07), rnd(0.4, 1) * tickGain);
    });
  };
  switch (bed.id) {
    case 'leaves':
      leaves(0.08);
      break;
    case 'window':
      loopBed(ac, bed, 'brown', 'lowpass', 650, 0.32);
      loopBed(ac, bed, 'pink', 'highpass', 3200, 0.04);
      every(ac, bed, 180, 700, (t) => {
        drop(ac, bus, t, rnd(2200, 3400), rnd(3200, 4800), rnd(0.05, 0.09), rnd(0.03, 0.07));
      });
      every(ac, bed, 60, 160, (t) => {
        tick(ac, bus, t, rnd(3500, 6500), rnd(6, 12), 0.02, rnd(0.02, 0.06));
      });
      every(ac, bed, 18_000, 40_000, (t) => {
        thunder(ac, bus, t + rnd(0, 2));
      });
      break;
    case 'tent':
      loopBed(ac, bed, 'pink', 'bandpass', 2400, 0.08);
      every(ac, bed, 30, 90, (t) => {
        tick(ac, bus, t, rnd(150, 240), rnd(2, 3), rnd(0.05, 0.11), rnd(0.15, 0.32), 'brown');
      });
      every(ac, bed, 90, 260, (t) => {
        tick(ac, bus, t, rnd(2000, 3000), rnd(3, 6), 0.04, rnd(0.04, 0.09));
      });
      break;
    case 'pond':
      loopBed(ac, bed, 'pink', 'bandpass', 3200, 0.05);
      loopBed(ac, bed, 'brown', 'lowpass', 350, 0.08);
      every(ac, bed, 140, 620, (t) => {
        const f = rnd(330, 520);
        drop(ac, bus, t, f, f * rnd(1.6, 1.9), rnd(0.14, 0.22), rnd(0.06, 0.13));
      });
      every(ac, bed, 40, 120, (t) => {
        tick(ac, bus, t, rnd(4500, 7500), rnd(8, 14), 0.015, rnd(0.01, 0.03));
      });
      break;
    case 'pad': {
      leaves(0.06);
      const lp = ac.createBiquadFilter(),
        pg = ac.createGain(),
        t0 = ac.currentTime;
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      pg.gain.setValueAtTime(0, t0);
      pg.gain.linearRampToValueAtTime(0.03, t0 + 4);
      lp.connect(pg).connect(bus);
      // Fmaj7 drifting to Dm7 and back, very soft, under the rain.
      const chords = [
        [174.61, 220, 261.63, 329.63],
        [146.83, 220, 261.63, 349.23],
      ] as const;
      const oscs = chords[0].flatMap((f, i) =>
        [-4, 4].map((detune) => {
          const o = ac.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          o.detune.value = detune;
          o.connect(lp);
          o.start(t0);
          return { o, i };
        }),
      );
      let k = 0;
      bed.timers.push(
        window.setInterval(() => {
          k = 1 - k;
          const now = ac.currentTime;
          for (const { o, i } of oscs) o.frequency.setTargetAtTime(chords[k]?.[i] ?? 220, now, 1.2);
        }, 9000),
      );
      bed.stops.push(() => {
        const now = ac.currentTime;
        pg.gain.cancelScheduledValues(now);
        pg.gain.setTargetAtTime(0, now, 0.3);
        for (const { o } of oscs) o.stop(now + 1.5);
      });
      break;
    }
    case 'off':
      break;
  }
}

/** A bed ready to start on `dest`, at the rain's level. Exported for the levels check. */
export function newBed(ac: BaseAudioContext, dest: AudioNode, id: RainSound): Bed {
  const bus = ac.createGain();
  bus.gain.value = LEVEL * TRIM[id];
  bus.connect(dest);
  return { id, bus, timers: [], stops: [], dead: false };
}

function stop(bed: Bed): void {
  bed.dead = true;
  for (const id of bed.timers) {
    clearTimeout(id);
    clearInterval(id);
  }
  for (const s of bed.stops) s();
  window.setTimeout(() => {
    bed.bus.disconnect();
  }, 2000);
}

/**
 * Once a frame: the bed that should be playing, 'off' for none. Starts, swaps or stops it; does
 * nothing until the sound is armed.
 */
export function updateRainBed(want: RainSound): void {
  if ((running?.id ?? 'off') === want) return;
  const ac = audioContext(),
    dest = bedInput();
  if (!ac || !dest) return;
  if (running) stop(running);
  running = null;
  if (want === 'off') return;
  running = newBed(ac, dest, want);
  startBed(ac, running);
}
