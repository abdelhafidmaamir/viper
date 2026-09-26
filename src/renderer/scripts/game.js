// Vipere Live, base minimale : un serpent IA qui mange et grandit dans la foret. Rien d'autre.
// Vitesse constante, se toucher tue toujours, aucun texte sur le canvas, aucun son de fond.

import { W, H, COLS, ROWS, CELL, X0, Y0, OX, WF, setFormat } from '../engine/layout.js';
import { canvas, ctx, bindCanvas } from '../engine/canvas.js';
import {
  armSound,
  toggleSound,
  isSoundActive,
  playBite,
  playHatch,
  playStone,
  isSoundReady,
} from '../engine/audio.js';
import { announceStreak, resetRoundDonations, announceRescue } from '../engine/announcements.js';
import { SHADOW, GOLD } from '../engine/palette.js';
import {
  ADULT_LENGTH,
  STONE_WARNING,
  HUNT_BY_TEAM,
  CUT_FRACTION,
  START_LENGTH,
  HATCH_TIME,
  FLAIR_BY_TEAM,
  FOREST_BERRY_INTERVAL,
  SEED_GROW_TIME,
  TARGET_LENGTH,
  YOUNG_MIN_LENGTH,
  TIERS,
  BRAMBLE_WARNING,
  BRAMBLE_MAX_SEGMENTS,
  BRAMBLE_STEP,
  EMERGE_TIME,
  BOOST_FACTOR,
  REPRIEVE_LENGTH,
  TRAIL_TIME,
  STONE_LIFE,
  BRAMBLE_LIFE,
  SPEED,
} from '../engine/rules.js';
import { cadence, forceLength, maxLength, updateTier, tier, jitter } from '../engine/crowd.js';
import {
  extendBramble,
  freeCells,
  plantBramble,
  activeBrambles,
  allFruits,
  isDeadZone,
} from '../engine/hazards.js';
import { sceneState, endScene, launchScene, scene } from '../engine/scenes.js';
import { updateTension, tension } from '../engine/tension.js';
import { receiveEvent } from '../engine/audience-events.js';
import { clearGiftFeedback } from '../engine/gift-feedback.js';
import { drawFrame } from '../engine/frame.js';

let adjustCanvas = null;

// applique le format demande en regie ; appele au debut de chaque manche (jamais en cours de manche)
function applyFormat() {
  if (!setFormat(settings.format)) return;
  if (canvas) {
    canvas.style.aspectRatio = WF + '/' + H;
    if (WF > H) {
      canvas.style.width = '100vw';
      canvas.style.height = 'auto';
    } else {
      canvas.style.width = '';
      canvas.style.height = '100vh';
    }
  }
  if (adjustCanvas) adjustCanvas();
}

export let brambles = [];

export let halos = [];
export let snake = [],
  positionHistory = [],
  dir = { x: 1, y: 0 },
  nextDir = { x: 1, y: 0 };
export let fruit = null,
  subStep = 0,
  grew = false,
  aiMemory = {},
  trace = [];
// anneaux qui restent a sortir de la coquille : le corps s'allonge pas apres pas depuis l'oeuf
let toPush = 0;
// Cadeaux des spectateurs : une graine tombe, germe en 1 s, devient une baie mangeable. 3 au plus.
export let seeds = [],
  berries = [],
  sparks = [],
  gifted = 0,
  giftsEaten = 0;

// Deux camps, un serpent : Sun nourrit, Moon bloque. La manche tranche entre eux.
export let stones = [],
  round = null,
  rounds = [],
  berrylessTime = 0;
let aiAdjustments = 0,
  aiHolds = 0; // anti-tremblement : redecisions au franchissement, et decisions gardees
let tickOrder = 0; // duel : alterne quel serpent est resolu en premier a chaque tick (equite)

let wildDelay = 0;

// Une erreur de rendu avalee en silence a casse le jeu sans que rien ne le dise : on garde le message.
let lastError = null;
const firstLine = (err) =>
  ((err && err.stack ? err.stack : '').split(String.fromCharCode(10))[1] || '').trim();
export let t = 0,
  pause = 0,
  berriesEaten = 0,
  stonesPlaced = 0,
  hits = 0,
  deaths = 0,
  errors = 0,
  turns = 0,
  staircases = 0,
  avoidable = 0,
  deathLengths = [],
  dirs = [];
// Un seul mode dans `main` : le duel Or contre Ombre. L'ancien mode solo vit sur la branche wip/solo-mode.
// plafonds : faux par defaut, donc on pose autant de pierres, de ronces et de baies qu'on veut,
// jusqu'a remplir le plateau. Vrai remet les plafonds du palier, seul etat dans lequel les
// harnais d'equilibrage mesurent quelque chose de comparable.
export const settings = {
  ia: true,
  maquette: false,
  temps: 1,
  imprudence: 0,
  zones: false,
  duree: 240,
  dureeDuel: 120,
  sauvage: 1,
  mode: 'duel',
  cycle: 480,
  heure: 0.06,
  plafonds: false,
  // avantage (super admin, regie) : -100 favorise Ombre, 0 neutre, +100 favorise Or.
  // Invisible a l'ecran : il ne touche que la qualite de jeu de l'IA. Remis a 0 a chaque manche.
  avantage: 0,
  // underdog (super admin) : le serpent le plus court reçoit en douce +audace et +portées. Aucun affichage.
  underdog: false,
  // plateforme (regie) : 'tiktok' affiche la legende des cadeaux et les colonnes de statuts qu'ils
  // alimentent ; 'neutre' (YouTube, test de gameplay) les cache. Le jeu, lui, ne change pas.
  plateforme: 'tiktok',
  // retourCadeau (regie) : prototype a valider par Abdel DANS le jeu, sur la vraie legende du bas.
  // 'aucun', 'G1' ligne illuminee + donateur + trait qui se vide, 'G2' anneau autour de l'image,
  // 'G3' pastille compteur, 'G4' bandeau donateur au-dessus de la colonne.
  retourCadeau: 'G1',
  // affichageCadeaux (regie) : forme de la legende. 'complet' = deux colonnes verticales avec prix + effet
  // (tests hors live). 'aucun' = rien du tout. 'defile' = bandeaux qui glissent, icones animees, EFFET
  // en toutes lettres SANS prix ni verbe d'envoi (live-safe : la regle du 25/07 vise le prix et l'appel a
  // l'action, pas la reaction a un cadeau). Le retour a l'arrivee d'un cadeau reste porte par le bandeau P1.
  affichageCadeaux: 'defile',
  // pattern d'apparition du mode 'defile' (reglable en regie, teste en direct) : secondes visibles puis
  // secondes cachees, en boucle. defileCache=0 => toujours visible (tests hors live seulement).
  defileVisi: 8,
  defileCache: 12,
  // nomsDonateurs (regie) : affiche ou non le pseudo du spectateur sur la ligne du cadeau (G1) et le bandeau (G4).
  nomsDonateurs: true,
  // bandeau (regie) : prototype du bandeau d'activite en haut-centre (arrivees, cadeaux, likes, partages),
  // porte par un mini serpent au rendu reel. 'aucun', 'P1' orbite, 'P2' porteur, 'P3' mascotte. A valider par Abdel.
  // meteo de la foret (regie) : 'pluie' d'origine, 'neige', 'automne', 'ete', 'orage', 'etoiles', 'brume'.
  // ambianceAuto : a chaque manche, une heure et une meteo tirees au sort. Prototype, a valider par Abdel.
  meteo: 'pluie',
  ambianceAuto: true,
  // format (regie) : 'vertical' 9:16 TikTok ou 'horizontal' 16:9 YouTube, applique a la prochaine manche.
  format: 'vertical',
  bandeau: 'P1',
  // classement (regie) : prototype du classement des donateurs de la manche, sur l'ecran de fin.
  // 'aucun', 'C1' podium, 'C2' deux colonnes par camp, 'C3' MVP ; mises en avant du MVP : 'M1' couronne et
  // rayons, 'M2' couronne et serpent qui tourne autour, 'M3' podium a trois marches. A valider par Abdel.
  classement: 'C3',
  // fluide (regie) : coupe tous les halos flous (shadowBlur) du canevas de jeu. Mesure dans le moteur de
  // l'exe, plateau charge : 28 images par seconde avec les flous, 45 sans. Change l'aspect : a juger a l'ecran.
  fluide: false,
  // superIA (super admin) : true = les deux camps jouent avec ia-super.js (recherche adverse).
  // 'or' ou 'ombre' = un seul camp (tournois des harnais). Suspendue pendant une scene.
  superIA: false,
  // debugIA (super admin, regie) : calque des decisions de l'IA sur le plateau. Coupe par defaut ;
  // coupe, l'IA ne remplit rien et le calque n'est pas dessine (zero effet sur le jeu).
  debugIA: false,
};

export const px = (gx, gy) => ({ x: X0 + gx * CELL + CELL / 2, y: Y0 + gy * CELL + CELL / 2 });
export const getAmbience = () => (window.AMBIANCES || []).find((a) => a.id === 'foret') || null;

export let HOLD_SECONDS = 5; // secondes a tenir l'anneau plein pour gagner (reglerTenue pour le bench)
// compteurs de moments de depense (proxy de profit) : tenues entamees, sursis entames, parades
let moments = { tenues: 0, sursis: 0, parades: 0, manches: 0 };

// eclaterAnneaux : convertit des segments en baies actives (coupe duel ou mort duel).
// Appeler sous charger(i) : zoneMorte utilise le bon contexte de tete (duel verifie les deux).
// camp : les anneaux laches gardent la couleur du serpent qui les a perdus (Abdel : « the food
// dropped need to be the same color as the snake who dropped it »). Sans camp, baie verte normale.
function burstSegments(segs, team) {
  segs.forEach((s) => {
    if (isDeadZone(s, 0)) return;
    const p = px(s.x, s.y);
    burst(
      p.x,
      p.y,
      4,
      team === 'or' ? 'offerte-or' : team === 'ombre' ? 'offerte-ombre' : 'rodeur',
    );
    berries.push({ x: s.x, y: s.y, pseudo: '', t: 0, sauvage: false, camp: team || null });
  });
}

// semerPour(i, pseudo) : seme une baie dans la moitie du plateau proche de la tete de corps i.
// Doit etre appele pendant le traitement d'un evenement duel ; charger(0) apres la boucle.
export function plantSeedFor(i, nickname) {
  const headIndex = bodies[i] && bodies[i].serpent[0];
  const rivalHeadIndex = bodies[1 - i] && bodies[1 - i].serpent[0];
  if (!headIndex) return 0;
  loadBody(i);
  let l = freeCells().filter((c) => !isDeadZone(c, SEED_GROW_TIME));
  if (rivalHeadIndex) {
    const preferred = l.filter(
      (c) =>
        Math.abs(c.x - headIndex.x) + Math.abs(c.y - headIndex.y) <
        Math.abs(c.x - rivalHeadIndex.x) + Math.abs(c.y - rivalHeadIndex.y),
    );
    if (preferred.length) l = preferred;
  }
  if (!l.length) l = freeCells();
  if (!l.length) {
    storeBody();
    return 0;
  }
  // Fiable (Abdel, reco validee) : la baie tombe PRES de la tete du camp, pas n'importe ou dans sa moitie.
  // Cases triees par distance a la tete (hors zone morte, donc jamais franchies avant d'etre actives),
  // tirage parmi les 4 plus proches. Un spam de 15 roses forme une grappe autour de la tete, mangee
  // dans les secondes qui suivent ; les cases se remplissent de proche en proche.
  // Devant lui, jamais derriere (Abdel) : on garde les cases dont le produit scalaire avec sa direction
  // est positif (devant ou de cote-devant) ; repli sur toutes si aucune.
  const dirI = bodies[i].dir || { x: 1, y: 0 };
  const inFront = l.filter((c) => (c.x - headIndex.x) * dirI.x + (c.y - headIndex.y) * dirI.y > 0);
  if (inFront.length) l = inFront;
  l.sort(
    (p, q) =>
      Math.abs(p.x - headIndex.x) +
      Math.abs(p.y - headIndex.y) -
      (Math.abs(q.x - headIndex.x) + Math.abs(q.y - headIndex.y)),
  );
  const c = l[Math.floor(Math.random() * Math.min(4, l.length))];
  seeds.push({
    x: c.x,
    y: c.y,
    pseudo: nickname || '',
    t: 0,
    camp: bodies[i].camp,
    pour: bodies[i].camp,
  }); // teinte du camp, et RESERVEE a ce camp (Abdel : pas de vol de rose)
  gifted++;
  storeBody();
  return 1;
}

// couperDuel(adverseIdx, k) : coupe k anneaux de la queue du corps adverse, les eclate en baies.
// Retourne le nombre d'anneaux effectivement coupes. Finit avec ranger() mais PAS charger(0).
export function cutDuel(adverseIdx, k, voleurIdx) {
  loadBody(adverseIdx);
  if (!snake.length) {
    storeBody();
    return 0;
  }
  if (bodies[adverseIdx].bouclierT > 0) {
    // le bouclier pare la coupe entiere tant qu'il est actif ; le rail et la tete le montrent
    bodies[adverseIdx].pareT = 0.9;
    moments.parades++;
    announceRescue(adverseIdx, 'bouclier');
    // TEST equilibre : la coupe paree est RENDUE au serpent protege, il grandit de ce qu'elle aurait coupe
    const gain = Math.max(1, Math.round(snake.length * CUT_FRACTION));
    toPush += gain;
    const pos = px(snake[0].x, snake[0].y);
    burst(pos.x, pos.y, 20, 'coquille');
    storeBody();
    return 0;
  }
  let count = Math.min(k, Math.max(0, snake.length - 1));
  if (count <= 0) {
    storeBody();
    return 0;
  }
  if (snake.length - count < 3 && !bodies[adverseIdx].adulte) {
    // serpent jeune (jamais 10 anneaux) : la coupe descend jusqu'a MIN_JEUNE, on ne tue pas un serpent au berceau
    count = Math.max(0, snake.length - YOUNG_MIN_LENGTH);
    if (count <= 0) {
      storeBody();
      return 0;
    }
  }
  if (snake.length - count < 3 && bodies[adverseIdx].vies > 0) {
    // une vie encaisse la mort : la coupe s'arrete a 3 anneaux
    bodies[adverseIdx].vies--;
    bodies[adverseIdx].pareT = 0.9;
    announceRescue(adverseIdx, 'vie');
    count = Math.max(0, snake.length - 3);
    if (count <= 0) {
      storeBody();
      return 0;
    }
  }
  bodies[adverseIdx].anneauHaut = snake.length / TARGET_LENGTH;
  bodies[adverseIdx].reculT = 0.9;
  bodies[adverseIdx].coupT = 0.9;
  const segs = snake.slice(-count);
  snake = snake.slice(0, snake.length - count);
  positionHistory = positionHistory.slice(0, Math.max(1, snake.length + 3));
  if (segs.length) {
    const p = px(segs[0].x, segs[0].y);
    burst(p.x, p.y, 16, 'rodeur');
  }
  if (voleurIdx !== undefined && bodies[voleurIdx]) {
    // VOL (Abdel : « steal 15% ») : les anneaux ne tombent pas en baies, ils passent directement au serpent du camp
    bodies[voleurIdx].aPousser = (bodies[voleurIdx].aPousser || 0) + segs.length;
    segs.forEach((sg) => {
      const p = px(sg.x, sg.y);
      burst(p.x, p.y, 3, bodies[voleurIdx].camp === 'or' ? 'offerte-or' : 'offerte-ombre');
    });
  } else burstSegments(segs, bodies[adverseIdx].camp);
  if (snake.length < 3 && bodies[adverseIdx].adulte) {
    snake = [];
    // adverseIdx a perdu : le camp oppose gagne
    const gagnant = bodies[adverseIdx].camp === 'ombre' ? 'or' : 'ombre';
    storeBody();
    endRound(gagnant, 'place');
    return count;
  }
  storeBody();
  requestAiMove();
  return count;
}

// opt regle la force d'un eclat : vitesse, poussee vers le haut, pesanteur, taille, opacite.
export function burst(x, y, n, tint, opt) {
  const o = opt || {},
    v0 = o.v0 !== undefined ? o.v0 : 60,
    v1 = o.v1 !== undefined ? o.v1 : 240;
  const upBoost = o.haut !== undefined ? o.haut : 40,
    g = o.g !== undefined ? o.g : 520;
  const r = o.r !== undefined ? o.r : 1,
    a0 = o.a !== undefined ? o.a : 1,
    d = o.duree !== undefined ? o.duree : 0.5;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      v = v0 + Math.random() * (v1 - v0);
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - upBoost,
      t: 0,
      duree: d + Math.random() * 0.4 * d,
      teinte: tint,
      r,
      g,
      a: a0,
      k: o.frein || 0,
    });
  }
}

window.recevoirEvenement = receiveEvent;

// La course dans le ciel : un soleil a gauche, une lune a droite, tous deux bas au depart.
// Chaque baie mangee monte le soleil d'un cran, chaque rocher pose monte la lune d'un cran.
// Le premier en haut termine la manche. Le serpent est la balle, pas le joueur.
function newRound() {
  applyFormat();
  settings.avantage = 0; // le coup de pouce est un geste ponctuel, jamais un reglage qui traine
  clearGiftFeedback();
  resetRoundDonations();
  if (settings.ambianceAuto) {
    const weatherOptions = [
      'pluie',
      'neige',
      'automne',
      'ete',
      'printemps',
      'orage',
      'etoiles',
      'aurore',
      'lucioles',
      'braises',
      'brume',
    ].filter((keyMap) => keyMap !== settings.meteo);
    settings.meteo = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
    settings.heure = ['etoiles', 'aurore', 'lucioles'].includes(settings.meteo)
      ? 0.02
      : settings.meteo === 'braises'
        ? 0.78
        : settings.meteo === 'printemps'
          ? 0.36
          : [0.02, 0.22, 0.36, 0.5, 0.64, 0.78][Math.floor(Math.random() * 6)];
  }
  endScene(); // la scène ne survit pas à la manche ; l'underdog, oui (interrupteur explicite)
  round = {
    t: 0,
    etat: 'en cours',
    sun: 0,
    moon: 0,
    moonEv: 0,
    vainqueur: null,
    fin: 0,
    cielSun: 0,
    cielMoon: 0,
    hautSun: tier.cielSun,
    hautMoon: tier.cielMoon,
    pulseSun: 9,
    pulseMoon: 9,
    cible: tier.cible,
    recolte: 0,
  };
  stones = [];
  brambles = [];
  berrylessTime = 0;
  bodies = [
    nouveauCorps('or', GOLD, COLS / 2 - 1, Math.floor(ROWS / 2), { x: -1, y: 0 }),
    nouveauCorps('ombre', SHADOW, COLS / 2, Math.floor(ROWS / 2), { x: 1, y: 0 }),
  ];
  for (let i = 0; i < bodies.length; i++) {
    loadBody(i);
    spawn(false, bodies[i].x0, bodies[i].y0, bodies[i].dir0);
    storeBody();
  }
  loadBody(0);
}

// L'affluence monte : le ciel s'allonge, jamais ne se raccourcit, et l'astre garde sa hauteur a l'ecran.
// Sans cela une ruee ferait redescendre le soleil, et plus personne ne comprendrait la course.
function stretchSky(team, target, increment) {
  const heightKey = 'haut' + team,
    skyKey = 'ciel' + team,
    h = round[heightKey];
  if (target <= h) return;
  const newHeight = Math.min(target, h + increment);
  round[skyKey] *= newHeight / h;
  round[heightKey] = newHeight;
}

// Un cran de plus pour un camp. Le premier en haut du ciel gagne.
export function rise(team, n) {
  return;
}

// Le compteur de serie. Il ne compte pas des points, il compte des MANCHES gagnees, et il
// survit aux manches : c'est la seule memoire longue que le spectateur qui arrive en cours de
// live peut lire d'un coup d'oeil. `pulse` part a zero quand le camp vient de marquer, ce qui
// declenche le gonflement du chiffre : sans ca, l'increment passe inapercu sous le voile de fin.
export let snakeScore = 0,
  scoreViewers = 0,
  snakePulse = 9,
  viewersPulse = 9;
const isSnakeTeam = (c) => c === 'serpent' || c === 'sun' || c === 'or';

function endRound(team, cause) {
  if (!round || round.etat !== 'en cours') return;
  round.etat = 'finie';
  round.vainqueur = team;
  round.fin = 0;
  moments.manches++;
  if (team === 'or' || team === 'ombre') {
    announceStreak(team);
  }
  if (team === 'nul') {
    /* match nul : aucun point */
  } else if (isSnakeTeam(team)) {
    snakeScore++;
    snakePulse = 0;
  } else {
    scoreViewers++;
    viewersPulse = 0;
  }
  rounds.push({
    camp: team,
    cause: cause || 'inconnue',
    duree: round.t,
    longueur: snake.length,
    sun: round.sun,
    moon: round.moonEv,
    cielSun: round.cielSun,
    cielMoon: round.cielMoon,
    cible: round.cible,
    recolte: round.recolte,
    mode: settings.mode,
    palier: tier.id,
  });
}

export let egg = null;

// Architecture multi-corps : motif charger/ranger.
// On charge le corps i dans les variables de module, on travaille dessus, on range.
function nouveauCorps(team, tint, x0, y0, dir0) {
  return {
    camp: team,
    teinte: tint,
    flair: FLAIR_BY_TEAM[team] || 0,
    chasse: HUNT_BY_TEAM[team] || 0,
    x0: x0 !== undefined ? x0 : Math.floor(COLS / 2),
    y0: y0 !== undefined ? y0 : Math.floor(ROWS / 2),
    dir0: dir0 || { x: 1, y: 0 },
    serpent: [],
    hist: [],
    dir: { x: 1, y: 0 },
    dirProchaine: { x: 1, y: 0 },
    avance: 0,
    grandi: false,
    memoireIA: {},
    trace: [],
    aPousser: 0,
    couvee: null,
    surgeT: 0,
    invincT: 0,
    coupT: 0,
    reculT: 0,
    creditLike: 0,
    anneau: 0,
    anneauHaut: 0,
    bouclierT: 0,
    vies: 0,
    pareT: 0,
  };
}
export let bodies = [],
  activeIndex = 0;

export function loadBody(i) {
  activeIndex = i;
  const c = bodies[i];
  snake = c.serpent;
  positionHistory = c.hist;
  dir = c.dir;
  nextDir = c.dirProchaine;
  subStep = c.avance;
  grew = c.grandi;
  aiMemory = c.memoireIA;
  trace = c.trace;
  toPush = c.aPousser;
  egg = c.couvee;
}
export function storeBody() {
  const c = bodies[activeIndex];
  c.serpent = snake;
  c.hist = positionHistory;
  c.dir = dir;
  c.dirProchaine = nextDir;
  c.avance = subStep;
  c.grandi = grew;
  c.memoireIA = aiMemory;
  c.trace = trace;
  c.aPousser = toPush;
  c.couvee = egg;
}
export const rival = () => (bodies.length > 1 ? bodies[1 - activeIndex] : null);

function spawn(keep, x0, y0, dir0) {
  const cx = x0 !== undefined ? x0 : Math.floor(COLS / 2);
  const cy = y0 !== undefined ? y0 : Math.floor(ROWS / 2);
  snake = [];
  positionHistory = [];
  trace = [];
  egg = { t: 0, x: cx, y: cy, garder: !!keep, dir0: dir0 || null };
  if (!keep) {
    seeds = [];
    berries = [];
  }
}

function hatch(keep) {
  const cx = egg ? egg.x : Math.floor(COLS / 2);
  const cy = egg ? egg.y : Math.floor(ROWS / 2);
  const d0 = egg && egg.dir0 ? egg.dir0 : { x: 1, y: 0 };
  snake = [{ x: cx, y: cy }];
  toPush = START_LENGTH - 1;
  positionHistory = snake.map((s) => ({ ...s }));
  dir = { ...d0 };
  nextDir = { ...d0 };
  subStep = 0;
  grew = false;
  aiMemory = {};
  // Renaissance en cours de manche : les offrandes des spectateurs restent, seule la case de depart se libere
  if (keep) {
    const isOccupied = (c) => snake.some((s) => s.x === c.x && s.y === c.y);
    seeds = seeds.filter((g) => !isOccupied(g));
    berries = berries.filter((b) => !isOccupied(b));
    stones = stones.filter((r) => !isOccupied(r) && Math.abs(r.x - cx) + Math.abs(r.y - cy) > 2);
  }
  requestAiMove();
}

// Duel : la tete adverse bouge en meme temps que la notre. Les deux serpents allaient l'un vers
// l'autre sur la meme baie et se percutaient tete contre tete (sonde : 48 frontales en 90 s, toutes
// perdues par Or qui avance en premier dans la boucle). Les quatre voisines de la tete adverse
// sont donc interdites a l'IA, comme la couronne du rodeur : elle contourne au lieu de foncer.
function opponentCrown(a) {
  const h = a.serpent[0];
  if (!h) return [];
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([x, y]) => ({ x: h.x + x, y: h.y + y }))
    .filter((c) => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS);
}
export function requestAiMove(keep) {
  if (!settings.ia || !window.VipereIA || !snake.length) return;
  try {
    const otherBody = rival();
    const state = {
      cols: COLS,
      rows: ROWS,
      corps: snake,
      dir,
      fruits: allFruits(),
      obstacles: stones
        .filter((r) => r.t >= STONE_WARNING * 0.6)
        .map((r) => ({ x: r.x, y: r.y }))
        .concat(activeBrambles(0.6).map((g) => ({ x: g.x, y: g.y })))
        .concat(otherBody ? otherBody.serpent : []),
      eviter: otherBody ? opponentCrown(otherBody) : [],
      aGrandir: toPush,
      imprudence: settings.imprudence,
      avantage: bodies[activeIndex]
        ? ((bodies[activeIndex].camp === 'or' ? 1 : -1) * (settings.avantage || 0)) / 100
        : 0,
      flair: bodies[activeIndex] ? bodies[activeIndex].flair : 0,
      chasse: bodies[activeIndex] ? bodies[activeIndex].chasse : 0,
      adversaire: otherBody ? otherBody.serpent : null,
      adversaireInvincible: !!(otherBody && otherBody.invincT > 0),
      memoire: aiMemory,
    };
    // Scène : la moitié concernant le camp du serpent actif s'applique sur etat.
    if (scene && bodies[activeIndex]) {
      const teamScene = scene[bodies[activeIndex].camp] || {};
      if (teamScene.posture) state.postureForcee = teamScene.posture;
      if (teamScene.pA) state.porteeAttaque = teamScene.pA;
      if (teamScene.pD) state.porteeDefense = teamScene.pD;
      if (teamScene.chasse != null) state.chasseForcee = teamScene.chasse;
      if (teamScene.flair != null) state.flairForce = teamScene.flair;
      if (teamScene.imprudence != null) state.imprudence = teamScene.imprudence;
      if (teamScene.courseBaie) state.courseBaie = true;
      if (teamScene.piegeImmediat) state.piegeImmediat = true;
      if (teamScene.attirer) state.attirer = true;
      if (teamScene.repousser) state.repousser = true;
      if (teamScene.encercler) state.encercler = true;
      if (teamScene.nePasTuer) state.nePasTuer = true;
    }
    // Underdog : le plus court reçoit +audace et +2 cases de portée, en silence.
    if (settings.underdog && bodies.length === 2) {
      const myLength = bodies[activeIndex].serpent.length,
        oppLength = bodies[1 - activeIndex].serpent.length;
      if (myLength < oppLength) {
        state.imprudence = (state.imprudence || 0) + 0.03;
        state.porteeAttaque = (state.porteeAttaque || 12) + 2;
        state.porteeDefense = (state.porteeDefense || 10) + 2;
      }
    }
    if (settings.debugIA) {
      state.debug = true;
      aiMemory.dbgEviter = state.eviter;
    } else if (aiMemory.debug) {
      delete aiMemory.debug;
      delete aiMemory.dbgEviter;
      delete aiMemory.dbgFlash;
    }
    const superActive = !!(
      !scene &&
      window.VipereSuperIA &&
      bodies[activeIndex] &&
      (settings.superIA === true || settings.superIA === bodies[activeIndex].camp)
    );
    if (superActive && keep) state.prefere = nextDir;
    let d = superActive ? window.VipereSuperIA.choisir(state) : window.VipereIA.choisir(state);
    // garder : une direction deja annoncee (et dessinee) reste si elle est encore sure
    if (
      !superActive &&
      keep &&
      d &&
      (d.x !== nextDir.x || d.y !== nextDir.y) &&
      window.VipereIA.pasSur &&
      window.VipereIA.pasSur(state, nextDir)
    )
      d = nextDir;
    // l'arriere est le cou, pas la derniere direction tentee (apres un pas rate contre un mur,
    // dir pointe dans le mur et son inverse est parfois la seule issue)
    const neck = snake[1]
      ? { x: snake[1].x - snake[0].x, y: snake[1].y - snake[0].y }
      : { x: -dir.x, y: -dir.y };
    if (d && !(d.x === neck.x && d.y === neck.y)) nextDir = d;
  } catch (err) {
    errors++;
    lastError =
      'ia: ' + err.message + ' | ' + (err.stack || '').split('\n').slice(0, 3).join(' > ');
  }
}

function die(cause) {
  if (bodies[activeIndex]) bodies[activeIndex].mortCause = cause || 'soi'; // pour les sondes : de quoi il est mort
  // mort evitable : la tete avait encore une case libre a cote d'elle
  // la queue ne libere pas sa case au pas d'une bouchee : elle compte comme occupee
  const h = snake[0],
    currentSegs = grew ? snake : snake.slice(0, -1);
  if (
    [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ].some(([x, y]) => {
      const a = h.x + x,
        b = h.y + y;
      return (
        a >= 0 && b >= 0 && a < COLS && b < ROWS && !currentSegs.some((c) => c.x === a && c.y === b)
      );
    })
  )
    avoidable++;
  deathLengths.push(snake.length);
  deaths++;
  trace = [];
  // La mort ne tranche plus la manche : elle pousse la lune de quelques crans, puis le serpent revient.
  // duel : pas de renaissance, pas de pause. Ramener a max(3, floor(L/2)).
  // La moitie perdue eclate en baies. Sous 3 anneaux : mort seche, l'autre camp gagne.
  if (bodies[activeIndex].bouclierT > 0) {
    // le bouclier pare la collision : aucun anneau perdu, il repart invincible
    bodies[activeIndex].pareT = 0.9;
    bodies[activeIndex].invincT = 1.5;
    announceRescue(activeIndex, 'bouclier');
    if (snake.length) {
      const pos = px(snake[0].x, snake[0].y);
      burst(pos.x, pos.y, 20, 'coquille');
    }
    requestAiMove();
    return;
  }
  // Faute propre (mur, son propre corps) : AUCUN anneau perdu (Abdel : « the team should never lose
  // because of a self mistake of the snake »). Il repart invincible 1,5 s et re-decide. Seuls le corps
  // adverse et la frontale, c'est-a-dire le piege de l'autre, coutent la moitie.
  // ... sauf si l'adversaire l'a acculee : son corps a 2 cases ou moins de ma tete, c'est SON piege
  // (Abdel : « orange blocked blue on the side and led him to the wall, blue didn't lose anything »).
  const opponentBody = rival();
  const h0 = snake[0];
  const cornered = !!(
    opponentBody &&
    h0 &&
    opponentBody.serpent.some((q) => Math.abs(q.x - h0.x) + Math.abs(q.y - h0.y) <= 2)
  );
  if (cornered && (cause === 'mur' || cause === 'soi')) {
    cause = 'adverse';
    bodies[activeIndex].mortCause = 'adverse';
  }
  if (cause === 'mur' || cause === 'soi') {
    bodies[activeIndex].invincT = 1.5;
    bodies[activeIndex].pareT = 0.4;
    if (snake.length) {
      const pos = px(snake[0].x, snake[0].y);
      burst(pos.x, pos.y, 10, 'poussiere');
    }
    requestAiMove();
    return;
  }
  const L = snake.length;
  const threshold = Math.max(bodies[activeIndex].adulte ? 3 : YOUNG_MIN_LENGTH, Math.floor(L / 2));
  const lostSegments = snake.slice(threshold);
  snake = snake.slice(0, threshold);
  positionHistory = positionHistory.slice(0, Math.max(1, threshold + 3));
  bodies[activeIndex].invincT = 1.5;
  bodies[activeIndex].anneauHaut = L / TARGET_LENGTH;
  bodies[activeIndex].reculT = 0.9;
  bodies[activeIndex].coupT = 0.9;
  burstSegments(lostSegments, bodies[activeIndex].camp);
  if (snake.length < 3 && bodies[activeIndex].adulte) {
    snake = [];
    const opponent = rival();
    endRound(opponent ? opponent.camp : 'or', 'place');
  } else requestAiMove(); // sinon il garde son cap dans le mur et remeurt a la fin de l'invincibilite
  return;
}

function step() {
  if (!snake.length) return false;
  // duel : l'adversaire a bouge depuis la derniere decision, on re-decide sur sa position reelle.
  // Sans ca, toutes les morts etaient "evitables" (sonde) : la tete fonçait dans une case qu'il
  // venait de prendre. Avec, la couronne de sa tete est a jour et les frontales disparaissent.
  // Anti-tremblement (Abdel, 2026-09-19 : « really a wiggle when they are head to head, very
  // subtle »). La tete est dessinee en glissant vers la case que vise dirProchaine, decidee a la fin
  // du pas precedent. Redecider ici changeait souvent d'avis tete contre tete (3 262 fois en 45 min
  // de duel) : la tete s'inclinait d'un cote puis partait de l'autre, sa pointe sautait d'une
  // demi-case. On redecide toujours, mais on GARDE la direction annoncee tant que l'IA la juge
  // encore sure (pasSur) : la reactivite face au danger reste entiere, seuls les caprices partent.
  const prevDir = { ...nextDir };
  requestAiMove(!window.VIPERE_REDECIDE_TOUJOURS);
  if (prevDir.x !== nextDir.x || prevDir.y !== nextDir.y) aiAdjustments++;
  else aiHolds++;
  if (settings.debugIA)
    aiMemory.dbgFlash = {
      t,
      change: prevDir.x !== nextDir.x || prevDir.y !== nextDir.y,
      x: snake[0].x,
      y: snake[0].y,
    };
  if (nextDir.x !== dir.x || nextDir.y !== dir.y) {
    turns++;
    // escalier : a, b, a, b sur quatre pas de suite
    const n = dirs.length,
      c = nextDir;
    if (
      n >= 3 &&
      dirs[n - 1] !== dirs[n - 2] &&
      dirs[n - 2] !== dirs[n - 3] &&
      dirs[n - 2].x === c.x &&
      dirs[n - 2].y === c.y &&
      dirs[n - 1].x === dirs[n - 3].x &&
      dirs[n - 1].y === dirs[n - 3].y
    )
      staircases++;
  }
  dir = nextDir;
  dirs.push(dir);
  if (dirs.length > 4) dirs.shift();
  const nx = snake[0].x + dir.x,
    ny = snake[0].y + dir.y;
  // invincibilite temporaire (apres absorption d'une mort par vie, ou apres collision en duel)
  const isInvincible = bodies[activeIndex].invincT > 0;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (!isInvincible) {
      die('mur');
      return false;
    }
    requestAiMove();
    return true;
  }
  if (stones.some((r) => r.t >= STONE_WARNING && r.x === nx && r.y === ny)) {
    die('rocher');
    return false;
  }
  if (activeBrambles().some((g) => g.x === nx && g.y === ny)) {
    die('ronce');
    return false;
  }
  // baie reservee a l'autre camp : le serpent passe dessus sans la manger (Abdel : « avoid the stealing case »)
  const myTeam = bodies[activeIndex] ? bodies[activeIndex].camp : null;
  const berryIdx = berries.findIndex(
    (b) => b.x === nx && b.y === ny && !(b.pour && myTeam && b.pour !== myTeam),
  );
  const eating = berryIdx >= 0;
  const isPushing = toPush > 0;
  const growByEating = eating && snake.length < maxLength();
  const growing = isPushing || growByEating;
  if (isPushing) toPush--;
  // la queue libere sa case au meme pas, sauf si le serpent mange ; en duel, le corps adverse bloque aussi
  const otherBodyDuel = rival();
  const blocking = (growing ? snake : snake.slice(0, -1)).concat(
    otherBodyDuel ? otherBodyDuel.serpent : [],
  );
  if (!isInvincible && blocking.some((s) => s.x === nx && s.y === ny)) {
    // duel, tete contre tete : la faute est partagee, les deux serpents encaissent. Sinon celui qui
    // avance en premier dans la boucle perd toutes les frontales.
    const opponentHead = otherBodyDuel && otherBodyDuel.serpent[0];
    if (
      opponentHead &&
      opponentHead.x === nx &&
      opponentHead.y === ny &&
      otherBodyDuel.invincT <= 0
    ) {
      const myIdx = activeIndex;
      die('frontale');
      if (round && round.etat === 'en cours') {
        storeBody();
        loadBody(1 - myIdx);
        die('frontale');
        storeBody();
        loadBody(myIdx);
      }
      return false;
    }
    die(
      otherBodyDuel && otherBodyDuel.serpent.some((s) => s.x === nx && s.y === ny)
        ? 'adverse'
        : 'soi',
    );
    return false;
  }
  snake = growing ? [{ x: nx, y: ny }, ...snake] : [{ x: nx, y: ny }, ...snake.slice(0, -1)];
  positionHistory.unshift({ x: nx, y: ny });
  if (positionHistory.length > snake.length + 3) positionHistory.length = snake.length + 3;
  grew = growing;
  if (eating) {
    berriesEaten++;
    const p = px(nx, ny);
    const b = berries[berryIdx];
    berries.splice(berryIdx, 1);
    if (!b || !b.sauvage) giftsEaten++;
    // halo de la couleur de la baie mangee : or, ombre, ou vert (baie sans camp)
    halos.push({
      x: p.x,
      y: p.y,
      t: 0,
      duree: b && b.sauvage ? 0.85 : 1.1,
      teinte:
        b && b.sauvage
          ? 'nature'
          : b && b.camp === 'or'
            ? 'offerte-or'
            : b && b.camp === 'ombre'
              ? 'offerte-ombre'
              : 'offerte',
    });
    rise('sun', 1);
    const a = getAmbience();
    playBite(a);
  }
  requestAiMove();
  return true;
}

// Trace lissee : un arc de Bezier par case, de milieu a milieu (virages arrondis, continuite exacte)
function vertex(k) {
  if (k < 0) {
    const h = positionHistory[0];
    return { x: h.x + nextDir.x, y: h.y + nextDir.y };
  }
  return positionHistory[Math.min(k, positionHistory.length - 1)];
}
function pointOn(p) {
  const k = Math.round(p),
    u = Math.min(1, Math.max(0, p - k + 0.5));
  const a = vertex(k - 1),
    v = vertex(k),
    b = vertex(k + 1);
  const Ax = (a.x + v.x) / 2,
    Ay = (a.y + v.y) / 2,
    Bx = (v.x + b.x) / 2,
    By = (v.y + b.y) / 2,
    i = 1 - u;
  return px(i * i * Ax + 2 * u * i * v.x + u * u * Bx, i * i * Ay + 2 * u * i * v.y + u * u * By);
}
function computeTrace() {
  const L = snake.length;
  if (!L) return [];
  const ph = 1 - subStep,
    pt = grew ? L - 1 : L - subStep,
    pts = [];
  for (let p = ph; p < pt; p += 1 / 3) pts.push(pointOn(p));
  pts.push(pointOn(pt));
  return pts;
}

// Avance la logique de dt secondes (sans rendu : sert aussi au harnais Node)
function advance(dt) {
  t += dt;
  updateTier(dt);
  // le gonflement du chiffre vit HORS de la manche : il commence justement quand elle finit
  snakePulse += dt;
  viewersPulse += dt;
  // le cycle du jour tourne tout seul : nuit, lever, plein jour, coucher, en boucle
  if (settings.cycle > 0) settings.heure = (settings.heure + dt / settings.cycle) % 1;
  if (scene && round && round.etat === 'en cours') {
    scene.restant -= dt;
    if (scene.restant <= 0) endScene();
  }
  // graines : elles germent, puis deviennent des baies mangeables
  for (let i = seeds.length - 1; i >= 0; i--) {
    const g = seeds[i];
    g.t += dt;
    if (g.t >= SEED_GROW_TIME) {
      seeds.splice(i, 1);
      berries.push({
        x: g.x,
        y: g.y,
        pseudo: g.pseudo,
        t: 0,
        camp: g.camp || null,
        pour: g.pour || null,
      });
      burst(
        px(g.x, g.y).x,
        px(g.x, g.y).y,
        6,
        g.camp === 'or' ? 'offerte-or' : g.camp === 'ombre' ? 'offerte-ombre' : 'offerte',
      );
      requestAiMove();
    }
  }
  berries.forEach((b) => {
    b.t += dt;
  });
  updateTension(dt);
  for (let i = halos.length - 1; i >= 0; i--) {
    halos[i].t += dt;
    if (halos[i].t >= halos[i].duree) halos.splice(i, 1);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const e = sparks[i];
    e.t += dt;
    if (e.t >= e.duree) {
      sparks.splice(i, 1);
      continue;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += (e.g === undefined ? 520 : e.g) * dt;
    if (e.k) {
      const fr = Math.max(0, 1 - e.k * dt);
      e.vx *= fr;
      e.vy *= fr;
    }
  }
  // rochers : l'ombre, puis la pierre, puis l'effacement
  for (let i = stones.length - 1; i >= 0; i--) {
    const r = stones[i];
    r.t += dt;
    if (r.t >= STONE_LIFE) stones.splice(i, 1);
    else if (r.t >= STONE_WARNING && r.t - dt < STONE_WARNING) {
      requestAiMove();
      playStone();
      const pixelPos = px(r.x, r.y);
      // des mottes de terre qui retombent au pied, sans jamais gicler
      burst(pixelPos.x, pixelPos.y + 14, 7, 'poussiere', {
        v0: 18,
        v1: 65,
        haut: -4,
        g: 260,
        frein: 3.4,
        r: 0.8,
        a: 0.4,
        duree: 0.55,
      });
    }
  }
  for (let i = brambles.length - 1; i >= 0; i--) {
    const bramble = brambles[i];
    bramble.t += dt;
    bramble.seg.forEach((g) => (g.t += dt));
    if (bramble.t >= BRAMBLE_LIFE) {
      brambles.splice(i, 1);
      requestAiMove();
      continue;
    }
    bramble.pas += dt;
    if (bramble.pas >= BRAMBLE_STEP && bramble.seg.length < BRAMBLE_MAX_SEGMENTS) {
      bramble.pas = 0;
      extendBramble(bramble);
    }
    // chaque segment qui devient dur remue la terre a son pied
    bramble.seg.forEach((g) => {
      if (g.t >= BRAMBLE_WARNING && g.t - dt < BRAMBLE_WARNING) {
        const pixelPos = px(g.x, g.y);
        burst(pixelPos.x, pixelPos.y + 10, 4, 'poussiere', {
          v0: 12,
          v1: 44,
          haut: -6,
          g: 200,
          frein: 3.2,
          r: 0.6,
          a: 0.32,
          duree: 0.45,
        });
      }
    });
  }
  if (round) {
    if (round.etat === 'en cours') {
      round.t += dt;
      // la cible ne monte qu'avec l'affluence : une ruee ne rend pas la manche triviale,
      // et une salle qui se vide ne punit pas ceux qui restent
      stretchSky('Sun', tier.cielSun, dt * 14);
      stretchSky('Moon', tier.cielMoon, dt * 2);
      // La cible s'allonge avec l'affluence, donc la recolte se remet a l'echelle comme le fait
      // deja etirer() pour les astres. Sans ca, un anneau plein retombait a 17 % quand la foule
      // arrivait, et le spectateur voyait la progression RECULER.
      if (tier.cible > round.cible) {
        const avant = round.cible;
        round.cible = Math.min(tier.cible, round.cible + dt * 14);
        if (avant > 0 && round.cible > avant) round.recolte *= round.cible / avant;
      }
      round.pulseSun += dt;
      round.pulseMoon += dt;
      // Temps ecoule. En base, le serpent n'a pas tenu son pari, les spectateurs l'emportent :
      // le code donnait l'inverse, contre son propre commentaire et contre spec-modes.md.
      // Corrige le 2026-09-18 sur OK d'Abdel. En versus, le plus haut l'emporte, egalite a Moon.
      // Duel, victoire a l'anneau (Abdel, 2026-09-18) : un camp gagne quand son demi-anneau est
      // plein (LONG_CIBLE_DUEL anneaux, le bas-centre atteint) et qu'il le TIENT TENUE_DUEL
      // secondes sans etre coupe en dessous. Le chrono reste la fin de secours.
      const fullBodies = [];
      for (let i = 0; i < bodies.length; i++) {
        const c = bodies[i];
        const prevHold = c.tenue || 0;
        c.tenue = c.serpent.length >= TARGET_LENGTH ? (c.tenue || 0) + dt : 0;
        if (prevHold === 0 && c.tenue > 0) moments.tenues++;
        if (c.serpent.length >= ADULT_LENGTH) c.adulte = true;
        const enSursis = !c.couvee && c.serpent.length > 0 && c.serpent.length < REPRIEVE_LENGTH;
        if (enSursis && !c.sursis) moments.sursis++;
        c.sursis = enSursis;
        if (c.tenue >= HOLD_SECONDS) fullBodies.push(c);
      }
      // EGALITE STRICTE : avant, la boucle finissait sur `break` des que corps[0] tenait son
      // anneau, donc Or passait devant Ombre du seul fait de son rang dans le tableau. On
      // depouille maintenant les deux, et la plus longue tenue gagne ; tenue identique = nul.
      if (fullBodies.length === 1) endRound(fullBodies[0].camp, 'anneau');
      else if (fullBodies.length > 1) {
        const a = fullBodies[0],
          b = fullBodies[1];
        endRound(a.tenue === b.tenue ? 'nul' : a.tenue > b.tenue ? a.camp : b.camp, 'anneau');
      }
      if (round.etat !== 'en cours') return;
      // duel : chrono propre (TEST equilibre : 120 s, les publics calmes ne remplissent jamais l'anneau)
      if (round.t >= (settings.dureeDuel || settings.duree)) {
        // plus long gagne ; egalite = ombre (comme Moon en versus). Aucun progres des deux cotes (personne
        // n'a depasse la longueur de naissance) : match nul, aucun point (Abdel).
        const l0 = bodies[0].serpent.length,
          l1 = bodies[1].serpent.length;
        // EGALITE STRICTE : l'egalite de longueur allait silencieusement a Ombre (« comme Moon en
        // versus »), ce qui est un biais de camp. Sans spectateur les deux serpents finissent
        // souvent a la meme longueur (5 % des manches mesurees) : c'est un match nul, aucun point.
        if (l0 === l1) endRound('nul', 'temps');
        else if (l0 <= START_LENGTH && l1 <= START_LENGTH) endRound('nul', 'temps');
        else endRound(l0 > l1 ? 'or' : 'ombre', 'temps');
      }
      // garde-fou : sans spectateur le plateau reste vide et rien ne peut arriver
      // ARBITRAGE, 2026-09-18. Abdel a demande deux choses contradictoires le meme jour :
      // « unlimited food », puis « i dont want food to be abundant unless a user drops a lot of
      // food ». Tranche ainsi : **illimite pour ce que le public donne** (semer n'a plus de
      // plafond), **rationne pour ce que la foret donne toute seule**. La foret n'est donc plus
      // qu'un filet de securite : elle ne nourrit que si le plateau est vide de toute nourriture,
      // et sa cadence RALENTIT a mesure que le public devient genereux, jusqu'a se taire.
      if (!seeds.length && !berries.length) {
        berrylessTime += dt;
        // Plus le public est actif, plus la foret se tait : c'est la generosite reelle du public
        // qui regle l'abondance, pas une horloge fixe. A cadence 20, la foret est deja 2 fois
        // plus lente ; a cadence 200, 11 fois.
        // Duel (Abdel) : la foret nourrit en quantite moderee quand le plateau est vide, une baie verte
        // neutre a intervalle, posee a EGALE distance des deux tetes (a 1 case pres).
        const wildFreqBase = FOREST_BERRY_INTERVAL;
        const wildFreq = wildFreqBase / (1 + cadence / 20);
        if (!wildDelay) wildDelay = jitter(wildFreq);
        if (wildFreq > 0 && berrylessTime >= wildDelay) {
          berrylessTime = 0;
          wildDelay = jitter(wildFreq);
          // La baie sauvage obeit a la regle comme tout le reste. Son delai est nul, elle ne
          // peut donc pas etre franchie avant d'etre active, mais la regle ne sert pas qu'a ca :
          // une nourriture qui parait sous son nez est un cadeau gratuit, sans decision, et elle
          // n'a aucune raison de se comporter autrement qu'une baie semee. Meme delai, GERME.
          let l = freeCells().filter((c) => !isDeadZone(c, SEED_GROW_TIME));
          if (bodies[0] && bodies[1] && bodies[0].serpent[0] && bodies[1].serpent[0]) {
            const a = bodies[0].serpent[0],
              b = bodies[1].serpent[0];
            const distDiff = (c) =>
              Math.abs(
                Math.abs(c.x - a.x) +
                  Math.abs(c.y - a.y) -
                  (Math.abs(c.x - b.x) + Math.abs(c.y - b.y)),
              );
            const equidistantCells = l.filter(
              (c) => distDiff(c) <= 1 && !isDeadZone(c, SEED_GROW_TIME),
            );
            if (equidistantCells.length) l = equidistantCells;
            else {
              l.sort((p, q) => distDiff(p) - distDiff(q));
              l = l.slice(0, 4);
            }
          }
          if (!l.length) l = freeCells();
          if (l.length) {
            const c = l[Math.floor(Math.random() * l.length)];
            berries.push({ x: c.x, y: c.y, pseudo: '', t: 0, sauvage: true });
            requestAiMove();
          }
        }
      } else {
        berrylessTime = 0;
        wildDelay = 0;
      }
    } else {
      round.fin += dt;
      if (round.fin >= 8) newRound();
      return;
    }
  }
  // Equite du duel : resoudre toujours Or puis Ombre donne l'initiative permanente au premier
  // servi (banc : 38-2). On alterne donc l'ordre a chaque tick, aucun camp ne garde la main.
  tickOrder = 1 - tickOrder;
  if (tickOrder) {
    for (let _i = bodies.length - 1; _i >= 0; _i--) {
      loadBody(_i);
      advanceBody(dt);
      storeBody();
    }
  } else
    for (let _i = 0; _i < bodies.length; _i++) {
      loadBody(_i);
      advanceBody(dt);
      storeBody();
    }
  loadBody(0);
}

// Avance le corps charge (actif) de dt secondes. Appele depuis avancer apres charger(i).
function advanceBody(dt) {
  // minuteries par corps en duel (surgeT, invincT, coupT)
  if (bodies[activeIndex].surgeT > 0)
    bodies[activeIndex].surgeT = Math.max(0, bodies[activeIndex].surgeT - dt);
  if (bodies[activeIndex].invincT > 0)
    bodies[activeIndex].invincT = Math.max(0, bodies[activeIndex].invincT - dt);
  if (bodies[activeIndex].coupT > 0)
    bodies[activeIndex].coupT = Math.max(0, bodies[activeIndex].coupT - dt);
  if (bodies[activeIndex].pareT > 0)
    bodies[activeIndex].pareT = Math.max(0, bodies[activeIndex].pareT - dt);
  if (bodies[activeIndex].bouclierT > 0)
    bodies[activeIndex].bouclierT = Math.max(0, bodies[activeIndex].bouclierT - dt);
  if (bodies[activeIndex].reculT > 0)
    bodies[activeIndex].reculT = Math.max(0, bodies[activeIndex].reculT - dt);
  if (pause > 0) {
    pause -= dt;
    if (pause <= 0) {
      pause = 0;
      spawn(!!(round && round.etat === 'en cours'));
    }
    return;
  }
  if (egg) {
    const avant = egg.t;
    egg.t += dt;
    const a0 = getAmbience();
    if (isSoundReady() && a0 && a0.sonEclosion) {
      const uu = egg.t / HATCH_TIME,
        ua = avant / HATCH_TIME;
      [0.34, 0.46, 0.55].forEach((keyMap) => {
        if (ua < keyMap && uu >= keyMap) playHatch(a0, 'fissure');
      });
      if (ua < EMERGE_TIME && uu >= EMERGE_TIME) playHatch(a0, 'naissance');
    }
    // le serpent sort avant la fin de l'animation, la coquille finit de s'ouvrir derriere lui
    if (!egg.sorti && egg.t >= HATCH_TIME * EMERGE_TIME) {
      egg.sorti = true;
      const p = px(egg.x, egg.y);
      burst(p.x, p.y, 18, 'coquille');
      hatch(egg.garder);
    }
    if (egg.t >= HATCH_TIME + TRAIL_TIME) egg = null;
    if (!egg || !egg.sorti) return;
  }
  const boosted = bodies[activeIndex].surgeT > 0;
  subStep += dt * SPEED * (boosted ? BOOST_FACTOR : 1); // like : poussee de tempo
  while (subStep >= 1) {
    subStep -= 1;
    if (!step()) return;
  }
}

let lastFrameTime = 0;
function loop(ts) {
  const now = ts / 1000,
    dt = Math.min(now - lastFrameTime, 0.1);
  lastFrameTime = now;
  const n = settings.temps;
  for (let i = 0; i < n; i++) advance(dt);
  // trace calculee par corps ; invariant corps[0] charge a l'issue
  // ranger() recopie la variable de module `trace` dans le corps : c'est donc elle qu'on remplit
  for (let _i = 0; _i < bodies.length; _i++) {
    loadBody(_i);
    trace = computeTrace();
    storeBody();
  }
  loadBody(0);
  trace = bodies[0] ? bodies[0].trace : [];
  try {
    drawFrame(dt);
  } catch (err) {
    errors++;
    lastError = 'rendu: ' + err.message + ' | ' + firstLine(err);
  }
  requestAnimationFrame(loop);
}

window.VipereBase = {
  reglages: settings,
  naitre: spawn,
  avancer: advance,
  basculerSon: toggleSound,
  nouvelleManche: newRound,
  tension: () => tension,
  // Scène courante (super admin) : lecture, lancement par nom, arrêt immédiat.
  scene: sceneState,
  lancerScene: launchScene,
  stopScene: endScene,
  finirTest: (team) => {
    endRound(team || 'or', 'test');
  },
  sonActif: isSoundActive,
  palier: () => ({
    id: tier.id,
    cadence: Math.round(cadence),
    hautSun: round ? Math.round(round.hautSun) : tier.cielSun,
    hautMoon: round ? Math.round(round.hautMoon) : tier.cielMoon,
  }),
  manche: () =>
    round && {
      etat: round.etat,
      t: round.t,
      sun: round.sun,
      moon: round.moonEv,
      vainqueur: round.vainqueur,
      cielSun: round.cielSun,
      cielMoon: round.cielMoon,
      recolte: round.recolte,
      cible: round.cible,
    },
  manches: () => rounds,
  score: () => ({ serpent: snakeScore, viewers: scoreViewers }),
  remettreScore: () => {
    snakeScore = 0;
    scoreViewers = 0;
    snakePulse = 9;
    viewersPulse = 9;
  },
  tremble: () => ({ retouches: aiAdjustments, gardes: aiHolds }),
  mesures: () => ({
    longueur: snake.length,
    bouchees: berriesEaten,
    morts: deaths,
    erreurs: errors,
    derniereErreur: lastError,
    t,
    virages: turns,
    escaliers: staircases,
    evitables: avoidable,
    longueursMort: deathLengths,
    offertes: gifted,
    mangeesOffertes: giftsEaten,
    poses: stonesPlaced,
    morsures: hits,
    baies: berries.length + seeds.length,
  }),
  duel: () => ({
    t: round && round.t,
    vainqueur: round && round.vainqueur,
    or: bodies[0]
      ? {
          longueur: bodies[0].serpent.length,
          posture: (bodies[0].memoireIA && bodies[0].memoireIA.postureActive) || 'neutre',
          raison: bodies[0].memoireIA && bodies[0].memoireIA.raison,
          tenue: bodies[0].tenue || 0,
          bouclierT: bodies[0].bouclierT,
          vies: bodies[0].vies,
          surgeT: bodies[0].surgeT,
          invincT: bodies[0].invincT,
          coupT: bodies[0].coupT,
          reculT: bodies[0].reculT,
        }
      : null,
    ombre: bodies[1]
      ? {
          longueur: bodies[1].serpent.length,
          posture: (bodies[1].memoireIA && bodies[1].memoireIA.postureActive) || 'neutre',
          raison: bodies[1].memoireIA && bodies[1].memoireIA.raison,
          tenue: bodies[1].tenue || 0,
          bouclierT: bodies[1].bouclierT,
          vies: bodies[1].vies,
          surgeT: bodies[1].surgeT,
          invincT: bodies[1].invincT,
          coupT: bodies[1].coupT,
          reculT: bodies[1].reculT,
        }
      : null,
  }),
  // reglage de la course pour les harnais d'equilibrage
  reglerCiel: (id, sun, moon) => {
    const p = TIERS.find((x) => x.id === id);
    if (!p) return;
    if (sun) p.cielSun = sun;
    if (moon) p.cielMoon = moon;
  },
  reglerCible: (id, c) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.cible = c;
  },
  reglerLong: forceLength,
  reglerRochers: (id, v) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.maxRochers = v;
  },
  reglerCoup: (id, v) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.coup = v;
  },
  // flair par camp en duel (regie, harnais) : s'applique aux corps courants et aux prochains
  reglerFlair: (team, v) => {
    FLAIR_BY_TEAM[team] = v;
    bodies.forEach((c) => {
      if (c.camp === team) c.flair = v;
    });
  },
  reglerTenue: (s) => {
    HOLD_SECONDS = Math.max(0.5, +s || 5);
  },
  moments: () => Object.assign({}, moments),
  razMoments: () => {
    moments = { tenues: 0, sursis: 0, parades: 0, manches: 0 };
  },
  reglerChasse: (team, v) => {
    HUNT_BY_TEAM[team] = v;
    bodies.forEach((c) => {
      if (c.camp === team) c.chasse = v;
    });
  },
  reglerHeure: (h) => {
    settings.heure = ((h % 1) + 1) % 1;
  },
  couvee: () => egg && { t: egg.t, duree: HATCH_TIME },
  planterRonce: () => plantBramble('sonde'),
  interne: () => ({
    serpent: snake,
    fruit,
    dir,
    rochers: stones.map((r) => ({ x: r.x, y: r.y, t: r.t })),
    ronces: brambles.map((bramble) => ({
      t: bramble.t,
      seg: bramble.seg.map((g) => ({ x: g.x, y: g.y, t: g.t })),
    })),
    alerte: STONE_WARNING,
    vitesse: SPEED,
    ronceAlerte: BRAMBLE_WARNING,
    ronceMax: BRAMBLE_MAX_SEGMENTS,
    baies: berries.map((b) => ({ x: b.x, y: b.y, camp: b.camp || null })),
    graines: seeds.map((g) => ({ x: g.x, y: g.y })),
    corps: bodies.map((c) => ({
      camp: c.camp,
      longueur: c.serpent.length,
      tete: c.serpent[0] || null,
      serpent: c.serpent.map((s) => ({ x: s.x, y: s.y })),
      dir: { ...c.dir },
      invincT: c.invincT,
      mortCause: c.mortCause || null,
      debug: c.memoireIA.debug || null,
    })),
  }),
};

function start() {
  bindCanvas(document.getElementById('scene'));
  if (!canvas) return;
  // rendu net : la surface suit la taille affichee et la densite de l'ecran
  const adjust = () => {
    const r = canvas.getBoundingClientRect(),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = r.width > 0 ? Math.round(r.width * dpr) : W;
    canvas.width = w;
    canvas.height = Math.round((w * H) / WF);
    const s = canvas.width / WF;
    ctx.setTransform(s, 0, 0, s, OX * s, 0);
  };
  adjust();
  window.addEventListener('resize', adjust);
  adjustCanvas = adjust;
  ['pointerdown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, armSound, { once: false, passive: true }),
  );
  if (window.ResizeObserver)
    try {
      new ResizeObserver(adjust).observe(canvas);
    } catch (e) {}
  document.addEventListener('keydown', (ev) => {
    const keyMap = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const d = keyMap[ev.key];
    if (d && !settings.ia && !(d.x === -dir.x && d.y === -dir.y)) {
      nextDir = d;
      ev.preventDefault();
    }
  });
  newRound();
  lastFrameTime = performance.now() / 1000;
  requestAnimationFrame(loop);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
