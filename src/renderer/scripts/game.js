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
  CIEL_BAS,
  CIEL_HAUT,
  changerFormat,
} from '../engine/layout.js';
import {
  armerSon,
  basculerSon,
  estSonActif,
  jouerBouchee,
  jouerEclosion,
  sonPose,
  sonPoussee,
  sonPret,
  sonRonce,
  sonRoncePas,
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

let ajusterCanvas = null;
const VITESSE = 7,
  DEPART = 3;
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

export let canvas, ctx;

let ronces = [];

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
const GERME = 1;
// Deux camps, un serpent : Sun nourrit, Moon bloque. La manche tranche entre eux.
export let rochers = [],
  manche = null,
  manches = [],
  sansBaie = 0;
let retouches = 0,
  gardes = 0; // anti-tremblement : redecisions au franchissement, et decisions gardees
let ordreTick = 0; // duel : alterne quel serpent est resolu en premier a chaque tick (equite)
// Mode de base : un rodeur. Le chat le nourrit en commentant, il grossit et accelere ;
// les likes lui arrachent un morceau, les cadeaux l'assomment. Un seul objet, lisible en une seconde.
let rodeur = null;
const ROD = { v: 2.6, k: 0.1, fonte: 0.08 },
  ROD_VMAX = 5.8;
// 1,3 s : sous une seconde la pierre "pop" au lieu de pousser, au-dela de 1,5 s le serpent, a
// 7 cases par seconde sur un plateau de 16, a deja traverse toute case qu'on pourrait viser.
const ALERTE = 1.3,
  VIEROCHER = 45;
// La ronce : le second bloqueur. La pierre est minerale, ponctuelle, sortie d'un coup ; la ronce
// rampe et ferme une voie entiere. Elle s'annonce plus vite par segment (0,8 s) mais elle met
// RONCE_PAS*RONCE_MAX a se deployer, et elle vit moins longtemps parce qu'elle prend plus de place.
const RONCE_ALERTE = 0.8,
  RONCE_PAS = 0.75,
  RONCE_MAX = 4,
  VIERONCE = 20;
// Quatre paliers d'affluence : le jeu se tient aussi bien salle vide qu'en pleine rue.
// cadence = evenements par minute, lissee. Chaque palier change le ravitaillement, la cible et les plafonds.
// cielSun : baies a manger pour que le soleil atteigne le haut. cielMoon : rochers poses pour la lune.
const PALIERS = [
  {
    id: 'desert',
    min: 0,
    coup: 0.5,
    sauvage: 10,
    cible: 27,
    cielSun: 27,
    cielMoon: 13,
    maxBaies: 3,
    maxRochers: 4,
    parBaie: 1,
    parRocher: 1,
    nature: 26,
    long: 34,
  },
  {
    id: 'calme',
    min: 6,
    coup: 0.34,
    sauvage: 22,
    cible: 48,
    cielSun: 48,
    cielMoon: 14,
    maxBaies: 3,
    maxRochers: 5,
    parBaie: 2,
    parRocher: 1,
    nature: 40,
    long: 52,
  },
  {
    id: 'anime',
    min: 60,
    coup: 0.12,
    sauvage: 0,
    cible: 108,
    cielSun: 108,
    cielMoon: 10,
    maxBaies: 4,
    maxRochers: 4,
    parBaie: 6,
    parRocher: 2,
    nature: 0,
    long: 80,
  },
  {
    id: 'foule',
    min: 250,
    coup: 0.018,
    sauvage: 0,
    cible: 120,
    cielSun: 120,
    cielMoon: 16,
    maxBaies: 5,
    maxRochers: 5,
    parBaie: 20,
    parRocher: 6,
    nature: 0,
    long: 120,
  },
];
// Une mort ne finit plus la manche : elle pousse la lune de quelques crans, le serpent revient.
const MORT_CRANS = 3;
// La course decide la manche, pas la longueur : passe ce plafond, la baie donne le cran sans le segment.
// Dans les deux modes la longueur est plafonnee : elle ne peut pas etre a la fois l'horloge de la
// manche et le risque de mort, sinon allonger la manche rend la mort inevitable (mesure : 2 min
// de mediane et 47 % de victoires serpent quand la cible etait une longueur).
// Mesure du 2026-09-18 : a la fin des manches, la longueur mediane valait 30 sur 30 aux trois
// paliers actifs. Ce n'etait donc pas la victoire qui arrivait trop tot, c'etait le plafond qui
// etait la contrainte agissante, et 30 segments sur 320 cases font 9 % du plateau. Abdel : « we
// need to be able to reach stages were the snake is really long and becomes challenging ».
// Le plafond suit donc l'affluence : salle vide 34, calme 52, animee 80, foule 120. `reglerLong`
// le force pour les harnais, auquel cas le palier ne le touche plus.
let longForce = 0;
// duel : plafond = LONG_CIBLE_DUEL (l'anneau est plein a 60). Deux serpents a 120 sur 320 cases
// s'enfermaient eux-memes (sonde : 62 morts/6 manches, toutes piegees ; a 60 : 30)
const longMax = () => longForce || (duel() ? LONG_CIBLE_DUEL : palier.long || 34); // duel : plafond LONG_CIBLE_DUEL
let cadence = 0,
  palier = PALIERS[0],
  natureT = 0,
  delaiNature = 0,
  delaiSauvage = 0;
// Salle vide, les deux camps avancaient sur deux horloges fixes et le vainqueur etait connu d'avance.
// La foret respire : chaque delai du garde-fou varie de plus ou moins 40 %.
const souffle = (v) => v * (0.6 + Math.random() * 0.8);

// Chaque evenement pese sur la cadence, qui redescend toute seule en une minute
function compter(n) {
  cadence += n;
}
function majPalier(dt) {
  cadence = Math.max(0, cadence - (cadence * dt) / 60);
  const c = cadence;
  let p = PALIERS[0];
  for (let i = 0; i < PALIERS.length; i++) if (c >= PALIERS[i].min) p = PALIERS[i];
  palier = p;
}
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
// Deux modes. 'base' : le serpent contre les spectateurs, ils aident ou ils genent, pas de camps.
// 'versus' : deux camps, Sun et Moon, et la course dans le ciel tranche.
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
  mode: 'base',
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
export const duel = () => reglages.mode === 'duel';

export const px = (gx, gy) => ({ x: X0 + gx * CELL + CELL / 2, y: Y0 + gy * CELL + CELL / 2 });
export const amb = () => (window.AMBIANCES || []).find((a) => a.id === 'foret') || null;

function libres() {
  const occ = new Set(serpent.map((s) => s.x + ',' + s.y));
  if (duel()) {
    const a = autre();
    if (a) a.serpent.forEach((s) => occ.add(s.x + ',' + s.y));
  }
  graines.concat(baies, rochers).forEach((o) => occ.add(o.x + ',' + o.y));
  ronces.forEach((R) => R.seg.forEach((g) => occ.add(g.x + ',' + g.y)));
  const l = [];
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++) if (!occ.has(x + ',' + y)) l.push({ x, y });
  return l;
}

let creditSun = 0,
  creditMoon = 0;
// Economie calquee sur un vrai live : la rose est le cadeau dominant et joue CONTRE le serpent,
// Le like, le commentaire et le partage sont sans effet (Abdel, 2026-09-19 : la poussee par likes est retiree).
// La seule poussee de vitesse est le cadeau tempo (SURGE_FACT pendant TEMPO_DUR).
const SURGE_FACT = 1.2; // Abdel, 2026-09-19 : « the actual speed boost value, tone it down a little » (etait 1,5)
// ancien commentaire :  // le serpent va 50 % plus vite pendant la poussee
const FORET_DUEL = 8; // duel : secondes (x0.6 a 1.4) entre deux baies vertes neutres quand le plateau est vide, ralenti par l'affluence
export const TEMPO_COUT = 10,
  TEMPO_DUR = 10; // don 10-29 coins : 10 s de poussee de tempo payee (x1.5), au-dela du plafond des likes
const COUPE_COUT = 20,
  COUPE_FRAC = 0.15; // coupe duel (Abdel : « cut at 15% for 30 ») : don >= 30 enleve 15 % de la longueur adverse, 1 anneau minimum
const coupeDe = (L) => Math.max(1, Math.round(L * COUPE_FRAC));
export const BOUCLIER_COUT = 30,
  VIE_COUT = 100,
  BOUCLIER_DUR = 15; // dons duel : bouclier a 50 = 15 s d'immunite, cumulables sans plafond, vie a 100, sans plafond (Abdel : « no cap »)
export let TENUE_DUEL = 5; // secondes a tenir l'anneau plein pour gagner (reglerTenue pour le bench)
export const LONG_CIBLE_DUEL = 40; // longueur cible pour l'anneau duel (TEST equilibre 2026-09-18 : 60 -> 40, revert si ca ne marche pas)
export const SURSIS_DUEL = 5; // sous cette longueur, le demi-anneau vire au rouge : moment 'vie'
const DEPART_DUEL = 5,
  MIN_JEUNE = 2; // duel : naissance a 5 anneaux ; un serpent jeune peut etre coupe jusqu'a 1 anneau, jamais tue (Abdel)
const ADULTE_DUEL = 10; // un serpent qui n'a jamais atteint 10 anneaux est 'jeune' : une coupe ne le descend jamais sous 3 et il n'est pas en sursis (pas de piege au depart)
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

// Un geste qui ne pose rien se voit quand meme : une baie deja la se ranime
function pulser() {
  const b = baies[Math.floor(Math.random() * baies.length)];
  if (b) {
    const p = px(b.x, b.y);
    eclat(p.x, p.y, 5, 'offerte');
    b.t = 0;
  }
}

// Une graine tombe devant le serpent, assez pres pour qu'il aille la chercher tout de suite
function semer(pseudo) {
  if (!serpent.length) return false;
  // plateau plein : le like nourrit une baie deja posee, il se voit toujours
  if (reglages.plafonds && graines.length + baies.length >= palier.maxBaies) {
    pulser();
    return false;
  }
  // La regle vaut aussi pour ce qui aide : une graine semee sous ses pattes est germee trop
  // tard, il l'a deja franchie, et le like du spectateur n'a rien produit de visible.
  const h = serpent[0],
    loin = Math.ceil(VITESSE * (GERME + 0.25)) + 2;
  const vise = { x: h.x + dir.x * loin, y: h.y + dir.y * loin };
  let l = libres().filter((c) => !zoneMorte(c, GERME));
  if (!l.length) l = libres();
  if (!l.length) return false;
  l.sort(
    (a, b) =>
      Math.abs(a.x - vise.x) +
      Math.abs(a.y - vise.y) -
      (Math.abs(b.x - vise.x) + Math.abs(b.y - vise.y)),
  );
  const c = l[Math.floor(Math.random() * Math.min(5, l.length))];
  graines.push({ x: c.x, y: c.y, pseudo: pseudo || '', t: 0 });
  offertes++;
  return true;
}

// Moon : la pierre pousse devant le serpent, mais jamais sous ses pattes. A VITESSE cases par
// seconde, il franchit ALERTE*VITESSE cases pendant la sortie : toute case plus proche que ca,
// dans son couloir, serait traversee avant que la pierre existe, et l'animation ne servirait a
// rien. On la place donc largement devant, ou sur le flanc, et jamais dans cette zone morte.
const PORTEE = () => VITESSE * (ALERTE + 0.25); // ce que le serpent avale pendant la pousse, avec marge
// REGLE, valable pour TOUT ce qui bloque, pierre comme ronce, ancrage comme croissance :
// on ne pose jamais rien devant le serpent s'il aura traverse la case avant que ca devienne
// actif. Sinon l'objet apparait sous lui pour rien, l'animation ne sert a rien, et le joueur
// comme le spectateur ne comprennent pas ce qu'ils voient.
function zoneMorte(c, delai) {
  if (!serpent.length) return false;
  const h = serpent[0],
    dx = c.x - h.x,
    dy = c.y - h.y;
  const devant = dx * dir.x + dy * dir.y,
    cote = Math.abs(dx * dir.y - dy * dir.x);
  if (devant > 0 && cote <= 1 && devant <= VITESSE * (delai + 0.25)) return true;
  if (duel()) {
    const a = autre();
    if (a && a.serpent.length) {
      const h2 = a.serpent[0],
        dx2 = c.x - h2.x,
        dy2 = c.y - h2.y;
      const dev2 = dx2 * a.dir.x + dy2 * a.dir.y,
        cot2 = Math.abs(dx2 * a.dir.y - dy2 * a.dir.x);
      if (dev2 > 0 && cot2 <= 1 && dev2 <= VITESSE * (delai + 0.25)) return true;
    }
  }
  return false;
}
function bloquer(pseudo) {
  if (!serpent.length) return false;
  if (reglages.plafonds && rochers.length >= palier.maxRochers) return false;
  const h = serpent[0],
    portee = PORTEE();
  const couloir = (c) => zoneMorte(c, ALERTE);
  const flanc = (c) => {
    const dx = c.x - h.x,
      dy = c.y - h.y;
    return Math.abs(dx * dir.y - dy * dir.x) >= 2 && Math.abs(dx) + Math.abs(dy) >= 3;
  };
  const tout = libres().filter((c) => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) >= 2);
  if (!tout.length) return false;
  // d'abord loin devant, sur sa route : elle sera sortie quand il arrivera
  const loin = Math.ceil(portee) + 2,
    vise = { x: h.x + dir.x * loin, y: h.y + dir.y * loin };
  let l = tout.filter((c) => !couloir(c) && (c.x - h.x) * dir.x + (c.y - h.y) * dir.y > 0);
  // rien de valable devant : elle ferme une ligne de fuite sur le cote
  if (!l.length) l = tout.filter((c) => flanc(c));
  if (!l.length) l = tout.filter((c) => !couloir(c));
  if (!l.length) return false;
  l.sort(
    (a, b) =>
      Math.abs(a.x - vise.x) +
      Math.abs(a.y - vise.y) -
      (Math.abs(b.x - vise.x) + Math.abs(b.y - vise.y)),
  );
  const c = l[Math.floor(Math.random() * Math.min(4, l.length))];
  rochers.push({ x: c.x, y: c.y, pseudo: pseudo || '', t: 0 });
  sonPoussee(ALERTE);
  poses++;
  monter('moon', 1);
  return true;
}

// Les cases mortes de la ronce, celles qui tuent deja.
function roncesDures(k) {
  const l = [];
  ronces.forEach((R) =>
    R.seg.forEach((g) => {
      if (g.t >= RONCE_ALERTE * (k || 1)) l.push(g);
    }),
  );
  return l;
}
const maxRonces = () => Math.max(1, Math.round(palier.maxRochers / 2));
// Elle prend racine hors de la zone morte, comme la pierre, mais elle pousse ensuite en travers
// de la course du serpent : c'est une voie qu'elle ferme, pas une case.
function planterRonce(pseudo) {
  if (!serpent.length) return false;
  if (reglages.plafonds && ronces.length >= maxRonces()) return false;
  const h = serpent[0],
    portee = PORTEE();
  const couloir = (c) => zoneMorte(c, RONCE_ALERTE);
  const tout = libres().filter(
    (c) => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) >= 3 && !couloir(c),
  );
  if (!tout.length) return false;
  // elle s'ancre a l'entree de la voie qu'il allait prendre, un peu de biais
  const loin = Math.ceil(portee) + 2;
  const vise = { x: h.x + dir.x * loin + dir.y * 2, y: h.y + dir.y * loin + dir.x * 2 };
  tout.sort(
    (a, b) =>
      Math.abs(a.x - vise.x) +
      Math.abs(a.y - vise.y) -
      (Math.abs(b.x - vise.x) + Math.abs(b.y - vise.y)),
  );
  const c = tout[Math.floor(Math.random() * Math.min(4, tout.length))];
  // elle rampe en travers : perpendiculaire a la course, vers le large du plateau
  let ax = { x: Math.abs(dir.y), y: Math.abs(dir.x) };
  if (!ax.x && !ax.y) ax = { x: 1, y: 0 };
  const versPlus = ax.x ? (c.x < COLS / 2 ? 1 : -1) : c.y < ROWS / 2 ? 1 : -1;
  ronces.push({
    seg: [{ x: c.x, y: c.y, t: 0 }],
    ax,
    sens: versPlus,
    t: 0,
    pas: 0,
    pseudo: pseudo || '',
  });
  sonRonce();
  monter('moon', 1);
  return true;
}
// Elle s'allonge d'une case a la fois, et se retourne si le large lui est ferme.
function allongerRonce(R) {
  const occ = new Set(serpent.map((g) => g.x + ',' + g.y));
  rochers.forEach((r) => occ.add(r.x + ',' + r.y));
  ronces.forEach((o) => o.seg.forEach((g) => occ.add(g.x + ',' + g.y)));
  for (const sens of [R.sens, -R.sens]) {
    const bout = sens === R.sens ? R.seg[R.seg.length - 1] : R.seg[0];
    const n = { x: bout.x + R.ax.x * sens, y: bout.y + R.ax.y * sens, t: 0 };
    if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || occ.has(n.x + ',' + n.y)) continue;
    if (zoneMorte(n, RONCE_ALERTE)) continue; // elle ne repousse pas sous ses pattes non plus
    if (sens === R.sens) R.seg.push(n);
    else R.seg.unshift(n);
    R.sens = sens;
    sonRoncePas(R.seg.length - 1);
    demanderIA();
    return true;
  }
  return false;
}

function rodeurVitesse() {
  return Math.min(ROD_VMAX, ROD.v + ROD.k * (rodeur ? rodeur.faim : 0));
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
  if (duel()) {
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
  }
  if (e.type === 'like') {
    compter(n);
    if (manche) manche.sun += n;
    creditSun += n;
    let pose = 0;
    while (creditSun >= palier.parBaie) {
      creditSun -= palier.parBaie;
      if (semer(e.pseudo)) pose++;
      else break;
    }
    if (!pose) pulser(e.pseudo);
    return pose;
  }
  if (e.type === 'cadeau') {
    compter(n * 3);
    if (manche) manche.moonEv += n;
    creditMoon += n;
    let pose = 0;
    while (creditMoon >= palier.parRocher) {
      creditMoon -= palier.parRocher;
      if (bloquer(e.pseudo)) pose++;
      else break;
    }
    return pose;
  }
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
  if (reglages.ambianceAuto && duel()) {
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
  creditSun = 0;
  creditMoon = 0;
  rochers = [];
  ronces = [];
  sansBaie = 0;
  if (duel()) {
    corps = [
      nouveauCorps('or', OR, COLS / 2 - 1, Math.floor(ROWS / 2), { x: -1, y: 0 }),
      nouveauCorps('ombre', OMBRE, COLS / 2, Math.floor(ROWS / 2), { x: 1, y: 0 }),
    ];
  } else {
    corps = [nouveauCorps('or', OR)];
  }
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
function monter(camp, n) {
  if (!manche || manche.etat !== 'en cours' || duel()) return;
  if (camp === 'sun') {
    manche.cielSun += n;
    manche.pulseSun = 0;
    if (manche.cielSun >= manche.hautSun) finir('sun');
  } else {
    manche.cielMoon += n;
    manche.pulseMoon = 0;
    if (manche.cielMoon >= manche.hautMoon) finir('moon');
  }
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
  if (duel()) moments.manches++;
  if (duel() && (camp === 'or' || camp === 'ombre')) {
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
    faim: rodeur ? Math.round(rodeur.faim) : 0,
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

// Une manche commence par une naissance : une coquille blanche se pose au centre du plateau,
// elle se fend, elle eclate, et le serpent en sort. Tant qu'elle est la, rien ne bouge.
export const ECLOSION = 1.4,
  SORTIE = 0.6,
  TRAINE = 0.55;
export let couvee = null;

// Architecture multi-corps : motif charger/ranger.
// base.js a ~106 references a `serpent`, `hist`, `dir`, etc. : on ne renomme pas ces variables.
// On charge le corps i dans les variables de module, on travaille dessus, on range.
// flair : part de joueur presse dans l'IA (0 = IA prudente du mode base). Deux valeurs differentes
// en duel, sinon les deux serpents jouent en miroir (Abdel, 2026-09-18).
// EGALITE STRICTE (Abdel, 2026-09-18 : « without viewer interaction they are on the same playing
// field 50/50 chances »). Les deux camps recoivent EXACTEMENT les memes valeurs. Mesure qui a
// impose ce choix : en inversant les leviers, l'avantage suivait le caractere (le camp qui recoit
// flair 0,4 / chasse 0,9 tombe de 53 % a 47 %), donc toute difference de levier est un handicap
// de camp. Les serpents ne jouent pas en miroir pour autant : `flair` et `chasse` tirent au sort
// (ia-humain.js:124 et 306), donc a parametres egaux les deux trajectoires divergent quand meme.
const FLAIR_DUEL = { or: 0.3, ombre: 0.3 };
// chasse : gout du piege (l'IA referme la poche adverse avec son corps)
const CHASSE_DUEL = { or: 0.7, ombre: 0.7 };
function nouveauCorps(camp, teinte, x0, y0, dir0) {
  return {
    camp,
    teinte,
    flair: duel() ? FLAIR_DUEL[camp] || 0 : 0,
    chasse: duel() ? CHASSE_DUEL[camp] || 0 : 0,
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
  if (!duel()) return;
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
const autre = () => (duel() && corps.length > 1 ? corps[1 - actif] : null);

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
  aPousser = (duel() ? DEPART_DUEL : DEPART) - 1;
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

// Les baies offertes sont vues tout de suite : une action de spectateur a un effet visible sans delai
// En duel, une baie reservee a l'autre camp n'existe pas pour cette IA : elle ne la vise pas.
function tousFruits() {
  const moi = duel() && corps[actif] ? corps[actif].camp : null;
  return baies
    .filter((b) => !b.pour || !moi || b.pour === moi)
    .map((b) => ({ x: b.x, y: b.y, offerte: true }));
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
function demanderIA(garder) {
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
        .concat(duel() && autreCorps ? autreCorps.serpent : []),
      eviter: duel() && autreCorps ? couronneAdverse(autreCorps) : [],
      aGrandir: aPousser,
      imprudence: reglages.imprudence,
      avantage:
        duel() && corps[actif]
          ? ((corps[actif].camp === 'or' ? 1 : -1) * (reglages.avantage || 0)) / 100
          : 0,
      flair: corps[actif] ? corps[actif].flair : 0,
      chasse: corps[actif] ? corps[actif].chasse : 0,
      adversaire: duel() && autreCorps ? autreCorps.serpent : null,
      adversaireInvincible: !!(duel() && autreCorps && autreCorps.invincT > 0),
      memoire: memoireIA,
    };
    // Scène : la moitié concernant le camp du serpent actif s'applique sur etat.
    if (scene && duel() && corps[actif]) {
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
    if (reglages.underdog && duel() && corps.length === 2) {
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
      duel() &&
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
  if (duel() && corps[actif]) corps[actif].mortCause = cause || 'soi'; // pour les sondes : de quoi il est mort
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
  if (duel()) {
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
  monter('moon', MORT_CRANS);
  pause = 0.8;
  serpent = [];
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
  if (duel()) {
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
  }
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
  const enInvinc = duel() && corps[actif].invincT > 0;
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
  const moiCamp = duel() && corps[actif] ? corps[actif].camp : null;
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
    duel() && autreCorpsDuel ? autreCorpsDuel.serpent : [],
  );
  if (!enInvinc && bloquant.some((s) => s.x === nx && s.y === ny)) {
    // duel, tete contre tete : la faute est partagee, les deux serpents encaissent. Sinon celui qui
    // avance en premier dans la boucle perd toutes les frontales.
    const ta = duel() && autreCorpsDuel && autreCorpsDuel.serpent[0];
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
      if (duel()) {
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
      }
      // duel : chrono propre (TEST equilibre : 120 s, les publics calmes ne remplissent jamais l'anneau)
      if (manche.t >= (duel() ? reglages.dureeDuel || reglages.duree : reglages.duree)) {
        if (duel()) {
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
        } else {
          finir(
            manche.cielSun / manche.hautSun > manche.cielMoon / manche.hautMoon ? 'sun' : 'moon',
            'temps',
          );
        }
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
        const sv0 = duel() ? FORET_DUEL : reglages.sauvage >= 0 ? palier.sauvage : 0;
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
          if (duel() && corps[0] && corps[1] && corps[0].serpent[0] && corps[1].serpent[0]) {
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
      // salle vide ou presque : la foret elle-meme fait tomber des pierres, sinon rien ne menace jamais
      if (palier.nature > 0 && !duel()) {
        natureT += dt;
        if (!delaiNature) delaiNature = souffle(palier.nature);
        if (natureT >= delaiNature) {
          natureT = 0;
          delaiNature = souffle(palier.nature);
          bloquer('');
        }
      } else {
        natureT = 0;
        delaiNature = 0;
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
  if (duel() && ordreTick) {
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
  if (duel()) {
    if (corps[actif].surgeT > 0) corps[actif].surgeT = Math.max(0, corps[actif].surgeT - dt);
    if (corps[actif].invincT > 0) corps[actif].invincT = Math.max(0, corps[actif].invincT - dt);
    if (corps[actif].coupT > 0) corps[actif].coupT = Math.max(0, corps[actif].coupT - dt);
    if (corps[actif].pareT > 0) corps[actif].pareT = Math.max(0, corps[actif].pareT - dt);
    if (corps[actif].bouclierT > 0)
      corps[actif].bouclierT = Math.max(0, corps[actif].bouclierT - dt);
    if (corps[actif].reculT > 0) corps[actif].reculT = Math.max(0, corps[actif].reculT - dt);
  }
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
  const surge = duel() && corps[actif].surgeT > 0;
  avance += dt * VITESSE * (surge ? SURGE_FACT : 1); // like : poussee de tempo
  while (avance >= 1) {
    avance -= 1;
    if (!pas()) return;
  }
}

export const OR = '#F2C57C';
// Duel : la nourriture ne peut pas etre or (couleur du camp Or) : vert tendre, distinct des deux
// camps et du fond de foret (Abdel, 2026-09-18). En base elle reste or.
const BAIE_VERT = '#9BE28A',
  BAIE_VERT_A = (a) => 'rgba(155,226,138,' + a + ')';
export const teinteBaie = (camp) =>
  camp === 'or' ? OR : camp === 'ombre' ? OMBRE : duel() ? BAIE_VERT : OR;
const lueurBaie = (a, camp) =>
  camp === 'or'
    ? 'rgba(242,197,124,' + a + ')'
    : camp === 'ombre'
      ? 'rgba(180,212,222,' + a + ')'
      : duel()
        ? BAIE_VERT_A(a)
        : 'rgba(242,197,124,' + a + ')';
export const OMBRE = '#b4d4de'; // couleur du second serpent en mode duel (a verifier au contraste)

// Ce que les spectateurs offrent : la graine tombe, l'ombre se resserre, la baie s'ouvre.
const BAIE_RS = 58,
  BAIE_N = 48,
  cacheBaie = new Map();
function spriteBaie(ph, camp) {
  const cle = ph + (duel() ? 'd' : 'b') + (camp || '');
  let s = cacheBaie.get(cle);
  if (s) return s;
  const si = Math.sin((ph / BAIE_N) * Math.PI * 2),
    bat = 1 + 0.09 * si;
  s = document.createElement('canvas');
  s.width = 2 * BAIE_RS;
  s.height = 2 * BAIE_RS;
  const avant = ctx;
  ctx = s.getContext('2d');
  ctx.translate(BAIE_RS, BAIE_RS);
  try {
    ctx.globalAlpha = 0.35 + 0.15 * si;
    ctx.strokeStyle = teinteBaie(camp);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 24 * bat, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowColor = lueurBaie(0.9, camp);
    ctx.shadowBlur = 26;
    ctx.fillStyle = teinteBaie(camp);
    ctx.beginPath();
    ctx.arc(0, 0, 17 * bat, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,246,228,0.55)';
    ctx.beginPath();
    ctx.arc(-5, -5, 5, 0, Math.PI * 2);
    ctx.fill();
  } finally {
    ctx = avant;
  }
  cacheBaie.set(cle, s);
  return s;
}
function peindreOffrandes() {
  graines.forEach((g) => {
    const p = px(g.x, g.y),
      u = Math.min(1, g.t / GERME),
      chute = Math.min(1, u / 0.7);
    if (chute < 1) {
      const y = p.y - CELL * 3.2 * (1 - chute) * (1 - chute);
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.3 * chute;
      ctx.fillStyle = '#0b120d';
      ctx.beginPath();
      ctx.ellipse(p.y ? p.x : p.x, p.y + 6, 10 + 8 * chute, 3 + 2 * chute, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowColor = lueurBaie(0.8, g.camp);
      ctx.shadowBlur = 20;
      ctx.fillStyle = teinteBaie(g.camp);
      ctx.beginPath();
      ctx.arc(p.x, y, 5 + 3 * chute, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      const s = (u - 0.7) / 0.3;
      ctx.save();
      ctx.strokeStyle = 'rgba(159,199,164,0.85)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 12);
      ctx.lineTo(p.x, p.y + 12 - 14 * s);
      ctx.stroke();
      ctx.shadowColor = lueurBaie(0.9, g.camp);
      ctx.shadowBlur = 24;
      ctx.fillStyle = teinteBaie(g.camp);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  baies.forEach((b) => {
    const p = px(b.x, b.y);
    // Toutes les baies battent au meme rythme, decale par leur age : leur dessin ne depend donc
    // que de la phase du battement. On en garde 48 images, partagees par toutes les baies du
    // plateau. C'est ici que se joue la vraie depense : `shadowBlur` est l'operation la plus
    // chere du canvas 2D, et elle etait payee une fois PAR BAIE ET PAR IMAGE. Elle est desormais
    // cuite dans le sprite, payee 48 fois pour toute la partie.
    const ph = ((Math.round(((b.t * 3.4) / (Math.PI * 2)) * BAIE_N) % BAIE_N) + BAIE_N) % BAIE_N;
    ctx.drawImage(spriteBaie(ph, b.camp), Math.round(p.x) - BAIE_RS, Math.round(p.y) - BAIE_RS);
  });
}

export const BLEU = '#8FA8D8',
  ROUGE = '#D64A42',
  COQUILLE = '#F6F3EA';

// Les rochers de Moon : rien ne tombe du ciel. La terre se bombe une seconde, la mousse se
// souleve, et la pierre sort du sol. L'avertissement reste lisible, le geste devient vegetal.
function bosse(x, y, rx, ry, force) {
  const g = ctx.createRadialGradient(x, y - ry * 0.35, rx * 0.12, x, y, rx);
  g.addColorStop(0, 'rgba(58,70,56,' + 0.55 * force + ')');
  g.addColorStop(0.55, 'rgba(35,45,36,' + 0.5 * force + ')');
  g.addColorStop(1, 'rgba(20,30,23,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
// Les plaques de terre : l'ecorce du sol se fend en quartiers qui basculent vers l'exterieur.
// Chacune pivote autour de son bord interne, donc la pierre a l'air de forcer le sol, pas de glisser.
function plaques(x, y, ouv, j) {
  for (let i = 0; i < 4; i++) {
    const an = (i / 4) * Math.PI * 2 + j * 0.21,
      r0 = 9,
      r1 = 20 + 13 * ouv;
    const bas = 0.34 + 0.06 * ((i + j + 8) % 3); // quartiers inegaux, aucun n'est le miroir d'un autre
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.46);
    ctx.rotate(an);
    ctx.beginPath();
    ctx.moveTo(r0, -r0 * bas);
    ctx.lineTo(r1, -r1 * bas * 0.9);
    ctx.lineTo(r1, r1 * bas * 0.9);
    ctx.lineTo(r0, r0 * bas);
    ctx.closePath();
    ctx.fillStyle = 'rgba(31,40,32,' + (0.62 + 0.28 * ouv) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,180,140,' + 0.26 * ouv + ')';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }
}
// La fissure : trois branches noires qui s'ouvrent depuis le centre avant que rien ne depasse.
function fissure(x, y, ouv, j) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.46);
  ctx.strokeStyle = 'rgba(6,10,7,' + 0.75 * Math.min(1, ouv * 2) + ')';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const an = (i / 3) * Math.PI * 2 + j * 0.4,
      L = 13 + 20 * ouv;
    ctx.lineWidth = 3.2 - 1.1 * i * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(
      Math.cos(an + 0.3) * L * 0.55,
      Math.sin(an + 0.3) * L * 0.55,
      Math.cos(an) * L,
      Math.sin(an) * L,
    );
    ctx.stroke();
  }
  ctx.restore();
}
// Une motte arrachee au flanc de la pierre : elle devale, tombe, et se tasse au pied.
function motte(x, y, k, i, j) {
  if (k <= 0 || k >= 1) return;
  const cote = i % 2 ? 1 : -1,
    d = 8 + 5 * ((i + j + 5) % 3);
  const px2 = x + cote * d * (0.4 + 0.6 * k),
    py2 = y - 16 + 34 * k * k;
  ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
  ctx.fillStyle = '#2a3529';
  ctx.beginPath();
  ctx.ellipse(px2, py2, 3.4 - 1.2 * k, 2.8 - 1 * k, cote * k * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
// Le grain hache, meme principe que l'ambiance : un bruit deterministe, donc une pierre a
// toujours exactement la meme forme et la meme mousse tant qu'elle est au meme endroit.
const HACHE = (i, d) => {
  const v = Math.sin((i + 1) * 12.9898 + (d + 7) * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// Une seule lumiere pour tout ce qui est pose au sol, calquee sur les cles de l'ambiance : elle
// vient de la gauche au lever, du zenith a midi, de la droite au coucher, et la nuit elle est
// faible et froide. Sans elle, un objet reste un aplat colle sur une image peinte.
function lumiere() {
  const h = (((reglages.heure || 0) % 1) + 1) % 1;
  const jour = Math.max(0, Math.min(1, (Math.cos((h - 0.5) * Math.PI * 2) + 0.35) / 1.35));
  const an = Math.PI * (-0.82 + 0.62 * Math.min(1, Math.max(0, (h - 0.2) / 0.58)));
  const chaud = [248, 226, 186],
    froid = [164, 192, 214];
  const te = chaud.map((c, i) => Math.round(c + (froid[i] - c) * (1 - jour)));
  return { x: Math.cos(an), y: Math.sin(an), k: 0.28 + 0.72 * jour, te: te.join(',') };
}

// La pierre : une silhouette irreguliere a onze sommets, deux plans casses net, une fissure
// eclairee d'un cote, du grain, de la mousse du cote du jour, et un liseret de lumiere qui ne
// court que sur les aretes tournees vers la source.
function pointsRocher(j, ech) {
  const n = 11,
    R = 23 * (ech || 1),
    pts = [];
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = R * (0.8 + 0.28 * HACHE(i, j));
    pts.push({ x: Math.cos(an) * r, y: Math.sin(an) * r * 0.9 + 2, an: an });
  }
  return pts;
}
function traceRocher(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}
function corpsRocher(j) {
  const L = lumiere(),
    pts = pointsRocher(j);
  // le corps : un degrade oriente par la lumiere, du flanc eclaire au flanc dans l'ombre
  traceRocher(pts);
  const g = ctx.createLinearGradient(-26 * L.x, -26 * L.y, 26 * L.x, 26 * L.y);
  g.addColorStop(0, '#7c8798');
  g.addColorStop(0.44, '#4f5a6c');
  g.addColorStop(1, '#212934');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  traceRocher(pts);
  ctx.clip();
  // le plan du dessus, casse net : c'est lui qui donne le volume, pas une facette plus claire
  ctx.beginPath();
  ctx.moveTo(-28, -4 + 1.5 * j);
  ctx.lineTo(-5, -16);
  ctx.lineTo(13, -10 + j);
  ctx.lineTo(28, -3);
  ctx.lineTo(28, -34);
  ctx.lineTo(-28, -34);
  ctx.closePath();
  const g2 = ctx.createLinearGradient(0, -26, 0, 2);
  g2.addColorStop(0, 'rgba(' + L.te + ',' + 0.34 * L.k + ')');
  g2.addColorStop(1, 'rgba(' + L.te + ',0)');
  ctx.fillStyle = g2;
  ctx.fill();
  // la fissure, creusee d'un trait sombre et relevee d'un trait clair du cote du jour
  ctx.strokeStyle = 'rgba(14,18,24,0.72)';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6 + 2 * j, -15);
  ctx.quadraticCurveTo(2, -2, -2 + j, 17);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(' + L.te + ',' + 0.2 * L.k + ')';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6 + 2 * j - 1.4 * L.x, -15 - 1.4 * L.y);
  ctx.quadraticCurveTo(2 - 1.4 * L.x, -2 - 1.4 * L.y, -2 + j - 1.4 * L.x, 17 - 1.4 * L.y);
  ctx.stroke();
  // le grain : quatorze eclats, moitie sombres moitie clairs, toujours les memes
  for (let i = 0; i < 14; i++) {
    const an = HACHE(i, j) * Math.PI * 2,
      r = HACHE(i + 9, j) * 19;
    ctx.globalAlpha = 0.09 + 0.09 * HACHE(i + 3, j);
    ctx.fillStyle = i % 2 ? '#0d1218' : '#a9b5c5';
    ctx.beginPath();
    ctx.arc(Math.cos(an) * r, Math.sin(an) * r * 0.88, 0.8 + 1.2 * HACHE(i + 5, j), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // la mousse : trois touffes sur le dessus, du cote eclaire, avec leur pointe plus claire
  for (let i = 0; i < 3; i++) {
    const an = -Math.PI / 2 + (HACHE(i + 2, j) - 0.5) * 1.6,
      r = 9 + 6 * HACHE(i + 7, j);
    const x = Math.cos(an) * r + L.x * 4,
      y = Math.sin(an) * r * 0.8;
    ctx.fillStyle = 'rgba(78,110,66,0.58)';
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + 2.6 * HACHE(i, j), 2.3 + 1.2 * HACHE(i + 1, j), an, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(148,182,126,0.26)';
    ctx.beginPath();
    ctx.ellipse(x - L.x * 1.2, y - 1.4, 2.4 + 1.3 * HACHE(i, j), 1.2, an, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // le liseret : seulement les aretes dont la normale regarde la lumiere
  ctx.strokeStyle = 'rgba(' + L.te + ',' + 0.46 * L.k + ')';
  ctx.lineWidth = 2.1;
  ctx.lineJoin = 'round';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length],
      mx = (p.x + q.x) / 2,
      my = (p.y + q.y) / 2;
    const n = Math.hypot(mx, my) || 1;
    if ((mx / n) * L.x + (my / n) * L.y > 0.15) continue; // arete a l'ombre, pas de liseret
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
}

// Cache de pierres. Le corps d'une pierre ne depend que de sa variante `j` et de la lumiere,
// jamais de sa position ni de son animation de sortie, qui sont des transformations posees par
// l'appelant. On le peignait entierement a chaque image, pour chaque pierre : deux degrades, un
// clip, quatorze eclats de grain, six ellipses de mousse et onze aretes de liseret. Mesure au
// profileur, `routines/profil-rendu.js` : 2170 des 4582 operations canvas par image, soit 47 %.
// On le peint donc une fois par variante et par palier de lumiere, dans un canvas hors ecran.
const ROC_RS = 40,
  cacheRocher = new Map();
let cacheRocherCle = null;
function spriteRocher(j) {
  const cle = Math.round(((((reglages.heure || 0) % 1) + 1) % 1) * 180);
  if (cle !== cacheRocherCle) {
    cacheRocher.clear();
    cacheRocherCle = cle;
  }
  let s = cacheRocher.get(j);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = 2 * ROC_RS;
  s.height = 2 * ROC_RS;
  const avant = ctx;
  ctx = s.getContext('2d');
  ctx.translate(ROC_RS, ROC_RS);
  try {
    corpsRocher(j);
  } finally {
    ctx = avant;
  }
  cacheRocher.set(j, s);
  return s;
}
// Remplace un appel a corpsRocher : meme dessin, meme origine, une seule operation canvas.
function poserRocher(j) {
  ctx.drawImage(spriteRocher(j), -ROC_RS, -ROC_RS);
}
function peindreRochers() {
  rochers.forEach((r) => {
    const p = px(r.x, r.y),
      j = ((r.x * 13 + r.y * 7) % 7) - 3;
    if (r.t < ALERTE) {
      const u = r.t / ALERTE,
        lev = u * u * (3 - 2 * u); // le bombement, doux aux deux bouts
      // Elle perce tot, et sa montee a un ressaut : elle force, elle glisse d'un cheveu vers 60 %,
      // puis elle passe. C'est ce temps mort qui la rend pesante au lieu de jaillir.
      const sor = Math.max(0, (u - 0.18) / 0.82);
      let emer = sor * sor * (3 - 2 * sor);
      emer -=
        0.085 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (sor - 0.46) / 0.26)) * Math.PI));
      emer = Math.max(0, Math.min(1, emer));
      ctx.save();
      // l'ombre portee du monticule, qui s'allonge a mesure qu'il monte
      ctx.globalAlpha = 0.3 * lev;
      ctx.fillStyle = '#050907';
      ctx.beginPath();
      ctx.ellipse(p.x + 6 * lev, p.y + 13, 26 * lev + 6, 8 * lev + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // la terre qui se souleve, puis se fend
      bosse(p.x, p.y + 6, 20 + 14 * lev, 9 + 9 * lev, lev);
      fissure(p.x, p.y + 4, lev, j);
      // la pierre sort du sol : on ne montre que ce qui depasse la ligne de terre
      if (emer > 0.001) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x - 42, p.y - 48, 84, 48 + 12);
        ctx.clip();
        ctx.translate(p.x, p.y + 34 * (1 - emer));
        ctx.rotate((1 - emer) * 0.22 * (j > 0 ? 1 : -1));
        ctx.scale(0.86 + 0.14 * emer, 0.86 + 0.14 * emer);
        poserRocher(j);
        ctx.restore();
      }
      // les quartiers de sol basculent par-dessus le pied de la pierre : c'est elle qui force
      plaques(p.x, p.y + 5, lev, j);
      // les mottes arrachees devalent le flanc pendant la sortie
      for (let i = 0; i < 3; i++) motte(p.x, p.y, (emer - (0.3 + 0.16 * i)) / 0.42, i, j);
      ctx.restore();
      return;
    }
    // une fois sortie, elle se cale : un tassement sec, vers le bas seulement, jamais de rebond
    const d = r.t - ALERTE,
      k = d < 0.18 ? Math.sin((d / 0.18) * Math.PI) : 0;
    const sx = 1 + 0.05 * k,
      sy = 1 - 0.08 * k;
    const f = r.t > VIEROCHER - 2 ? (VIEROCHER - r.t) / 2 : 1;
    ctx.save();
    // la terre remuee reste visible au pied, puis se tasse
    ctx.globalAlpha = f * (d < 1.4 ? 1 - d / 1.4 : 0) * 0.8;
    if (ctx.globalAlpha > 0.01) bosse(p.x, p.y + 8, 30, 14, 0.7);
    // l'anneau de poussiere chassee par le choc
    if (d < 0.45) {
      const q = d / 0.45;
      ctx.globalAlpha = f * (1 - q) * 0.42;
      ctx.strokeStyle = 'rgba(168,176,150,1)';
      ctx.lineWidth = 3 - 2 * q;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 13, 20 + 34 * q, 7 + 12 * q, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = f * 0.45;
    ctx.fillStyle = '#050907';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 15, 21 * sx, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = f;
    ctx.translate(p.x, p.y);
    ctx.scale(sx, sy);
    poserRocher(j);
    ctx.restore();
  });
}

// La ronce : une liane, pas un trait. Le corps est un contour rempli, epais a la racine et fin a
// la pointe, avec son ombre de contact au sol, un ruban de lumiere du cote de la source, des
// feuilles a nervure et des epines crochues qui n'apparaissent que sur la part qui tue.
function pointsRonce(R) {
  const pts = [];
  R.seg.forEach((g, i) => {
    const p = px(g.x, g.y),
      u = Math.min(1, g.t / RONCE_ALERTE),
      ouv = u * u * (3 - 2 * u);
    const v = R.seg[i - 1] || R.seg[i + 1];
    if (!v || ouv >= 1) {
      pts.push({ x: p.x, y: p.y, dur: u >= 1, ouv: ouv, i: i });
      return;
    }
    const q = px(v.x, v.y);
    pts.push({
      x: q.x + (p.x - q.x) * ouv,
      y: q.y + (p.y - q.y) * ouv,
      dur: false,
      ouv: ouv,
      i: i,
    });
  });
  return pts;
}
// Le contour de la tige : on longe la ligne d'un cote, on revient de l'autre, la demi-epaisseur
// decroit vers la pointe. C'est ce qui fait une plante plutot qu'un tuyau d'epaisseur constante.
function contourRonce(pts, ep, dx, dy) {
  const n = pts.length;
  const nor = (i) => {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(n - 1, i + 1)];
    const vx = b.x - a.x,
      vy = b.y - a.y,
      l = Math.hypot(vx, vy) || 1;
    return { x: -vy / l, y: vx / l };
  };
  const e = (i) =>
    ep * (1 - 0.52 * (i / Math.max(1, n - 1))) * Math.min(1, 0.35 + 0.65 * pts[i].ouv);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const u = nor(i),
      w = e(i);
    const x = pts[i].x + u.x * w + (dx || 0),
      y = pts[i].y + u.y * w + (dy || 0);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let i = n - 1; i >= 0; i--) {
    const u = nor(i),
      w = e(i);
    ctx.lineTo(pts[i].x - u.x * w + (dx || 0), pts[i].y - u.y * w + (dy || 0));
  }
  ctx.closePath();
}
function feuille(x, y, an, L, clair, f, ouv) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(an);
  ctx.globalAlpha = f * Math.min(1, ouv * 1.2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(L * 0.5, -L * 0.34, L, 0);
  ctx.quadraticCurveTo(L * 0.5, L * 0.34, 0, 0);
  ctx.fillStyle = clair ? '#46603a' : '#2c3d25';
  ctx.fill();
  ctx.strokeStyle = 'rgba(158,190,138,0.30)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(L * 0.08, 0);
  ctx.lineTo(L * 0.86, 0);
  ctx.stroke();
  ctx.restore();
}
function epine(x, y, an, L, te, f) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(an);
  ctx.globalAlpha = f * 0.92;
  ctx.beginPath();
  ctx.moveTo(0, -2.4);
  ctx.quadraticCurveTo(L * 0.72, -L * 0.3, L, -L * 0.06); // le crochet, courbe vers l'arriere
  ctx.quadraticCurveTo(L * 0.52, L * 0.12, 0, 2.4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, L, 0);
  g.addColorStop(0, '#5d7a4c');
  g.addColorStop(1, 'rgba(' + te + ',0.92)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}
// Cache de ronces. Le dessin d'une liane ne depend que de ses noeuds, de leur ouverture, de son
// effacement `f` et de la lumiere : jamais du temps qui passe. Or il etait entierement refait a
// chaque image, deux feuilles et trois epines par noeud, chacune avec son save, sa rotation et
// ses courbes. Mesure au profileur : 1406 des 4582 operations canvas par image, soit 31 %.
// Une ronce posee ne bouge plus, donc son sprite ne se repeint qu'a l'ouverture et a la mort.
// Le decalage est entier, pour que la recopie soit au pixel pres et non reechantillonnee.
const RON_M = 26;
function peindreRonces() {
  const L = lumiere();
  const cleL = Math.round(((((reglages.heure || 0) % 1) + 1) % 1) * 180);
  ronces.forEach((R) => {
    const f = R.t > VIERONCE - 2 ? (VIERONCE - R.t) / 2 : 1;
    const pts = pointsRonce(R);
    if (pts.length < 1) return;
    let ax = Infinity,
      ay = Infinity,
      bx = -Infinity,
      by = -Infinity;
    for (const p of pts) {
      if (p.x < ax) ax = p.x;
      if (p.x > bx) bx = p.x;
      if (p.y < ay) ay = p.y;
      if (p.y > by) by = p.y;
    }
    const ox = Math.floor(ax - RON_M),
      oy = Math.floor(ay - RON_M);
    let sig = cleL + '|' + f.toFixed(2) + '|' + ox + '|' + oy + '|' + pts.length;
    for (const q of pts) sig += '|' + Math.round(q.ouv * 24) + (q.dur ? 'd' : '');
    if (R.sig !== sig) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(bx + RON_M) - ox);
      c.height = Math.max(1, Math.ceil(by + RON_M) - oy);
      const avant = ctx;
      ctx = c.getContext('2d');
      ctx.translate(-ox, -oy);
      try {
        corpsRonce(pts, f, L, R);
      } finally {
        ctx = avant;
      }
      R.sprite = c;
      R.sig = sig;
    }
    ctx.drawImage(R.sprite, ox, oy);
  });
}
function corpsRonce(pts, f, L, R) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // l'ombre de contact : la meme tige, decalee au sol, floue par un degre d'alpha
  ctx.globalAlpha = f * 0.42;
  ctx.fillStyle = '#070c07';
  contourRonce(pts, 8.5, 2.5, 6);
  ctx.fill();
  ctx.globalAlpha = f * 0.22;
  contourRonce(pts, 11, 3.5, 9);
  ctx.fill();
  // le corps, degrade le long de la liane : sombre a la racine, plus vert vers la pointe vive
  ctx.globalAlpha = f;
  const q0 = pts[0],
    q1 = pts[pts.length - 1];
  const gb = ctx.createLinearGradient(q0.x, q0.y, q1.x, q1.y);
  gb.addColorStop(0, '#1b2616');
  gb.addColorStop(0.55, '#26331d');
  gb.addColorStop(1, '#354823');
  contourRonce(pts, 8);
  ctx.fillStyle = gb;
  ctx.fill();
  // le ruban de lumiere, du cote de la source, plus fin que le corps
  ctx.globalAlpha = f * (0.3 + 0.34 * L.k);
  contourRonce(pts, 3.1, L.x * 2.6, L.y * 2.6);
  ctx.fillStyle = 'rgba(' + L.te + ',0.55)';
  ctx.fill();
  // les feuilles : deux par noeud, jamais symetriques, la claire du cote du jour
  pts.forEach((p, i) => {
    const v = pts[i - 1] || pts[i + 1] || p;
    const an = Math.atan2(p.y - v.y, p.x - v.x),
      h = HACHE(i, R.seg.length);
    for (let k = 0; k < 2; k++) {
      const cote = k ? 1 : -1;
      const ec = an + cote * (0.78 + 0.34 * h);
      const clair = Math.cos(ec) * L.x + Math.sin(ec) * L.y < 0;
      feuille(p.x, p.y, ec, 8.5 + 3.5 * HACHE(i + k, 3), clair, f, p.ouv);
    }
  });
  // les epines : uniquement sur la part dure. Elles sont le seul signal que ca tue.
  pts.forEach((p, i) => {
    if (!p.dur) return;
    const v = pts[i - 1] || pts[i + 1] || p;
    const an = Math.atan2(p.y - v.y, p.x - v.x);
    for (let k = 0; k < 3; k++) {
      const ec = an + (k === 1 ? -Math.PI / 2 : Math.PI / 2) + (k - 1) * 0.38;
      epine(p.x, p.y, ec, 7.5 + 2 * HACHE(i + k, 5), L.te, f);
    }
  });
  ctx.restore();
}

// La course dans le ciel, lisible sans un mot : le soleil monte a gauche, la lune a droite.
// Une baie mangee, le soleil gagne un cran ; un rocher pose, la lune gagne le sien. Premier en haut.
const CIEL_X = 62;

function astre(x, u, sun, pulse) {
  const y = CIEL_BAS + (CIEL_HAUT - CIEL_BAS) * Math.min(1, u);
  const teinte = sun ? OR : BLEU,
    rgb = sun ? '242,197,124' : '143,168,216';
  ctx.save();
  // le chemin deja parcouru reste allume derriere l'astre
  const g = ctx.createLinearGradient(0, CIEL_BAS, 0, y);
  g.addColorStop(0, 'rgba(' + rgb + ',0)');
  g.addColorStop(1, 'rgba(' + rgb + ',0.5)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, CIEL_BAS);
  ctx.lineTo(x, y);
  ctx.stroke();
  // la ligne d'arrivee, tout en haut
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.6 + (sun ? 0 : Math.PI));
  ctx.strokeStyle = teinte;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 24, CIEL_HAUT - 38);
  ctx.lineTo(x + 24, CIEL_HAUT - 38);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // le cran vient d'etre gagne : l'astre respire une fois
  const k = Math.max(0, 1 - pulse / 0.45),
    R = 44 + 13 * k;
  ctx.shadowColor = 'rgba(' + rgb + ',' + (0.75 + 0.25 * k) + ')';
  ctx.shadowBlur = 40 + 40 * k;
  ctx.fillStyle = teinte;
  if (sun) {
    ctx.beginPath();
    ctx.arc(x, y, R * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 4;
    ctx.strokeStyle = teinte;
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2 + t * 0.25;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(an) * R * 0.85, y + Math.sin(an) * R * 0.85);
      ctx.lineTo(x + Math.cos(an) * R * 1.15, y + Math.sin(an) * R * 1.15);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(x, y, R * 0.64, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x + R * 0.34, y - R * 0.2, R * 0.58, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function peindreCourse() {
  if (!manche || duel()) return; // duel : pas d'astres, les demi-anneaux et la serie suffisent
  astre(CIEL_X, Math.min(1, manche.cielSun / manche.hautSun), true, manche.pulseSun);
  astre(W - CIEL_X, Math.min(1, manche.cielMoon / manche.hautMoon), false, manche.pulseMoon);
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
    const avant = ctx;
    ctx = s.getContext('2d');
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
      ctx = avant;
    }
    spriteGens = s;
  }
  const k = r / (GENS_RS * 0.66),
    w = 2 * GENS_RS * k;
  ctx.drawImage(spriteGens, x - w / 2, y - w / 2, w, w);
}

export let dtRendu = 0.016;

// Point du rail du timer a la distance s du haut-centre, dans le sens horaire (le sens ou le trait
// rouge est dessine). Meme geometrie que ctx.roundRect(x,y,w,h,r).
export let fumeeTimer = [];
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
  if (duel()) {
    peindreDuel(dtRendu);
    return;
  } // l'ecran de fin du duel est peint en dernier, dans dessiner : il passe devant TOUT
  const us = Math.min(1, manche.cielSun / manche.hautSun),
    um = Math.min(1, manche.cielMoon / manche.hautMoon);
  // teinte de scene : celui qui mene la course colore le monde
  const pente = us - um;
  ctx.save();
  ctx.globalAlpha = 0.13 * Math.abs(pente);
  ctx.fillStyle = pente >= 0 ? OR : BLEU;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  if (manche.etat !== 'en cours') peindreFin();
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
  if (duel()) {
    const a = autre();
    if (a) a.serpent.forEach((s) => mur.add(s.x + ',' + s.y));
  }
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
        : manche && duel()
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
      teinte: duel() ? corps[actif].teinte : undefined,
    });
    if (duel() && corps[actif].bouclierT > 0 && trace.length) {
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
  if (reglages.debugIA && duel()) peindreDebugIA();
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
  if (duel()) {
    if (avecCadeaux) peindreStatutsDuel();
  }
  // affichageCadeaux : 'defile' (bandeaux qui defilent, avec le pattern visible/cache), 'complet' (ancienne legende), 'aucun' (rien)
  if (avecCadeaux) {
    const mA = reglages.affichageCadeaux || 'complet';
    if (mA === 'defile') peindreDefileCadeaux();
    else if (mA === 'complet') peindreLegendeDuel();
  }
  // Ecran de fin du duel, peint APRES le score et la legende (Abdel : « your grey veil just apply to gift and do
  // not consider the whole screen, make it smoother ») : un seul voile, plein ecran, et le classement devant tout.
  if (duel() && manche && manche.etat !== 'en cours') peindreFin();
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
    if (duel()) finir(camp || 'or', 'test');
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
  duel: () =>
    duel()
      ? {
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
        }
      : null,
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
  reglerLong: (v) => {
    longForce = v;
  },
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
  rodeur: () => rodeur && { x: rodeur.x, y: rodeur.y, faim: rodeur.faim, vitesse: rodeurVitesse() },
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
  canvas = document.getElementById('scene');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
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
