/**
 * Globals the legacy renderer scripts publish on `window`, and the slice of them that typed code
 * relies on. Names stay French until the engine is migrated (docs/roadmap.md); this file is the
 * single place that knows them.
 */

type Team = 'or' | 'ombre';

interface GameSettings {
  mode: 'base' | 'duel';
  format: 'vertical' | 'horizontal';
  affichageCadeaux: 'defile' | 'complet' | 'aucun';
  defileVisi: number;
  defileCache: number;
  plateforme: 'tiktok' | 'neutre';
  meteo: string;
  heure: number;
  cycle: number;
  ambianceAuto: boolean;
  dureeDuel: number;
  avantage: number;
  underdog: boolean;
  superIA: boolean;
  debugIA: boolean;
  fluide: boolean;
  nomsDonateurs: boolean;
  retourCadeau: string;
  bandeau: string;
  classement: string;
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
  lancerScene(name: string, seconds: number): void;
  stopScene(): void;
  scene(): unknown;
  finirTest?(team: Team): void;
  mesures(): GameMetrics;
  duel(): DuelSnapshot | null;
}

interface AudienceEvent {
  type: 'cadeau' | 'like' | 'partage' | 'arrivee' | 'abonne' | 'commentaire' | 'spectateurs';
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

interface TikFinityBridge {
  demarrer(url?: string): void;
  arreter(): void;
  traiter(message: unknown): void;
  etat(): unknown;
}

interface Window {
  VipereBase: GameApi;
  VipereFoule: { creer(): SimulatedCrowd; lireEtat(game: GameApi): unknown };
  PontTikFinity: TikFinityBridge;
  recevoirEvenement(event: AudienceEvent): number;
}
