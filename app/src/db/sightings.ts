import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type SightingMethod = 'manual' | 'sound' | 'wizard';

export type Sighting = {
  id: string;
  speciesCode: string;
  observedAt: string;
  lat: number | null;
  lng: number | null;
  method: SightingMethod;
  note: string | null;
  createdAt: string;
};

export type NewSighting = {
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
  species_code AS speciesCode,
  observed_at  AS observedAt,
  lat,
  lng,
  method,
  note,
  created_at   AS createdAt
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
    `INSERT INTO sightings (id, species_code, observed_at, lat, lng, method, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
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
