// Original Qiaomu RSS subscription scheduling, unchanged.
import type {Subscription} from "./model";
/** Failing feeds retry on an exponential backoff: 5m → 10m → 20m → 40m → 1h cap. */
export function refreshBackoffMs(errorCount: number): number {
  return Math.min(3600000, 300000 * 2 ** Math.max(0, errorCount - 1));
}
/** Frequent feeds keep the 5-minute floor; slower sources avoid needless polling. */
export function refreshIntervalMs(feed: Subscription): number {
  const times = feed.entries.map(entry => entry.publishedTs).filter((value): value is number => typeof value === 'number').slice(0, 10).sort((a, b) => b - a);
  const gaps = times.slice(1).map((value, i) => times[i] - value).filter(value => value > 0).sort((a, b) => a - b);
  return gaps.length ? Math.max(300000, Math.min(3600000, gaps[Math.floor(gaps.length / 2)] / 4)) : 300000;
}
