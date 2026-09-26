// Vipere Live, base minimale : un serpent IA qui mange et grandit dans la foret. Rien d'autre.
// Vitesse constante, se toucher tue toujours, aucun texte sur le canvas, aucun son de fond.

import {
  W,
  H,
  COLS,
  ROWS,
  SR_X,
  SR_Y,
  SR_W,
  SR_H,
  Z_CADEAUX,
  Z_BANNIERE,
  Z_FIL,
  Z_SAISIE,
  CELL,
  X0,
  Y0,
  OX,
  WF,
  changerFormat,
} from '../engine/layout.js';
import { canvas, ctx, lierCanvas, setCtx } from '../engine/canvas.js';
import {
  armerSon,
  basculerSon,
  estSonActif,
  jouerBouchee,
  jouerEclosion,
  sonPose,
  sonPret,
} from '../engine/audio.js';
import {
  CADEAUX_DUEL,
  EFFET_LABEL,
  peindreDefileCadeaux,
  peindreLegendeDuel,
} from '../engine/gift-panel.js';
import { peindreFin } from '../engine/end-screen.js';
import { peindreDebugIA, peindreMaquetteLive } from '../engine/debug-overlay.js';
import { peindreCoquille, peindreEtincelles, peindreHalos } from '../engine/effects.js';
import { peindreScore, personne } from '../engine/scoreboard.js';
import { peindreDuel, peindreStatutsDuel } from '../engine/duel-hud.js';
import {
  DONS,
  PALIERS_VUE,
  annoncer,
  annoncerSerie,
  dejaDonne,
  dire,
  donsManche,
  likesPar,
  nomCamp,
  oublierDonsManche,
  paliersVus,
  peindreBandeau,
  sauve,
} from '../engine/announcements.js';
import { BLEU, OMBRE, OR } from '../engine/palette.js';
import { peindreOffrandes, peindreRochers, peindreRonces } from '../engine/board-items.js';
import {
  ADULTE_DUEL,
  ALERTE,
  BOUCLIER_COUT,
  BOUCLIER_DUR,
  CHASSE_DUEL,
  COUPE_COUT,
  COUPE_FRAC,
  DEPART_DUEL,
  ECLOSION,
  FLAIR_DUEL,
  FORET_DUEL,
  GERME,
  LONG_CIBLE_DUEL,
  MIN_JEUNE,
  PALIERS,
  RONCE_ALERTE,
  RONCE_MAX,
  RONCE_PAS,
  SORTIE,
  SURGE_FACT,
  SURSIS_DUEL,
  TEMPO_COUT,
  TEMPO_DUR,
  TRAINE,
  VIEROCHER,
  VIERONCE,
  VIE_COUT,
  VITESSE,
  coupeDe,
} from '../engine/rules.js';
import {
  cadence,
  compter,
  forcerLong,
  longMax,
  majPalier,
  palier,
  souffle,
} from '../engine/crowd.js';
import {
  allongerRonce,
  libres,
  planterRonce,
  roncesDures,
  tousFruits,
  zoneMorte,
} from '../engine/hazards.js';

let ajusterCanvas = null;

// applique le format demande en regie ; appele au debut de chaque manche (jamais en cours de manche)
function appliquerFormat() {
  if (!changerFormat(reglages.format)) return;
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
  if (ajusterCanvas) ajusterCanvas();
}

export let ronces = [];

export let halos = [];
export let serpent = [],
  hist = [],
  dir = { x: 1, y: 0 },
  dirProchaine = { x: 1, y: 0 };
export let fruit = null,
  avance = 0,
  grandi = false,
  memoireIA = {},
  trace = [];
// anneaux qui restent a sortir de la coquille : le corps s'allonge pas apres pas depuis l'oeuf
let aPousser = 0;
// Cadeaux des spectateurs : une graine tombe, germe en 1 s, devient une baie mangeable. 3 au plus.
export let graines = [],
  baies = [],
  etincelles = [],
  offertes = 0,
  mangeesOffertes = 0;

// Deux camps, un serpent : Sun nourrit, Moon bloque. La manche tranche entre eux.
export let rochers = [],
  manche = null,
  manches = [],
  sansBaie = 0;
let retouches = 0,
  gardes = 0; // anti-tremblement : redecisions au franchissement, et decisions gardees
let ordreTick = 0;

let delaiSauvage = 0;

// Une erreur de rendu avalee en silence a casse le jeu sans que rien ne le dise : on garde le message.
let derniereErreur = null;
const premiereLigne = (er) =>
  ((er && er.stack ? er.stack : '').split(String.fromCharCode(10))[1] || '').trim();
export let t = 0,
  pause = 0,
  bouchees = 0,
  poses = 0,
  morsures = 0,
  morts = 0,
  erreurs = 0,
  virages = 0,
  escaliers = 0,
  evitables = 0,
  longueursMort = [],
  dirs = [];
// Un seul mode dans `main` : le duel Or contre Ombre. L'ancien mode solo vit sur la branche wip/solo-mode.
// plafonds : faux par defaut, donc on pose autant de pierres, de ronces et de baies qu'on veut,
// jusqu'a remplir le plateau. Vrai remet les plafonds du palier, seul etat dans lequel les
// harnais d'equilibrage mesurent quelque chose de comparable.
export const reglages = {
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
export const amb = () => (window.AMBIANCES || []).find((a) => a.id === 'foret') || null;

// dons duel : bouclier a 50 = 15 s d'immunite, cumulables sans plafond, vie a 100, sans plafond (Abdel : « no cap »)
export let TENUE_DUEL = 5; // un serpent qui n'a jamais atteint 10 anneaux est 'jeune' : une coupe ne le descend jamais sous 3 et il n'est pas en sursis (pas de piege au depart)
// compteurs de moments de depense (proxy de profit) : tenues entamees, sursis entames, parades
let moments = { tenues: 0, sursis: 0, parades: 0, manches: 0 };
let baieCount = 0; // compteur de baies mangees pour la croissance decouplee (mode base)

// eclaterAnneaux : convertit des segments en baies actives (coupe duel ou mort duel).
// Appeler sous charger(i) : zoneMorte utilise le bon contexte de tete (duel verifie les deux).
// camp : les anneaux laches gardent la couleur du serpent qui les a perdus (Abdel : « the food
// dropped need to be the same color as the snake who dropped it »). Sans camp, baie verte normale.
function eclaterAnneaux(segs, camp) {
  segs.forEach((s) => {
    if (zoneMorte(s, 0)) return;
    const p = px(s.x, s.y);
    eclat(
      p.x,
      p.y,
      4,
      camp === 'or' ? 'offerte-or' : camp === 'ombre' ? 'offerte-ombre' : 'rodeur',
    );
    baies.push({ x: s.x, y: s.y, pseudo: '', t: 0, sauvage: false, camp: camp || null });
  });
}

// semerPour(i, pseudo) : seme une baie dans la moitie du plateau proche de la tete de corps i.
// Doit etre appele pendant le traitement d'un evenement duel ; charger(0) apres la boucle.
function semerPour(i, pseudo) {
  const tiI = corps[i] && corps[i].serpent[0];
  const tiAdv = corps[1 - i] && corps[1 - i].serpent[0];
  if (!tiI) return 0;
  charger(i);
  let l = libres().filter((c) => !zoneMorte(c, GERME));
  if (tiAdv) {
    const pref = l.filter(
      (c) =>
        Math.abs(c.x - tiI.x) + Math.abs(c.y - tiI.y) <
        Math.abs(c.x - tiAdv.x) + Math.abs(c.y - tiAdv.y),
    );
    if (pref.length) l = pref;
  }
  if (!l.length) l = libres();
  if (!l.length) {
    ranger();
    return 0;
  }
  // Fiable (Abdel, reco validee) : la baie tombe PRES de la tete du camp, pas n'importe ou dans sa moitie.
  // Cases triees par distance a la tete (hors zone morte, donc jamais franchies avant d'etre actives),
  // tirage parmi les 4 plus proches. Un spam de 15 roses forme une grappe autour de la tete, mangee
  // dans les secondes qui suivent ; les cases se remplissent de proche en proche.
  // Devant lui, jamais derriere (Abdel) : on garde les cases dont le produit scalaire avec sa direction
  // est positif (devant ou de cote-devant) ; repli sur toutes si aucune.
  const dI = corps[i].dir || { x: 1, y: 0 };
  const devant = l.filter((c) => (c.x - tiI.x) * dI.x + (c.y - tiI.y) * dI.y > 0);
  if (devant.length) l = devant;
  l.sort(
    (p, q) =>
      Math.abs(p.x - tiI.x) +
      Math.abs(p.y - tiI.y) -
      (Math.abs(q.x - tiI.x) + Math.abs(q.y - tiI.y)),
  );
  const c = l[Math.floor(Math.random() * Math.min(4, l.length))];
  graines.push({
    x: c.x,
    y: c.y,
    pseudo: pseudo || '',
    t: 0,
    camp: corps[i].camp,
    pour: corps[i].camp,
  }); // teinte du camp, et RESERVEE a ce camp (Abdel : pas de vol de rose)
  offertes++;
  ranger();
  return 1;
}

// couperDuel(adverseIdx, k) : coupe k anneaux de la queue du corps adverse, les eclate en baies.
// Retourne le nombre d'anneaux effectivement coupes. Finit avec ranger() mais PAS charger(0).
function couperDuel(adverseIdx, k, voleurIdx) {
  charger(adverseIdx);
  if (!serpent.length) {
    ranger();
    return 0;
  }
  if (corps[adverseIdx].bouclierT > 0) {
    // le bouclier pare la coupe entiere tant qu'il est actif ; le rail et la tete le montrent
    corps[adverseIdx].pareT = 0.9;
    moments.parades++;
    sauve(adverseIdx, 'bouclier');
    // TEST equilibre : la coupe paree est RENDUE au serpent protege, il grandit de ce qu'elle aurait coupe
    const gain = Math.max(1, Math.round(serpent.length * COUPE_FRAC));
    aPousser += gain;
    const tp = px(serpent[0].x, serpent[0].y);
    eclat(tp.x, tp.y, 20, 'coquille');
    ranger();
    return 0;
  }
  let nb = Math.min(k, Math.max(0, serpent.length - 1));
  if (nb <= 0) {
    ranger();
    return 0;
  }
  if (serpent.length - nb < 3 && !corps[adverseIdx].adulte) {
    // serpent jeune (jamais 10 anneaux) : la coupe descend jusqu'a MIN_JEUNE, on ne tue pas un serpent au berceau
    nb = Math.max(0, serpent.length - MIN_JEUNE);
    if (nb <= 0) {
      ranger();
      return 0;
    }
  }
  if (serpent.length - nb < 3 && corps[adverseIdx].vies > 0) {
    // une vie encaisse la mort : la coupe s'arrete a 3 anneaux
    corps[adverseIdx].vies--;
    corps[adverseIdx].pareT = 0.9;
    sauve(adverseIdx, 'vie');
    nb = Math.max(0, serpent.length - 3);
    if (nb <= 0) {
      ranger();
      return 0;
    }
  }
  corps[adverseIdx].anneauHaut = serpent.length / LONG_CIBLE_DUEL;
  corps[adverseIdx].reculT = 0.9;
  corps[adverseIdx].coupT = 0.9;
  const segs = serpent.slice(-nb);
  serpent = serpent.slice(0, serpent.length - nb);
  hist = hist.slice(0, Math.max(1, serpent.length + 3));
  if (segs.length) {
    const p = px(segs[0].x, segs[0].y);
    eclat(p.x, p.y, 16, 'rodeur');
  }
  if (voleurIdx !== undefined && corps[voleurIdx]) {
    // VOL (Abdel : « steal 15% ») : les anneaux ne tombent pas en baies, ils passent directement au serpent du camp
    corps[voleurIdx].aPousser = (corps[voleurIdx].aPousser || 0) + segs.length;
    segs.forEach((sg) => {
      const p = px(sg.x, sg.y);
      eclat(p.x, p.y, 3, corps[voleurIdx].camp === 'or' ? 'offerte-or' : 'offerte-ombre');
    });
  } else eclaterAnneaux(segs, corps[adverseIdx].camp);
  if (serpent.length < 3 && corps[adverseIdx].adulte) {
    serpent = [];
    // adverseIdx a perdu : le camp oppose gagne
    const gagnant = corps[adverseIdx].camp === 'ombre' ? 'or' : 'ombre';
    ranger();
    finir(gagnant, 'place');
    return nb;
  }
  ranger();
  demanderIA();
  return nb;
}

// opt regle la force d'un eclat : vitesse, poussee vers le haut, pesanteur, taille, opacite.
function eclat(x, y, n, teinte, opt) {
  const o = opt || {},
    v0 = o.v0 !== undefined ? o.v0 : 60,
    v1 = o.v1 !== undefined ? o.v1 : 240;
  const haut = o.haut !== undefined ? o.haut : 40,
    g = o.g !== undefined ? o.g : 520;
  const r = o.r !== undefined ? o.r : 1,
    a0 = o.a !== undefined ? o.a : 1,
    d = o.duree !== undefined ? o.duree : 0.5;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      v = v0 + Math.random() * (v1 - v0);
    etincelles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - haut,
      t: 0,
      duree: d + Math.random() * 0.4 * d,
      teinte,
      r,
      g,
      a: a0,
      k: o.frein || 0,
    });
  }
}

// Entree unique des evenements du live (un connecteur TikTok appellera la meme fonction)
window.recevoirEvenement = function (ev) {
  const e = ev || {},
    n = Math.max(1, Math.min(parseInt(e.n) || 1, 20));
  // Mode de base : aider et gener sont tous deux gratuits et ouverts a tous.
  // Un geste, un effet, jamais deux : le like seme une baie, le commentaire fait pousser une
  // pierre, le partage plante une ronce, le cadeau seme large. Aucun geste ne melange bonus et malus.
  // Mode de base : un seul objet recoit tous les gestes, le rodeur. Aucun geste n'est avale
  // par un seuil ni par un plafond : le like l'entame, le commentaire le nourrit, le cadeau l'assomme.
  if (e.type === 'spectateurs') {
    const tot = parseInt(e.total) || 0;
    let haut = 0;
    for (const pl of PALIERS_VUE) {
      if (tot >= pl && !paliersVus[pl]) {
        paliersVus[pl] = 1;
        haut = pl;
      }
    }
    if (haut) annoncer({ genre: 'palier', pseudo: '', texte: dire('palier', { n: haut }) });
    return 0;
  }
  if (e.type === 'arrivee' || e.type === 'partage' || e.type === 'abonne') {
    annoncer({
      genre: e.type,
      pseudo: String(e.pseudo || ''),
      avatar: e.avatar,
      texte: dire(e.type),
    });
    return 0;
  }
  if (e.type === 'like' && e.pseudo) {
    const lp = String(e.pseudo);
    likesPar[lp] = (likesPar[lp] || 0) + n;
    if (likesPar[lp] >= 10) {
      annoncer({
        genre: 'like',
        pseudo: lp,
        avatar: e.avatar,
        texte: dire('like', { n: likesPar[lp] }),
      });
      likesPar[lp] = 0;
    }
  }
  // Camp : explicite (regie), sinon par le NOM du cadeau TikTok (Abdel : « red 1 coin rose gives one
  // point to Or, white 1 coin gives 1 point to the other ») : 'rose' -> Or, tout autre cadeau -> Ombre.
  // Sans camp ni nom : tirage au sort (public simule).
  const nom = String(e.nom || e.cadeau || e.gift || '').toLowerCase();
  // Rose rouge ('rose') -> Or ; rose blanche (TikTok la nomme 'Rosa', ou 'rose blanche'/'white rose') -> Ombre.
  // A 10 coins (Abdel) : une rose a 10 -> tempo Or, le 'Dyno' a 10 -> tempo Ombre : tout nom contenant 'rose' -> Or.
  const v = e.valeur || 0;
  // Cadeaux du camp Or par nom : rose (10), donut (30) ; tout le reste (Dyno, Capybara...) est Ombre.
  const roseRouge =
    v >= TEMPO_COUT
      ? /rose|bouquet|bagel|donut|doughnut|teddy|bear/.test(nom)
      : /^rose( rouge| red)?$/.test(nom.trim());
  const i =
    e.camp === 'ombre'
      ? 1
      : e.camp === 'or'
        ? 0
        : nom
          ? roseRouge
            ? 0
            : 1
          : Math.random() < 0.5
            ? 0
            : 1;
  compter(e.type === 'cadeau' ? n * 3 : n);
  // Le like ne donne plus de poussee de vitesse en duel (Abdel, 2026-09-19 : « this is not a feature
  // anymore, remove it »). Il compte toujours pour l'affluence (compter, plus haut), rien d'autre.
  if (e.type === 'like') return 0;
  if (e.type === 'cadeau') {
    noterCadeau(i, e.valeur || 0, e.pseudo, n, e.avatar);
    if ((e.valeur || 0) >= VIE_COUT) {
      // vie : quand une coupe devrait tuer le serpent, elle le laisse a 3 anneaux
      const av = corps[i].vies;
      corps[i].vies += n;
      corps[i].viePar = String(e.pseudo || '');
      corps[i].vieAvatar = e.avatar;
      charger(i);
      if (serpent.length) {
        const tp = px(serpent[0].x, serpent[0].y);
        eclat(tp.x, tp.y, 18, 'rodeur');
      }
      ranger();
      charger(0); // vie : eclat rouge, comme le coeur
      return corps[i].vies - av;
    }
    if ((e.valeur || 0) >= BOUCLIER_COUT) {
      // bouclier : BOUCLIER_DUR secondes d'immunite aux coupes et aux collisions (Abdel : actif 15 s)
      corps[i].bouclierT += BOUCLIER_DUR * n;
      corps[i].bouclierPar = String(e.pseudo || '');
      corps[i].bouclierAvatar = e.avatar;
      charger(i);
      if (serpent.length) {
        const tp = px(serpent[0].x, serpent[0].y);
        eclat(tp.x, tp.y, 18, 'coquille');
      }
      ranger();
      charger(0);
      return n;
    }
    if ((e.valeur || 0) >= TEMPO_COUT && (e.valeur || 0) < COUPE_COUT) {
      // tempo paye : TEMPO_DUR secondes de poussee sur SON serpent, cumulable (Abdel : le cadeau a 10 coins)
      corps[i].surgeT += TEMPO_DUR * n;
      charger(i);
      if (serpent.length) {
        const tp = px(serpent[0].x, serpent[0].y);
        eclat(tp.x, tp.y, 16, 'coquille');
      }
      ranger();
      charger(0);
      return n;
    }
    if ((e.valeur || 0) >= COUPE_COUT) {
      // coupe : 15 % de la longueur adverse, n fois
      let total = 0;
      for (let q = 0; q < n; q++) {
        if (!(manche && manche.etat === 'en cours')) break;
        total += couperDuel(1 - i, coupeDe(corps[1 - i].serpent.length), i);
      }
      charger(0);
      return total;
    }
    // bon marche : semer n baies pour le camp i
    let pose = 0;
    for (let q = 0; q < n; q++) pose += semerPour(i, e.pseudo);
    charger(0);
    return pose;
  }
  // commentaire/partage : cadence seulement
  return 0;
};

// La course dans le ciel : un soleil a gauche, une lune a droite, tous deux bas au depart.
// Chaque baie mangee monte le soleil d'un cran, chaque rocher pose monte la lune d'un cran.
// Le premier en haut termine la manche. Le serpent est la balle, pas le joueur.
function nouvelleManche() {
  appliquerFormat();
  reglages.avantage = 0; // le coup de pouce est un geste ponctuel, jamais un reglage qui traine
  retourCadeaux = [[], []];
  bandeauCadeau = [null, null];
  oublierDonsManche();
  if (reglages.ambianceAuto) {
    const ms = [
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
    ].filter((m) => m !== reglages.meteo);
    reglages.meteo = ms[Math.floor(Math.random() * ms.length)];
    reglages.heure = ['etoiles', 'aurore', 'lucioles'].includes(reglages.meteo)
      ? 0.02
      : reglages.meteo === 'braises'
        ? 0.78
        : reglages.meteo === 'printemps'
          ? 0.36
          : [0.02, 0.22, 0.36, 0.5, 0.64, 0.78][Math.floor(Math.random() * 6)];
  }
  finirScene(); // la scène ne survit pas à la manche ; l'underdog, oui (interrupteur explicite)
  manche = {
    t: 0,
    etat: 'en cours',
    sun: 0,
    moon: 0,
    moonEv: 0,
    vainqueur: null,
    fin: 0,
    cielSun: 0,
    cielMoon: 0,
    hautSun: palier.cielSun,
    hautMoon: palier.cielMoon,
    pulseSun: 9,
    pulseMoon: 9,
    cible: palier.cible,
    recolte: 0,
  };
  baieCount = 0;
  rochers = [];
  ronces = [];
  sansBaie = 0;
  corps = [
    nouveauCorps('or', OR, COLS / 2 - 1, Math.floor(ROWS / 2), { x: -1, y: 0 }),
    nouveauCorps('ombre', OMBRE, COLS / 2, Math.floor(ROWS / 2), { x: 1, y: 0 }),
  ];
  for (let i = 0; i < corps.length; i++) {
    charger(i);
    naitre(false, corps[i].x0, corps[i].y0, corps[i].dir0);
    ranger();
  }
  charger(0);
}

// L'affluence monte : le ciel s'allonge, jamais ne se raccourcit, et l'astre garde sa hauteur a l'ecran.
// Sans cela une ruee ferait redescendre le soleil, et plus personne ne comprendrait la course.
function etirer(camp, vise, pas) {
  const kh = 'haut' + camp,
    kc = 'ciel' + camp,
    h = manche[kh];
  if (vise <= h) return;
  const nh = Math.min(vise, h + pas);
  manche[kc] *= nh / h;
  manche[kh] = nh;
}

// Un cran de plus pour un camp. Le premier en haut du ciel gagne.
export function monter(camp, n) {
  return;
}

// Le compteur de serie. Il ne compte pas des points, il compte des MANCHES gagnees, et il
// survit aux manches : c'est la seule memoire longue que le spectateur qui arrive en cours de
// live peut lire d'un coup d'oeil. `pulse` part a zero quand le camp vient de marquer, ce qui
// declenche le gonflement du chiffre : sans ca, l'increment passe inapercu sous le voile de fin.
export let scoreSerpent = 0,
  scoreViewers = 0,
  pulseS = 9,
  pulseV = 9;
const campSerpent = (c) => c === 'serpent' || c === 'sun' || c === 'or';

function finir(camp, cause) {
  if (!manche || manche.etat !== 'en cours') return;
  manche.etat = 'finie';
  manche.vainqueur = camp;
  manche.fin = 0;
  moments.manches++;
  if (camp === 'or' || camp === 'ombre') {
    annoncerSerie(camp);
  }
  if (camp === 'nul') {
    /* match nul : aucun point */
  } else if (campSerpent(camp)) {
    scoreSerpent++;
    pulseS = 0;
  } else {
    scoreViewers++;
    pulseV = 0;
  }
  manches.push({
    camp,
    cause: cause || 'inconnue',
    duree: manche.t,
    longueur: serpent.length,
    sun: manche.sun,
    moon: manche.moonEv,
    cielSun: manche.cielSun,
    cielMoon: manche.cielMoon,
    cible: manche.cible,
    recolte: manche.recolte,
    mode: reglages.mode,
    palier: palier.id,
  });
}

export let couvee = null;

function nouveauCorps(camp, teinte, x0, y0, dir0) {
  return {
    camp,
    teinte,
    flair: FLAIR_DUEL[camp] || 0,
    chasse: CHASSE_DUEL[camp] || 0,
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
    baieCount: 0,
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
export let corps = [],
  actif = 0;
// Scène courante (super admin) : {nom, restant, ...params}. Chaque tick d'IA la lit ; à zéro,
// on rend la main à l'IA normale. Définies dans SCENES ci-dessous.
let scene = null;
// Nettoyage complet en fin de scène (naturel ou bouton "Couper la scène") : la scène disparaît et
// tout effet qu'elle a pu poser sur les corps (invincibilité du ballet, mémoire IA de posture, de
// fatigue, d'attente) redevient normal. Les fruits, les rochers et le score restent, ils n'appartiennent
// pas à la scène. L'interrupteur underdog n'est pas touché, c'est un choix explicite séparé.
function finirScene() {
  scene = null;

  corps.forEach((c) => {
    c.invincT = 0; // ballet : invincibilité poussée à chaque tick, on la coupe net
    if (c.memoireIA) {
      c.memoireIA.posture = null; // la posture forcée s'oublie, elle sera recalculée
      c.memoireIA.postureActive = 'neutre';
      c.memoireIA.postureT = 0;
      c.memoireIA.attaqueT = 0;
      c.memoireIA.fatigue = 0;
      c.memoireIA.raison = null;
    }
  });
}
const SCENES = {
  // Ballet (Abdel : « donner le show, ne pas tuer l'autre, chaque serpent doit avoir une sortie
  // s'il joue intelligemment, un 4D chess move »). Comme face à face, mais nePasTuer coupe la
  // fermeture décisive : la pression, l'usure et l'orbite restent. Un serpent peut toujours mourir
  // d'une faute (mur, ronce, son propre corps), pas d'un piège volontaire de l'autre.
  ballet: {
    duree: 20,
    or: {
      posture: 'attaque',
      pA: 20,
      pD: 20,
      chasse: 1,
      flair: 0.25,
      attirer: true,
      nePasTuer: true,
    },
    ombre: {
      posture: 'attaque',
      pA: 20,
      pD: 20,
      chasse: 1,
      flair: 0.25,
      attirer: true,
      nePasTuer: true,
    },
  },
  course: {
    duree: 15,
    or: { courseBaie: true, pA: 12, pD: 10 },
    ombre: { courseBaie: true, pA: 12, pD: 10 },
  },
  // Chasse unifiée (retour d'Abdel : « le mener à un mur, le pousser à l'erreur, l'encercler avec
  // son propre corps »). Un serpent va au contact, l'encercle et tente le piège même risqué ; l'autre
  // joue normalement, il ne sait pas qu'il est visé.
  chasseOr: {
    duree: 12,
    or: {
      posture: 'attaque',
      pA: 20,
      pD: 20,
      chasse: 1,
      flair: 0.05,
      attirer: true,
      piegeImmediat: true,
      encercler: true,
    },
    ombre: {},
  },
  chasseOm: {
    duree: 12,
    or: {},
    ombre: {
      posture: 'attaque',
      pA: 20,
      pD: 20,
      chasse: 1,
      flair: 0.05,
      attirer: true,
      piegeImmediat: true,
      encercler: true,
    },
  },
};
export function charger(i) {
  actif = i;
  const c = corps[i];
  serpent = c.serpent;
  hist = c.hist;
  dir = c.dir;
  dirProchaine = c.dirProchaine;
  avance = c.avance;
  grandi = c.grandi;
  memoireIA = c.memoireIA;
  trace = c.trace;
  aPousser = c.aPousser;
  couvee = c.couvee;
  baieCount = c.baieCount;
}
export function ranger() {
  const c = corps[actif];
  c.serpent = serpent;
  c.hist = hist;
  c.dir = dir;
  c.dirProchaine = dirProchaine;
  c.avance = avance;
  c.grandi = grandi;
  c.memoireIA = memoireIA;
  c.trace = trace;
  c.aPousser = aPousser;
  c.couvee = couvee;
  c.baieCount = baieCount;
}
export const autre = () => (corps.length > 1 ? corps[1 - actif] : null);

function naitre(garder, x0, y0, dir0) {
  const cx = x0 !== undefined ? x0 : Math.floor(COLS / 2);
  const cy = y0 !== undefined ? y0 : Math.floor(ROWS / 2);
  serpent = [];
  hist = [];
  trace = [];
  couvee = { t: 0, x: cx, y: cy, garder: !!garder, dir0: dir0 || null };
  if (!garder) {
    graines = [];
    baies = [];
  }
}

function eclore(garder) {
  const cx = couvee ? couvee.x : Math.floor(COLS / 2);
  const cy = couvee ? couvee.y : Math.floor(ROWS / 2);
  const d0 = couvee && couvee.dir0 ? couvee.dir0 : { x: 1, y: 0 };
  serpent = [{ x: cx, y: cy }];
  aPousser = DEPART_DUEL - 1;
  hist = serpent.map((s) => ({ ...s }));
  dir = { ...d0 };
  dirProchaine = { ...d0 };
  avance = 0;
  grandi = false;
  memoireIA = {};
  // Renaissance en cours de manche : les offrandes des spectateurs restent, seule la case de depart se libere
  if (garder) {
    const occupe = (c) => serpent.some((s) => s.x === c.x && s.y === c.y);
    graines = graines.filter((g) => !occupe(g));
    baies = baies.filter((b) => !occupe(b));
    rochers = rochers.filter((r) => !occupe(r) && Math.abs(r.x - cx) + Math.abs(r.y - cy) > 2);
  }
  demanderIA();
}

// Duel : la tete adverse bouge en meme temps que la notre. Les deux serpents allaient l'un vers
// l'autre sur la meme baie et se percutaient tete contre tete (sonde : 48 frontales en 90 s, toutes
// perdues par Or qui avance en premier dans la boucle). Les quatre voisines de la tete adverse
// sont donc interdites a l'IA, comme la couronne du rodeur : elle contourne au lieu de foncer.
function couronneAdverse(a) {
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
export function demanderIA(garder) {
  if (!reglages.ia || !window.VipereIA || !serpent.length) return;
  try {
    const autreCorps = autre();
    const etat = {
      cols: COLS,
      rows: ROWS,
      corps: serpent,
      dir,
      fruits: tousFruits(),
      obstacles: rochers
        .filter((r) => r.t >= ALERTE * 0.6)
        .map((r) => ({ x: r.x, y: r.y }))
        .concat(roncesDures(0.6).map((g) => ({ x: g.x, y: g.y })))
        .concat(autreCorps ? autreCorps.serpent : []),
      eviter: autreCorps ? couronneAdverse(autreCorps) : [],
      aGrandir: aPousser,
      imprudence: reglages.imprudence,
      avantage: corps[actif]
        ? ((corps[actif].camp === 'or' ? 1 : -1) * (reglages.avantage || 0)) / 100
        : 0,
      flair: corps[actif] ? corps[actif].flair : 0,
      chasse: corps[actif] ? corps[actif].chasse : 0,
      adversaire: autreCorps ? autreCorps.serpent : null,
      adversaireInvincible: !!(autreCorps && autreCorps.invincT > 0),
      memoire: memoireIA,
    };
    // Scène : la moitié concernant le camp du serpent actif s'applique sur etat.
    if (scene && corps[actif]) {
      const s2 = scene[corps[actif].camp] || {};
      if (s2.posture) etat.postureForcee = s2.posture;
      if (s2.pA) etat.porteeAttaque = s2.pA;
      if (s2.pD) etat.porteeDefense = s2.pD;
      if (s2.chasse != null) etat.chasseForcee = s2.chasse;
      if (s2.flair != null) etat.flairForce = s2.flair;
      if (s2.imprudence != null) etat.imprudence = s2.imprudence;
      if (s2.courseBaie) etat.courseBaie = true;
      if (s2.piegeImmediat) etat.piegeImmediat = true;
      if (s2.attirer) etat.attirer = true;
      if (s2.repousser) etat.repousser = true;
      if (s2.encercler) etat.encercler = true;
      if (s2.nePasTuer) etat.nePasTuer = true;
    }
    // Underdog : le plus court reçoit +audace et +2 cases de portée, en silence.
    if (reglages.underdog && corps.length === 2) {
      const moi = corps[actif].serpent.length,
        adv = corps[1 - actif].serpent.length;
      if (moi < adv) {
        etat.imprudence = (etat.imprudence || 0) + 0.03;
        etat.porteeAttaque = (etat.porteeAttaque || 12) + 2;
        etat.porteeDefense = (etat.porteeDefense || 10) + 2;
      }
    }
    if (reglages.debugIA) {
      etat.debug = true;
      memoireIA.dbgEviter = etat.eviter;
    } else if (memoireIA.debug) {
      delete memoireIA.debug;
      delete memoireIA.dbgEviter;
      delete memoireIA.dbgFlash;
    }
    const superOn = !!(
      !scene &&
      window.VipereSuperIA &&
      corps[actif] &&
      (reglages.superIA === true || reglages.superIA === corps[actif].camp)
    );
    if (superOn && garder) etat.prefere = dirProchaine;
    let d = superOn ? window.VipereSuperIA.choisir(etat) : window.VipereIA.choisir(etat);
    // garder : une direction deja annoncee (et dessinee) reste si elle est encore sure
    if (
      !superOn &&
      garder &&
      d &&
      (d.x !== dirProchaine.x || d.y !== dirProchaine.y) &&
      window.VipereIA.pasSur &&
      window.VipereIA.pasSur(etat, dirProchaine)
    )
      d = dirProchaine;
    // l'arriere est le cou, pas la derniere direction tentee (apres un pas rate contre un mur,
    // dir pointe dans le mur et son inverse est parfois la seule issue)
    const cou = serpent[1]
      ? { x: serpent[1].x - serpent[0].x, y: serpent[1].y - serpent[0].y }
      : { x: -dir.x, y: -dir.y };
    if (d && !(d.x === cou.x && d.y === cou.y)) dirProchaine = d;
  } catch (er) {
    erreurs++;
    derniereErreur =
      'ia: ' + er.message + ' | ' + (er.stack || '').split('\n').slice(0, 3).join(' > ');
  }
}

function mourir(cause) {
  if (corps[actif]) corps[actif].mortCause = cause || 'soi'; // pour les sondes : de quoi il est mort
  // mort evitable : la tete avait encore une case libre a cote d'elle
  // la queue ne libere pas sa case au pas d'une bouchee : elle compte comme occupee
  const h = serpent[0],
    segsCourants = grandi ? serpent : serpent.slice(0, -1);
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
        a >= 0 &&
        b >= 0 &&
        a < COLS &&
        b < ROWS &&
        !segsCourants.some((c) => c.x === a && c.y === b)
      );
    })
  )
    evitables++;
  longueursMort.push(serpent.length);
  morts++;
  trace = [];
  // La mort ne tranche plus la manche : elle pousse la lune de quelques crans, puis le serpent revient.
  // Mode de base : la mort du serpent donne la manche aux spectateurs, c'est tout l'enjeu.
  // Versus : elle ne tranche rien, elle pousse la lune de quelques crans et le serpent revient.
  // Base : mourir contre un mur ou contre soi ne donne pas la manche, mais le rodeur en profite.
  // duel : pas de renaissance, pas de pause. Ramener a max(3, floor(L/2)).
  // La moitie perdue eclate en baies. Sous 3 anneaux : mort seche, l'autre camp gagne.
  if (corps[actif].bouclierT > 0) {
    // le bouclier pare la collision : aucun anneau perdu, il repart invincible
    corps[actif].pareT = 0.9;
    corps[actif].invincT = 1.5;
    sauve(actif, 'bouclier');
    if (serpent.length) {
      const tp = px(serpent[0].x, serpent[0].y);
      eclat(tp.x, tp.y, 20, 'coquille');
    }
    demanderIA();
    return;
  }
  // Faute propre (mur, son propre corps) : AUCUN anneau perdu (Abdel : « the team should never lose
  // because of a self mistake of the snake »). Il repart invincible 1,5 s et re-decide. Seuls le corps
  // adverse et la frontale, c'est-a-dire le piege de l'autre, coutent la moitie.
  // ... sauf si l'adversaire l'a acculee : son corps a 2 cases ou moins de ma tete, c'est SON piege
  // (Abdel : « orange blocked blue on the side and led him to the wall, blue didn't lose anything »).
  const advC = autre();
  const h0 = serpent[0];
  const accule = !!(
    advC &&
    h0 &&
    advC.serpent.some((q) => Math.abs(q.x - h0.x) + Math.abs(q.y - h0.y) <= 2)
  );
  if (accule && (cause === 'mur' || cause === 'soi')) {
    cause = 'adverse';
    corps[actif].mortCause = 'adverse';
  }
  if (cause === 'mur' || cause === 'soi') {
    corps[actif].invincT = 1.5;
    corps[actif].pareT = 0.4;
    if (serpent.length) {
      const tp = px(serpent[0].x, serpent[0].y);
      eclat(tp.x, tp.y, 10, 'poussiere');
    }
    demanderIA();
    return;
  }
  const L = serpent.length;
  const seuil = Math.max(corps[actif].adulte ? 3 : MIN_JEUNE, Math.floor(L / 2));
  const perdu = serpent.slice(seuil);
  serpent = serpent.slice(0, seuil);
  hist = hist.slice(0, Math.max(1, seuil + 3));
  corps[actif].invincT = 1.5;
  corps[actif].anneauHaut = L / LONG_CIBLE_DUEL;
  corps[actif].reculT = 0.9;
  corps[actif].coupT = 0.9;
  eclaterAnneaux(perdu, corps[actif].camp);
  if (serpent.length < 3 && corps[actif].adulte) {
    serpent = [];
    const adv = autre();
    finir(adv ? adv.camp : 'or', 'place');
  } else demanderIA(); // sinon il garde son cap dans le mur et remeurt a la fin de l'invincibilite
  return;
}

function pas() {
  if (!serpent.length) return false;
  // duel : l'adversaire a bouge depuis la derniere decision, on re-decide sur sa position reelle.
  // Sans ca, toutes les morts etaient "evitables" (sonde) : la tete fonçait dans une case qu'il
  // venait de prendre. Avec, la couronne de sa tete est a jour et les frontales disparaissent.
  // Anti-tremblement (Abdel, 2026-09-19 : « really a wiggle when they are head to head, very
  // subtle »). La tete est dessinee en glissant vers la case que vise dirProchaine, decidee a la fin
  // du pas precedent. Redecider ici changeait souvent d'avis tete contre tete (3 262 fois en 45 min
  // de duel) : la tete s'inclinait d'un cote puis partait de l'autre, sa pointe sautait d'une
  // demi-case. On redecide toujours, mais on GARDE la direction annoncee tant que l'IA la juge
  // encore sure (pasSur) : la reactivite face au danger reste entiere, seuls les caprices partent.
  const av = { ...dirProchaine };
  demanderIA(!window.VIPERE_REDECIDE_TOUJOURS);
  if (av.x !== dirProchaine.x || av.y !== dirProchaine.y) retouches++;
  else gardes++;
  if (reglages.debugIA)
    memoireIA.dbgFlash = {
      t,
      change: av.x !== dirProchaine.x || av.y !== dirProchaine.y,
      x: serpent[0].x,
      y: serpent[0].y,
    };
  if (dirProchaine.x !== dir.x || dirProchaine.y !== dir.y) {
    virages++;
    // escalier : a, b, a, b sur quatre pas de suite
    const n = dirs.length,
      c = dirProchaine;
    if (
      n >= 3 &&
      dirs[n - 1] !== dirs[n - 2] &&
      dirs[n - 2] !== dirs[n - 3] &&
      dirs[n - 2].x === c.x &&
      dirs[n - 2].y === c.y &&
      dirs[n - 1].x === dirs[n - 3].x &&
      dirs[n - 1].y === dirs[n - 3].y
    )
      escaliers++;
  }
  dir = dirProchaine;
  dirs.push(dir);
  if (dirs.length > 4) dirs.shift();
  const nx = serpent[0].x + dir.x,
    ny = serpent[0].y + dir.y;
  // invincibilite temporaire (apres absorption d'une mort par vie, ou apres collision en duel)
  const enInvinc = corps[actif].invincT > 0;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (!enInvinc) {
      mourir('mur');
      return false;
    }
    demanderIA();
    return true;
  }
  if (rochers.some((r) => r.t >= ALERTE && r.x === nx && r.y === ny)) {
    mourir('rocher');
    return false;
  }
  if (roncesDures().some((g) => g.x === nx && g.y === ny)) {
    mourir('ronce');
    return false;
  }
  // baie reservee a l'autre camp : le serpent passe dessus sans la manger (Abdel : « avoid the stealing case »)
  const moiCamp = corps[actif] ? corps[actif].camp : null;
  const iBaie = baies.findIndex(
    (b) => b.x === nx && b.y === ny && !(b.pour && moiCamp && b.pour !== moiCamp),
  );
  const mange = iBaie >= 0;
  const sort = aPousser > 0;
  const pousseManges = mange && serpent.length < longMax();
  const pousse = sort || pousseManges;
  if (sort) aPousser--;
  // la queue libere sa case au meme pas, sauf si le serpent mange ; en duel, le corps adverse bloque aussi
  const autreCorpsDuel = autre();
  const bloquant = (pousse ? serpent : serpent.slice(0, -1)).concat(
    autreCorpsDuel ? autreCorpsDuel.serpent : [],
  );
  if (!enInvinc && bloquant.some((s) => s.x === nx && s.y === ny)) {
    // duel, tete contre tete : la faute est partagee, les deux serpents encaissent. Sinon celui qui
    // avance en premier dans la boucle perd toutes les frontales.
    const ta = autreCorpsDuel && autreCorpsDuel.serpent[0];
    if (ta && ta.x === nx && ta.y === ny && autreCorpsDuel.invincT <= 0) {
      const moi = actif;
      mourir('frontale');
      if (manche && manche.etat === 'en cours') {
        ranger();
        charger(1 - moi);
        mourir('frontale');
        ranger();
        charger(moi);
      }
      return false;
    }
    mourir(
      autreCorpsDuel && autreCorpsDuel.serpent.some((s) => s.x === nx && s.y === ny)
        ? 'adverse'
        : 'soi',
    );
    return false;
  }
  serpent = pousse ? [{ x: nx, y: ny }, ...serpent] : [{ x: nx, y: ny }, ...serpent.slice(0, -1)];
  hist.unshift({ x: nx, y: ny });
  if (hist.length > serpent.length + 3) hist.length = serpent.length + 3;
  grandi = pousse;
  if (mange) {
    bouchees++;
    const p = px(nx, ny);
    const b = baies[iBaie];
    baies.splice(iBaie, 1);
    if (!b || !b.sauvage) mangeesOffertes++;
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
    monter('sun', 1);
    const a = amb();
    jouerBouchee(a);
  }
  demanderIA();
  return true;
}

// Trace lissee : un arc de Bezier par case, de milieu a milieu (virages arrondis, continuite exacte)
function sommet(k) {
  if (k < 0) {
    const h = hist[0];
    return { x: h.x + dirProchaine.x, y: h.y + dirProchaine.y };
  }
  return hist[Math.min(k, hist.length - 1)];
}
function pointSur(p) {
  const k = Math.round(p),
    u = Math.min(1, Math.max(0, p - k + 0.5));
  const a = sommet(k - 1),
    v = sommet(k),
    b = sommet(k + 1);
  const Ax = (a.x + v.x) / 2,
    Ay = (a.y + v.y) / 2,
    Bx = (v.x + b.x) / 2,
    By = (v.y + b.y) / 2,
    i = 1 - u;
  return px(i * i * Ax + 2 * u * i * v.x + u * u * Bx, i * i * Ay + 2 * u * i * v.y + u * u * By);
}
function tracer() {
  const L = serpent.length;
  if (!L) return [];
  const ph = 1 - avance,
    pt = grandi ? L - 1 : L - avance,
    pts = [];
  for (let p = ph; p < pt; p += 1 / 3) pts.push(pointSur(p));
  pts.push(pointSur(pt));
  return pts;
}

// Avance la logique de dt secondes (sans rendu : sert aussi au harnais Node)
function avancer(dt) {
  t += dt;
  majPalier(dt);
  // le gonflement du chiffre vit HORS de la manche : il commence justement quand elle finit
  pulseS += dt;
  pulseV += dt;
  // le cycle du jour tourne tout seul : nuit, lever, plein jour, coucher, en boucle
  if (reglages.cycle > 0) reglages.heure = (reglages.heure + dt / reglages.cycle) % 1;
  if (scene && manche && manche.etat === 'en cours') {
    scene.restant -= dt;
    if (scene.restant <= 0) finirScene();
  }
  // graines : elles germent, puis deviennent des baies mangeables
  for (let i = graines.length - 1; i >= 0; i--) {
    const g = graines[i];
    g.t += dt;
    if (g.t >= GERME) {
      graines.splice(i, 1);
      baies.push({
        x: g.x,
        y: g.y,
        pseudo: g.pseudo,
        t: 0,
        camp: g.camp || null,
        pour: g.pour || null,
      });
      eclat(
        px(g.x, g.y).x,
        px(g.x, g.y).y,
        6,
        g.camp === 'or' ? 'offerte-or' : g.camp === 'ombre' ? 'offerte-ombre' : 'offerte',
      );
      demanderIA();
    }
  }
  baies.forEach((b) => {
    b.t += dt;
  });
  // la tension se remesure dix fois par seconde, puis se lisse : vite vers le haut, lentement vers le bas
  tensionT -= dt;
  if (tensionT <= 0) {
    tensionT = 0.1;
    tensionCible = mesurerTension();
  }
  tension += (tensionCible - tension) * Math.min(1, dt * (tensionCible > tension ? 3.5 : 0.9));
  for (let i = halos.length - 1; i >= 0; i--) {
    halos[i].t += dt;
    if (halos[i].t >= halos[i].duree) halos.splice(i, 1);
  }
  for (let i = etincelles.length - 1; i >= 0; i--) {
    const e = etincelles[i];
    e.t += dt;
    if (e.t >= e.duree) {
      etincelles.splice(i, 1);
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
  for (let i = rochers.length - 1; i >= 0; i--) {
    const r = rochers[i];
    r.t += dt;
    if (r.t >= VIEROCHER) rochers.splice(i, 1);
    else if (r.t >= ALERTE && r.t - dt < ALERTE) {
      demanderIA();
      sonPose();
      const pi = px(r.x, r.y);
      // des mottes de terre qui retombent au pied, sans jamais gicler
      eclat(pi.x, pi.y + 14, 7, 'poussiere', {
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
  for (let i = ronces.length - 1; i >= 0; i--) {
    const R = ronces[i];
    R.t += dt;
    R.seg.forEach((g) => (g.t += dt));
    if (R.t >= VIERONCE) {
      ronces.splice(i, 1);
      demanderIA();
      continue;
    }
    R.pas += dt;
    if (R.pas >= RONCE_PAS && R.seg.length < RONCE_MAX) {
      R.pas = 0;
      allongerRonce(R);
    }
    // chaque segment qui devient dur remue la terre a son pied
    R.seg.forEach((g) => {
      if (g.t >= RONCE_ALERTE && g.t - dt < RONCE_ALERTE) {
        const pi = px(g.x, g.y);
        eclat(pi.x, pi.y + 10, 4, 'poussiere', {
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
  if (manche) {
    if (manche.etat === 'en cours') {
      manche.t += dt;
      // la cible ne monte qu'avec l'affluence : une ruee ne rend pas la manche triviale,
      // et une salle qui se vide ne punit pas ceux qui restent
      etirer('Sun', palier.cielSun, dt * 14);
      etirer('Moon', palier.cielMoon, dt * 2);
      // La cible s'allonge avec l'affluence, donc la recolte se remet a l'echelle comme le fait
      // deja etirer() pour les astres. Sans ca, un anneau plein retombait a 17 % quand la foule
      // arrivait, et le spectateur voyait la progression RECULER.
      if (palier.cible > manche.cible) {
        const avant = manche.cible;
        manche.cible = Math.min(palier.cible, manche.cible + dt * 14);
        if (avant > 0 && manche.cible > avant) manche.recolte *= manche.cible / avant;
      }
      manche.pulseSun += dt;
      manche.pulseMoon += dt;
      // Temps ecoule. En base, le serpent n'a pas tenu son pari, les spectateurs l'emportent :
      // le code donnait l'inverse, contre son propre commentaire et contre spec-modes.md.
      // Corrige le 2026-09-18 sur OK d'Abdel. En versus, le plus haut l'emporte, egalite a Moon.
      // Duel, victoire a l'anneau (Abdel, 2026-09-18) : un camp gagne quand son demi-anneau est
      // plein (LONG_CIBLE_DUEL anneaux, le bas-centre atteint) et qu'il le TIENT TENUE_DUEL
      // secondes sans etre coupe en dessous. Le chrono reste la fin de secours.
      const pleins = [];
      for (let i = 0; i < corps.length; i++) {
        const c = corps[i];
        const avT = c.tenue || 0;
        c.tenue = c.serpent.length >= LONG_CIBLE_DUEL ? (c.tenue || 0) + dt : 0;
        if (avT === 0 && c.tenue > 0) moments.tenues++;
        if (c.serpent.length >= ADULTE_DUEL) c.adulte = true;
        const enSursis = !c.couvee && c.serpent.length > 0 && c.serpent.length < SURSIS_DUEL;
        if (enSursis && !c.sursis) moments.sursis++;
        c.sursis = enSursis;
        if (c.tenue >= TENUE_DUEL) pleins.push(c);
      }
      // EGALITE STRICTE : avant, la boucle finissait sur `break` des que corps[0] tenait son
      // anneau, donc Or passait devant Ombre du seul fait de son rang dans le tableau. On
      // depouille maintenant les deux, et la plus longue tenue gagne ; tenue identique = nul.
      if (pleins.length === 1) finir(pleins[0].camp, 'anneau');
      else if (pleins.length > 1) {
        const a = pleins[0],
          b = pleins[1];
        finir(a.tenue === b.tenue ? 'nul' : a.tenue > b.tenue ? a.camp : b.camp, 'anneau');
      }
      if (manche.etat !== 'en cours') return;
      // duel : chrono propre (TEST equilibre : 120 s, les publics calmes ne remplissent jamais l'anneau)
      if (manche.t >= (reglages.dureeDuel || reglages.duree)) {
        // plus long gagne ; egalite = ombre (comme Moon en versus). Aucun progres des deux cotes (personne
        // n'a depasse la longueur de naissance) : match nul, aucun point (Abdel).
        const l0 = corps[0].serpent.length,
          l1 = corps[1].serpent.length;
        // EGALITE STRICTE : l'egalite de longueur allait silencieusement a Ombre (« comme Moon en
        // versus »), ce qui est un biais de camp. Sans spectateur les deux serpents finissent
        // souvent a la meme longueur (5 % des manches mesurees) : c'est un match nul, aucun point.
        if (l0 === l1) finir('nul', 'temps');
        else if (l0 <= DEPART_DUEL && l1 <= DEPART_DUEL) finir('nul', 'temps');
        else finir(l0 > l1 ? 'or' : 'ombre', 'temps');
      }
      // garde-fou : sans spectateur le plateau reste vide et rien ne peut arriver
      // ARBITRAGE, 2026-09-18. Abdel a demande deux choses contradictoires le meme jour :
      // « unlimited food », puis « i dont want food to be abundant unless a user drops a lot of
      // food ». Tranche ainsi : **illimite pour ce que le public donne** (semer n'a plus de
      // plafond), **rationne pour ce que la foret donne toute seule**. La foret n'est donc plus
      // qu'un filet de securite : elle ne nourrit que si le plateau est vide de toute nourriture,
      // et sa cadence RALENTIT a mesure que le public devient genereux, jusqu'a se taire.
      if (!graines.length && !baies.length) {
        sansBaie += dt;
        // Base : le like ne seme plus, il frappe le rodeur. C'est donc la foret seule qui nourrit
        // le serpent, a tous les paliers, sinon a forte affluence il n'a plus rien a manger.
        // Plus le public est actif, plus la foret se tait : c'est la generosite reelle du public
        // qui regle l'abondance, pas une horloge fixe. A cadence 20, la foret est deja 2 fois
        // plus lente ; a cadence 200, 11 fois.
        // Duel (Abdel) : la foret nourrit en quantite moderee quand le plateau est vide, une baie verte
        // neutre a intervalle, posee a EGALE distance des deux tetes (a 1 case pres).
        const sv0 = FORET_DUEL;
        const sv = sv0 / (1 + cadence / 20);
        if (!delaiSauvage) delaiSauvage = souffle(sv);
        if (sv > 0 && sansBaie >= delaiSauvage) {
          sansBaie = 0;
          delaiSauvage = souffle(sv);
          // La baie sauvage obeit a la regle comme tout le reste. Son delai est nul, elle ne
          // peut donc pas etre franchie avant d'etre active, mais la regle ne sert pas qu'a ca :
          // une nourriture qui parait sous son nez est un cadeau gratuit, sans decision, et elle
          // n'a aucune raison de se comporter autrement qu'une baie semee. Meme delai, GERME.
          let l = libres().filter((c) => !zoneMorte(c, GERME));
          if (corps[0] && corps[1] && corps[0].serpent[0] && corps[1].serpent[0]) {
            const a = corps[0].serpent[0],
              b = corps[1].serpent[0];
            const dd = (c) =>
              Math.abs(
                Math.abs(c.x - a.x) +
                  Math.abs(c.y - a.y) -
                  (Math.abs(c.x - b.x) + Math.abs(c.y - b.y)),
              );
            const eq = l.filter((c) => dd(c) <= 1 && !zoneMorte(c, GERME));
            if (eq.length) l = eq;
            else {
              l.sort((p, q) => dd(p) - dd(q));
              l = l.slice(0, 4);
            }
          }
          if (!l.length) l = libres();
          if (l.length) {
            const c = l[Math.floor(Math.random() * l.length)];
            baies.push({ x: c.x, y: c.y, pseudo: '', t: 0, sauvage: true });
            demanderIA();
          }
        }
      } else {
        sansBaie = 0;
        delaiSauvage = 0;
      }
    } else {
      manche.fin += dt;
      if (manche.fin >= 8) nouvelleManche();
      return;
    }
  }
  // Equite du duel : resoudre toujours Or puis Ombre donne l'initiative permanente au premier
  // servi (banc : 38-2). On alterne donc l'ordre a chaque tick, aucun camp ne garde la main.
  ordreTick = 1 - ordreTick;
  if (ordreTick) {
    for (let _i = corps.length - 1; _i >= 0; _i--) {
      charger(_i);
      avancerCorps(dt);
      ranger();
    }
  } else
    for (let _i = 0; _i < corps.length; _i++) {
      charger(_i);
      avancerCorps(dt);
      ranger();
    }
  charger(0);
}

// Avance le corps charge (actif) de dt secondes. Appele depuis avancer apres charger(i).
function avancerCorps(dt) {
  // minuteries par corps en duel (surgeT, invincT, coupT)
  if (corps[actif].surgeT > 0) corps[actif].surgeT = Math.max(0, corps[actif].surgeT - dt);
  if (corps[actif].invincT > 0) corps[actif].invincT = Math.max(0, corps[actif].invincT - dt);
  if (corps[actif].coupT > 0) corps[actif].coupT = Math.max(0, corps[actif].coupT - dt);
  if (corps[actif].pareT > 0) corps[actif].pareT = Math.max(0, corps[actif].pareT - dt);
  if (corps[actif].bouclierT > 0) corps[actif].bouclierT = Math.max(0, corps[actif].bouclierT - dt);
  if (corps[actif].reculT > 0) corps[actif].reculT = Math.max(0, corps[actif].reculT - dt);
  if (pause > 0) {
    pause -= dt;
    if (pause <= 0) {
      pause = 0;
      naitre(!!(manche && manche.etat === 'en cours'));
    }
    return;
  }
  if (couvee) {
    const avant = couvee.t;
    couvee.t += dt;
    const a0 = amb();
    if (sonPret() && a0 && a0.sonEclosion) {
      const uu = couvee.t / ECLOSION,
        ua = avant / ECLOSION;
      [0.34, 0.46, 0.55].forEach((m) => {
        if (ua < m && uu >= m) jouerEclosion(a0, 'fissure');
      });
      if (ua < SORTIE && uu >= SORTIE) jouerEclosion(a0, 'naissance');
    }
    // le serpent sort avant la fin de l'animation, la coquille finit de s'ouvrir derriere lui
    if (!couvee.sorti && couvee.t >= ECLOSION * SORTIE) {
      couvee.sorti = true;
      const p = px(couvee.x, couvee.y);
      eclat(p.x, p.y, 18, 'coquille');
      eclore(couvee.garder);
    }
    if (couvee.t >= ECLOSION + TRAINE) couvee = null;
    if (!couvee || !couvee.sorti) return;
  }
  const surge = corps[actif].surgeT > 0;
  avance += dt * VITESSE * (surge ? SURGE_FACT : 1); // like : poussee de tempo
  while (avance >= 1) {
    avance -= 1;
    if (!pas()) return;
  }
}

function peindreCourse() {
  return;
}

// Le vide entre les deux silhouettes se creuse en `destination-out`. Sur le canvas principal ce
// mode trouerait l'image entiere, fond compris, puisque le compteur est dessine par-dessus tout.
// Le glyphe est donc cuit une seule fois dans un sprite hors ecran, ou le decoupage ne concerne
// que lui. Bonus : il est paye une fois pour toute la partie et non a chaque image.
const GENS_RS = 48;
let spriteGens = null;
export function glypheGens(x, y, r) {
  if (!spriteGens) {
    const s = document.createElement('canvas');
    s.width = s.height = 2 * GENS_RS;
    const avant = setCtx(s.getContext('2d'));
    try {
      ctx.translate(GENS_RS, GENS_RS);
      const R = GENS_RS * 0.66;
      ctx.fillStyle = BLEU;
      personne(R * 0.86, -R * 0.16, R * 0.74);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = R * 0.3;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      personne(-R * 0.3, 0, R * 0.96);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BLEU;
      personne(-R * 0.3, 0, R * 0.86);
    } finally {
      setCtx(avant);
    }
    spriteGens = s;
  }
  const k = r / (GENS_RS * 0.66),
    w = 2 * GENS_RS * k;
  ctx.drawImage(spriteGens, x - w / 2, y - w / 2, w, w);
}

export let dtRendu = 0.016;

export let retourCadeaux = [[], []],
  bandeauCadeau = [null, null]; // [camp][ligne] = {t, pseudo, n} ; bandeau = {t, texte}
function noterCadeau(i, valeur, pseudo, n, avatar) {
  const k =
    valeur >= VIE_COUT
      ? 4
      : valeur >= BOUCLIER_COUT
        ? 3
        : valeur >= COUPE_COUT
          ? 2
          : valeur >= TEMPO_COUT
            ? 1
            : 0;
  const r = retourCadeaux[i][k] || (retourCadeaux[i][k] = { t: -9, pseudo: '', n: 0 });
  r.t = t;
  r.pseudo = String(pseudo || '');
  r.n += Math.max(1, n || 1);
  const c = CADEAUX_DUEL[i === 0 ? 'or' : 'ombre'][k];
  const premier = !!(r.pseudo && !dejaDonne[r.pseudo]);
  if (r.pseudo) {
    dejaDonne[r.pseudo] = 1;
    const dm =
      donsManche[r.pseudo] || (donsManche[r.pseudo] = { camp: i === 0 ? 'or' : 'ombre', total: 0 });
    dm.total += (valeur || 0) * Math.max(1, n || 1);
    dm.camp = i === 0 ? 'or' : 'ombre';
  }
  if (r.pseudo && donsManche[r.pseudo] && avatar) donsManche[r.pseudo].avatar = avatar;
  if (c)
    annoncer({
      genre: 'cadeau',
      pseudo: r.pseudo,
      avatar,
      texte: dire(premier ? 'premier' : 'cadeau', {
        c: nomCamp(i === 0 ? 'or' : 'ombre'),
        q: DONS[k] || c.effet,
      }),
      camp: i === 0 ? 'or' : 'ombre',
      effet: EFFET_LABEL[c.effet],
    });
  bandeauCadeau[i] = {
    t,
    texte:
      (r.pseudo && reglages.nomsDonateurs !== false ? r.pseudo + '  >  ' : '') + (c ? c.effet : ''),
  };
}
let ipsLisse = 60,
  pireDt = 0,
  pireT = 0,
  pireAffiche = 0;
// Point du rail du timer a la distance s du haut-centre, dans le sens horaire (le sens ou le trait
// rouge est dessine). Meme geometrie que ctx.roundRect(x,y,w,h,r).
export function pointRail(x, y, w, h, r, s) {
  const droit = w / 2 - r,
    q = (Math.PI * r) / 2,
    cote = h - 2 * r,
    bas = w - 2 * r;
  const arc = (cx, cy, a0, u) => ({
    x: cx + r * Math.cos(a0 + (u * Math.PI) / 2),
    y: cy + r * Math.sin(a0 + (u * Math.PI) / 2),
  });
  if (s < droit) return { x: x + w / 2 + s, y };
  s -= droit;
  if (s < q) return arc(x + w - r, y + r, -Math.PI / 2, s / q);
  s -= q;
  if (s < cote) return { x: x + w, y: y + r + s };
  s -= cote;
  if (s < q) return arc(x + w - r, y + h - r, 0, s / q);
  s -= q;
  if (s < bas) return { x: x + w - r - s, y: y + h };
  s -= bas;
  if (s < q) return arc(x + r, y + h - r, Math.PI / 2, s / q);
  s -= q;
  if (s < cote) return { x, y: y + h - r - s };
  s -= cote;
  if (s < q) return arc(x + r, y + r, Math.PI, s / q);
  s -= q;
  return { x: x + r + Math.min(s, droit), y };
}
function peindreManche() {
  if (!manche) return;
  peindreDuel(dtRendu);
  return;
}

// La tension, ce qui resserre l'image. L'avancement de la manche ne dit rien du risque :
// on peut etre a une baie de gagner en pleine ouverture, ou coince des la deuxieme. Trois
// choses la nourrissent : l'espace encore atteignable depuis la tete, la longueur du serpent,
// et les cases mortes qui la touchent. Elle monte vite, elle redescend lentement.
let tension = 0,
  tensionCible = 0,
  tensionT = 0;
function mesurerTension() {
  if (!serpent.length) return 0;
  const tete = serpent[0],
    mur = new Set();
  for (let i = 0; i < serpent.length - 1; i++) mur.add(serpent[i].x + ',' + serpent[i].y);
  const a = autre();
  if (a) a.serpent.forEach((s) => mur.add(s.x + ',' + s.y));
  rochers.forEach((r) => {
    if (r.t >= ALERTE) mur.add(r.x + ',' + r.y);
  });
  roncesDures().forEach((g) => mur.add(g.x + ',' + g.y));
  const VOISINS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  // 1. on remplit tout ce qui est atteignable depuis la tete, le plateau est petit
  const vus = new Set([tete.x + ',' + tete.y]);
  let file = [tete],
    n = 0;
  while (file.length) {
    const suiv = [];
    for (const c of file) {
      for (const d of VOISINS) {
        const x = c.x + d[0],
          y = c.y + d[1],
          k = x + ',' + y;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS || vus.has(k) || mur.has(k)) continue;
        vus.add(k);
        n++;
        suiv.push({ x, y });
      }
    }
    file = suiv;
  }
  const libres = Math.max(1, COLS * ROWS - mur.size);
  // ce qui est coupe : le serpent s'est enferme dans une poche du plateau
  const coupe = 1 - Math.min(1, n / libres);
  // ce qui est etroit : meme sans poche, il ne reste plus de quoi manoeuvrer
  const etroit = 1 - Math.min(1, n / (serpent.length * 2 + 16));
  // la longueur seule, qui pese meme quand tout est ouvert
  const longueur = Math.min(1, serpent.length / (COLS * ROWS * 0.3));
  // ce qui touche deja la tete : mur, corps ou rocher pose
  let morts = 0;
  for (const d of VOISINS) {
    const x = tete.x + d[0],
      y = tete.y + d[1];
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || mur.has(x + ',' + y)) morts++;
  }
  const colle = Math.min(1, morts / 3);
  // les pierres posees : chacune retire une case et ferme une ligne de fuite
  const pierres = Math.min(
    1,
    rochers.filter((r) => r.t >= ALERTE).length / Math.max(1, palier.maxRochers),
  );
  return Math.max(
    0,
    Math.min(1, 0.3 * coupe + 0.25 * etroit + 0.28 * longueur + 0.1 * colle + 0.07 * pierres),
  );
}

// Mode fluide : on masque la propriete shadowBlur du canevas principal (elle devient sans effet), et on la
// rend quand le mode est coupe. Une seule bascule, aucun des 47 endroits qui posent un flou n'est touche.
let fluideActif = false;
function reglerFluide() {
  const veut = !!reglages.fluide;
  if (veut === fluideActif || !ctx) return;
  if (veut)
    Object.defineProperty(ctx, 'shadowBlur', {
      set() {},
      get() {
        return 0;
      },
      configurable: true,
    });
  else delete ctx.shadowBlur;
  fluideActif = veut;
}
function dessiner(dt) {
  reglerFluide();
  const a = amb(),
    tete = trace.length ? trace[0] : { x: W / 2, y: H / 2 };
  const e = {
    t,
    dt,
    W,
    H,
    cell: CELL,
    x0: X0,
    y0: Y0,
    cols: COLS,
    rows: ROWS,
    tete,
    monde: 0,
    mondeSorte: null,
    silence: 0,
    heure: reglages.heure,
    meteo: reglages.meteo,
    meteoNet: !!(manche && manche.etat === 'en cours' && manche.t < 0.3 && reglages.ambianceAuto),
    avance:
      reglages.avanceForcee !== undefined
        ? reglages.avanceForcee
        : manche
          ? Math.min(1, (manche.t || 0) / Math.max(1, reglages.dureeDuel || reglages.duree))
          : 0,
    progression: 0,
    tension: tension,
    reduit: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  if (!a) {
    ctx.fillStyle = '#141e17';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // En 16:9 l'ambiance couvre tout le cadre (les cotes compris) : on lui passe la largeur totale et on la
  // decale de la marge ; le jeu et le HUD, eux, restent dessines dans la composition verticale intacte.
  const enCadre = (f) => {
    if (!OX) return f(e);
    const sW = e.W,
      sX = e.x0,
      sT = e.tete;
    e.W = WF;
    e.x0 = X0 + OX;
    e.tete = { x: sT.x + OX, y: sT.y };
    ctx.save();
    ctx.translate(-OX, 0);
    try {
      return f(e);
    } finally {
      ctx.restore();
      e.W = sW;
      e.x0 = sX;
      e.tete = sT;
    }
  };
  enCadre((e2) => a.peindreFond(ctx, e2));
  ctx.save();
  peindreCourse();
  peindreOffrandes();
  peindreRochers();
  peindreRonces();

  for (let _i = 0; _i < corps.length; _i++) {
    charger(_i);
    a.peindreSerpent(ctx, trace, CELL, {
      ...e,
      teinte: corps[actif].teinte,
    });
    if (corps[actif].bouclierT > 0 && trace.length) {
      // bouclier actif : bulle autour de la tete, qui respire, et qui s'affine sur les 3 dernieres secondes
      const h = trace[0],
        bt = corps[actif].bouclierT,
        fin = Math.min(1, bt / 3);
      const rgb = actif === 0 ? '242,197,124' : '180,212,222';
      const R = CELL * (0.62 + 0.04 * Math.sin(t * 5));
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * fin;
      const g = ctx.createRadialGradient(h.x, h.y, R * 0.55, h.x, h.y, R);
      g.addColorStop(0, 'rgba(' + rgb + ',0)');
      g.addColorStop(0.8, 'rgba(' + rgb + ',0.35)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * fin) + ')';
      ctx.shadowColor = 'rgba(' + rgb + ',0.9)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(h.x, h.y, R * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (couvee) peindreCoquille(couvee.t / ECLOSION);
    ranger();
  }
  charger(0);
  if (reglages.debugIA) peindreDebugIA();
  // Mesure de fluidite (calque Debug IA seulement) : images par seconde lissees et pire image des 2 dernieres secondes
  ipsLisse += ((dt > 0 ? 1 / dt : 60) - ipsLisse) * 0.05;
  pireT += dt;
  if (dt > pireDt) pireDt = dt;
  if (pireT > 2) {
    pireAffiche = pireDt;
    pireDt = 0;
    pireT = 0;
  }
  if (reglages.debugIA) {
    ctx.save();
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(20, 20, 330, 34);
    ctx.fillStyle = ipsLisse < 50 ? '#ff6a5a' : '#9be28a';
    ctx.fillText(
      Math.round(ipsLisse) + ' ips   pire image ' + Math.round(pireAffiche * 1000) + ' ms',
      28,
      45,
    );
    ctx.restore();
  }
  peindreHalos();
  peindreEtincelles();
  ctx.restore();
  dtRendu = dt;
  peindreManche();
  enCadre((e2) => a.peindreAvant(ctx, e2));
  peindreScore();
  const avecCadeaux = reglages.plateforme !== 'neutre';
  if (avecCadeaux) peindreStatutsDuel();
  // affichageCadeaux : 'defile' (bandeaux qui defilent, avec le pattern visible/cache), 'complet' (ancienne legende), 'aucun' (rien)
  if (avecCadeaux) {
    const mA = reglages.affichageCadeaux || 'complet';
    if (mA === 'defile') peindreDefileCadeaux();
    else if (mA === 'complet') peindreLegendeDuel();
  }
  // Ecran de fin du duel, peint APRES le score et la legende (Abdel : « your grey veil just apply to gift and do
  // not consider the whole screen, make it smoother ») : un seul voile, plein ecran, et le classement devant tout.
  if (manche && manche.etat !== 'en cours') peindreFin();
  peindreBandeau();
  if (reglages.maquette) peindreMaquetteLive();
  enCadre((e2) => a.maj(dt, e2));
  if (reglages.zones) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    // ce que l'interface TikTok recouvre, aux positions MESUREES sur la capture d'Abdel
    ctx.fillStyle = '#f0f';
    ctx.fillRect(0, 0, W, SR_Y);
    ctx.fillRect(0, SR_Y + SR_H, W, H - SR_Y - SR_H);
    ctx.fillStyle = '#ff0';
    [Z_CADEAUX, Z_BANNIERE, Z_FIL, Z_SAISIE].forEach((z) => ctx.fillRect(z.x, z.y, z.w, z.h));
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 3;
    ctx.strokeRect(SR_X + 2, SR_Y, SR_W - 4, SR_H);
    ctx.restore();
  }
}

let dernier = 0;
function boucle(ts) {
  const now = ts / 1000,
    dt = Math.min(now - dernier, 0.1);
  dernier = now;
  const n = reglages.temps;
  for (let i = 0; i < n; i++) avancer(dt);
  // trace calculee par corps ; invariant corps[0] charge a l'issue
  // ranger() recopie la variable de module `trace` dans le corps : c'est donc elle qu'on remplit
  for (let _i = 0; _i < corps.length; _i++) {
    charger(_i);
    trace = tracer();
    ranger();
  }
  charger(0);
  trace = corps[0] ? corps[0].trace : [];
  try {
    dessiner(dt);
  } catch (er) {
    erreurs++;
    derniereErreur = 'rendu: ' + er.message + ' | ' + premiereLigne(er);
  }
  requestAnimationFrame(boucle);
}

window.VipereBase = {
  reglages,
  naitre,
  avancer,
  basculerSon,
  nouvelleManche,
  tension: () => tension,
  // Scène courante (super admin) : lecture, lancement par nom, arrêt immédiat.
  scene: () =>
    scene && {
      nom: scene.nom,
      restant: Math.max(0, scene.restant),
      duree: SCENES[scene.nom] && SCENES[scene.nom].duree,
      or: scene.or || {},
      ombre: scene.ombre || {},
    },
  lancerScene: (nom, duree) => {
    const d = SCENES[nom];
    if (!d) return;
    scene = { nom, restant: duree || d.duree, or: d.or || {}, ombre: d.ombre || {} };
  },
  stopScene: () => {
    finirScene();
  },
  finirTest: (camp) => {
    finir(camp || 'or', 'test');
  },
  sonActif: estSonActif,
  palier: () => ({
    id: palier.id,
    cadence: Math.round(cadence),
    hautSun: manche ? Math.round(manche.hautSun) : palier.cielSun,
    hautMoon: manche ? Math.round(manche.hautMoon) : palier.cielMoon,
  }),
  manche: () =>
    manche && {
      etat: manche.etat,
      t: manche.t,
      sun: manche.sun,
      moon: manche.moonEv,
      vainqueur: manche.vainqueur,
      cielSun: manche.cielSun,
      cielMoon: manche.cielMoon,
      recolte: manche.recolte,
      cible: manche.cible,
    },
  manches: () => manches,
  score: () => ({ serpent: scoreSerpent, viewers: scoreViewers }),
  remettreScore: () => {
    scoreSerpent = 0;
    scoreViewers = 0;
    pulseS = 9;
    pulseV = 9;
  },
  tremble: () => ({ retouches, gardes }),
  mesures: () => ({
    longueur: serpent.length,
    bouchees,
    morts,
    erreurs,
    derniereErreur,
    t,
    virages,
    escaliers,
    evitables,
    longueursMort,
    offertes,
    mangeesOffertes,
    poses,
    morsures,
    baies: baies.length + graines.length,
  }),
  duel: () => ({
    t: manche && manche.t,
    vainqueur: manche && manche.vainqueur,
    or: corps[0]
      ? {
          longueur: corps[0].serpent.length,
          posture: (corps[0].memoireIA && corps[0].memoireIA.postureActive) || 'neutre',
          raison: corps[0].memoireIA && corps[0].memoireIA.raison,
          tenue: corps[0].tenue || 0,
          bouclierT: corps[0].bouclierT,
          vies: corps[0].vies,
          surgeT: corps[0].surgeT,
          invincT: corps[0].invincT,
          coupT: corps[0].coupT,
          reculT: corps[0].reculT,
        }
      : null,
    ombre: corps[1]
      ? {
          longueur: corps[1].serpent.length,
          posture: (corps[1].memoireIA && corps[1].memoireIA.postureActive) || 'neutre',
          raison: corps[1].memoireIA && corps[1].memoireIA.raison,
          tenue: corps[1].tenue || 0,
          bouclierT: corps[1].bouclierT,
          vies: corps[1].vies,
          surgeT: corps[1].surgeT,
          invincT: corps[1].invincT,
          coupT: corps[1].coupT,
          reculT: corps[1].reculT,
        }
      : null,
  }),
  // reglage de la course pour les harnais d'equilibrage
  reglerCiel: (id, sun, moon) => {
    const p = PALIERS.find((x) => x.id === id);
    if (!p) return;
    if (sun) p.cielSun = sun;
    if (moon) p.cielMoon = moon;
  },
  reglerCible: (id, c) => {
    const p = PALIERS.find((x) => x.id === id);
    if (p) p.cible = c;
  },
  reglerLong: forcerLong,
  reglerRochers: (id, v) => {
    const p = PALIERS.find((x) => x.id === id);
    if (p) p.maxRochers = v;
  },
  reglerCoup: (id, v) => {
    const p = PALIERS.find((x) => x.id === id);
    if (p) p.coup = v;
  },
  // flair par camp en duel (regie, harnais) : s'applique aux corps courants et aux prochains
  reglerFlair: (camp, v) => {
    FLAIR_DUEL[camp] = v;
    corps.forEach((c) => {
      if (c.camp === camp) c.flair = v;
    });
  },
  reglerTenue: (s) => {
    TENUE_DUEL = Math.max(0.5, +s || 5);
  },
  moments: () => Object.assign({}, moments),
  razMoments: () => {
    moments = { tenues: 0, sursis: 0, parades: 0, manches: 0 };
  },
  reglerChasse: (camp, v) => {
    CHASSE_DUEL[camp] = v;
    corps.forEach((c) => {
      if (c.camp === camp) c.chasse = v;
    });
  },
  reglerHeure: (h) => {
    reglages.heure = ((h % 1) + 1) % 1;
  },
  couvee: () => couvee && { t: couvee.t, duree: ECLOSION },
  planterRonce: () => planterRonce('sonde'),
  interne: () => ({
    serpent,
    fruit,
    dir,
    rochers: rochers.map((r) => ({ x: r.x, y: r.y, t: r.t })),
    ronces: ronces.map((R) => ({ t: R.t, seg: R.seg.map((g) => ({ x: g.x, y: g.y, t: g.t })) })),
    alerte: ALERTE,
    vitesse: VITESSE,
    ronceAlerte: RONCE_ALERTE,
    ronceMax: RONCE_MAX,
    baies: baies.map((b) => ({ x: b.x, y: b.y, camp: b.camp || null })),
    graines: graines.map((g) => ({ x: g.x, y: g.y })),
    corps: corps.map((c) => ({
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

function demarrer() {
  lierCanvas(document.getElementById('scene'));
  if (!canvas) return;
  // rendu net : la surface suit la taille affichee et la densite de l'ecran
  const ajuster = () => {
    const r = canvas.getBoundingClientRect(),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = r.width > 0 ? Math.round(r.width * dpr) : W;
    canvas.width = w;
    canvas.height = Math.round((w * H) / WF);
    const s = canvas.width / WF;
    ctx.setTransform(s, 0, 0, s, OX * s, 0);
  };
  ajuster();
  window.addEventListener('resize', ajuster);
  ajusterCanvas = ajuster;
  ['pointerdown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, armerSon, { once: false, passive: true }),
  );
  if (window.ResizeObserver)
    try {
      new ResizeObserver(ajuster).observe(canvas);
    } catch (e) {}
  document.addEventListener('keydown', (ev) => {
    const m = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const d = m[ev.key];
    if (d && !reglages.ia && !(d.x === -dir.x && d.y === -dir.y)) {
      dirProchaine = d;
      ev.preventDefault();
    }
  });
  nouvelleManche();
  dernier = performance.now() / 1000;
  requestAnimationFrame(boucle);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
}
