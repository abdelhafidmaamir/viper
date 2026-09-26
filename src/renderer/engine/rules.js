// Game rules: board speed, hazard timings, crowd tiers, gift prices and durations, and the fixed
// temperament both AIs share. The bench API retunes tier fields in place.

export const SPEED = 7;

export const SEED_GROW_TIME = 1;

// duel : alterne quel serpent est resolu en premier a chaque tick (equite)
// 1,3 s : sous une seconde la pierre "pop" au lieu de pousser, au-dela de 1,5 s le serpent, a
// 7 cases par seconde sur un plateau de 16, a deja traverse toute case qu'on pourrait viser.
export const STONE_WARNING = 1.3,
  STONE_LIFE = 45;

// La ronce : le second bloqueur. La pierre est minerale, ponctuelle, sortie d'un coup ; la ronce
// rampe et ferme une voie entiere. Elle s'annonce plus vite par segment (0,8 s) mais elle met
// RONCE_PAS*RONCE_MAX a se deployer, et elle vit moins longtemps parce qu'elle prend plus de place.
export const BRAMBLE_WARNING = 0.8,
  BRAMBLE_STEP = 0.75,
  BRAMBLE_MAX_SEGMENTS = 4,
  BRAMBLE_LIFE = 20;

// Quatre paliers d'affluence : le jeu se tient aussi bien salle vide qu'en pleine rue.
// cadence = evenements par minute, lissee. Chaque palier change le ravitaillement, la cible et les plafonds.
// cielSun : baies a manger pour que le soleil atteigne le haut. cielMoon : rochers poses pour la lune.
export const TIERS = [
  {
    id: 'empty',
    min: 0,
    hit: 0.5,
    wild: 10,
    target: 27,
    skySun: 27,
    skyMoon: 13,
    maxBerries: 3,
    maxStones: 4,
    perBerry: 1,
    perStone: 1,
    nature: 26,
    maxLength: 34,
  },
  {
    id: 'quiet',
    min: 6,
    hit: 0.34,
    wild: 22,
    target: 48,
    skySun: 48,
    skyMoon: 14,
    maxBerries: 3,
    maxStones: 5,
    perBerry: 2,
    perStone: 1,
    nature: 40,
    maxLength: 52,
  },
  {
    id: 'busy',
    min: 60,
    hit: 0.12,
    wild: 0,
    target: 108,
    skySun: 108,
    skyMoon: 10,
    maxBerries: 4,
    maxStones: 4,
    perBerry: 6,
    perStone: 2,
    nature: 0,
    maxLength: 80,
  },
  {
    id: 'crowd',
    min: 250,
    hit: 0.018,
    wild: 0,
    target: 120,
    skySun: 120,
    skyMoon: 16,
    maxBerries: 5,
    maxStones: 5,
    perBerry: 20,
    perStone: 6,
    nature: 0,
    maxLength: 120,
  },
];

// Economie calquee sur un vrai live : la rose est le cadeau dominant et joue CONTRE le serpent,
// Le like, le commentaire et le partage sont sans effet (Abdel, 2026-09-19 : la poussee par likes est retiree).
// La seule poussee de vitesse est le cadeau tempo (SURGE_FACT pendant TEMPO_DUR).
// Abdel, 2026-09-19 : « the actual speed boost value, tone it down a little » (etait 1,5)
export const BOOST_FACTOR = 1.2;

// duel : secondes (x0.6 a 1.4) entre deux baies vertes neutres quand le plateau est vide, ralenti par l'affluence
export const FOREST_BERRY_INTERVAL = 8;

// don 10-29 coins : 10 s de poussee de tempo payee, au-dela du plafond des likes
export const BOOST_COST = 10,
  BOOST_DURATION = 10;

// coupe duel (Abdel : « cut at 15% for 30 ») : le don enleve 15 % de la longueur adverse, 1 anneau minimum
export const CUT_COST = 20,
  CUT_FRACTION = 0.15;
export const cutLength = (L) => Math.max(1, Math.round(L * CUT_FRACTION));

// dons duel : bouclier a 50 = 15 s d'immunite, cumulables sans plafond, vie a 100, sans plafond (Abdel : « no cap »)
export const SHIELD_COST = 30,
  LIFE_COST = 100,
  SHIELD_DURATION = 15;

// longueur cible pour l'anneau duel (TEST equilibre 2026-09-18 : 60 -> 40, revert si ca ne marche pas)
export const TARGET_LENGTH = 40;

// sous cette longueur, le demi-anneau vire au rouge : moment 'vie'
export const REPRIEVE_LENGTH = 5;

// duel : naissance a 5 anneaux ; un serpent jeune peut etre coupe jusqu'a 1 anneau, jamais tue (Abdel)
export const START_LENGTH = 5,
  YOUNG_MIN_LENGTH = 2;

// un serpent qui n'a jamais atteint 10 anneaux est 'jeune' : une coupe ne le descend jamais sous 3 et il n'est pas en sursis (pas de piege au depart)
export const ADULT_LENGTH = 10;

// Moon : la pierre pousse devant le serpent, mais jamais sous ses pattes. A VITESSE cases par
// seconde, il franchit ALERTE*VITESSE cases pendant la sortie : toute case plus proche que ca,
// dans son couloir, serait traversee avant que la pierre existe, et l'animation ne servirait a
// rien. On la place donc largement devant, ou sur le flanc, et jamais dans cette zone morte.
export const STONE_CLEARANCE = () => SPEED * (STONE_WARNING + 0.25); // ce que le serpent avale pendant la pousse, avec marge

// Une manche commence par une naissance : une coquille blanche se pose au centre du plateau,
// elle se fend, elle eclate, et le serpent en sort. Tant qu'elle est la, rien ne bouge.
export const HATCH_TIME = 1.4,
  EMERGE_TIME = 0.6,
  TRAIL_TIME = 0.55;

// flair : part de joueur presse dans l'IA (0 = IA prudente du mode base). Deux valeurs differentes
// en duel, sinon les deux serpents jouent en miroir (Abdel, 2026-09-18).
// EGALITE STRICTE (Abdel, 2026-09-18 : « without viewer interaction they are on the same playing
// field 50/50 chances »). Les deux camps recoivent EXACTEMENT les memes valeurs. Mesure qui a
// impose ce choix : en inversant les leviers, l'avantage suivait le caractere (le camp qui recoit
// flair 0,4 / chasse 0,9 tombe de 53 % a 47 %), donc toute difference de levier est un handicap
// de camp. Les serpents ne jouent pas en miroir pour autant : `flair` et `chasse` tirent au sort
// (ia-humain.js:124 et 306), donc a parametres egaux les deux trajectoires divergent quand meme.
export const FLAIR_BY_TEAM = { gold: 0.3, shadow: 0.3 };

// chasse : gout du piege (l'IA referme la poche adverse avec son corps)
export const HUNT_BY_TEAM = { gold: 0.7, shadow: 0.7 };
