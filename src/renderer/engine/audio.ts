// Sound: a single AudioContext, armed on the first user gesture (browsers refuse to play
// before one), and the effects synthesised on the fly. The ambience provides its own voices
// (bite, hatching) and plays them through the shared output.

import type { Ambience, HatchPhase } from './types-api.ts';

let ac: AudioContext | null = null,
  output: GainNode | null = null,
  soundEnabled = true,
  noteIndex = 0;

/** True once audio is armed and not muted. */
export const isSoundReady = (): boolean => Boolean(soundEnabled && ac);

// Browsers block autoplay before a user gesture; arm on the first click or key press.
export function armSound(): void {
  if (ac) {
    if (ac.state === 'suspended') void ac.resume();
    return;
  }
  try {
    ac = new window.AudioContext();
    output = ac.createGain();
    output.gain.value = 0.6;
    output.connect(ac.destination);
    if (ac.state === 'suspended') void ac.resume();
  } catch {
    ac = null;
  }
}
// A burst of filtered noise: used for both the falling wind and the impact dust.
function playFilteredNoise(
  duration: number,
  gain: number,
  f0: number,
  f1: number,
  q: number,
  delay = 0,
): void {
  if (!ac || !output) return;
  const t0 = ac.currentTime + delay,
    n = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buf = ac.createBuffer(1, n, ac.sampleRate),
    d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(f1, t0 + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + duration * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f);
  f.connect(g);
  g.connect(output);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}
// The stone settles: nothing strikes, the earth closes around it.
export function playStone(): void {
  if (!soundEnabled || !ac || !output) return;
  try {
    const t0 = ac.currentTime;
    // Three layers: impact transient, body giving mass for the phone speaker, sub for headphones.
    playFilteredNoise(0.09, 0.09, 1100, 300, 0.7); // impact transient
    const c = ac.createOscillator(),
      gc = ac.createGain();
    c.type = 'triangle';
    c.frequency.setValueAtTime(200, t0);
    c.frequency.exponentialRampToValueAtTime(120, t0 + 0.18);
    gc.gain.setValueAtTime(0.0001, t0);
    gc.gain.linearRampToValueAtTime(0.08, t0 + 0.012);
    gc.gain.exponentialRampToValueAtTime(0.0002, t0 + 0.26);
    c.connect(gc);
    gc.connect(output);
    c.start(t0);
    c.stop(t0 + 0.28);
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, t0);
    o.frequency.exponentialRampToValueAtTime(62, t0 + 0.35);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.055, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + 0.5);
    o.connect(g);
    g.connect(output);
    o.start(t0);
    o.stop(t0 + 0.55);
    playFilteredNoise(0.4, 0.02, 1200, 300, 0.9, 0.05); // dust settling
  } catch {
    // audio context errors are non-fatal
  }
}

// The bramble does not rumble: it snaps dry and hisses. No bass, opposite of the stone.
export function playBramble(): void {
  if (!soundEnabled || !ac) return;
  try {
    playFilteredNoise(0.55, 0.026, 700, 2600, 1.1);
    [0, 0.12, 0.26].forEach((d, i) => {
      playFilteredNoise(0.035, 0.032, 2400 - 300 * i, 1200, 1.6, d);
    });
  } catch {
    // audio context errors are non-fatal
  }
}
// One more segment: a short dry snap, rising in pitch each time the bramble extends.
export function playBrambleStep(i: number): void {
  if (!soundEnabled || !ac) return;
  try {
    playFilteredNoise(0.05, 0.03, 1500 + 340 * i, 900, 1.5);
    playFilteredNoise(0.18, 0.014, 900 + 200 * i, 2200, 1.0, 0.02);
  } catch {
    // audio context errors are non-fatal
  }
}

export function toggleSound(): boolean {
  armSound();
  soundEnabled = !soundEnabled;
  return soundEnabled;
}

/** The ambience's bite note, walking up its scale one note per berry. */
export function playBite(ambience: Ambience): void {
  if (soundEnabled && ac && output)
    try {
      const freq = ambience.scale[noteIndex++ % ambience.scale.length];
      if (freq !== undefined) ambience.biteSound(ac, output, freq);
    } catch {
      // audio context errors are non-fatal
    }
}

/** The ambience's hatching sounds: 'fissure' while the egg cracks, 'naissance' when it opens. */
export function playHatch(ambience: Ambience, moment: HatchPhase): void {
  if (!ac || !output) return;
  try {
    ambience.hatchSound?.(ac, output, moment);
  } catch {
    // audio context errors are non-fatal
  }
}

export const isSoundActive = (): boolean => soundEnabled;
