import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type SightingMethod = 'manual' | 'sound' | 'wizard';

export type Sighting = {
  id: string;
  userId: string | null;
  speciesCode: string;
  observedAt: string;
  lat: number | null;
  lng: number | null;
  method: SightingMethod;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
};

/** A row as the server returns it. */
export type RemoteSighting = {
  id: string;
  user_id: string;
  species_code: string;
  observed_at: string;
  lat: number | null;
  lng: number | null;
  method: SightingMethod;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string;
};

export type NewSighting = {
  userId?: string | null;
  speciesCode: string;
  observedAt?: string;
  lat?: number | null;
  lng?: number | null;
  method?: SightingMethod;
  note?: string | null;
};

export type LifeListEntry = {
  code: string;
  commonName: string;
  scientificName: string;
  familyCommon: string;
  catchCount: number;
  firstSeen: string;
  lastSeen: string;
};

export type CatchResult = { id: string; isLifer: boolean; catchNumber: number };

const SIGHTING_COLUMNS = `
  id,
  user_id      AS userId,
  species_code AS speciesCode,
  observed_at  AS observedAt,
  lat,
  lng,
  method,
  note,
  created_at   AS createdAt,
  updated_at   AS updatedAt,
  deleted_at   AS deletedAt,
  synced_at    AS syncedAt
`;

/** Records a catch. Returns whether it was the first of its species (a "lifer"). */
export async function addSighting(db: SQLiteDatabase, input: NewSighting): Promise<CatchResult> {
  const prior = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sightings WHERE species_code = ? AND deleted_at IS NULL',
    input.speciesCode,
  );
  const id = randomUUID();
  const now = new Date().toISOString();
  const note = input.note?.trim() || null;

  await db.runAsync(
    `INSERT INTO sightings (id, user_id, species_code, observed_at, lat, lng, method, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.userId ?? null,
    input.speciesCode,
    input.observedAt ?? now,
    input.lat ?? null,
    input.lng ?? null,
    input.method ?? 'manual',
    note,
    now,
    now,
  );

  const priorCount = prior?.n ?? 0;
  return { id, isLifer: priorCount === 0, catchNumber: priorCount + 1 };
}

export async function listSightingsForSpecies(db: SQLiteDatabase, code: string): Promise<Sighting[]> {
  return db.getAllAsync<Sighting>(
    `SELECT ${SIGHTING_COLUMNS} FROM sightings
     WHERE species_code = ? AND deleted_at IS NULL
     ORDER BY observed_at DESC`,
    code,
  );
}

/** Soft delete, so the row can still be reconciled with the server later. */
export async function deleteSighting(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE sightings SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

export async function getLifeList(db: SQLiteDatabase): Promise<LifeListEntry[]> {
  return db.getAllAsync<LifeListEntry>(
    `SELECT
       s.code,
       s.common_name     AS commonName,
       s.scientific_name AS scientificName,
       s.family_common   AS familyCommon,
       COUNT(g.id)       AS catchCount,
       MIN(g.observed_at) AS firstSeen,
       MAX(g.observed_at) AS lastSeen
     FROM sightings g
     JOIN species s ON s.code = g.species_code
     WHERE g.deleted_at IS NULL
     GROUP BY s.code
     ORDER BY lastSeen DESC`,
  );
}

export async function getStats(db: SQLiteDatabase): Promise<{ species: number; catches: number }> {
  const row = await db.getFirstAsync<{ species: number; catches: number }>(
    `SELECT COUNT(DISTINCT species_code) AS species, COUNT(*) AS catches
     FROM sightings WHERE deleted_at IS NULL`,
  );
  return row ?? { species: 0, catches: 0 };
}

/** Normalize timestamps from either clock to a comparable ISO string. */
function iso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** Catches that have never been uploaded, or changed since they were. Includes soft deletes. */
export async function listUnsyncedSightings(db: SQLiteDatabase, userId: string): Promise<Sighting[]> {
  return db.getAllAsync<Sighting>(
    `SELECT ${SIGHTING_COLUMNS} FROM sightings
     WHERE user_id = ? AND (synced_at IS NULL OR updated_at > synced_at)
     ORDER BY updated_at`,
    userId,
  );
}

export async function countUnsyncedSightings(db: SQLiteDatabase, userId: string | null): Promise<number> {
  const row = userId
    ? await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM sightings WHERE user_id = ? AND (synced_at IS NULL OR updated_at > synced_at)',
        userId,
      )
    : await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sightings WHERE synced_at IS NULL AND deleted_at IS NULL');
  return row?.n ?? 0;
}

export async function markSightingsSynced(db: SQLiteDatabase, rows: { id: string; updatedAt: string }[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      await db.runAsync('UPDATE sightings SET synced_at = ? WHERE id = ?', r.updatedAt, r.id);
    }
  });
}

/** Catches made before signing in belong to whoever signs in first on this phone. */
export async function claimLocalSightings(db: SQLiteDatabase, userId: string): Promise<number> {
  const result = await db.runAsync('UPDATE sightings SET user_id = ? WHERE user_id IS NULL', userId);
  return result.changes;
}

/**
 * Merge a server row into the local database. Last write wins by the phone
 * clock: a local edit newer than the server's copy is kept and will upload.
 */
export async function applyRemoteSighting(db: SQLiteDatabase, r: RemoteSighting): Promise<void> {
  const local = await db.getFirstAsync<{ updatedAt: string; syncedAt: string | null }>(
    'SELECT updated_at AS updatedAt, synced_at AS syncedAt FROM sightings WHERE id = ?',
    r.id,
  );
  const remoteUpdated = iso(r.updated_at);
  if (local && iso(local.updatedAt) > remoteUpdated) return;
  await db.runAsync(
    `INSERT INTO sightings (id, user_id, species_code, observed_at, lat, lng, method, note, created_at, updated_at, deleted_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       user_id = excluded.user_id, species_code = excluded.species_code, observed_at = excluded.observed_at,
       lat = excluded.lat, lng = excluded.lng, method = excluded.method, note = excluded.note,
       created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
       synced_at = excluded.synced_at`,
    r.id,
    r.user_id,
    r.species_code,
    iso(r.observed_at),
    r.lat,
    r.lng,
    r.method,
    r.note,
    iso(r.created_at),
    remoteUpdated,
    r.deleted_at ? iso(r.deleted_at) : null,
    remoteUpdated,
  );
}
