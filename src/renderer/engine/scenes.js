// Director scenes: short scripted situations the control room can trigger (face-off, chase, ballet,
// trap, race). A scene overrides AI levers while it runs and is invisible on the broadcast.

import { corps } from '../scripts/game.js';

// Scène courante (super admin) : {nom, restant, ...params}. Chaque tick d'IA la lit ; à zéro,
// on rend la main à l'IA normale. Définies dans SCENES ci-dessous.
export let scene = null;

// Nettoyage complet en fin de scène (naturel ou bouton "Couper la scène") : la scène disparaît et
// tout effet qu'elle a pu poser sur les corps (invincibilité du ballet, mémoire IA de posture, de
// fatigue, d'attente) redevient normal. Les fruits, les rochers et le score restent, ils n'appartiennent
// pas à la scène. L'interrupteur underdog n'est pas touché, c'est un choix explicite séparé.
export function finirScene() {
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

/** Snapshot of the running scene for the control room, or null. */
export function etatScene() {
  return (
    scene && {
      nom: scene.nom,
      restant: Math.max(0, scene.restant),
      duree: SCENES[scene.nom] && SCENES[scene.nom].duree,
      or: scene.or || {},
      ombre: scene.ombre || {},
    }
  );
}

/** Starts a scene by name; an unknown name is ignored. */
export function lancerScene(nom, duree) {
  const d = SCENES[nom];
  if (!d) return;
  scene = { nom, restant: duree || d.duree, or: d.or || {}, ombre: d.ombre || {} };
}

export const SCENES = {
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
