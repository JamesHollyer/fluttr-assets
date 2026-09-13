import type { SQLiteDatabase } from 'expo-sqlite';

import type { BadgeRule } from './definitions';

/** Everything the badge rules look at, computed from the local catch history. */
export type Stats = {
  species: number;
  catches: number;
  longestStreak: number;
  families: number;
  byMethod: Record<string, number>;
  speciesByFamily: Map<string, number>;
  earliestHour: number | null;
  latestHour: number | null;
  rarestFreq: number | null;
  seasons: number;
  months: number;
  bigDay: number;
  maxRepeat: number;
  colors: number;
  introduced: number;
  friends: number;
};

type Row = {
  speciesCode: string;
  observedAt: string;
  method: string;
  familyCommon: string;
  colors: string | null;
  freqUsca: number | null;
  introduced: number;
};

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function season(month: number): number {
  // Meteorological seasons: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov fall.
  return Math.floor(((month + 1) % 12) / 3);
}

function longestRun(dateKeys: Set<string>): number {
  const days = [...dateKeys].map((k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10))) / 86400000).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

export async function computeStats(db: SQLiteDatabase): Promise<Stats> {
  const rows = await db.getAllAsync<Row>(`
    SELECT s.species_code AS speciesCode, s.observed_at AS observedAt, s.method,
           sp.family_common AS familyCommon, sp.colors, sp.freq_usca AS freqUsca, sp.introduced
    FROM sightings s JOIN species sp ON sp.code = s.species_code
    WHERE s.deleted_at IS NULL`);
  const friendsRow = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'friend_count'");

  const perSpecies = new Map<string, number>();
  const familiesOfSpecies = new Map<string, string>();
  const dateKeys = new Set<string>();
  const speciesPerDay = new Map<string, Set<string>>();
  const seasons = new Set<number>();
  const months = new Set<number>();
  const colors = new Set<string>();
  const byMethod: Record<string, number> = {};
  let earliestHour: number | null = null;
  let latestHour: number | null = null;
  let rarestFreq: number | null = null;
  let introduced = 0;

  for (const r of rows) {
    perSpecies.set(r.speciesCode, (perSpecies.get(r.speciesCode) ?? 0) + 1);
    familiesOfSpecies.set(r.speciesCode, r.familyCommon);
    byMethod[r.method] = (byMethod[r.method] ?? 0) + 1;
    const d = new Date(r.observedAt);
    const key = localDateKey(d);
    dateKeys.add(key);
    if (!speciesPerDay.has(key)) speciesPerDay.set(key, new Set());
    speciesPerDay.get(key)!.add(r.speciesCode);
    seasons.add(season(d.getMonth()));
    months.add(d.getMonth());
    const hour = d.getHours();
    if (earliestHour === null || hour < earliestHour) earliestHour = hour;
    if (latestHour === null || hour > latestHour) latestHour = hour;
    if (r.freqUsca !== null && r.freqUsca > 0 && (rarestFreq === null || r.freqUsca < rarestFreq)) rarestFreq = r.freqUsca;
    if (r.introduced) introduced++;
    for (const c of (r.colors ?? '').split(',')) if (c) colors.add(c);
  }

  const speciesByFamily = new Map<string, number>();
  for (const fam of familiesOfSpecies.values()) speciesByFamily.set(fam, (speciesByFamily.get(fam) ?? 0) + 1);

  let bigDay = 0;
  for (const set of speciesPerDay.values()) if (set.size > bigDay) bigDay = set.size;
  let maxRepeat = 0;
  for (const n of perSpecies.values()) if (n > maxRepeat) maxRepeat = n;

  return {
    species: perSpecies.size,
    catches: rows.length,
    longestStreak: longestRun(dateKeys),
    families: speciesByFamily.size,
    byMethod,
    speciesByFamily,
    earliestHour,
    latestHour,
    rarestFreq,
    seasons: seasons.size,
    months: months.size,
    bigDay,
    maxRepeat,
    colors: colors.size,
    introduced,
    friends: Number(friendsRow?.value ?? 0),
  };
}

/** Where the user stands on a rule: `current` of `target`. Earned when current >= target. */
export function progress(rule: BadgeRule, s: Stats): { current: number; target: number } {
  switch (rule.kind) {
    case 'species': return { current: s.species, target: rule.target };
    case 'catches': return { current: s.catches, target: rule.target };
    case 'streak': return { current: s.longestStreak, target: rule.target };
    case 'families': return { current: s.families, target: rule.target };
    case 'method': return { current: s.byMethod[rule.method] ?? 0, target: rule.target };
    case 'group': {
      let n = 0;
      for (const f of rule.families) n += s.speciesByFamily.get(f) ?? 0;
      return { current: n, target: rule.target };
    }
    case 'hour': {
      const hit =
        (rule.before !== undefined && s.earliestHour !== null && s.earliestHour < rule.before) ||
        (rule.after !== undefined && s.latestHour !== null && s.latestHour >= rule.after);
      return { current: hit ? 1 : 0, target: 1 };
    }
    case 'rarity': return { current: s.rarestFreq !== null && s.rarestFreq <= rule.maxFreq ? 1 : 0, target: 1 };
    case 'seasons': return { current: s.seasons, target: rule.target };
    case 'months': return { current: s.months, target: rule.target };
    case 'bigDay': return { current: s.bigDay, target: rule.target };
    case 'repeat': return { current: s.maxRepeat, target: rule.target };
    case 'colors': return { current: s.colors, target: rule.target };
    case 'introduced': return { current: s.introduced > 0 ? 1 : 0, target: 1 };
    case 'friends': return { current: s.friends, target: rule.target };
  }
}
