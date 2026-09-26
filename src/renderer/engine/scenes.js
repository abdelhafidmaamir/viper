// Director scenes: short scripted situations the control room can trigger (face-off, chase, ballet,
// trap, race). A scene overrides AI levers while it runs and is invisible on the broadcast.

import { bodies } from '../scripts/game.js';

// Scène courante (super admin) : {nom, restant, ...params}. Chaque tick d'IA la lit ; à zéro,
// on rend la main à l'IA normale. Définies dans SCENES ci-dessous.
export let scene = null;

// Nettoyage complet en fin de scène (naturel ou bouton "Couper la scène") : la scène disparaît et
// tout effet qu'elle a pu poser sur les corps (invincibilité du ballet, mémoire IA de posture, de
// fatigue, d'attente) redevient normal. Les fruits, les rochers et le score restent, ils n'appartiennent
// pas à la scène. L'interrupteur underdog n'est pas touché, c'est un choix explicite séparé.
export function endScene() {
  scene = null;

  bodies.forEach((c) => {
    c.invincibleTime = 0; // ballet : invincibilité poussée à chaque tick, on la coupe net
    if (c.aiMemory) {
      c.aiMemory.stance = null; // la posture forcée s'oublie, elle sera recalculée
      c.aiMemory.activeStance = 'neutral';
      c.aiMemory.stanceTime = 0;
      c.aiMemory.attackTime = 0;
      c.aiMemory.fatigue = 0;
      c.aiMemory.reason = null;
    }
  });
}

/** Snapshot of the running scene for the control room, or null. */
export function sceneState() {
  return (
    scene && {
      name: scene.name,
      remaining: Math.max(0, scene.remaining),
      duration: SCENES[scene.name] && SCENES[scene.name].duration,
      gold: scene.gold || {},
      shadow: scene.shadow || {},
    }
  );
}

/** Starts a scene by name; an unknown name is ignored. */
export function launchScene(sceneName, duration) {
  const d = SCENES[sceneName];
  if (!d) return;
  scene = {
    name: sceneName,
    remaining: duration || d.duration,
    gold: d.gold || {},
    shadow: d.shadow || {},
  };
}

export const SCENES = {
  // Ballet (Abdel : « donner le show, ne pas tuer l'autre, chaque serpent doit avoir une sortie
  // s'il joue intelligemment, un 4D chess move »). Comme face à face, mais nePasTuer coupe la
  // fermeture décisive : la pression, l'usure et l'orbite restent. Un serpent peut toujours mourir
  // d'une faute (mur, ronce, son propre corps), pas d'un piège volontaire de l'autre.
  ballet: {
    duration: 20,
    gold: {
      stance: 'attack',
      pA: 20,
      pD: 20,
      hunt: 1,
      flair: 0.25,
      lure: true,
      noKill: true,
    },
    shadow: {
      stance: 'attack',
      pA: 20,
      pD: 20,
      hunt: 1,
      flair: 0.25,
      lure: true,
      noKill: true,
    },
  },
  race: {
    duration: 15,
    gold: { berryRace: true, pA: 12, pD: 10 },
    shadow: { berryRace: true, pA: 12, pD: 10 },
  },
  // Chasse unifiée (retour d'Abdel : « le mener à un mur, le pousser à l'erreur, l'encercler avec
  // son propre corps »). Un serpent va au contact, l'encercle et tente le piège même risqué ; l'autre
  // joue normalement, il ne sait pas qu'il est visé.
  huntGold: {
    duration: 12,
    gold: {
      stance: 'attack',
      pA: 20,
      pD: 20,
      hunt: 1,
      flair: 0.05,
      lure: true,
      immediateTrap: true,
      encircle: true,
    },
    shadow: {},
  },
  huntShadow: {
    duration: 12,
    gold: {},
    shadow: {
      stance: 'attack',
      pA: 20,
      pD: 20,
      hunt: 1,
      flair: 0.05,
      lure: true,
      immediateTrap: true,
      encircle: true,
    },
  },
};
