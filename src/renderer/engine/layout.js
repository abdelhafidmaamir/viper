// Frame geometry: the 1080x1920 reference frame, the 16x20 grid, the TikTok LIVE safe zones and
// the anchors that move with the 9:16 / 16:9 format. Every binding here is written only by
// changerFormat; other modules read them as live bindings.

export let W = 1080,
  H = 1920;
export const COLS = 16,
  ROWS = 20;
// Zone sure du LIVE, corrigee par Abdel : un LIVE n'a PAS la colonne de boutons like, partage
// et commentaire du feed video, donc les cotes sont libres. Ce qui recouvre vraiment : l'overlay
// du haut (badge LIVE, pseudo, spectateurs) et tout le bas (fil de commentaires a gauche,
// barre de saisie et bouton cadeau). Un gros cadeau s'anime par dessus tout, on ne peut rien y faire.
// Zones MESUREES sur une capture d'un vrai live envoyee par Abdel le 2026-09-18, en fraction de
// la hauteur d'ecran, reportees sur 1080x1920. On ne retient que le chrome TikTok : la cam et le
// jeu de ce streamer relevaient de SON arrangement, pas de l'interface (consigne d'Abdel).
// Haut 0-260, fil de commentaires a partir de 1237 : la hauteur sure vaut 977 et non 1130.
export let SR_X = 0,
  SR_Y = 260,
  SR_W = 1080,
  SR_H = 977;
// Les autres zones du chrome, pour l'overlay de reperes et la maquette.
export const Z_GIFTS = { x: 702, y: 392, w: 340, h: 343 }; // colonne de widgets cadeaux, a droite
export const Z_BANNER = { x: 45, y: 1133, w: 595, h: 98 }; // banniere « untel a offert x15 »
export const Z_COMMENTS = { x: 0, y: 1237, w: 780, h: 478 }; // fil de commentaires
export const Z_INPUT = { x: 0, y: 1751, w: 1080, h: 98 }; // barre de saisie et boutons
// Le plateau tient dans la hauteur sure REELLE. 20 lignes de 47 plus l'anneau font 968 px pour
// 977 disponibles ; a 52 il en fallait 1068 et les 91 px du haut passaient sous la barre de
// l'hote en live. Les 16x20 cases sont conservees a l'identique, donc aucune regle, aucune
// trajectoire et aucun equilibrage ne bouge : c'est un changement d'echelle, pas de plateau.
export const CELL = 47;
export let X0 = 164,
  Y0 = 278;
// Format d'image (Abdel 2026-09-23) : 'vertical' 9:16 (TikTok) ou 'horizontal' 16:9 (YouTube). Le plateau garde
// sa grille et ses 47 px par case dans les deux formats : seuls son origine et les ancrages du HUD changent.
// En horizontal, le HUD migre dans les flancs : tout ce qui est Or a gauche, tout ce qui est Ombre a droite.
const FORMATS = {
  portrait: {
    ox: 0,
    WF: 1080,
    W: 1080,
    H: 1920,
    X0: 164,
    Y0: 278,
    scCy: 1276,
    bdCx: 540,
    bdW: 600,
    bdCy: 154,
    legY: 1372,
    legCxG: 320,
    legCxD: 760,
    scrollRowY: 1330,
    scrollLeftX: 528,
    scrollRightX: 794,
    baseEnd: 1206,
    srY: 260,
    srH: 977,
  },
  // horizontal (Abdel 2026-09-23 : « just want the black space to be filled ») : la composition verticale est
  // dessinee TELLE QUELLE au centre d'un cadre 16:9 (3414 x 1920), seule l'ambiance continue dans les cotes.
  landscape: {
    ox: 1167,
    WF: 3414,
    W: 1080,
    H: 1920,
    X0: 164,
    Y0: 278,
    scCy: 1276,
    bdCx: 540,
    bdW: 600,
    bdCy: 154,
    legY: 1372,
    legCxG: 320,
    legCxD: 760,
    scrollRowY: 1330,
    scrollLeftX: 528,
    scrollRightX: 794,
    baseEnd: 1206,
    srY: 260,
    srH: 977,
  },
};
export let L = FORMATS.portrait,
  OX = 0,
  WF = 1080; // OX : marge gauche du cadre, WF : largeur totale du cadre

export let SC_CY = 1276; // ligne centrale de la barre, avec un peu d'air sous l'anneau
export let BD_W = 600,
  BD_CY = 154,
  BD_CX = 540; // Abdel : P1 retenu, « a little higher », loin du chrono

/** Applies a format. Returns false when it is already active, so callers can skip re-layout. */
export function setFormat(format) {
  const f = FORMATS[format] || FORMATS.portrait;
  if (L === f) return false;
  L = f;
  OX = f.ox;
  WF = f.WF;
  W = f.W;
  H = f.H;
  X0 = f.X0;
  Y0 = f.Y0;
  SC_CY = f.scCy;
  BD_CX = f.bdCx;
  BD_W = f.bdW;
  BD_CY = f.bdCy;
  SR_W = f.W;
  SR_Y = f.srY;
  SR_H = f.srH;
  return true;
}
