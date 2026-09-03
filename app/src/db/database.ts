import type { SQLiteDatabase } from 'expo-sqlite';

import pack from '@/assets/data/species-na.json';

export const DATABASE_NAME = 'fluttr.db';

const SPECIES_PACK_KEY = 'species_pack';

type PackSpecies = {
  code: string;
  common: string;
  sci: string;
  family: string;
  familyCommon: string;
  order: string;
  sort: number;
  introduced: boolean;
  hawaii: boolean;
};

/**
 * Creates or upgrades the local schema, then makes sure the bundled species
 * pack is loaded. Runs once per app launch via SQLiteProvider.onInit.
 *
 * The local database is the source of truth on device; the server (later) is
 * a sync target. Keep every write here safe to run repeatedly.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS species (
        code            TEXT PRIMARY KEY NOT NULL,
        common_name     TEXT NOT NULL,
        scientific_name TEXT NOT NULL,
        family          TEXT NOT NULL,
        family_common   TEXT NOT NULL,
        order_name      TEXT NOT NULL,
        sort_order      REAL NOT NULL,
        introduced      INTEGER NOT NULL DEFAULT 0,
        hawaii          INTEGER NOT NULL DEFAULT 0,
        pack_id         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS species_sort ON species (sort_order);
      CREATE INDEX IF NOT EXISTS species_common_name ON species (common_name COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS sightings (
        id           TEXT PRIMARY KEY NOT NULL,
        species_code TEXT NOT NULL REFERENCES species (code),
        observed_at  TEXT NOT NULL,
        lat          REAL,
        lng          REAL,
        method       TEXT NOT NULL DEFAULT 'manual',
        note         TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        deleted_at   TEXT,
        synced_at    TEXT
      );
      CREATE INDEX IF NOT EXISTS sightings_species ON sightings (species_code, deleted_at);
      CREATE INDEX IF NOT EXISTS sightings_observed ON sightings (observed_at);
    `);
    await db.execAsync('PRAGMA user_version = 1;');
  }

  await seedSpeciesPack(db);
}

async function seedSpeciesPack(db: SQLiteDatabase): Promise<void> {
  const stamp = `${pack.id}:${pack.version}`;
  const current = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    SPECIES_PACK_KEY,
  );
  if (current?.value === stamp) return;

  const species = pack.species as PackSpecies[];

  await db.withExclusiveTransactionAsync(async (tx) => {
    const insert = await tx.prepareAsync(`
      INSERT INTO species
        (code, common_name, scientific_name, family, family_common, order_name, sort_order, introduced, hawaii, pack_id)
      VALUES
        ($code, $common, $sci, $family, $familyCommon, $order, $sort, $introduced, $hawaii, $pack)
      ON CONFLICT (code) DO UPDATE SET
        common_name     = excluded.common_name,
        scientific_name = excluded.scientific_name,
        family          = excluded.family,
        family_common   = excluded.family_common,
        order_name      = excluded.order_name,
        sort_order      = excluded.sort_order,
        introduced      = excluded.introduced,
        hawaii          = excluded.hawaii,
        pack_id         = excluded.pack_id
    `);
    try {
      for (const s of species) {
        await insert.executeAsync({
          $code: s.code,
          $common: s.common,
          $sci: s.sci,
          $family: s.family,
          $familyCommon: s.familyCommon,
          $order: s.order,
          $sort: s.sort,
          $introduced: s.introduced ? 1 : 0,
          $hawaii: s.hawaii ? 1 : 0,
          $pack: pack.id,
        });
      }
    } finally {
      await insert.finalizeAsync();
    }

    await tx.runAsync(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      SPECIES_PACK_KEY,
      stamp,
    );
  });
}
