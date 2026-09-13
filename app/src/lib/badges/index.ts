import type { SQLiteDatabase } from 'expo-sqlite';

import { insertEarnedBadges, listEarnedBadges } from '@/db/badges';

import { BADGES, type Badge } from './definitions';
import { computeStats, progress } from './stats';

export { BADGES, BADGE_BY_ID, CATEGORY_LABELS, type Badge, type BadgeCategory } from './definitions';

export type BadgeStatus = { badge: Badge; earnedAt: string | null; current: number; target: number };

/** Re-evaluates every badge and records the ones newly earned. Returns those, in catalogue order. */
export async function checkBadges(db: SQLiteDatabase): Promise<Badge[]> {
  const [stats, earned] = await Promise.all([computeStats(db), listEarnedBadges(db)]);
  const have = new Set(earned.map((e) => e.badgeId));
  const fresh = BADGES.filter((b) => {
    if (have.has(b.id)) return false;
    const p = progress(b.rule, stats);
    return p.current >= p.target;
  });
  if (fresh.length) await insertEarnedBadges(db, fresh.map((b) => b.id), new Date().toISOString());
  return fresh;
}

/** Every badge with its earned date or current progress. */
export async function badgeStatus(db: SQLiteDatabase): Promise<BadgeStatus[]> {
  const [stats, earned] = await Promise.all([computeStats(db), listEarnedBadges(db)]);
  const when = new Map(earned.map((e) => [e.badgeId, e.earnedAt]));
  return BADGES.map((badge) => {
    const p = progress(badge.rule, stats);
    return { badge, earnedAt: when.get(badge.id) ?? null, current: Math.min(p.current, p.target), target: p.target };
  });
}

/** Remembers the friend count so the friend badges can be evaluated offline. */
export async function recordFriendCount(db: SQLiteDatabase, count: number): Promise<void> {
  await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', 'friend_count', String(count));
}
