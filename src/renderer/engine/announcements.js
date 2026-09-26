// On-stream announcements: the banner that credits viewers for their plays, the phrasing it
// uses (no mention of gifts or prices, per TikTok LIVE guidelines) and viewer avatars.

import { paintEffectGlyph } from './gift-panel.js';
import { BD_CX, BD_CY, BD_W, CELL, W } from './layout.js';
import { paintSnakeGlyph } from './scoreboard.js';
import { ctx } from './canvas.js';
import { SHADOW, GOLD } from './palette.js';
import { pointRail } from './frame.js';
import { getAmbience, bodies, round, settings, t } from '../scripts/game.js';

// ===== Bandeau d'activite, haut-centre (prototype, Abdel 2026-09-21 : « welcome people, thanks donations,
// like and share, with a cute animation of the snake », puis « more polished »). Une annonce a la fois,
// les cadeaux passent devant. Meme plaque que les lignes de la legende, et le VRAI rendu du serpent en
// petit. Masque pendant la tenue de l'anneau (le compte a rebours occupe la meme place). Rendu seul.
let announcements = [],
  currentAnnouncement = null;
// Likes counted per viewer, announced every tenth one.
export const likesByViewer = {};

// memoire du LIVE (pas de la manche) : paliers de spectateurs deja salues, premiers cadeaux, serie de victoires,
// et dons de la manche en cours par spectateur (pour le classement de fin de manche).
export const VIEWER_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export let seenThresholds = {},
  alreadyDonated = {},
  streakTeam = null,
  streakCount = 0,
  roundDonations = {},
  rescueTime = [-9, -9];

export function teamName(c) {
  return c === 'gold' ? 'Or' : 'Ombre';
}

// Les mots du bandeau (Abdel, 2026-09-21 : « more natural and user friendly, not like a bot, a bit more warm »).
// Plusieurs tournures par evenement, tirees au sort sans jamais redire la meme deux fois de suite.
// De vraies phrases, comme un hote qui parle, avec le NOM du spectateur dedans (Abdel : « not human speech
// readable », « their name is not visible »). {nom} est mis en valeur au rendu ; {c} camp, {a} camp adverse.
// Plus AUCUNE notion de cadeau dans les annonces (Abdel, 2026-09-22 : « get rid of the notion of gift but
// still reward the viewer ») : le spectateur est celebre pour son ACTION dans le jeu. DONS = l'action
// accomplie, conjuguee, par effet (meme index que CADEAUX_DUEL).
export const EFFECT_ACTIONS = [
  'drops a berry',
  'fires a speed boost',
  'pulls off a steal',
  'raises a shield',
  'grants an extra life',
];

const PHRASES = {
  join: [
    "Welcome {nom}, glad you're here!",
    'Hey {nom}, good to see you!',
    '{nom} just joined us, say hi!',
  ],
  share: ['Thanks for sharing the live, {nom}!', '{nom} shared the live, thank you so much!'],
  follow: ['Thanks for the follow, {nom}!', '{nom} just followed, welcome aboard!'],
  like: ['{nom} dropped {n} likes, thank you!', '{n} likes from {nom}, love it!'],
  // Abdel : ne jamais ecrire « Or » ni « Ombre », la couleur de la plaque et du nom le dit deja
  gift: ['{nom} {q}! What a play!', 'Big play: {nom} {q}!', '{nom} {q} for the team!'],
  first: ['{nom} enters the game and {q}! Welcome!', 'First play by {nom}: {q}!'],
  tier: ["We're {n} here now, welcome everyone!", "{n} of us watching, you're amazing!"],
  streak: ['{n} wins in a row! Who can stop them?', "That's {n} in a row, unstoppable!"],
  rescue: ["{nom}'s {q} just saved the day!", "What a save! {nom}'s {q} kept them alive."],
  rescueWithout: ['A {q} just saved the day!', 'What a save, that {q} kept them alive!'],
};

const lastPhraseIdx = {};

export function phrase(key, v) {
  const l = PHRASES[key];
  let k = Math.floor(Math.random() * l.length);
  if (l.length > 1 && k === lastPhraseIdx[key]) k = (k + 1) % l.length;
  lastPhraseIdx[key] = k;
  return l[k]
    .replace('{n}', v && v.n !== undefined ? v.n : '')
    .replace('{c}', (v && v.c) || '')
    .replace('{a}', (v && v.a) || '')
    .replace('{q}', (v && v.q) || '');
}

export function announceRescue(i, effectType) {
  // un bouclier ou une vie offerts viennent d'eviter une perte
  if (t - rescueTime[i] < 4) return;
  rescueTime[i] = t;
  const team = i === 0 ? 'gold' : 'shadow',
    donor = bodies[i] && bodies[i][effectType === 'life' ? 'lifeBy' : 'shieldBy'];
  addAnnouncement({
    kind: 'rescue',
    nickname: donor || '',
    text: phrase(donor ? 'rescue' : 'rescueWithout', {
      c: teamName(team),
      q: effectType === 'life' ? 'extra life' : 'shield',
    }),
    avatar: bodies[i] && bodies[i][effectType === 'life' ? 'lifeAvatar' : 'shieldAvatar'],
    team: team,
    effect: effectType === 'life' ? 'LIFE' : 'SHIELD',
    ahead: true,
  });
}

const BANNER_DURATION = 3.8,
  BANNER_HEIGHT = 96;

// Serie de victoires d'un camp : annoncee a partir de la deuxieme manche gagnee d'affilee.
export function announceStreak(team) {
  if (streakTeam === team) streakCount++;
  else {
    streakTeam = team;
    streakCount = 1;
  }
  if (streakCount >= 2)
    addAnnouncement({
      kind: 'streak',
      nickname: '',
      text: phrase('streak', {
        c: teamName(team),
        a: teamName(team === 'gold' ? 'shadow' : 'gold'),
        n: streakCount,
      }),
      team: team,
      ahead: true,
    });
}

// Les dons se comptent par manche : le classement de fin repart de zero.
export function resetRoundDonations() {
  roundDonations = {};
}

export function addAnnouncement(a) {
  if (!settings.banner || settings.banner === 'none') return;
  if (a.kind === 'gift' || a.ahead) {
    let k = announcements.findIndex((q) => q.kind !== 'gift');
    if (k < 0) k = announcements.length;
    announcements.splice(k, 0, a);
  } else announcements.push(a);
  if (announcements.length > 6) announcements.length = 6;
}

// photos de profil des spectateurs (URL fournie par TikFinity) : cache borne, image prete ou rien
const photos = {};

let photoCount = 0;

export function getProfilePhoto(url) {
  if (!url || typeof url !== 'string' || !/^https?:/.test(url)) return null;
  let im = photos[url];
  if (!im) {
    if (photoCount > 80) {
      for (const k in photos) delete photos[k];
      photoCount = 0;
    }
    im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.src = url;
    photos[url] = im;
    photoCount++;
  }
  return im.complete && im.naturalWidth ? im : null;
}

export function paintMiniSnake(pts, tint, scale) {
  const a = getAmbience();
  if (!a || !a.paintSnake || pts.length < 2) return;
  ctx.save();
  ctx.scale(scale, scale);
  a.paintSnake(
    ctx,
    pts.map((p) => ({ x: p.x / scale, y: p.y / scale })),
    CELL,
    { tint: tint },
  );
  ctx.restore();
}

export function paintBanner() {
  const mode = settings.banner;
  if (!mode || mode === 'none' || !round) return;
  const holdActive = bodies.some((c) => c && (c.hold || 0) > 0 && round.state === 'playing');
  if (holdActive) {
    currentAnnouncement = null;
    return;
  }
  if (!currentAnnouncement && announcements.length) {
    currentAnnouncement = announcements.shift();
    currentAnnouncement.t0 = t;
  }
  const smooth = (v) => {
    v = Math.max(0, Math.min(1, v));
    return v * v * v * (v * (6 * v - 15) + 10);
  };
  if (currentAnnouncement && t - currentAnnouncement.t0 >= BANNER_DURATION)
    currentAnnouncement = null;
  const active = currentAnnouncement,
    age = active ? t - active.t0 : 0;
  const tint = active && active.team ? (active.team === 'gold' ? GOLD : SHADOW) : '#e8f1dc',
    rgb =
      active && active.team
        ? active.team === 'gold'
          ? '242,197,124'
          : '180,212,222'
        : '232,241,220';
  const entryFade = active ? smooth(age / 0.55) : 0,
    exitFade = active ? smooth((age - (BANNER_DURATION - 0.55)) / 0.55) : 0;
  const cx = BD_CX + (mode === 'P3' ? 34 : 0),
    x = cx - BD_W / 2,
    y = BD_CY - BANNER_HEIGHT / 2;
  // la plaque et son contenu ; reveal = part visible depuis la gauche (P2, P3), alpha global
  const drawPanel = (reveal, alpha, dy) => {
    if (alpha <= 0.01 || reveal <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, dy || 0);
    ctx.beginPath();
    ctx.rect(x - 4, y - 6, (BD_W + 8) * reveal, BANNER_HEIGHT + 12);
    ctx.clip();
    ctx.fillStyle = 'rgba(8,12,10,0.74)';
    ctx.beginPath();
    ctx.roundRect(x, y, BD_W, BANNER_HEIGHT, 24);
    ctx.fill();
    ctx.fillStyle = 'rgba(' + rgb + ',' + (0.1 * (1 - Math.min(1, age / 1.6))).toFixed(3) + ')';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.38)';
    ctx.stroke();
    const AV = 64,
      ax = x + 16 + AV / 2,
      pop =
        age < 0.9
          ? 1 + 0.14 * Math.sin(Math.min(1, Math.max(0, (age - 0.45) / 0.45)) * Math.PI)
          : 1;
    const showNames = settings.donorNames !== false,
      displayName = showNames && active.nickname ? active.nickname.slice(0, 18) : '',
      av = showNames ? getProfilePhoto(active.avatar) : null;
    // photo de profil du spectateur, ronde, cerclee de la couleur du camp ; sinon son initiale ; sinon le glyphe
    if (displayName) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, BD_CY, (AV / 2) * pop, 0, Math.PI * 2);
      ctx.closePath();
      if (av) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(av, ax - (AV / 2) * pop, BD_CY - (AV / 2) * pop, AV * pop, AV * pop);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(' + rgb + ',0.22)';
        ctx.fill();
        ctx.fillStyle = tint;
        ctx.font = '800 32px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          displayName
            .replace(/[^A-Za-z0-9]/g, '')
            .charAt(0)
            .toUpperCase() || '?',
          ax,
          BD_CY + 2,
        );
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
      ctx.beginPath();
      ctx.arc(ax, BD_CY, (AV / 2) * pop, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else paintSnakeGlyph(ax, BD_CY, 17 * pop, active.team ? tint : null);
    // a droite : le glyphe de l'EFFET du jeu (plus l'artwork du cadeau, notion de cadeau retiree)
    const IM = 60,
      aImg = !!active.effect;
    if (aImg) {
      ctx.save();
      ctx.translate(x + BD_W - 16 - IM / 2, BD_CY);
      ctx.scale(pop, pop);
      paintEffectGlyph(ctx, active.effect, 0, 0, 22, rgb);
      ctx.restore();
    }
    // la phrase : mots de couleur claire, le nom en gras dans la couleur du camp, deux lignes au plus
    const tx = ax + AV / 2 + 18,
      availableWidth = x + BD_W - (aImg ? IM + 30 : 22) - tx;
    const parts = String(active.text).split('{nom}'),
      textTokens = [];
    parts.forEach((m, k) => {
      if (k > 0) textTokens.push({ t: displayName || 'a viewer', strong: !!displayName });
      (m.match(/\S+|\s+/g) || []).forEach((q) => textTokens.push({ t: q, strong: false }));
    });
    const words = [];
    let cur = null;
    textTokens.forEach((q) => {
      if (!q.strong && /^\s+$/.test(q.t)) {
        cur = null;
        return;
      }
      if (!cur) {
        cur = [];
        words.push(cur);
      }
      cur.push(q);
    });
    let fontSize = 30,
      lines = [];
    for (; fontSize >= 19; fontSize--) {
      const fN = '500 ' + fontSize + 'px system-ui, sans-serif',
        fF = '800 ' + fontSize + 'px system-ui, sans-serif';
      ctx.font = fN;
      const spaceWidth = ctx.measureText(' ').width;
      words.forEach((w) => {
        w.l = 0;
        w.forEach((q) => {
          ctx.font = q.strong ? fF : fN;
          q.l = ctx.measureText(q.t).width;
          w.l += q.l;
        });
      });
      lines = [[]];
      let lx = 0;
      words.forEach((w) => {
        if (lx > 0 && lx + spaceWidth + w.l > availableWidth) {
          lines.push([]);
          lx = 0;
        }
        if (lx > 0) lx += spaceWidth;
        w.x = lx;
        lx += w.l;
        lines[lines.length - 1].push(w);
      });
      if (lines.length <= 2 && words.every((w) => w.l <= availableWidth)) break;
    }
    const lineHeight = fontSize * 1.22,
      y0 = BD_CY - ((lines.length - 1) * lineHeight) / 2 + 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.slice(0, 2).forEach((li, k) =>
      li.forEach((w) => {
        let wx = tx + w.x;
        w.forEach((q) => {
          ctx.font = (q.strong ? '800 ' : '500 ') + fontSize + 'px system-ui, sans-serif';
          ctx.fillStyle = q.strong ? (active.team ? tint : '#ffffff') : 'rgba(255,255,255,0.86)';
          ctx.fillText(q.t, wx, y0 + k * lineHeight);
          wx += q.l;
        });
      }),
    );
    ctx.restore();
  };
  if (mode === 'P1' && active) {
    // orbite : le serpent fait le tour de la plaque, se pose, puis repart en l'effacant
    drawPanel(1, entryFade * (1 - exitFade), (1 - entryFade) * 10);
    const m = 13,
      rx = x - m,
      ry = y - m,
      rw = BD_W + 2 * m,
      rh = BANNER_HEIGHT + 2 * m,
      rr = 24 + m,
      perimeter = 2 * (rw + rh) - 8 * rr + 2 * Math.PI * rr;
    const progress = smooth(age / 1.25),
      headPos =
        perimeter * 0.08 +
        progress * perimeter +
        Math.max(0, age - 1.25) * 22 +
        exitFade * perimeter * 0.55,
      snakeLength = Math.min(170, progress * perimeter) * (1 - exitFade * 0.4);
    const pts = [];
    for (let d = 0; d <= snakeLength; d += 7) {
      const s2 = (((headPos - d) % perimeter) + perimeter) % perimeter;
      pts.push(pointRail(rx, ry, rw, rh, rr, s2));
    }
    ctx.save();
    ctx.globalAlpha = 1 - exitFade;
    paintMiniSnake(pts, tint, 0.5);
    ctx.restore();
  }
  if (mode === 'P2' && active) {
    // porteur : le serpent traverse en ondulant et deroule la plaque derriere lui
    const hx = x - 60 + smooth(age / 1.1) * (BD_W + 140) + Math.max(0, age - 1.1) * 520;
    drawPanel(Math.max(0, Math.min(1, (hx - x - 10) / BD_W)), 1 - exitFade, -exitFade * 12);
    const pts = [];
    for (let i = 0; i < 26; i++) {
      const px2 = hx - i * 7;
      pts.push({ x: px2, y: BD_CY + Math.sin(px2 * 0.03) * 15 });
    }
    if (hx < W + 220) paintMiniSnake(pts, tint, 0.5);
  }
  if (mode === 'P3') {
    // mascotte : un petit serpent love, toujours la ; il se redresse et la plaque sort de lui
    const mx = cx - BD_W / 2 - 38,
      my = BD_CY + 6,
      raised = entryFade - exitFade,
      breathe = 1 + 0.03 * Math.sin(t * 2.2);
    if (active) drawPanel(entryFade, 1 - exitFade, 0);
    const pts = [
      { x: mx + 6 + raised * 10, y: my - 30 - raised * 16 - 2 * Math.sin(t * 2.2) },
      { x: mx + 2 + raised * 6, y: my - 22 - raised * 9 },
      { x: mx - 2, y: my - 14 },
    ];
    for (let i = 0; i <= 19; i++) {
      const ang = -Math.PI / 2 - i * 0.4,
        rad = (27 - i * 0.35) * breathe;
      pts.push({ x: mx + Math.cos(ang) * rad * 1.2, y: my + 4 + Math.sin(ang) * rad * 0.6 });
    }
    paintMiniSnake(pts, active ? tint : '#e8f1dc', 0.42);
  }
}
