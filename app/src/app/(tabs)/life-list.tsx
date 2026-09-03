import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { SpeciesRow } from '@/components/species-row';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getLifeList, getStats, type LifeListEntry } from '@/db/sightings';
import { formatDate } from '@/lib/format';

export default function LifeListScreen() {
  const db = useSQLiteContext();
  const [entries, setEntries] = useState<LifeListEntry[]>([]);
  const [stats, setStats] = useState({ species: 0, catches: 0 });

  useFocusEffect(
    useCallback(() => {
      Promise.all([getLifeList(db), getStats(db)])
        .then(([list, s]) => {
          setEntries(list);
          setStats(s);
        })
        .catch(console.error);
    }, [db]),
  );

  const subtitle =
    stats.species === 0
      ? 'No birds caught yet'
      : `${stats.species} ${stats.species === 1 ? 'species' : 'species'} · ${stats.catches} ${stats.catches === 1 ? 'catch' : 'catches'}`;

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.code}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<ScreenHeader title="Life list" subtitle={subtitle} />}
        ListEmptyComponent={
          <EmptyState
            title="Your life list is empty"
            hint="Find a bird in the Species tab and catch it. Every new species lands here."
          />
        }
        renderItem={({ item }) => (
          <SpeciesRow
            code={item.code}
            commonName={item.commonName}
            scientificName={item.scientificName}
            detail={`Last ${formatDate(item.lastSeen)}`}
            catchCount={item.catchCount}
          />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset + Spacing.four,
  },
});
