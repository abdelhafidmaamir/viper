// Team and effect colours shared by every painter.

export const GOLD = '#F2C57C';

// Duel : la nourriture ne peut pas etre or (couleur du camp Or) : vert tendre, distinct des deux
// camps et du fond de foret (Abdel, 2026-09-18). En base elle reste or.
const BERRY_GREEN = '#9BE28A',
  BERRY_GREEN_ALPHA = (a) => 'rgba(155,226,138,' + a + ')';

export const berryTint = (team) =>
  team === 'gold' ? GOLD : team === 'shadow' ? SHADOW : BERRY_GREEN;

export const berryGlow = (a, team) =>
  team === 'gold'
    ? 'rgba(242,197,124,' + a + ')'
    : team === 'shadow'
      ? 'rgba(180,212,222,' + a + ')'
      : BERRY_GREEN_ALPHA(a);

export const SHADOW = '#b4d4de'; // couleur du second serpent (a verifier au contraste)

export const BLUE = '#8FA8D8',
  RED = '#D64A42',
  SHELL = '#F6F3EA';
