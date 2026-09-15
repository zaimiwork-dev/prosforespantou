import { describe, it, expect } from 'vitest';
import { evaluateFeed, isAlarming, EXPECTED_FEEDS, type FeedSpec } from './pipeline-health';

const spec: FeedSpec = {
  chain: 'ab',
  source: 'wolt',
  maxAgeHours: 9 * 24,
  schedule: 'κάθε Κυριακή 09:00 UTC',
  graceUntil: '2026-09-22',
};

describe('evaluateFeed — graceUntil for feeds added before their first run', () => {
  it('a feed with no run is pending (not alarming) before its grace date', () => {
    const status = evaluateFeed(spec, null, null, new Date('2026-09-16T08:00:00Z'));
    expect(status).toBe('pending');
    expect(isAlarming(status)).toBe(false);
  });

  it('…and never (alarming) once the grace date has passed', () => {
    const status = evaluateFeed(spec, null, null, new Date('2026-09-23T08:00:00Z'));
    expect(status).toBe('never');
    expect(isAlarming(status)).toBe(true);
  });

  it('grace has no effect once a run exists', () => {
    const run = { finishedAt: new Date('2026-09-20T09:30:00Z'), healthOk: true };
    expect(evaluateFeed(spec, run, run, new Date('2026-09-21T08:00:00Z'))).toBe('ok');
  });

  it('feeds without graceUntil behave exactly as before', () => {
    const { graceUntil: _omit, ...plain } = spec;
    expect(evaluateFeed(plain, null, null, new Date('2026-09-16T08:00:00Z'))).toBe('never');
  });

  it('every grace date in EXPECTED_FEEDS is a real date within a month of 2026-09-15', () => {
    const shipped = new Date('2026-09-15T00:00:00Z').getTime();
    for (const f of EXPECTED_FEEDS) {
      if (!f.graceUntil) continue;
      const t = new Date(f.graceUntil).getTime();
      expect(Number.isFinite(t)).toBe(true);
      expect(t - shipped).toBeLessThanOrEqual(31 * 86400000);
    }
  });
});
