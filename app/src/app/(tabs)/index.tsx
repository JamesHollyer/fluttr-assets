import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { SearchField } from '@/components/search-field';
import { SpeciesRow } from '@/components/species-row';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { searchSpecies, type SpeciesWithCount } from '@/db/species';

export default function SpeciesScreen() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SpeciesWithCount[]>([]);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const rows = await searchSpecies(db, query);
    if (id === requestId.current) setItems(rows);
  }, [db, query]);

  // Debounce typing; re-run on focus so "Caught" markers reflect new catches.
  useEffect(() => {
    const timer = setTimeout(() => {
      load().catch(console.error);
    }, 120);
    return () => clearTimeout(timer);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load().catch(console.error);
    }, [load]),
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.code}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.list}
        contentContainerStyle={styles.content}
        initialNumToRender={20}
        windowSize={7}
        ListHeaderComponent={
          <ScreenHeader title="Species" subtitle={`${items.length.toLocaleString()} in North & Middle America`}>
            <SearchField
              placeholder="Search by name or family"
              value={query}
              onChangeText={setQuery}
            />
          </ScreenHeader>
        }
        ListEmptyComponent={
          <EmptyState title="No species match" hint="Try a shorter name, or the family, like “warbler”." />
        }
        renderItem={({ item }) => (
          <SpeciesRow
            code={item.code}
            commonName={item.commonName}
            scientificName={item.scientificName}
            detail={item.familyCommon}
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
