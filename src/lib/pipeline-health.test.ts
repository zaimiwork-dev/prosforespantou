import { describe, it, expect } from 'vitest';
import { evaluateFeed, isAlarming, EXPECTED_FEEDS, type FeedSpec } from './pipeline-health';

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
});
