import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLUSH_COUNT, FLUSH_MS, createImpressionQueue, type ImpressionItem } from './impressions';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));


const item = (id: string, page = 'home'): ImpressionItem => ({ discountId: id, page });

describe('impression queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends each offer once per page, but again on another page', () => {
    const send = vi.fn();
    const q = createImpressionQueue(send, () => true);
    q.add(item('a'));
    q.add(item('a'));
    q.add(item('a', 'deals'));
    vi.advanceTimersByTime(FLUSH_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual([item('a'), item('a', 'deals')]);
    q.add(item('a')); // already reported this session
    q.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flushes after 5 s, not before', () => {
    const send = vi.fn();
    const q = createImpressionQueue(send, () => true);
    q.add(item('a'));
    vi.advanceTimersByTime(FLUSH_MS - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flushes at 20 items immediately', () => {
    const send = vi.fn();
    const q = createImpressionQueue(send, () => true);
    for (let i = 0; i < FLUSH_COUNT; i++) q.add(item(`o${i}`));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(FLUSH_COUNT);
    expect(q.pending()).toBe(0);
  });

  it('queues nothing without consent, and drops the queue if consent is lost before the flush', () => {
    const send = vi.fn();
    let ok = false;
    const q = createImpressionQueue(send, () => ok);
    q.add(item('a'));
    expect(q.pending()).toBe(0);
    ok = true;
    q.add(item('b'));
    ok = false;
    vi.advanceTimersByTime(FLUSH_MS);
    expect(send).not.toHaveBeenCalled();
  });
});
