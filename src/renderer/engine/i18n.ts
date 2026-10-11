// On-stream text translations. Only text drawn on the game canvas (visible to viewers) is
// translated here; the control room UI stays in English.
//
// Rules: every key in `fr` must also exist in `en` (enforced by the `Translations` type).
// `tr(key, vars?)` replaces `{name}`, `{n}`, `{q}` from vars when provided.
// Call `setLanguage` whenever the game setting changes; defaults to 'en'.

// All translatable keys, values are the English strings.
const en = {
  // Banner phrases
  'join.0': "Welcome {name}, glad you're here!",
  'join.1': 'Hey {name}, good to see you!',
  'join.2': '{name} just joined us, say hi!',
  'share.0': 'Thanks for sharing the live, {name}!',
  'share.1': '{name} shared the live, thank you so much!',
  'follow.0': 'Thanks for the follow, {name}!',
  'follow.1': '{name} just followed, welcome aboard!',
  'like.0': '{name} dropped {n} likes, thank you!',
  'like.1': '{n} likes from {name}, love it!',
  'gift.0': '{name} {q}! What a play!',
  'gift.1': 'Big play: {name} {q}!',
  'gift.2': '{name} {q} for the team!',
  'first.0': '{name} enters the game and {q}! Welcome!',
  'first.1': 'First play by {name}: {q}!',
  'tier.0': "We're {n} here now, welcome everyone!",
  'tier.1': "{n} of us watching, you're amazing!",
  'streak.0': '{n} wins in a row! Who can stop them?',
  'streak.1': "That's {n} in a row, unstoppable!",
  'rescue.0': "{name}'s {q} just saved the day!",
  'rescue.1': "What a save! {name}'s {q} kept them alive.",
  'rescueWithout.0': 'A {q} just saved the day!',
  'rescueWithout.1': 'What a save, that {q} kept them alive!',
  // Effect actions (banner copy)
  'effect.berry': 'drops a berry',
  'effect.speed': 'fires a speed boost',
  'effect.steal': 'pulls off a steal',
  'effect.shield': 'raises a shield',
  'effect.life': 'grants an extra life',
  // Rescue substitution values
  'rescue.extra life': 'extra life',
  'rescue.shield': 'shield',
  // Gift panel effect labels
  'label.BERRY': 'BERRY',
  'label.SPEED': 'SPEED',
  'label.STEAL': 'STEAL',
  'label.SHIELD': 'SHIELD',
  'label.LIFE': 'LIFE',
  // Crowd energy
  'energy.badge.tap': 'TAP TAP',
  'energy.badge.frenzy': 'FRENZY!',
  // Like milestones
  'milestones.likes': 'LIKES',
  'milestones.thanks': 'THANK YOU!',
  // Frenzy announcement
  'frenzy.text': 'Your likes wake the forest: berries for both!',
  // Team names (used in banner copy, not as visual labels)
  'team.gold': 'Or',
  'team.shadow': 'Ombre',
  // End-screen ranking titles
  'ranking.top': 'TOP SUPPORTERS',
  'ranking.mvp': 'MVP OF THE ROUND',
  // End-screen name fallback
  'ranking.supporter': 'top supporter',
  // Ranking row: hidden name fallback (rank number substituted for {n})
  'ranking.supporter.n': 'supporter {n}',
  // Total coins label in MVP card
  'ranking.coins': 'coins',
  // Feed the Snake
  'feed.ready': 'GET READY',
  'feed.go': 'GO!',
  'feed.filled': 'BOARD FILLED!',
  'feed.next': '{n} berries eaten · next round in {q}s',
  'feed.likeChampion': 'LIKE CHAMPION',
  'feed.likes': '{n} likes',
  'feed.topSupporters': 'TOP SUPPORTERS',
  'feed.finalRanking': 'FINAL RANKING',
  'feed.topLikes': 'TOP LIKES',
  'feed.thisRound': 'THIS ROUND',
  'feed.allTime': 'HALL OF FAME',
  'feed.coins': 'coins',
  'feed.likesUnit': 'likes',
  'feed.nobody': 'nobody yet',
  'feed.berry': 'BERRY',
  'feed.berries': 'BERRIES',
  'feed.today': '{q} · {n}+ TODAY',
  'feed.title.1': 'SPROUT',
  'feed.title.30': 'SEED SOWER',
  'feed.title.100': 'BERRY KEEPER',
  'feed.title.300': 'FOREST GUARDIAN',
  'feed.title.1000': 'ANCIENT OAK',
  'feed.carried': 'FROM LAST ROUND',
  'feed.carriedNext': '{n} berries carry over to the next round',
  'arena.over': "TIME'S UP!",
  'arena.won': '{name} SURVIVED',
  'arena.wild': 'THE WILD ONE',
  'arena.qualifying': 'QUALIFYING',
  'kill.0': '{name} was eliminated',
  'kill.by': '{name} was eliminated by {q}',
  'welcome.new': 'First time here, welcome {name}!',
  'welcome.back': 'Welcome back, {name}!',
  'welcome.supporter': 'Supporter {name} is back!',
  'welcome.top': 'Top supporter #{n} {name} is back!',
  'welcome.mod': 'Moderator {name} is back!',
} as const;

// The `fr` object must have exactly the same keys as `en`.
type Translations = { readonly [K in keyof typeof en]: string };

const fr: Translations = {
  // Banner phrases
  'join.0': 'Bienvenue {name}, ravi de te voir !',
  'join.1': 'Hey {name}, on est ravis !',
  'join.2': '{name} vient de rejoindre, dites bonjour !',
  'share.0': 'Merci pour le partage, {name} !',
  'share.1': '{name} a partagé le live, merci beaucoup !',
  'follow.0': 'Merci pour le suivi, {name} !',
  'follow.1': '{name} vient de suivre, bienvenue !',
  'like.0': '{name} a mis {n} likes, merci !',
  'like.1': '{n} likes de {name}, trop fort !',
  'gift.0': '{name} {q} ! Quel coup !',
  'gift.1': 'Grand coup : {name} {q} !',
  'gift.2': '{name} {q} pour son équipe !',
  'first.0': '{name} entre en jeu et {q} ! Bienvenue !',
  'first.1': 'Premier coup de {name} : {q} !',
  'tier.0': 'On est {n} ici, bienvenue à tous !',
  'tier.1': "{n} d'entre vous regardent, vous êtes incroyables !",
  'streak.0': '{n} victoires de suite ! Qui peut les arrêter ?',
  'streak.1': '{n} de suite, inarrêtables !',
  'rescue.0': 'Le {q} de {name} a tout sauvé !',
  'rescue.1': 'Quel sauvetage ! Le {q} de {name} les a gardés en vie.',
  'rescueWithout.0': 'Un {q} vient de tout sauver !',
  'rescueWithout.1': 'Quel sauvetage, ce {q} les a gardés en vie !',
  // Effect actions (banner copy)
  'effect.berry': 'pose une baie',
  'effect.speed': 'déclenche un boost de vitesse',
  'effect.steal': 'réussit un vol',
  'effect.shield': 'active un bouclier',
  'effect.life': 'offre une vie supplémentaire',
  // Rescue substitution values
  'rescue.extra life': 'vie supplémentaire',
  'rescue.shield': 'bouclier',
  // Gift panel effect labels
  'label.BERRY': 'BAIE',
  'label.SPEED': 'VITESSE',
  'label.STEAL': 'VOL',
  'label.SHIELD': 'BOUCLIER',
  'label.LIFE': 'VIE',
  // Crowd energy
  'energy.badge.tap': 'TAP TAP',
  'energy.badge.frenzy': 'FOLIE !',
  // Like milestones
  'milestones.likes': 'LIKES',
  'milestones.thanks': 'MERCI !',
  // Frenzy announcement
  'frenzy.text': 'Vos likes réveillent la forêt : des baies pour tous !',
  // Team names (used in banner copy)
  'team.gold': 'Or',
  'team.shadow': 'Ombre',
  // End-screen ranking titles
  'ranking.top': 'TOP SUPPORTERS',
  'ranking.mvp': 'MVP DU ROUND',
  // End-screen name fallback
  'ranking.supporter': 'top supporter',
  // Ranking row: hidden name fallback (rank number substituted for {n})
  'ranking.supporter.n': 'supporter {n}',
  // Total coins label in MVP card
  'ranking.coins': 'pièces',
  // Feed the Snake
  'feed.ready': 'PRÊTS ?',
  'feed.go': 'GO !',
  'feed.filled': 'PLATEAU REMPLI !',
  'feed.next': '{n} baies mangées · manche suivante dans {q} s',
  'feed.likeChampion': 'ROI DES LIKES',
  'feed.likes': '{n} likes',
  'feed.topSupporters': 'TOP DONATEURS',
  'feed.finalRanking': 'CLASSEMENT FINAL',
  'feed.topLikes': 'TOP LIKES',
  'feed.thisRound': 'CETTE MANCHE',
  'feed.allTime': 'LÉGENDES DU LIVE',
  'feed.coins': 'pièces',
  'feed.likesUnit': 'likes',
  'feed.nobody': 'personne encore',
  'feed.berry': 'BAIE',
  'feed.berries': 'BAIES',
  'feed.today': "{q} · {n}+ AUJOURD'HUI",
  'feed.title.1': 'POUSSE',
  'feed.title.30': 'SEMEUR',
  'feed.title.100': 'GARDIEN DES BAIES',
  'feed.title.300': 'GARDIEN DE LA FORÊT',
  'feed.title.1000': 'CHÊNE ANCESTRAL',
  'feed.carried': 'MANCHE PRÉCÉDENTE',
  'feed.carriedNext': '{n} baies reportées à la manche suivante',
  'arena.over': 'TEMPS ÉCOULÉ !',
  'arena.won': '{name} A SURVÉCU',
  'arena.wild': 'LE SAUVAGE',
  'arena.qualifying': 'QUALIFICATIONS',
  'kill.0': '{name} a été éliminé',
  'kill.by': '{name} a été éliminé par {q}',
  'welcome.new': 'Premier live ici, bienvenue {name} !',
  'welcome.back': 'Content de te revoir, {name} !',
  'welcome.supporter': 'Le soutien {name} est de retour !',
  'welcome.top': 'Top soutien n°{n} {name} est de retour !',
  'welcome.mod': 'Le modo {name} est de retour !',
};

export type I18nKey = keyof typeof en;

const DICTS: Record<'en' | 'fr', Translations> = { en, fr };

/** Active locale; updated by setLanguage when the control room changes the game setting. */
let activeLang: 'en' | 'fr' = 'en';

/** Sets the active locale. Call this whenever settings.language changes. */
export function setLanguage(lang: 'en' | 'fr'): void {
  activeLang = lang;
}

/**
 * Translates a key to the active game language. Substitutes `{name}`, `{n}`, `{q}` from vars.
 */
export function tr(
  key: I18nKey,
  vars?: { name?: string; n?: number | string; q?: string },
): string {
  const dict = DICTS[activeLang];
  let text: string = dict[key];
  if (vars) {
    if (vars.name !== undefined) text = text.replace('{name}', vars.name);
    if (vars.n !== undefined) text = text.replace('{n}', String(vars.n));
    if (vars.q !== undefined) text = text.replace('{q}', vars.q);
  }
  return text;
}

/**
 * Formats a number according to the active locale ('fr' uses thin space as thousands separator).
 */
export function trNum(n: number): string {
  return n.toLocaleString(activeLang === 'fr' ? 'fr-FR' : 'en-US');
}
