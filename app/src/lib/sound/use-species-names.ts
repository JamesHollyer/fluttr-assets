import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

type Names = { commonName: string; scientificName: string };

/** Code -> names for the whole pack, loaded once. Small enough to keep in memory. */
export function useSpeciesNames(): Map<string, Names> {
  const db = useSQLiteContext();
  const [names, setNames] = useState<Map<string, Names>>(new Map());
  useEffect(() => {
    db.getAllAsync<{ code: string; commonName: string; scientificName: string }>(
      'SELECT code, common_name AS commonName, scientific_name AS scientificName FROM species',
    )
      .then((rows) => setNames(new Map(rows.map((r) => [r.code, { commonName: r.commonName, scientificName: r.scientificName }]))))
      .catch(console.error);
  }, [db]);
  return names;
}
