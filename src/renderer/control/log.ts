/** The event log: a capped, chronological list of what happened, from every source. */

export type LogSource = 'cmd' | 'bridge' | 'crowd' | 'link';
export type LogLevel = 'info' | 'warn' | 'error';
export type LogFilter = 'all' | 'bridge' | 'cmd' | 'crowd' | 'errors';

export interface LogEntry {
  readonly id: number;
  readonly at: number;
  readonly source: LogSource;
  readonly level: LogLevel;
  readonly text: string;
  /** Errors stay pinned above the list until dismissed. */
  readonly dismissed: boolean;
}

export interface LogState {
  readonly entries: readonly LogEntry[];
  readonly nextId: number;
}

export const LOG_CAP = 500;

export const EMPTY_LOG: LogState = { entries: [], nextId: 1 };

export interface LogInput {
  readonly source: LogSource;
  readonly level: LogLevel;
  readonly text: string;
}

export function append(log: LogState, at: number, inputs: readonly LogInput[]): LogState {
  if (inputs.length === 0) return log;
  let nextId = log.nextId;
  const added = inputs.map((input) => ({ ...input, at, id: nextId++, dismissed: false }));
  const entries = [...log.entries, ...added];
  return { entries: entries.length > LOG_CAP ? entries.slice(-LOG_CAP) : entries, nextId };
}

export function dismiss(log: LogState, id: number): LogState {
  return {
    ...log,
    entries: log.entries.map((entry) => (entry.id === id ? { ...entry, dismissed: true } : entry)),
  };
}

/**
 * Lines the crowd brain added since its previous view. The brain keeps its last six decisions,
 * newest first; returns the new ones oldest first.
 */
export function newCrowdLines(previous: readonly string[], current: readonly string[]): string[] {
  const head = previous[0];
  const seen = head === undefined ? -1 : current.indexOf(head);
  const fresh = seen === -1 ? current : current.slice(0, seen);
  return [...fresh].reverse();
}
