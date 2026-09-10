import type { SQLiteDatabase } from 'expo-sqlite';

export type PhotoSex = 'male' | 'female' | 'unknown';

export type SpeciesPhotoRow = {
  id: string;
  speciesCode: string;
  sex: PhotoSex;
  url: string;
  width: number | null;
  height: number | null;
  attribution: string | null;
  license: string | null;
  pageUrl: string | null;
};

export async function listSpeciesPhotos(db: SQLiteDatabase, speciesCode: string): Promise<SpeciesPhotoRow[]> {
  return db.getAllAsync<SpeciesPhotoRow>(
    `SELECT id, species_code AS speciesCode, sex, url, width, height, attribution, license, page_url AS pageUrl
     FROM species_photos WHERE species_code = ?
     ORDER BY CASE sex WHEN 'male' THEN 0 WHEN 'female' THEN 1 ELSE 2 END, rowid`,
    speciesCode,
  );
}
