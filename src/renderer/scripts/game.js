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
  ai: true,
  mockup: false,
  timeScale: 1,
  recklessness: 0,
  zones: false,
  duration: 240,
  duelDuration: 120,
  wild: 1,
  mode: 'duel',
  cycle: 480,
  hour: 0.06,
  caps: false,
  // avantage (super admin, regie) : -100 favorise Ombre, 0 neutre, +100 favorise Or.
  // Invisible a l'ecran : il ne touche que la qualite de jeu de l'IA. Remis a 0 a chaque manche.
  advantage: 0,
  // underdog (super admin) : le serpent le plus court reçoit en douce +audace et +portées. Aucun affichage.
  underdog: false,
  // plateforme (regie) : 'tiktok' affiche la legende des cadeaux et les colonnes de statuts qu'ils
  // alimentent ; 'neutre' (YouTube, test de gameplay) les cache. Le jeu, lui, ne change pas.
  platform: 'tiktok',
  // retourCadeau (regie) : prototype a valider par Abdel DANS le jeu, sur la vraie legende du bas.
  // 'aucun', 'G1' ligne illuminee + donateur + trait qui se vide, 'G2' anneau autour de l'image,
  // 'G3' pastille compteur, 'G4' bandeau donateur au-dessus de la colonne.
  giftFeedback: 'G1',
  // affichageCadeaux (regie) : forme de la legende. 'complet' = deux colonnes verticales avec prix + effet
  // (tests hors live). 'aucun' = rien du tout. 'defile' = bandeaux qui glissent, icones animees, EFFET
  // en toutes lettres SANS prix ni verbe d'envoi (live-safe : la regle du 25/07 vise le prix et l'appel a
  // l'action, pas la reaction a un cadeau). Le retour a l'arrivee d'un cadeau reste porte par le bandeau P1.
  giftDisplay: 'scroll',
  // pattern d'apparition du mode 'defile' (reglable en regie, teste en direct) : secondes visibles puis
  // secondes cachees, en boucle. defileCache=0 => toujours visible (tests hors live seulement).
  scrollVisible: 8,
  scrollHidden: 12,
  // nomsDonateurs (regie) : affiche ou non le pseudo du spectateur sur la ligne du cadeau (G1) et le bandeau (G4).
  donorNames: true,
  // bandeau (regie) : prototype du bandeau d'activite en haut-centre (arrivees, cadeaux, likes, partages),
  // porte par un mini serpent au rendu reel. 'aucun', 'P1' orbite, 'P2' porteur, 'P3' mascotte. A valider par Abdel.
  // meteo de la foret (regie) : 'pluie' d'origine, 'neige', 'automne', 'ete', 'orage', 'etoiles', 'brume'.
  // ambianceAuto : a chaque manche, une heure et une meteo tirees au sort. Prototype, a valider par Abdel.
  weather: 'rain',
  autoAmbience: true,
  // format (regie) : 'vertical' 9:16 TikTok ou 'horizontal' 16:9 YouTube, applique a la prochaine manche.
  format: 'portrait',
  banner: 'P1',
  // classement (regie) : prototype du classement des donateurs de la manche, sur l'ecran de fin.
  // 'aucun', 'C1' podium, 'C2' deux colonnes par camp, 'C3' MVP ; mises en avant du MVP : 'M1' couronne et
  // rayons, 'M2' couronne et serpent qui tourne autour, 'M3' podium a trois marches. A valider par Abdel.
  ranking: 'C3',
  // fluide (regie) : coupe tous les halos flous (shadowBlur) du canevas de jeu. Mesure dans le moteur de
  // l'exe, plateau charge : 28 images par seconde avec les flous, 45 sans. Change l'aspect : a juger a l'ecran.
  smooth: false,
  // superIA (super admin) : true = les deux camps jouent avec ia-super.js (recherche adverse).
  // 'or' ou 'ombre' = un seul camp (tournois des harnais). Suspendue pendant une scene.
  superAi: false,
  // debugIA (super admin, regie) : calque des decisions de l'IA sur le plateau. Coupe par defaut ;
  // coupe, l'IA ne remplit rien et le calque n'est pas dessine (zero effet sur le jeu).
  aiDebug: false,
};

export const px = (gx, gy) => ({ x: X0 + gx * CELL + CELL / 2, y: Y0 + gy * CELL + CELL / 2 });
export const getAmbience = () => (window.AMBIENCES || []).find((a) => a.id === 'forest') || null;

export let HOLD_SECONDS = 5; // secondes a tenir l'anneau plein pour gagner (reglerTenue pour le bench)
// compteurs de moments de depense (proxy de profit) : tenues entamees, sursis entames, parades
let moments = { holds: 0, reprieve: 0, parries: 0, rounds: 0 };

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
      team === 'gold' ? 'gift-gold' : team === 'shadow' ? 'gift-shadow' : 'neutral-burst',
    );
    berries.push({ x: s.x, y: s.y, nickname: '', t: 0, wild: false, team: team || null });
  });
}

// semerPour(i, pseudo) : seme une baie dans la moitie du plateau proche de la tete de corps i.
// Doit etre appele pendant le traitement d'un evenement duel ; charger(0) apres la boucle.
export function plantSeedFor(i, nickname) {
  const headIndex = bodies[i] && bodies[i].snake[0];
  const rivalHeadIndex = bodies[1 - i] && bodies[1 - i].snake[0];
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
    nickname: nickname || '',
    t: 0,
    team: bodies[i].team,
    owner: bodies[i].team,
  }); // teinte du camp, et RESERVEE a ce camp (Abdel : pas de vol de rose)
  gifted++;
  storeBody();
  return 1;
}

// couperDuel(adverseIdx, k) : coupe k anneaux de la queue du corps adverse, les eclate en baies.
// Retourne le nombre d'anneaux effectivement coupes. Finit avec ranger() mais PAS charger(0).
export function cutDuel(adverseIdx, k, thiefIndex) {
  loadBody(adverseIdx);
  if (!snake.length) {
    storeBody();
    return 0;
  }
  if (bodies[adverseIdx].shieldTime > 0) {
    // le bouclier pare la coupe entiere tant qu'il est actif ; le rail et la tete le montrent
    bodies[adverseIdx].parryTime = 0.9;
    moments.parries++;
    announceRescue(adverseIdx, 'shield');
    // TEST equilibre : la coupe paree est RENDUE au serpent protege, il grandit de ce qu'elle aurait coupe
    const gain = Math.max(1, Math.round(snake.length * CUT_FRACTION));
    toPush += gain;
    const pos = px(snake[0].x, snake[0].y);
    burst(pos.x, pos.y, 20, 'shell');
    storeBody();
    return 0;
  }
  let count = Math.min(k, Math.max(0, snake.length - 1));
  if (count <= 0) {
    storeBody();
    return 0;
  }
  if (snake.length - count < 3 && !bodies[adverseIdx].adult) {
    // serpent jeune (jamais 10 anneaux) : la coupe descend jusqu'a MIN_JEUNE, on ne tue pas un serpent au berceau
    count = Math.max(0, snake.length - YOUNG_MIN_LENGTH);
    if (count <= 0) {
      storeBody();
      return 0;
    }
  }
  if (snake.length - count < 3 && bodies[adverseIdx].lives > 0) {
    // une vie encaisse la mort : la coupe s'arrete a 3 anneaux
    bodies[adverseIdx].lives--;
    bodies[adverseIdx].parryTime = 0.9;
    announceRescue(adverseIdx, 'life');
    count = Math.max(0, snake.length - 3);
    if (count <= 0) {
      storeBody();
      return 0;
    }
  }
  bodies[adverseIdx].ringPeak = snake.length / TARGET_LENGTH;
  bodies[adverseIdx].recoilTime = 0.9;
  bodies[adverseIdx].cutTime = 0.9;
  const segs = snake.slice(-count);
  snake = snake.slice(0, snake.length - count);
  positionHistory = positionHistory.slice(0, Math.max(1, snake.length + 3));
  if (segs.length) {
    const p = px(segs[0].x, segs[0].y);
    burst(p.x, p.y, 16, 'neutral-burst');
  }
  if (thiefIndex !== undefined && bodies[thiefIndex]) {
    // VOL (Abdel : « steal 15% ») : les anneaux ne tombent pas en baies, ils passent directement au serpent du camp
    bodies[thiefIndex].toPush = (bodies[thiefIndex].toPush || 0) + segs.length;
    segs.forEach((sg) => {
      const p = px(sg.x, sg.y);
      burst(p.x, p.y, 3, bodies[thiefIndex].team === 'gold' ? 'gift-gold' : 'gift-shadow');
    });
  } else burstSegments(segs, bodies[adverseIdx].team);
  if (snake.length < 3 && bodies[adverseIdx].adult) {
    snake = [];
    // adverseIdx a perdu : le camp oppose gagne
    const gagnant = bodies[adverseIdx].team === 'shadow' ? 'gold' : 'shadow';
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
  const upBoost = o.top !== undefined ? o.top : 40,
    g = o.g !== undefined ? o.g : 520;
  const r = o.r !== undefined ? o.r : 1,
    a0 = o.a !== undefined ? o.a : 1,
    d = o.duration !== undefined ? o.duration : 0.5;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      v = v0 + Math.random() * (v1 - v0);
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - upBoost,
      t: 0,
      duration: d + Math.random() * 0.4 * d,
      tint: tint,
      r,
      g,
      a: a0,
      k: o.frein || 0,
    });
  }
}

window.receiveEvent = receiveEvent;

// La course dans le ciel : un soleil a gauche, une lune a droite, tous deux bas au depart.
// Chaque baie mangee monte le soleil d'un cran, chaque rocher pose monte la lune d'un cran.
// Le premier en haut termine la manche. Le serpent est la balle, pas le joueur.
function newRound() {
  applyFormat();
  settings.advantage = 0; // le coup de pouce est un geste ponctuel, jamais un reglage qui traine
  clearGiftFeedback();
  resetRoundDonations();
  if (settings.autoAmbience) {
    const weatherOptions = [
      'rain',
      'snow',
      'autumn',
      'summer',
      'spring',
      'storm',
      'stars',
      'aurora',
      'fireflies',
      'embers',
      'mist',
    ].filter((keyMap) => keyMap !== settings.weather);
    settings.weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
    settings.hour = ['stars', 'aurora', 'fireflies'].includes(settings.weather)
      ? 0.02
      : settings.weather === 'embers'
        ? 0.78
        : settings.weather === 'spring'
          ? 0.36
          : [0.02, 0.22, 0.36, 0.5, 0.64, 0.78][Math.floor(Math.random() * 6)];
  }
  endScene(); // la scène ne survit pas à la manche ; l'underdog, oui (interrupteur explicite)
  round = {
    t: 0,
    state: 'playing',
    sun: 0,
    moon: 0,
    moonEvents: 0,
    winner: null,
    end: 0,
    skySun: 0,
    skyMoon: 0,
    topSun: tier.skySun,
    topMoon: tier.skyMoon,
    pulseSun: 9,
    pulseMoon: 9,
    target: tier.target,
    harvest: 0,
  };
  stones = [];
  brambles = [];
  berrylessTime = 0;
  bodies = [
    createBody('gold', GOLD, COLS / 2 - 1, Math.floor(ROWS / 2), { x: -1, y: 0 }),
    createBody('shadow', SHADOW, COLS / 2, Math.floor(ROWS / 2), { x: 1, y: 0 }),
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
  const heightKey = 'top' + team,
    skyKey = 'sky' + team,
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
const isSnakeTeam = (c) => c === 'snake' || c === 'sun' || c === 'gold';

function endRound(team, cause) {
  if (!round || round.state !== 'playing') return;
  round.state = 'over';
  round.winner = team;
  round.end = 0;
  moments.rounds++;
  if (team === 'gold' || team === 'shadow') {
    announceStreak(team);
  }
  if (team === 'draw') {
    /* match nul : aucun point */
  } else if (isSnakeTeam(team)) {
    snakeScore++;
    snakePulse = 0;
  } else {
    scoreViewers++;
    viewersPulse = 0;
  }
  rounds.push({
    team: team,
    cause: cause || 'unknown',
    duration: round.t,
    length: snake.length,
    sun: round.sun,
    moon: round.moonEvents,
    skySun: round.skySun,
    skyMoon: round.skyMoon,
    target: round.target,
    harvest: round.harvest,
    mode: settings.mode,
    tier: tier.id,
  });
}

export let egg = null;

// Architecture multi-corps : motif charger/ranger.
// On charge le corps i dans les variables de module, on travaille dessus, on range.
function createBody(team, tint, x0, y0, dir0) {
  return {
    team: team,
    tint: tint,
    flair: FLAIR_BY_TEAM[team] || 0,
    hunt: HUNT_BY_TEAM[team] || 0,
    x0: x0 !== undefined ? x0 : Math.floor(COLS / 2),
    y0: y0 !== undefined ? y0 : Math.floor(ROWS / 2),
    dir0: dir0 || { x: 1, y: 0 },
    snake: [],
    positionHistory: [],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    subStep: 0,
    grew: false,
    aiMemory: {},
    trace: [],
    toPush: 0,
    egg: null,
    boostTime: 0,
    invincibleTime: 0,
    cutTime: 0,
    recoilTime: 0,
    likeCredit: 0,
    ring: 0,
    ringPeak: 0,
    shieldTime: 0,
    lives: 0,
    parryTime: 0,
  };
}
export let bodies = [],
  activeIndex = 0;

export function loadBody(i) {
  activeIndex = i;
  const c = bodies[i];
  snake = c.snake;
  positionHistory = c.positionHistory;
  dir = c.dir;
  nextDir = c.nextDir;
  subStep = c.subStep;
  grew = c.grew;
  aiMemory = c.aiMemory;
  trace = c.trace;
  toPush = c.toPush;
  egg = c.egg;
}
export function storeBody() {
  const c = bodies[activeIndex];
  c.snake = snake;
  c.positionHistory = positionHistory;
  c.dir = dir;
  c.nextDir = nextDir;
  c.subStep = subStep;
  c.grew = grew;
  c.aiMemory = aiMemory;
  c.trace = trace;
  c.toPush = toPush;
  c.egg = egg;
}
export const rival = () => (bodies.length > 1 ? bodies[1 - activeIndex] : null);

function spawn(keep, x0, y0, dir0) {
  const cx = x0 !== undefined ? x0 : Math.floor(COLS / 2);
  const cy = y0 !== undefined ? y0 : Math.floor(ROWS / 2);
  snake = [];
  positionHistory = [];
  trace = [];
  egg = { t: 0, x: cx, y: cy, keep: !!keep, dir0: dir0 || null };
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
  const h = a.snake[0];
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
  if (!settings.ai || !window.ViperAi || !snake.length) return;
  try {
    const otherBody = rival();
    const state = {
      cols: COLS,
      rows: ROWS,
      body: snake,
      dir,
      fruits: allFruits(),
      obstacles: stones
        .filter((r) => r.t >= STONE_WARNING * 0.6)
        .map((r) => ({ x: r.x, y: r.y }))
        .concat(activeBrambles(0.6).map((g) => ({ x: g.x, y: g.y })))
        .concat(otherBody ? otherBody.snake : []),
      avoid: otherBody ? opponentCrown(otherBody) : [],
      toGrow: toPush,
      recklessness: settings.recklessness,
      advantage: bodies[activeIndex]
        ? ((bodies[activeIndex].team === 'gold' ? 1 : -1) * (settings.advantage || 0)) / 100
        : 0,
      flair: bodies[activeIndex] ? bodies[activeIndex].flair : 0,
      hunt: bodies[activeIndex] ? bodies[activeIndex].hunt : 0,
      opponent: otherBody ? otherBody.snake : null,
      opponentInvincible: !!(otherBody && otherBody.invincibleTime > 0),
      memory: aiMemory,
    };
    // Scène : la moitié concernant le camp du serpent actif s'applique sur etat.
    if (scene && bodies[activeIndex]) {
      const teamScene = scene[bodies[activeIndex].team] || {};
      if (teamScene.stance) state.forcedStance = teamScene.stance;
      if (teamScene.pA) state.attackRange = teamScene.pA;
      if (teamScene.pD) state.defenseRange = teamScene.pD;
      if (teamScene.hunt != null) state.forcedHunt = teamScene.hunt;
      if (teamScene.flair != null) state.forcedFlair = teamScene.flair;
      if (teamScene.recklessness != null) state.recklessness = teamScene.recklessness;
      if (teamScene.berryRace) state.berryRace = true;
      if (teamScene.immediateTrap) state.immediateTrap = true;
      if (teamScene.lure) state.lure = true;
      if (teamScene.repel) state.repel = true;
      if (teamScene.encircle) state.encircle = true;
      if (teamScene.noKill) state.noKill = true;
    }
    // Underdog : le plus court reçoit +audace et +2 cases de portée, en silence.
    if (settings.underdog && bodies.length === 2) {
      const myLength = bodies[activeIndex].snake.length,
        oppLength = bodies[1 - activeIndex].snake.length;
      if (myLength < oppLength) {
        state.recklessness = (state.recklessness || 0) + 0.03;
        state.attackRange = (state.attackRange || 12) + 2;
        state.defenseRange = (state.defenseRange || 10) + 2;
      }
    }
    if (settings.aiDebug) {
      state.debug = true;
      aiMemory.dbgAvoid = state.avoid;
    } else if (aiMemory.debug) {
      delete aiMemory.debug;
      delete aiMemory.dbgAvoid;
      delete aiMemory.dbgFlash;
    }
    const superActive = !!(
      !scene &&
      window.ViperSuperAi &&
      bodies[activeIndex] &&
      (settings.superAi === true || settings.superAi === bodies[activeIndex].team)
    );
    if (superActive && keep) state.preferred = nextDir;
    let d = superActive ? window.ViperSuperAi.choose(state) : window.ViperAi.choose(state);
    // garder : une direction deja annoncee (et dessinee) reste si elle est encore sure
    if (
      !superActive &&
      keep &&
      d &&
      (d.x !== nextDir.x || d.y !== nextDir.y) &&
      window.ViperAi.safeStep &&
      window.ViperAi.safeStep(state, nextDir)
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
  if (bodies[activeIndex]) bodies[activeIndex].deathCause = cause || 'self'; // pour les sondes : de quoi il est mort
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
  if (bodies[activeIndex].shieldTime > 0) {
    // le bouclier pare la collision : aucun anneau perdu, il repart invincible
    bodies[activeIndex].parryTime = 0.9;
    bodies[activeIndex].invincibleTime = 1.5;
    announceRescue(activeIndex, 'shield');
    if (snake.length) {
      const pos = px(snake[0].x, snake[0].y);
      burst(pos.x, pos.y, 20, 'shell');
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
    opponentBody.snake.some((q) => Math.abs(q.x - h0.x) + Math.abs(q.y - h0.y) <= 2)
  );
  if (cornered && (cause === 'wall' || cause === 'self')) {
    cause = 'adverse';
    bodies[activeIndex].deathCause = 'adverse';
  }
  if (cause === 'wall' || cause === 'self') {
    bodies[activeIndex].invincibleTime = 1.5;
    bodies[activeIndex].parryTime = 0.4;
    if (snake.length) {
      const pos = px(snake[0].x, snake[0].y);
      burst(pos.x, pos.y, 10, 'dust');
    }
    requestAiMove();
    return;
  }
  const L = snake.length;
  const threshold = Math.max(bodies[activeIndex].adult ? 3 : YOUNG_MIN_LENGTH, Math.floor(L / 2));
  const lostSegments = snake.slice(threshold);
  snake = snake.slice(0, threshold);
  positionHistory = positionHistory.slice(0, Math.max(1, threshold + 3));
  bodies[activeIndex].invincibleTime = 1.5;
  bodies[activeIndex].ringPeak = L / TARGET_LENGTH;
  bodies[activeIndex].recoilTime = 0.9;
  bodies[activeIndex].cutTime = 0.9;
  burstSegments(lostSegments, bodies[activeIndex].team);
  if (snake.length < 3 && bodies[activeIndex].adult) {
    snake = [];
    const opponent = rival();
    endRound(opponent ? opponent.team : 'gold', 'place');
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
  requestAiMove(!window.VIPER_ALWAYS_REDECIDE);
  if (prevDir.x !== nextDir.x || prevDir.y !== nextDir.y) aiAdjustments++;
  else aiHolds++;
  if (settings.aiDebug)
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
  const isInvincible = bodies[activeIndex].invincibleTime > 0;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (!isInvincible) {
      die('wall');
      return false;
    }
    requestAiMove();
    return true;
  }
  if (stones.some((r) => r.t >= STONE_WARNING && r.x === nx && r.y === ny)) {
    die('stone');
    return false;
  }
  if (activeBrambles().some((g) => g.x === nx && g.y === ny)) {
    die('bramble');
    return false;
  }
  // baie reservee a l'autre camp : le serpent passe dessus sans la manger (Abdel : « avoid the stealing case »)
  const myTeam = bodies[activeIndex] ? bodies[activeIndex].team : null;
  const berryIdx = berries.findIndex(
    (b) => b.x === nx && b.y === ny && !(b.owner && myTeam && b.owner !== myTeam),
  );
  const eating = berryIdx >= 0;
  const isPushing = toPush > 0;
  const growByEating = eating && snake.length < maxLength();
  const growing = isPushing || growByEating;
  if (isPushing) toPush--;
  // la queue libere sa case au meme pas, sauf si le serpent mange ; en duel, le corps adverse bloque aussi
  const otherBodyDuel = rival();
  const blocking = (growing ? snake : snake.slice(0, -1)).concat(
    otherBodyDuel ? otherBodyDuel.snake : [],
  );
  if (!isInvincible && blocking.some((s) => s.x === nx && s.y === ny)) {
    // duel, tete contre tete : la faute est partagee, les deux serpents encaissent. Sinon celui qui
    // avance en premier dans la boucle perd toutes les frontales.
    const opponentHead = otherBodyDuel && otherBodyDuel.snake[0];
    if (
      opponentHead &&
      opponentHead.x === nx &&
      opponentHead.y === ny &&
      otherBodyDuel.invincibleTime <= 0
    ) {
      const myIdx = activeIndex;
      die('headOn');
      if (round && round.state === 'playing') {
        storeBody();
        loadBody(1 - myIdx);
        die('headOn');
        storeBody();
        loadBody(myIdx);
      }
      return false;
    }
    die(
      otherBodyDuel && otherBodyDuel.snake.some((s) => s.x === nx && s.y === ny)
        ? 'adverse'
        : 'self',
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
    if (!b || !b.wild) giftsEaten++;
    // halo de la couleur de la baie mangee : or, ombre, ou vert (baie sans camp)
    halos.push({
      x: p.x,
      y: p.y,
      t: 0,
      duration: b && b.wild ? 0.85 : 1.1,
      tint:
        b && b.wild
          ? 'nature'
          : b && b.team === 'gold'
            ? 'gift-gold'
            : b && b.team === 'shadow'
              ? 'gift-shadow'
              : 'gifted',
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
  if (settings.cycle > 0) settings.hour = (settings.hour + dt / settings.cycle) % 1;
  if (scene && round && round.state === 'playing') {
    scene.remaining -= dt;
    if (scene.remaining <= 0) endScene();
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
        nickname: g.nickname,
        t: 0,
        team: g.team || null,
        owner: g.owner || null,
      });
      burst(
        px(g.x, g.y).x,
        px(g.x, g.y).y,
        6,
        g.team === 'gold' ? 'gift-gold' : g.team === 'shadow' ? 'gift-shadow' : 'gifted',
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
    if (halos[i].t >= halos[i].duration) halos.splice(i, 1);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const e = sparks[i];
    e.t += dt;
    if (e.t >= e.duration) {
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
      burst(pixelPos.x, pixelPos.y + 14, 7, 'dust', {
        v0: 18,
        v1: 65,
        top: -4,
        g: 260,
        frein: 3.4,
        r: 0.8,
        a: 0.4,
        duration: 0.55,
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
    bramble.step += dt;
    if (bramble.step >= BRAMBLE_STEP && bramble.seg.length < BRAMBLE_MAX_SEGMENTS) {
      bramble.step = 0;
      extendBramble(bramble);
    }
    // chaque segment qui devient dur remue la terre a son pied
    bramble.seg.forEach((g) => {
      if (g.t >= BRAMBLE_WARNING && g.t - dt < BRAMBLE_WARNING) {
        const pixelPos = px(g.x, g.y);
        burst(pixelPos.x, pixelPos.y + 10, 4, 'dust', {
          v0: 12,
          v1: 44,
          top: -6,
          g: 200,
          frein: 3.2,
          r: 0.6,
          a: 0.32,
          duration: 0.45,
        });
      }
    });
  }
  if (round) {
    if (round.state === 'playing') {
      round.t += dt;
      // la cible ne monte qu'avec l'affluence : une ruee ne rend pas la manche triviale,
      // et une salle qui se vide ne punit pas ceux qui restent
      stretchSky('Sun', tier.skySun, dt * 14);
      stretchSky('Moon', tier.skyMoon, dt * 2);
      // La cible s'allonge avec l'affluence, donc la recolte se remet a l'echelle comme le fait
      // deja etirer() pour les astres. Sans ca, un anneau plein retombait a 17 % quand la foule
      // arrivait, et le spectateur voyait la progression RECULER.
      if (tier.target > round.target) {
        const avant = round.target;
        round.target = Math.min(tier.target, round.target + dt * 14);
        if (avant > 0 && round.target > avant) round.harvest *= round.target / avant;
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
        const prevHold = c.hold || 0;
        c.hold = c.snake.length >= TARGET_LENGTH ? (c.hold || 0) + dt : 0;
        if (prevHold === 0 && c.hold > 0) moments.holds++;
        if (c.snake.length >= ADULT_LENGTH) c.adult = true;
        const enSursis = !c.egg && c.snake.length > 0 && c.snake.length < REPRIEVE_LENGTH;
        if (enSursis && !c.reprieve) moments.reprieve++;
        c.reprieve = enSursis;
        if (c.hold >= HOLD_SECONDS) fullBodies.push(c);
      }
      // EGALITE STRICTE : avant, la boucle finissait sur `break` des que corps[0] tenait son
      // anneau, donc Or passait devant Ombre du seul fait de son rang dans le tableau. On
      // depouille maintenant les deux, et la plus longue tenue gagne ; tenue identique = nul.
      if (fullBodies.length === 1) endRound(fullBodies[0].team, 'ring');
      else if (fullBodies.length > 1) {
        const a = fullBodies[0],
          b = fullBodies[1];
        endRound(a.hold === b.hold ? 'draw' : a.hold > b.hold ? a.team : b.team, 'ring');
      }
      if (round.state !== 'playing') return;
      // duel : chrono propre (TEST equilibre : 120 s, les publics calmes ne remplissent jamais l'anneau)
      if (round.t >= (settings.duelDuration || settings.duration)) {
        // plus long gagne ; egalite = ombre (comme Moon en versus). Aucun progres des deux cotes (personne
        // n'a depasse la longueur de naissance) : match nul, aucun point (Abdel).
        const l0 = bodies[0].snake.length,
          l1 = bodies[1].snake.length;
        // EGALITE STRICTE : l'egalite de longueur allait silencieusement a Ombre (« comme Moon en
        // versus »), ce qui est un biais de camp. Sans spectateur les deux serpents finissent
        // souvent a la meme longueur (5 % des manches mesurees) : c'est un match nul, aucun point.
        if (l0 === l1) endRound('draw', 'timeScale');
        else if (l0 <= START_LENGTH && l1 <= START_LENGTH) endRound('draw', 'timeScale');
        else endRound(l0 > l1 ? 'gold' : 'shadow', 'timeScale');
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
          if (bodies[0] && bodies[1] && bodies[0].snake[0] && bodies[1].snake[0]) {
            const a = bodies[0].snake[0],
              b = bodies[1].snake[0];
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
            berries.push({ x: c.x, y: c.y, nickname: '', t: 0, wild: true });
            requestAiMove();
          }
        }
      } else {
        berrylessTime = 0;
        wildDelay = 0;
      }
    } else {
      round.end += dt;
      if (round.end >= 8) newRound();
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
  if (bodies[activeIndex].boostTime > 0)
    bodies[activeIndex].boostTime = Math.max(0, bodies[activeIndex].boostTime - dt);
  if (bodies[activeIndex].invincibleTime > 0)
    bodies[activeIndex].invincibleTime = Math.max(0, bodies[activeIndex].invincibleTime - dt);
  if (bodies[activeIndex].cutTime > 0)
    bodies[activeIndex].cutTime = Math.max(0, bodies[activeIndex].cutTime - dt);
  if (bodies[activeIndex].parryTime > 0)
    bodies[activeIndex].parryTime = Math.max(0, bodies[activeIndex].parryTime - dt);
  if (bodies[activeIndex].shieldTime > 0)
    bodies[activeIndex].shieldTime = Math.max(0, bodies[activeIndex].shieldTime - dt);
  if (bodies[activeIndex].recoilTime > 0)
    bodies[activeIndex].recoilTime = Math.max(0, bodies[activeIndex].recoilTime - dt);
  if (pause > 0) {
    pause -= dt;
    if (pause <= 0) {
      pause = 0;
      spawn(!!(round && round.state === 'playing'));
    }
    return;
  }
  if (egg) {
    const avant = egg.t;
    egg.t += dt;
    const a0 = getAmbience();
    if (isSoundReady() && a0 && a0.hatchSound) {
      const uu = egg.t / HATCH_TIME,
        ua = avant / HATCH_TIME;
      [0.34, 0.46, 0.55].forEach((keyMap) => {
        if (ua < keyMap && uu >= keyMap) playHatch(a0, 'crack');
      });
      if (ua < EMERGE_TIME && uu >= EMERGE_TIME) playHatch(a0, 'birth');
    }
    // le serpent sort avant la fin de l'animation, la coquille finit de s'ouvrir derriere lui
    if (!egg.emerged && egg.t >= HATCH_TIME * EMERGE_TIME) {
      egg.emerged = true;
      const p = px(egg.x, egg.y);
      burst(p.x, p.y, 18, 'shell');
      hatch(egg.keep);
    }
    if (egg.t >= HATCH_TIME + TRAIL_TIME) egg = null;
    if (!egg || !egg.emerged) return;
  }
  const boosted = bodies[activeIndex].boostTime > 0;
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
  const n = settings.timeScale;
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

window.Viper = {
  settings: settings,
  spawn: spawn,
  advance: advance,
  toggleSound: toggleSound,
  newRound: newRound,
  tension: () => tension,
  // Scène courante (super admin) : lecture, lancement par nom, arrêt immédiat.
  scene: sceneState,
  launchScene: launchScene,
  stopScene: endScene,
  endTest: (team) => {
    endRound(team || 'gold', 'test');
  },
  soundOn: isSoundActive,
  tier: () => ({
    id: tier.id,
    cadence: Math.round(cadence),
    topSun: round ? Math.round(round.topSun) : tier.skySun,
    topMoon: round ? Math.round(round.topMoon) : tier.skyMoon,
  }),
  round: () =>
    round && {
      state: round.state,
      t: round.t,
      sun: round.sun,
      moon: round.moonEvents,
      winner: round.winner,
      skySun: round.skySun,
      skyMoon: round.skyMoon,
      harvest: round.harvest,
      target: round.target,
    },
  rounds: () => rounds,
  score: () => ({ snake: snakeScore, viewers: scoreViewers }),
  resetScore: () => {
    snakeScore = 0;
    scoreViewers = 0;
    snakePulse = 9;
    viewersPulse = 9;
  },
  shake: () => ({ adjustments: aiAdjustments, holds: aiHolds }),
  metrics: () => ({
    length: snake.length,
    berriesEaten: berriesEaten,
    deaths: deaths,
    errors: errors,
    lastError: lastError,
    t,
    turns: turns,
    staircases: staircases,
    avoidable: avoidable,
    deathLengths: deathLengths,
    giftsSpawned: gifted,
    giftsEaten: giftsEaten,
    stonesPlaced: stonesPlaced,
    hits: hits,
    berries: berries.length + seeds.length,
  }),
  duel: () => ({
    t: round && round.t,
    winner: round && round.winner,
    gold: bodies[0]
      ? {
          length: bodies[0].snake.length,
          stance: (bodies[0].aiMemory && bodies[0].aiMemory.activeStance) || 'neutral',
          reason: bodies[0].aiMemory && bodies[0].aiMemory.reason,
          hold: bodies[0].hold || 0,
          shieldTime: bodies[0].shieldTime,
          lives: bodies[0].lives,
          boostTime: bodies[0].boostTime,
          invincibleTime: bodies[0].invincibleTime,
          cutTime: bodies[0].cutTime,
          recoilTime: bodies[0].recoilTime,
        }
      : null,
    shadow: bodies[1]
      ? {
          length: bodies[1].snake.length,
          stance: (bodies[1].aiMemory && bodies[1].aiMemory.activeStance) || 'neutral',
          reason: bodies[1].aiMemory && bodies[1].aiMemory.reason,
          hold: bodies[1].hold || 0,
          shieldTime: bodies[1].shieldTime,
          lives: bodies[1].lives,
          boostTime: bodies[1].boostTime,
          invincibleTime: bodies[1].invincibleTime,
          cutTime: bodies[1].cutTime,
          recoilTime: bodies[1].recoilTime,
        }
      : null,
  }),
  // reglage de la course pour les harnais d'equilibrage
  setSky: (id, sun, moon) => {
    const p = TIERS.find((x) => x.id === id);
    if (!p) return;
    if (sun) p.skySun = sun;
    if (moon) p.skyMoon = moon;
  },
  setTarget: (id, c) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.target = c;
  },
  setMaxLength: forceLength,
  setMaxStones: (id, v) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.maxStones = v;
  },
  setHit: (id, v) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.hit = v;
  },
  // flair par camp en duel (regie, harnais) : s'applique aux corps courants et aux prochains
  setFlair: (team, v) => {
    FLAIR_BY_TEAM[team] = v;
    bodies.forEach((c) => {
      if (c.team === team) c.flair = v;
    });
  },
  setHoldSeconds: (s) => {
    HOLD_SECONDS = Math.max(0.5, +s || 5);
  },
  moments: () => Object.assign({}, moments),
  resetMoments: () => {
    moments = { holds: 0, reprieve: 0, parries: 0, rounds: 0 };
  },
  setHunt: (team, v) => {
    HUNT_BY_TEAM[team] = v;
    bodies.forEach((c) => {
      if (c.team === team) c.hunt = v;
    });
  },
  setHour: (h) => {
    settings.hour = ((h % 1) + 1) % 1;
  },
  egg: () => egg && { t: egg.t, duration: HATCH_TIME },
  plantBramble: () => plantBramble('probe'),
  internal: () => ({
    snake: snake,
    fruit,
    dir,
    stones: stones.map((r) => ({ x: r.x, y: r.y, t: r.t })),
    brambles: brambles.map((bramble) => ({
      t: bramble.t,
      seg: bramble.seg.map((g) => ({ x: g.x, y: g.y, t: g.t })),
    })),
    warning: STONE_WARNING,
    speed: SPEED,
    brambleWarning: BRAMBLE_WARNING,
    brambleMax: BRAMBLE_MAX_SEGMENTS,
    berries: berries.map((b) => ({ x: b.x, y: b.y, team: b.team || null })),
    seeds: seeds.map((g) => ({ x: g.x, y: g.y })),
    body: bodies.map((c) => ({
      team: c.team,
      length: c.snake.length,
      head: c.snake[0] || null,
      snake: c.snake.map((s) => ({ x: s.x, y: s.y })),
      dir: { ...c.dir },
      invincibleTime: c.invincibleTime,
      deathCause: c.deathCause || null,
      debug: c.aiMemory.debug || null,
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
    if (d && !settings.ai && !(d.x === -dir.x && d.y === -dir.y)) {
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
