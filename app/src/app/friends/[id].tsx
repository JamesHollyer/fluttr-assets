import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { SpeciesRow } from '@/components/species-row';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { fetchFriendLifeList, profileName, type Profile } from '@/lib/friends';
import { formatDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Entry = { code: string; commonName: string; scientificName: string; catches: number; lastSeen: string; mine: number };

/** A friend's life list: what they've caught, with your own catch count for comparison. */
export default function FriendLifeListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [badgeCount, setBadgeCount] = useState<number | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const run = async () => {
      const { data } = await client.from('profiles').select('id, username, display_name').eq('id', id).maybeSingle();
      if (data) setProfile({ id: data.id, username: data.username, displayName: data.display_name });
      const badges = await client.from('badges').select('badge_id', { count: 'exact', head: true }).eq('user_id', id);
      setBadgeCount(badges.count ?? 0);
      const list = await fetchFriendLifeList(client, id);
      if (list.length === 0) {
        setEntries([]);
        return;
      }
      const codes = list.map((e) => e.species_code);
      const rows = await db.getAllAsync<{ code: string; commonName: string; scientificName: string; mine: number }>(
        `SELECT s.code, s.common_name AS commonName, s.scientific_name AS scientificName,
                (SELECT COUNT(*) FROM sightings g WHERE g.species_code = s.code AND g.deleted_at IS NULL) AS mine
         FROM species s WHERE s.code IN (${codes.map(() => '?').join(',')})`,
        codes,
      );
      const byCode = new Map(rows.map((r) => [r.code, r]));
      setEntries(
        list.map((e) => {
          const s = byCode.get(e.species_code);
          return {
            code: e.species_code,
            commonName: s?.commonName ?? e.species_code,
            scientificName: s?.scientificName ?? '',
            catches: Number(e.catches),
            lastSeen: e.last_seen,
            mine: s?.mine ?? 0,
          };
        }),
      );
    };
    run().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [db, id]);

  const name = profile ? profileName(profile) : 'Friend';
  const youLack = entries?.filter((e) => e.mine === 0).length ?? 0;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: name }} />
      <FlatList
        data={entries ?? []}
        keyExtractor={(e) => e.code}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <ScreenHeader
            title={name}
            subtitle={
              entries === null
                ? 'Loading…'
                : `${entries.length} species · ${youLack} you haven't caught${badgeCount ? ` · ${badgeCount} ${badgeCount === 1 ? 'badge' : 'badges'}` : ''}`
            }
          />
        }
        ListEmptyComponent={
          error ? (
            <EmptyState title="Could not load" hint={error} />
          ) : entries === null ? null : (
            <EmptyState title="Nothing caught yet" hint={`${name} hasn't logged a bird yet.`} />
          )
        }
        renderItem={({ item }) => (
          <SpeciesRow
            code={item.code}
            commonName={item.commonName}
            scientificName={item.scientificName}
            detail={`${item.catches === 1 ? '1 catch' : `${item.catches} catches`} · ${formatDate(item.lastSeen)}`}
            catchCount={item.mine}
          />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, paddingBottom: Spacing.six },
});
