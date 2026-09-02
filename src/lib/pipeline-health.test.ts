import { describe, it, expect } from 'vitest';
import {
  evaluateFeed,
  isAlarming,
  evaluateVolume,
  feedAlarms,
  median,
  EXPECTED_FEEDS,
  VOLUME_MIN_REFERENCE,
  type FeedSpec,
} from './pipeline-health';

const daily: FeedSpec = { chain: 'masoutis', source: 'web', maxAgeHours: 36, schedule: 'test' };
const weekly: FeedSpec = { chain: 'lidl', source: 'leaflet', maxAgeHours: 8 * 24, schedule: 'test' };

const now = new Date('2026-06-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

describe('evaluateFeed', () => {
  it('returns "never" when the feed has no recorded runs', () => {
    expect(evaluateFeed(daily, null, null, now)).toBe('never');
  });

  it('returns "ok" for a fresh healthy run', () => {
    const run = { finishedAt: hoursAgo(6), healthOk: true };
    expect(evaluateFeed(daily, run, run, now)).toBe('ok');
  });

  it('returns "ok" right at the freshness boundary', () => {
    const run = { finishedAt: hoursAgo(36), healthOk: true };
    expect(evaluateFeed(daily, run, run, now)).toBe('ok');
  });

  it('returns "stale" when the last healthy run is past the window', () => {
    const run = { finishedAt: hoursAgo(37), healthOk: true };
    expect(evaluateFeed(daily, run, run, now)).toBe('stale');
  });

  it('returns "stale" when runs exist but none were ever healthy', () => {
    const run = { finishedAt: hoursAgo(1), healthOk: false };
    expect(evaluateFeed(daily, run, null, now)).toBe('stale');
  });

  it('returns "warn" when the latest run tripped but a fresh healthy run exists', () => {
    const tripped = { finishedAt: hoursAgo(1), healthOk: false };
    const lastOk = { finishedAt: hoursAgo(25) };
    expect(evaluateFeed(daily, tripped, lastOk, now)).toBe('warn');
  });

  it('respects per-feed cadence — 5 days old is fine for a weekly feed', () => {
    const run = { finishedAt: hoursAgo(5 * 24), healthOk: true };
    expect(evaluateFeed(weekly, run, run, now)).toBe('ok');
    expect(evaluateFeed(daily, run, run, now)).toBe('stale');
  });
});

describe('isAlarming', () => {
  it('alarms on stale and never, not on ok/warn', () => {
    expect(isAlarming('stale')).toBe(true);
    expect(isAlarming('never')).toBe(true);
    expect(isAlarming('ok')).toBe(false);
    expect(isAlarming('warn')).toBe(false);
  });
});

describe('EXPECTED_FEEDS', () => {
  it('has no duplicate (chain, source) pairs', () => {
    const keys = EXPECTED_FEEDS.map((f) => `${f.chain}/${f.source}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('monitors every live chain offer feed', () => {
    const chains = new Set(EXPECTED_FEEDS.map((f) => f.chain));
    expect(chains).toEqual(new Set([
      'ab',
      'bazaar',
      'kritikos',
      'lidl',
      'masoutis',
      'mymarket',
      'sklavenitis',
    ]));
  });
});

describe('median', () => {
  it('returns null for an empty sample', () => {
    expect(median([])).toBeNull();
  });
  it('averages the middle pair for an even count', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
  it('is order-independent', () => {
    expect(median([300, 10, 200])).toBe(200);
  });
});

describe('evaluateVolume', () => {
  const typical = [300, 310, 295, 305];

  it('flags a run that succeeded but came back a fraction of the usual size', () => {
    // The AB shape: the job passes, the data does not.
    expect(evaluateVolume(12, typical)).toBe('collapsed');
  });

  it('accepts a normal run', () => {
    expect(evaluateVolume(298, typical)).toBe('ok');
  });

  it('accepts a run right at the threshold', () => {
    // median 302.5 → half is 151.25; 152 must not alarm.
    expect(evaluateVolume(152, typical)).toBe('ok');
  });

  it('flags just below the threshold', () => {
    expect(evaluateVolume(151, typical)).toBe('collapsed');
  });

  it('says "unknown" rather than guessing from too little history', () => {
    expect(evaluateVolume(5, [300, 310])).toBe('unknown');
  });

  it('says "unknown" for feeds too small for the ratio to mean anything', () => {
    const tiny = new Array(4).fill(VOLUME_MIN_REFERENCE - 1);
    expect(evaluateVolume(0, tiny)).toBe('unknown');
  });

  it('says "unknown" when there is no latest run to judge', () => {
    expect(evaluateVolume(null, typical)).toBe('unknown');
  });

  it('uses the median, so one unusually big run does not condemn normal ones', () => {
    // A single 3,000-item week must not make 300 look like a collapse.
    expect(evaluateVolume(300, [3000, 300, 310, 295])).toBe('ok');
  });

  it('does not flag a weekly feed whose offers merely expired between runs', () => {
    // Regression guard for the rejected design: comparing the latest run
    // against CURRENTLY ACTIVE offers would alarm every time a weekly leaflet
    // lapsed before its next scrape. Run-to-run comparison is immune.
    expect(evaluateVolume(3029, [3046, 3029, 2900, 3100])).toBe('ok');
  });
});

describe('feedAlarms', () => {
  it('alarms when the feed stopped running', () => {
    expect(feedAlarms({ status: 'stale', volumeStatus: 'ok' })).toBe(true);
  });

  it('alarms when a fresh, healthy-looking run came back small', () => {
    expect(feedAlarms({ status: 'ok', volumeStatus: 'collapsed' })).toBe(true);
  });

  it('stays quiet for a healthy feed', () => {
    expect(feedAlarms({ status: 'ok', volumeStatus: 'ok' })).toBe(false);
  });

  it('stays quiet on warn — the safety rails kept last-good data live', () => {
    expect(feedAlarms({ status: 'warn', volumeStatus: 'ok' })).toBe(false);
  });

  it('never alarms on unknown volume', () => {
    expect(feedAlarms({ status: 'ok', volumeStatus: 'unknown' })).toBe(false);
  });
});
