// Director scenes: short scripted situations the control room can trigger (face-off, chase, ballet,
// trap, race). A scene overrides AI levers while it runs and is invisible on the broadcast.

import { bodies } from '../scripts/game.js';

// Active scene: {name, remaining, ...params}. Each AI tick reads it; at zero, normal AI resumes.
// Defined in SCENES below.
export let scene = null;

// Full cleanup at scene end (natural or "Cut scene" button): the scene clears and all effects it
// placed on bodies (ballet invincibility, AI memory of stance, fatigue, wait) return to normal.
// Fruits, stones and score remain; they do not belong to the scene. The underdog toggle is untouched;
// it is a separate explicit choice.
export function endScene() {
  scene = null;

  bodies.forEach((c) => {
    c.invincibleTime = 0; // ballet pushes invincibility every tick; cut it here
    if (c.aiMemory) {
      c.aiMemory.stance = null; // forced stance clears; it will be recalculated
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
  // Ballet: both snakes pressure each other without lethal traps. noKill suppresses the decisive
  // close; pressure, attrition and orbiting remain. A snake can still die by mistake (wall, bramble,
  // own body), never by a deliberate trap from the other.
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
  // Hunt: one snake pursues contact, encircles and attempts the trap even at risk; the other plays
  // normally, unaware it is targeted.
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
