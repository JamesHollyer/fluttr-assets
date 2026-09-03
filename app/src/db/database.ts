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
  description?: string;
  wikiUrl?: string | null;
  sizes?: number[];
  colors?: string[];
  behaviors?: string[];
  freq?: { usca: number; months: number[] };
  image?: {
    url: string;
    width?: number | null;
    height?: number | null;
    artist?: string | null;
    license?: string | null;
    licenseUrl?: string | null;
    page?: string | null;
  };
};

/**
 * Creates or upgrades the local schema, then makes sure the bundled species
 * pack is loaded. Runs once per app launch via SQLiteProvider.onInit.
 *
 * The local database is the source of truth on device; the server (later) is
 * a sync target. Keep every write here safe to run repeatedly.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  // Wait for a lock instead of failing: a dev reload can reopen the database mid-seed.
  await db.execAsync('PRAGMA busy_timeout = 5000;');
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

  if (version < 2) {
    // Descriptions and photos from the species pack (Wikipedia / Wikimedia Commons).
    await db.execAsync(`
      ALTER TABLE species ADD COLUMN description       TEXT;
      ALTER TABLE species ADD COLUMN wiki_url          TEXT;
      ALTER TABLE species ADD COLUMN image_url         TEXT;
      ALTER TABLE species ADD COLUMN image_width       INTEGER;
      ALTER TABLE species ADD COLUMN image_height      INTEGER;
      ALTER TABLE species ADD COLUMN image_artist      TEXT;
      ALTER TABLE species ADD COLUMN image_license     TEXT;
      ALTER TABLE species ADD COLUMN image_license_url TEXT;
      ALTER TABLE species ADD COLUMN image_page        TEXT;
    `);
    await db.execAsync('PRAGMA user_version = 2;');
  }

  if (version < 3) {
    // Wizard attributes and regional likelihood from the species pack.
    await db.execAsync(`
      ALTER TABLE species ADD COLUMN size_classes TEXT;
      ALTER TABLE species ADD COLUMN colors       TEXT;
      ALTER TABLE species ADD COLUMN behaviors    TEXT;
      ALTER TABLE species ADD COLUMN freq_usca    INTEGER;
      ALTER TABLE species ADD COLUMN freq_months  TEXT;
    `);
    await db.execAsync('PRAGMA user_version = 3;');
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
        (code, common_name, scientific_name, family, family_common, order_name, sort_order, introduced, hawaii, pack_id,
         description, wiki_url, image_url, image_width, image_height, image_artist, image_license, image_license_url, image_page,
         size_classes, colors, behaviors, freq_usca, freq_months)
      VALUES
        ($code, $common, $sci, $family, $familyCommon, $order, $sort, $introduced, $hawaii, $pack,
         $description, $wikiUrl, $imageUrl, $imageWidth, $imageHeight, $imageArtist, $imageLicense, $imageLicenseUrl, $imagePage,
         $sizes, $colors, $behaviors, $freqUsca, $freqMonths)
      ON CONFLICT (code) DO UPDATE SET
        common_name       = excluded.common_name,
        scientific_name   = excluded.scientific_name,
        family            = excluded.family,
        family_common     = excluded.family_common,
        order_name        = excluded.order_name,
        sort_order        = excluded.sort_order,
        introduced        = excluded.introduced,
        hawaii            = excluded.hawaii,
        pack_id           = excluded.pack_id,
        description       = excluded.description,
        wiki_url          = excluded.wiki_url,
        image_url         = excluded.image_url,
        image_width       = excluded.image_width,
        image_height      = excluded.image_height,
        image_artist      = excluded.image_artist,
        image_license     = excluded.image_license,
        image_license_url = excluded.image_license_url,
        image_page        = excluded.image_page,
        size_classes      = excluded.size_classes,
        colors            = excluded.colors,
        behaviors         = excluded.behaviors,
        freq_usca         = excluded.freq_usca,
        freq_months       = excluded.freq_months
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
          $description: s.description ?? null,
          $wikiUrl: s.wikiUrl ?? null,
          $imageUrl: s.image?.url ?? null,
          $imageWidth: s.image?.width ?? null,
          $imageHeight: s.image?.height ?? null,
          $imageArtist: s.image?.artist ?? null,
          $imageLicense: s.image?.license ?? null,
          $imageLicenseUrl: s.image?.licenseUrl ?? null,
          $imagePage: s.image?.page ?? null,
          $sizes: s.sizes?.join(',') ?? null,
          $colors: s.colors?.join(',') ?? null,
          $behaviors: s.behaviors?.join(',') ?? null,
          $freqUsca: s.freq?.usca ?? null,
          $freqMonths: s.freq?.months?.join(',') ?? null,
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
