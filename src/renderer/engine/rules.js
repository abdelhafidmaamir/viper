// Game rules: board speed, hazard timings, crowd tiers, gift prices and durations, and the fixed
// temperament both AIs share. Pure data, no state.

export const VITESSE = 7;

export const GERME = 1;

// duel : alterne quel serpent est resolu en premier a chaque tick (equite)
// 1,3 s : sous une seconde la pierre "pop" au lieu de pousser, au-dela de 1,5 s le serpent, a
// 7 cases par seconde sur un plateau de 16, a deja traverse toute case qu'on pourrait viser.
export const ALERTE = 1.3,
  VIEROCHER = 45;

// La ronce : le second bloqueur. La pierre est minerale, ponctuelle, sortie d'un coup ; la ronce
// rampe et ferme une voie entiere. Elle s'annonce plus vite par segment (0,8 s) mais elle met
// RONCE_PAS*RONCE_MAX a se deployer, et elle vit moins longtemps parce qu'elle prend plus de place.
export const RONCE_ALERTE = 0.8,
  RONCE_PAS = 0.75,
  RONCE_MAX = 4,
  VIERONCE = 20;

// Quatre paliers d'affluence : le jeu se tient aussi bien salle vide qu'en pleine rue.
// cadence = evenements par minute, lissee. Chaque palier change le ravitaillement, la cible et les plafonds.
// cielSun : baies a manger pour que le soleil atteigne le haut. cielMoon : rochers poses pour la lune.
export const PALIERS = [
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

// Economie calquee sur un vrai live : la rose est le cadeau dominant et joue CONTRE le serpent,
// Le like, le commentaire et le partage sont sans effet (Abdel, 2026-09-19 : la poussee par likes est retiree).
// La seule poussee de vitesse est le cadeau tempo (SURGE_FACT pendant TEMPO_DUR).
export const SURGE_FACT = 1.2;

// Abdel, 2026-09-19 : « the actual speed boost value, tone it down a little » (etait 1,5)
// ancien commentaire :  // le serpent va 50 % plus vite pendant la poussee
export const FORET_DUEL = 8;

// duel : secondes (x0.6 a 1.4) entre deux baies vertes neutres quand le plateau est vide, ralenti par l'affluence
export const TEMPO_COUT = 10,
  TEMPO_DUR = 10;

// don 10-29 coins : 10 s de poussee de tempo payee (x1.5), au-dela du plafond des likes
export const COUPE_COUT = 20,
  COUPE_FRAC = 0.15;

// coupe duel (Abdel : « cut at 15% for 30 ») : don >= 30 enleve 15 % de la longueur adverse, 1 anneau minimum
export const coupeDe = (L) => Math.max(1, Math.round(L * COUPE_FRAC));

export const BOUCLIER_COUT = 30,
  VIE_COUT = 100,
  BOUCLIER_DUR = 15;

// secondes a tenir l'anneau plein pour gagner (reglerTenue pour le bench)
export const LONG_CIBLE_DUEL = 40;

// longueur cible pour l'anneau duel (TEST equilibre 2026-09-18 : 60 -> 40, revert si ca ne marche pas)
export const SURSIS_DUEL = 5;

// sous cette longueur, le demi-anneau vire au rouge : moment 'vie'
export const DEPART_DUEL = 5,
  MIN_JEUNE = 2;

// duel : naissance a 5 anneaux ; un serpent jeune peut etre coupe jusqu'a 1 anneau, jamais tue (Abdel)
export const ADULTE_DUEL = 10;

// Moon : la pierre pousse devant le serpent, mais jamais sous ses pattes. A VITESSE cases par
// seconde, il franchit ALERTE*VITESSE cases pendant la sortie : toute case plus proche que ca,
// dans son couloir, serait traversee avant que la pierre existe, et l'animation ne servirait a
// rien. On la place donc largement devant, ou sur le flanc, et jamais dans cette zone morte.
export const PORTEE = () => VITESSE * (ALERTE + 0.25);

// Une manche commence par une naissance : une coquille blanche se pose au centre du plateau,
// elle se fend, elle eclate, et le serpent en sort. Tant qu'elle est la, rien ne bouge.
export const ECLOSION = 1.4,
  SORTIE = 0.6,
  TRAINE = 0.55;

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
export const FLAIR_DUEL = { or: 0.3, ombre: 0.3 };

// chasse : gout du piege (l'IA referme la poche adverse avec son corps)
export const CHASSE_DUEL = { or: 0.7, ombre: 0.7 };
