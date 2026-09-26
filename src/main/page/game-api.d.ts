/**
 * The slice of the renderer's global API that the main process drives from page context.
 *
 * The renderer still exposes French names (see docs/roadmap.md, step 4). This declaration is the
 * single place that knows them; it shrinks to `window.viper` once the renderer is migrated.
 */

type Team = 'or' | 'ombre';

interface GameSettings {
  mode: 'base' | 'duel';
  format: 'vertical' | 'horizontal';
  affichageCadeaux: 'defile' | 'complet' | 'aucun';
  plateforme: 'tiktok' | 'neutre';
  meteo: string;
  ambianceAuto: boolean;
  dureeDuel: number;
  defileCache: number;
  cycle: number;
}

interface GameMetrics {
  erreurs: number;
  derniereErreur: string | null;
  t: number;
}

interface DuelSnapshot {
  t: number;
  vainqueur: Team | 'nul' | null;
  or?: { longueur: number };
  ombre?: { longueur: number };
}

interface GameApi {
  reglages: GameSettings;
  nouvelleManche(): void;
  reglerHeure(hour: number): void;
  finirTest?(team: Team): void;
  mesures(): GameMetrics;
  duel(): DuelSnapshot | null;
}

interface AudienceEvent {
  type: 'cadeau' | 'like' | 'partage' | 'arrivee' | 'abonne' | 'commentaire';
  n?: number;
  valeur?: number;
  nom?: string;
  camp?: Team;
  pseudo?: string;
}

interface SimulatedCrowd {
  regler(level: number): void;
  tick(state: unknown, dt: number): AudienceEvent[];
}

interface Window {
  VipereBase: GameApi;
  VipereFoule: { creer(): SimulatedCrowd; lireEtat(game: GameApi): unknown };
  recevoirEvenement(event: AudienceEvent): number;
}
