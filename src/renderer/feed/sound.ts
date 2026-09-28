// Feed the Snake: soft, satisfying sound, synthesised (no files). A bite is a round "bloop" that
// climbs a pentatonic scale while the snake eats a line of berries in a row, with a tiny crunch;
// landing berries tick like rain on leaves; a gift shimmers; a full board swells into a chord.
// Browsers only allow sound after a gesture: armSound().

import { alertSounds } from './alerts.ts';
import { hooks } from './state.ts';

let ac: AudioContext | null = null,
  out: GainNode | null = null,
  noise: AudioBuffer | null = null;

const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
    d = b.getChannelData(0);
  let last = 0;
  // Brown noise: soft and round, the texture of the little ticks.
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return b;
}

export function armSound(): void {
  if (ac) {
    if (ac.state === 'suspended') void ac.resume();
    return;
  }
  ac = new AudioContext();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  out = ac.createGain();
  out.gain.value = 0.7;
  out.connect(comp).connect(ac.destination);
  noise = noiseBuffer(ac);
}

function tone(
  freq: number,
  at: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  bend = 1,
): void {
  if (!ac || !out) return;
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq * bend, at);
  o.frequency.exponentialRampToValueAtTime(freq, at + 0.05);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function tick(at: number, freq: number, dur: number, gain: number): void {
  if (!ac || !out || !noise) return;
  const src = ac.createBufferSource(),
    bp = ac.createBiquadFilter(),
    g = ac.createGain();
  src.buffer = noise;
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 3;
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(at, Math.random());
  src.stop(at + dur + 0.02);
}

// Every berry gets its own sounds, nothing skipped or throttled: a bubbly "plip" as it leaves the
// flower, a soft wooden "tok" at the exact moment it touches the board (scheduled on the audio
// clock), and a round "bloop" when it is eaten, climbing a pentatonic scale through a chain.
/** How late the speakers are behind the screen (output buffering), so sounds can be sent early. */
function lag(): number {
  if (!ac) return 0;
  return Math.min(0.25, (ac.outputLatency || 0) + (ac.baseLatency || 0));
}
hooks.lead = lag;

hooks.eat = (combo) => {
  if (!ac) return;
  const now = ac.currentTime,
    f = SCALE[combo % SCALE.length] ?? 523.25;
  tone(f, now, 0.26, 0.13, 'sine', 1.35);
  tone(f * 2, now, 0.1, 0.025, 'triangle', 1.2);
  tick(now, 2600, 0.025, 0.07);
};

hooks.land = (delay) => {
  if (!ac) return;
  const now = ac.currentTime,
    at = now + Math.max(0, delay - lag()),
    lift = 620 + Math.random() * 160;
  // Leaving the flower: a small rising bubble.
  plip(now, lift);
  // Touching the board: a soft low knock with a hint of texture.
  tone(300 + Math.random() * 60, at, 0.12, 0.07, 'sine', 1.6);
  tick(at, 1400, 0.02, 0.03);
};

function plip(at: number, freq: number): void {
  if (!ac || !out) return;
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(freq * 1.9, at + 0.05);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.03, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + 0.09);
}

hooks.gift = (n) => {
  if (!ac) return;
  const now = ac.currentTime,
    notes = n >= 30 ? [1318.51, 1567.98, 1975.53, 2637.02] : [1318.51, 1567.98, 1975.53];
  notes.forEach((f, i) => {
    tone(f, now + i * 0.06, 0.5, 0.045);
  });
};

hooks.full = () => {
  if (!ac) return;
  const now = ac.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
    tone(f, now + i * 0.09, 2.2, 0.07);
  });
};

// Viewer alerts, soft like the berries: a light wooden chime for a join, two bright notes going
// up for a follow or a share, tiny pops under the hearts of a like.
alertSounds.show = (kind, first) => {
  if (!ac) return;
  const now = ac.currentTime;
  if (kind === 'join') {
    // A soft bloom: three notes rising, a fourth one for a first visit.
    const notes = first ? [783.99, 1046.5, 1318.51, 1567.98] : [783.99, 1046.5, 1318.51];
    notes.forEach((f, i) => {
      tone(f, now + i * 0.09, 0.6, 0.035, 'sine');
    });
  } else if (kind === 'follow') {
    tone(1046.5, now, 0.4, 0.04, 'sine');
    tone(1567.98, now + 0.08, 0.5, 0.035, 'sine');
  } else if (kind === 'share') {
    tone(1174.66, now, 0.4, 0.04, 'triangle');
    tone(1760, now + 0.08, 0.5, 0.03, 'triangle');
  }
};

alertSounds.heart = () => {
  if (!ac) return;
  tick(ac.currentTime, 1800 + Math.random() * 900, 0.04, 0.035);
};
