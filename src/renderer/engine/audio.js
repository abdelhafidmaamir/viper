// Sound: a single AudioContext, armed on the first user gesture (browsers refuse to play
// before one), and the effects synthesised on the fly. The ambience provides its own voices
// (bite, hatching) and plays them through the shared output.

let ac = null,
  sortie = null,
  sonActif = true,
  noteIdx = 0;

/** True once audio is armed and not muted. */
export const sonPret = () => Boolean(sonActif && ac);

// Le navigateur refuse de jouer avant un geste : on arme le son au premier clic ou a la premiere touche.
export function armerSon() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume();
    return;
  }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    sortie = ac.createGain();
    sortie.gain.value = 0.6;
    sortie.connect(ac.destination);
    if (ac.state === 'suspended') ac.resume();
  } catch (er) {
    ac = null;
  }
}
// Un souffle de bruit filtre : sert au vent de la chute comme a la poussiere du choc.
function bruitFiltre(dur, gain, f0, f1, q, retard) {
  const t0 = ac.currentTime + (retard || 0),
    n = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, n, ac.sampleRate),
    d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sortie);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}
// La pierre s'annonce : la terre gronde doucement pendant qu'elle se bombe.
export function sonPoussee(alerte) {
  if (!sonActif || !ac) return;
  try {
    // La sub porte la masse sur une vraie enceinte, mais un telephone ne rend rien sous 400 Hz :
    // l'avertissement doit donc vivre dans le grain median, sinon il est muet la ou le jeu se joue.
    bruitFiltre(alerte * 0.95, 0.016, 90, 240, 1.6);
    bruitFiltre(alerte * 0.95, 0.022, 520, 1400, 0.8); // le grain de terre qui se dechire, audible partout
    [0.14, 0.44, 0.76].forEach((k, i) => {
      // trois craquements secs, de plus en plus haut
      bruitFiltre(0.05, 0.04 + 0.012 * i, 1500 + 500 * i, 800, 1.2, alerte * k);
    });
    const t0 = ac.currentTime,
      o = ac.createOscillator(),
      g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(38, t0);
    o.frequency.linearRampToValueAtTime(58, t0 + alerte);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + alerte * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0002, t0 + alerte * 1.15);
    o.connect(g);
    g.connect(sortie);
    o.start(t0);
    o.stop(t0 + alerte * 1.2);
  } catch (er) {}
}
// Elle se cale : rien ne frappe, la terre se referme autour d'elle.
export function sonPose() {
  if (!sonActif || !ac) return;
  try {
    const t0 = ac.currentTime;
    // Trois couches : le choc qui claque, le corps qui donne la masse au telephone, la sub pour le casque.
    bruitFiltre(0.09, 0.09, 1100, 300, 0.7); // le choc
    const c = ac.createOscillator(),
      gc = ac.createGain();
    c.type = 'triangle';
    c.frequency.setValueAtTime(200, t0);
    c.frequency.exponentialRampToValueAtTime(120, t0 + 0.18);
    gc.gain.setValueAtTime(0.0001, t0);
    gc.gain.linearRampToValueAtTime(0.08, t0 + 0.012);
    gc.gain.exponentialRampToValueAtTime(0.0002, t0 + 0.26);
    c.connect(gc);
    gc.connect(sortie);
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
    g.connect(sortie);
    o.start(t0);
    o.stop(t0 + 0.55);
    bruitFiltre(0.4, 0.02, 1200, 300, 0.9, 0.05); // la poussiere qui retombe
  } catch (er) {}
}

// La ronce ne gronde pas : elle craque a sec et siffle. Aucune basse, c'est l'inverse de la pierre.
export function sonRonce() {
  if (!sonActif || !ac) return;
  try {
    bruitFiltre(0.55, 0.026, 700, 2600, 1.1);
    [0, 0.12, 0.26].forEach((d, i) => bruitFiltre(0.035, 0.032, 2400 - 300 * i, 1200, 1.6, d));
  } catch (er) {}
}
// Un segment de plus : un petit craquement sec, plus haut a chaque fois qu'elle s'allonge.
export function sonRoncePas(i) {
  if (!sonActif || !ac) return;
  try {
    bruitFiltre(0.05, 0.03, 1500 + 340 * i, 900, 1.5);
    bruitFiltre(0.18, 0.014, 900 + 200 * i, 2200, 1.0, 0.02);
  } catch (er) {}
}

export function basculerSon() {
  armerSon();
  sonActif = !sonActif;
  return sonActif;
}

/** The ambience's bite note, walking up its scale one note per berry. */
export function jouerBouchee(ambience) {
  if (sonActif && ac && ambience)
    try {
      ambience.sonBouchee(ac, sortie, ambience.gamme[noteIdx++ % ambience.gamme.length]);
    } catch (er) {}
}

/** The ambience's hatching sounds: 'fissure' while the egg cracks, 'naissance' when it opens. */
export function jouerEclosion(ambience, moment) {
  try {
    ambience.sonEclosion(ac, sortie, moment);
  } catch (er) {}
}

export const estSonActif = () => sonActif;
