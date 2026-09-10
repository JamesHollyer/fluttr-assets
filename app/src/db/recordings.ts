import type { SQLiteDatabase } from 'expo-sqlite';

export type RecordingKind = 'song' | 'call' | 'alarm' | 'flight' | 'drum' | 'sound';

export type Recording = {
  id: string;
  speciesCode: string;
  kind: RecordingKind;
  url: string;
  duration: number;
  title: string | null;
  recordist: string | null;
  license: string | null;
  licenseUrl: string | null;
  pageUrl: string | null;
  downloadedAt: string | null;
};

export const KIND_LABELS: Record<RecordingKind, string> = {
  song: 'Song',
  call: 'Call',
  alarm: 'Alarm call',
  flight: 'Flight call',
  drum: 'Drumming',
  sound: 'Sound',
};

const COLUMNS = `
  id, species_code AS speciesCode, kind, url, duration, title, recordist, license,
  license_url AS licenseUrl, page_url AS pageUrl, downloaded_at AS downloadedAt
`;

export async function listRecordings(db: SQLiteDatabase, speciesCode: string): Promise<Recording[]> {
  return db.getAllAsync<Recording>(
    `SELECT ${COLUMNS} FROM recordings WHERE species_code = ?
     ORDER BY CASE kind WHEN 'song' THEN 0 WHEN 'call' THEN 1 WHEN 'alarm' THEN 2 WHEN 'flight' THEN 3 WHEN 'drum' THEN 4 ELSE 5 END, duration`,
    speciesCode,
  );
}

export async function setRecordingDownloaded(db: SQLiteDatabase, id: string, at: string | null): Promise<void> {
  await db.runAsync('UPDATE recordings SET downloaded_at = ? WHERE id = ?', at, id);
}

export async function countRecordings(db: SQLiteDatabase, speciesCode: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM recordings WHERE species_code = ?', speciesCode);
  return row?.n ?? 0;
}
