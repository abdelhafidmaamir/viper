// Team and effect colours shared by every painter.

import { duel } from '../scripts/game.js';

export const OR = '#F2C57C';

// Duel : la nourriture ne peut pas etre or (couleur du camp Or) : vert tendre, distinct des deux
// camps et du fond de foret (Abdel, 2026-09-18). En base elle reste or.
export const BAIE_VERT = '#9BE28A',
  BAIE_VERT_A = (a) => 'rgba(155,226,138,' + a + ')';

export const teinteBaie = (camp) =>
  camp === 'or' ? OR : camp === 'ombre' ? OMBRE : duel() ? BAIE_VERT : OR;

export const lueurBaie = (a, camp) =>
  camp === 'or'
    ? 'rgba(242,197,124,' + a + ')'
    : camp === 'ombre'
      ? 'rgba(180,212,222,' + a + ')'
      : duel()
        ? BAIE_VERT_A(a)
        : 'rgba(242,197,124,' + a + ')';

export const OMBRE = '#b4d4de';

export const BLEU = '#8FA8D8',
  ROUGE = '#D64A42',
  COQUILLE = '#F6F3EA';
