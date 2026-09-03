import type { SQLiteDatabase } from 'expo-sqlite';

export type Species = {
  code: string;
  commonName: string;
  scientificName: string;
  family: string;
  familyCommon: string;
  order: string;
  introduced: number;
};

export type SpeciesWithCount = Species & { catchCount: number };

const COLUMNS = `
  s.code,
  s.common_name     AS commonName,
  s.scientific_name AS scientificName,
  s.family,
  s.family_common   AS familyCommon,
  s.order_name      AS "order",
  s.introduced,
  (SELECT COUNT(*) FROM sightings g WHERE g.species_code = s.code AND g.deleted_at IS NULL) AS catchCount
`;

/** Full taxonomic-order list when the query is empty; ranked name matches otherwise. */
export async function searchSpecies(db: SQLiteDatabase, query: string): Promise<SpeciesWithCount[]> {
  const q = query.trim();
  if (!q) {
    return db.getAllAsync<SpeciesWithCount>(`SELECT ${COLUMNS} FROM species s ORDER BY s.sort_order`);
  }
  return db.getAllAsync<SpeciesWithCount>(
    `SELECT ${COLUMNS}
     FROM species s
     WHERE s.common_name LIKE $any
        OR s.scientific_name LIKE $any
        OR s.family_common LIKE $any
     ORDER BY
       CASE
         WHEN s.common_name LIKE $prefix THEN 0
         WHEN s.common_name LIKE $word THEN 1
         ELSE 2
       END,
       s.sort_order`,
    { $any: `%${q}%`, $prefix: `${q}%`, $word: `% ${q}%` },
  );
}

export async function getSpecies(db: SQLiteDatabase, code: string): Promise<SpeciesWithCount | null> {
  return db.getFirstAsync<SpeciesWithCount>(`SELECT ${COLUMNS} FROM species s WHERE s.code = ?`, code);
}
