/** View model of the event log column. */
import type { LogEntry, LogFilter, LogLevel, LogSource, LogState } from '../log.ts';

export interface LogRowVm {
  readonly id: number;
  readonly time: string;
  readonly source: LogSource;
  readonly tag: string;
  readonly level: LogLevel;
  readonly text: string;
}

export interface LogVm {
  /** The latest undismissed errors, at most `PINNED_MAX`. */
  readonly pinned: readonly LogRowVm[];
  readonly pinnedTotal: number;
  readonly rows: readonly LogRowVm[];
  readonly filter: LogFilter;
}

export const LOG_FILTERS: readonly { readonly value: LogFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'cmd', label: 'Commands' },
  { value: 'crowd', label: 'Crowd' },
  { value: 'errors', label: 'Errors' },
];

const TAGS: Readonly<Record<LogSource, string>> = {
  cmd: 'CMD',
  bridge: 'BRIDGE',
  crowd: 'CROWD',
  link: 'LINK',
};

/** Local wall-clock time, `hh:mm:ss`. */
export function formatTime(at: number): string {
  const date = new Date(at);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export function matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'errors':
      return entry.level === 'error';
    case 'bridge':
    case 'cmd':
    case 'crowd':
      return entry.source === filter;
  }
}

function row(entry: LogEntry): LogRowVm {
  return {
    id: entry.id,
    time: formatTime(entry.at),
    source: entry.source,
    tag: TAGS[entry.source],
    level: entry.level,
    text: entry.text,
  };
}

export const PINNED_MAX = 3;

export function logVm(log: LogState, filter: LogFilter): LogVm {
  const pinned = log.entries.filter((entry) => entry.level === 'error' && !entry.dismissed);
  return {
    pinned: pinned.slice(-PINNED_MAX).map(row),
    pinnedTotal: pinned.length,
    rows: log.entries.filter((entry) => matchesFilter(entry, filter)).map(row),
    filter,
  };
}
