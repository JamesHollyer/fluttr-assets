import type { SQLiteDatabase } from 'expo-sqlite';

import type { Recording } from '@/db/recordings';
import type { Region } from '@/lib/identify';
import { isStoredOffline, removeOffline, storeOffline } from '@/lib/sounds/files';

/** Rough MP3 size per second of audio for Commons renditions; tune from measurements. */
export const BYTES_PER_SECOND = 24000;
/** Clips per species in the region pack: the shortest ones. Keeps the pack under ~750 MB. */
export const CLIPS_PER_SPECIES = 3;
const MIN_USCA_RECORDS = 200;

export type RegionPackSummary = {
  region: Region;
  clips: number;
  species: number;
  saved: number;
  estimatedBytes: number;
};

const COLUMNS = `
  r.id, r.species_code AS speciesCode, r.kind, r.url, r.duration, r.title, r.recordist, r.license,
  r.license_url AS licenseUrl, r.page_url AS pageUrl, r.downloaded_at AS downloadedAt
`;

/** The shortest few recordings per species that occurs in the region. */
export async function listRegionRecordings(db: SQLiteDatabase, region: Region): Promise<Recording[]> {
  const regionFilter = region === 'usca' ? `WHERE s.freq_usca >= ${MIN_USCA_RECORDS}` : '';
  return db.getAllAsync<Recording>(
    `SELECT * FROM (
       SELECT ${COLUMNS}, ROW_NUMBER() OVER (PARTITION BY r.species_code ORDER BY r.duration) AS rank
       FROM recordings r JOIN species s ON s.code = r.species_code ${regionFilter}
     ) WHERE rank <= ? ORDER BY speciesCode, duration`,
    CLIPS_PER_SPECIES,
  );
}

export async function summarizeRegionPack(db: SQLiteDatabase, region: Region): Promise<RegionPackSummary> {
  const recs = await listRegionRecordings(db, region);
  let saved = 0;
  for (const r of recs) if (r.downloadedAt) saved += 1;
  return {
    region,
    clips: recs.length,
    species: new Set(recs.map((r) => r.speciesCode)).size,
    saved,
    estimatedBytes: recs.reduce((sum, r) => sum + r.duration * BYTES_PER_SECOND, 0),
  };
}

export type PackProgress = { done: number; total: number; failed: number };

/**
 * Downloads every clip in the region that is not already on the phone.
 * Sequential and resumable: skips files already present, keeps going past
 * individual failures, and stops promptly when `shouldStop` returns true.
 */
export async function downloadRegionPack(
  db: SQLiteDatabase,
  region: Region,
  onProgress: (p: PackProgress) => void,
  shouldStop: () => boolean,
): Promise<PackProgress> {
  const recs = await listRegionRecordings(db, region);
  const progress: PackProgress = { done: 0, total: recs.length, failed: 0 };
  for (const rec of recs) {
    if (shouldStop()) break;
    try {
      if (!(await isStoredOffline(rec.id))) {
        await storeOffline(rec);
        // Wikimedia throttles bursts; a short gap between files keeps a long run flowing.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (!rec.downloadedAt) {
        await db.runAsync('UPDATE recordings SET downloaded_at = ? WHERE id = ?', new Date().toISOString(), rec.id);
      }
    } catch {
      progress.failed += 1;
    }
    progress.done += 1;
    onProgress({ ...progress });
  }
  return progress;
}

export async function removeRegionPack(db: SQLiteDatabase, region: Region): Promise<void> {
  const recs = await listRegionRecordings(db, region);
  for (const rec of recs) {
    await removeOffline(rec.id);
    await db.runAsync('UPDATE recordings SET downloaded_at = NULL WHERE id = ?', rec.id);
  }
}
