import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { SpeciesRow } from '@/components/species-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { countEarnedBadges } from '@/db/badges';
import { getLifeList, getStats, type LifeListEntry } from '@/db/sightings';
import { BADGES } from '@/lib/badges';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useSync } from '@/lib/sync/use-sync';

export default function LifeListScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const auth = useAuth();
  const sync = useSync();
  const [entries, setEntries] = useState<LifeListEntry[]>([]);
  const [stats, setStats] = useState({ species: 0, catches: 0 });
  const [earnedBadges, setEarnedBadges] = useState(0);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getLifeList(db), getStats(db), countEarnedBadges(db)])
        .then(([list, s, badges]) => {
          setEntries(list);
          setStats(s);
          setEarnedBadges(badges);
        })
        .catch(console.error);
    }, [db]),
  );

  const badgeLine = earnedBadges === 0 ? `Earn badges as you bird · 0 of ${BADGES.length}` : `${earnedBadges} of ${BADGES.length} badges earned`;

  const subtitle =
    stats.species === 0
      ? 'No birds caught yet'
      : `${stats.species} ${stats.species === 1 ? 'species' : 'species'} · ${stats.catches} ${stats.catches === 1 ? 'catch' : 'catches'}`;

  const accountLine = !auth.configured
    ? null
    : auth.user
      ? sync.status === 'syncing'
        ? 'Syncing…'
        : sync.status === 'error'
          ? 'Saved on this phone · will sync when connected'
          : sync.pending > 0
            ? `${sync.pending} to upload`
            : 'Backed up'
      : 'Not signed in · catches stay on this phone';

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.code}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <ScreenHeader title="Life list" subtitle={subtitle}>
            {accountLine ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={styles.accountRow}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.accountText} numberOfLines={1}>
                  {accountLine}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  {auth.user ? 'Account' : 'Sign in'}
                </ThemedText>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => router.push('/badges')} style={styles.accountRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.accountText}>
                {badgeLine}
              </ThemedText>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>Badges</ThemedText>
            </Pressable>
            {auth.user ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/friends')} style={styles.accountRow}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.accountText}>
                  See what your friends have caught
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>Friends</ThemedText>
              </Pressable>
            ) : null}
          </ScreenHeader>
        }
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
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  accountText: {
    flex: 1,
  },
});
