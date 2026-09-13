import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { SearchField } from '@/components/search-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { checkBadges, recordFriendCount } from '@/lib/badges';
import {
  acceptFriendRequest,
  getMyProfile,
  listFriendships,
  profileName,
  removeFriendship,
  searchProfiles,
  sendFriendRequest,
  type FriendEntry,
  type Profile,
} from '@/lib/friends';
import { supabase } from '@/lib/supabase';

type Row =
  | { kind: 'header'; key: string; title: string }
  | { kind: 'friend'; key: string; entry: FriendEntry }
  | { kind: 'result'; key: string; profile: Profile; relation: FriendEntry['relation'] | null };

/** Your friends, requests in both directions, and username search. */
export default function FriendsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [hasUsername, setHasUsername] = useState<boolean | null>(null);
  const db = useSQLiteContext();
  const [entries, setEntries] = useState<FriendEntry[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const [profile, list] = await Promise.all([getMyProfile(supabase, user.id), listFriendships(supabase, user.id)]);
    setHasUsername(Boolean(profile?.username));
    setEntries(list);
    await recordFriendCount(db, list.filter((e) => e.relation === 'friend').length);
    await checkBadges(db);
  }, [user, db]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
    }, [load]),
  );

  useEffect(() => {
    const client = supabase;
    if (!client || !user) return;
    const timer = setTimeout(() => {
      searchProfiles(client, query, user.id)
        .then(setResults)
        .catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, user]);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!supabase || !user) {
    return (
      <ThemedView style={styles.container}>
        <EmptyState title="Sign in to add friends" hint="Friends need an account so your life lists can find each other." />
        <View style={styles.padded}>
          <Button title="Go to Account" onPress={() => router.push('/account')} />
        </View>
      </ThemedView>
    );
  }

  if (hasUsername === false) {
    return (
      <ThemedView style={styles.container}>
        <EmptyState title="Pick a username first" hint="Friends find you by username. Set one on your Account page." />
        <View style={styles.padded}>
          <Button title="Set a username" onPress={() => router.push('/account')} />
        </View>
      </ThemedView>
    );
  }

  const relationOf = (id: string) => entries.find((e) => e.profile.id === id)?.relation ?? null;
  const incoming = entries.filter((e) => e.relation === 'incoming');
  const outgoing = entries.filter((e) => e.relation === 'outgoing');
  const friends = entries.filter((e) => e.relation === 'friend');

  const rows: Row[] = [];
  if (query.trim().length >= 2) {
    rows.push({ kind: 'header', key: 'h-results', title: results.length ? 'RESULTS' : 'NO ONE FOUND' });
    for (const p of results) rows.push({ kind: 'result', key: `r-${p.id}`, profile: p, relation: relationOf(p.id) });
  } else {
    if (incoming.length) {
      rows.push({ kind: 'header', key: 'h-in', title: 'REQUESTS FOR YOU' });
      for (const e of incoming) rows.push({ kind: 'friend', key: `f-${e.profile.id}`, entry: e });
    }
    rows.push({ kind: 'header', key: 'h-friends', title: friends.length ? `FRIENDS · ${friends.length}` : 'NO FRIENDS YET' });
    for (const e of friends) rows.push({ kind: 'friend', key: `f-${e.profile.id}`, entry: e });
    if (outgoing.length) {
      rows.push({ kind: 'header', key: 'h-out', title: 'SENT' });
      for (const e of outgoing) rows.push({ kind: 'friend', key: `f-${e.profile.id}`, entry: e });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SearchField placeholder="Find a friend by username" value={query} onChangeText={setQuery} />
            {message ? <ThemedText type="small" style={{ color: theme.danger }}>{message}</ThemedText> : null}
          </View>
        }
        ListEmptyComponent={<EmptyState title="Search by username" hint="Ask a friend for theirs, or share yours from the Account page." />}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                {item.title}
              </ThemedText>
            );
          }
          const profile = item.kind === 'friend' ? item.entry.profile : item.profile;
          const relation = item.kind === 'friend' ? item.entry.relation : item.relation;
          const key = profile.id;
          const canOpen = relation === 'friend';
          return (
            <Pressable
              accessibilityRole="button"
              disabled={!canOpen}
              onPress={() => router.push({ pathname: '/friends/[id]', params: { id: profile.id } })}
              style={({ pressed }) => [styles.row, { borderBottomColor: theme.border }, pressed && canOpen && styles.pressed]}>
              <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold">{(profile.username ?? '?').slice(0, 1).toUpperCase()}</ThemedText>
              </View>
              <View style={styles.rowText}>
                <ThemedText numberOfLines={1}>{profileName(profile)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {profile.username ? `@${profile.username}` : ''}
                  {relation === 'friend' ? '  ·  Tap to see their life list' : relation === 'outgoing' ? '  ·  Request sent' : ''}
                </ThemedText>
              </View>
              {relation === 'incoming' ? (
                <View style={styles.actions}>
                  <Button title="Accept" loading={busy === `a-${key}`} onPress={() => act(`a-${key}`, () => acceptFriendRequest(supabase!, user.id, profile.id))} style={styles.smallButton} />
                  <Button title="Decline" variant="secondary" loading={busy === `d-${key}`} onPress={() => act(`d-${key}`, () => removeFriendship(supabase!, user.id, profile.id))} style={styles.smallButton} />
                </View>
              ) : relation === null ? (
                <Button title="Add" loading={busy === `s-${key}`} onPress={() => act(`s-${key}`, () => sendFriendRequest(supabase!, user.id, profile.id))} style={styles.smallButton} />
              ) : relation === 'outgoing' ? (
                <Button title="Cancel" variant="secondary" loading={busy === `d-${key}`} onPress={() => act(`d-${key}`, () => removeFriendship(supabase!, user.id, profile.id))} style={styles.smallButton} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  padded: { padding: Spacing.four },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, paddingBottom: Spacing.six },
  headerBlock: { padding: Spacing.four, gap: Spacing.two },
  sectionLabel: { letterSpacing: 0.6, fontSize: 12, paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.four, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.6 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  actions: { flexDirection: 'row', gap: Spacing.one },
  smallButton: { minHeight: 36, paddingVertical: 6, paddingHorizontal: Spacing.three, borderRadius: Spacing.two + 2 },
});
