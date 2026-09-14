import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { SpeciesThumb } from '@/components/species-thumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { BADGE_BY_ID, checkBadges, recordFriendCount } from '@/lib/badges';
import { fetchFeed, profileLabel, setCongratulated, timeAgo, type FeedItem } from '@/lib/feed';
import { getMyProfile, listFriendships } from '@/lib/friends';
import { supabase } from '@/lib/supabase';

type Row = FeedItem & { commonName: string | null; /** Other badges earned by the same person around the same time. */ alsoEarned: FeedItem[] };

const GROUP_WINDOW_MS = 30 * 60 * 1000;

/** Badges earned by one person within half an hour collapse into a single row. */
function groupBadges(items: (FeedItem & { commonName: string | null })[]): Row[] {
  const out: Row[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (
      item.kind === 'badge' &&
      last?.kind === 'badge' &&
      last.userId === item.userId &&
      new Date(last.happenedAt).getTime() - new Date(item.happenedAt).getTime() < GROUP_WINDOW_MS
    ) {
      last.alsoEarned.push(item);
      continue;
    }
    out.push({ ...item, alsoEarned: [] });
  }
  return out;
}

/** What your friends have been catching, and a way to cheer them on. */
export default function FriendsTab() {
  const theme = useTheme();
  const router = useRouter();
  const db = useSQLiteContext();
  const { user, configured } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [pending, setPending] = useState(0);
  const [hasUsername, setHasUsername] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const client = supabase;
    if (!client || !user) return;
    const [profile, friends, feed] = await Promise.all([
      getMyProfile(client, user.id),
      listFriendships(client, user.id),
      fetchFeed(client, user.id),
    ]);
    setHasUsername(Boolean(profile?.username));
    const accepted = friends.filter((f) => f.relation === 'friend').length;
    setFriendCount(accepted);
    await recordFriendCount(db, accepted);
    await checkBadges(db);
    setPending(friends.filter((f) => f.relation === 'incoming').length);
    const codes = [...new Set(feed.map((f) => f.speciesCode).filter((c): c is string => Boolean(c)))];
    const names = codes.length
      ? await db.getAllAsync<{ code: string; commonName: string }>(
          `SELECT code, common_name AS commonName FROM species WHERE code IN (${codes.map(() => '?').join(',')})`,
          codes,
        )
      : [];
    const byCode = new Map(names.map((n) => [n.code, n.commonName]));
    setRows(groupBadges(feed.map((f) => ({ ...f, commonName: f.speciesCode ? (byCode.get(f.speciesCode) ?? f.speciesCode) : null }))));
    setError(null);
  }, [user, db]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, [load]),
  );

  async function toggle(item: Row) {
    const client = supabase;
    if (!client || !user || item.userId === user.id) return;
    const next = !item.congratulated;
    setRows((prev) => prev?.map((r) => (r.key === item.key ? { ...r, congratulated: next } : r)) ?? null);
    try {
      await setCongratulated(client, user.id, item, next);
    } catch (e) {
      setRows((prev) => prev?.map((r) => (r.key === item.key ? { ...r, congratulated: !next } : r)) ?? null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const manageLine =
    pending > 0
      ? `${pending} friend ${pending === 1 ? 'request' : 'requests'} waiting`
      : friendCount === 0
        ? 'Find friends by username'
        : `${friendCount} ${friendCount === 1 ? 'friend' : 'friends'}`;

  const header = (
    <ScreenHeader title="Friends" subtitle={user ? 'What your flock has been catching' : undefined}>
      {user ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/friends/manage')} style={styles.manageRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.manageText}>{manageLine}</ThemedText>
          <ThemedText type="smallBold" style={{ color: pending > 0 ? theme.highlight : theme.accent }}>
            {pending > 0 ? 'Respond' : 'Manage'}
          </ThemedText>
        </Pressable>
      ) : null}
    </ScreenHeader>
  );

  if (!configured || !user) {
    return (
      <ThemedView style={styles.container}>
        {header}
        <EmptyState title="Sign in to see friends" hint="Friends need an account so your catches can find each other." />
        <View style={styles.signIn}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/account')}>
            <ThemedText type="smallBold" style={{ color: theme.accent, textAlign: 'center' }}>Sign in</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.key}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load().catch((e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setRefreshing(false));
            }}
          />
        }
        ListEmptyComponent={
          error ? (
            <EmptyState title="Could not load the feed" hint={error} />
          ) : rows === null ? null : hasUsername === false ? (
            <EmptyState title="Pick a username first" hint="Friends find you by username. Set one on your Account page." />
          ) : friendCount === 0 ? (
            <EmptyState title="No friends yet" hint="Tap Manage to find friends by username. Your own catches show here too." />
          ) : (
            <EmptyState title="Quiet out there" hint="Catches and badges from you and your friends will show up here." />
          )
        }
        renderItem={({ item }) => {
          const who = item.userId === user.id ? 'You' : item.profile ? profileLabel(item.profile) : 'A friend';
          const badge = item.badgeId ? BADGE_BY_ID.get(item.badgeId) : null;
          const own = item.userId === user.id;
          const group = item.kind === 'badge' ? [item, ...item.alsoEarned].map((b) => BADGE_BY_ID.get(b.badgeId ?? '')).filter((b): b is NonNullable<typeof b> => Boolean(b)) : [];
          return (
            <Pressable
              accessibilityRole={item.kind === 'catch' ? 'button' : undefined}
              onPress={item.kind === 'catch' && item.speciesCode ? () => router.push(`/species/${item.speciesCode}`) : undefined}
              style={[styles.row, { borderColor: theme.border }]}>
              {item.kind === 'catch' && item.speciesCode ? (
                <SpeciesThumb code={item.speciesCode} size={52} caught={item.isLifer} />
              ) : (
                <View style={[styles.glyphWrap, { backgroundColor: theme.highlightSoft, borderColor: theme.highlight }]}>
                  <ThemedText style={group.length > 1 ? styles.glyphSmall : styles.glyph}>
                    {group.length > 1 ? group.slice(0, 4).map((b) => b.glyph).join('') : (badge?.glyph ?? '🏅')}
                  </ThemedText>
                </View>
              )}
              <View style={styles.copy}>
                <ThemedText type="small">
                  <ThemedText type="smallBold">{who}</ThemedText>
                  {item.kind === 'catch' ? ' caught a ' : group.length > 1 ? ` earned ${group.length} badges: ` : ' earned '}
                  <ThemedText type="smallBold">
                    {item.kind === 'catch' ? item.commonName : group.length > 1 ? group.map((b) => b.name).join(', ') : (badge?.name ?? item.badgeId)}
                  </ThemedText>
                  {item.isLifer ? <ThemedText type="smallBold" style={{ color: theme.highlight }}> · Lifer!</ThemedText> : null}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {timeAgo(item.happenedAt)}
                  {item.kind === 'badge' && badge && group.length === 1 ? ` · ${badge.description}` : ''}
                  {own && item.congratulatedBy.length ? ` · 🎉 ${item.congratulatedBy.join(', ')}` : ''}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Comments"
                onPress={() =>
                  router.push({
                    pathname: '/thread/[key]',
                    params: {
                      key: item.key,
                      title: item.kind === 'catch' ? `${who} caught a ${item.commonName ?? ''}` : `${who} earned ${group.length > 1 ? `${group.length} badges` : (badge?.name ?? '')}`,
                      when: item.happenedAt,
                    },
                  })
                }
                hitSlop={8}
                style={[styles.cheer, { backgroundColor: theme.backgroundElement, borderColor: item.commentCount ? theme.accent : theme.border }]}>
                <ThemedText style={styles.cheerGlyph}>💬</ThemedText>
                {item.commentCount ? (
                  <View style={[styles.count, { backgroundColor: theme.accent }]}>
                    <ThemedText type="small" style={styles.countText}>{item.commentCount}</ThemedText>
                  </View>
                ) : null}
              </Pressable>
              {!own ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.congratulated ? 'Remove congratulation' : 'Congratulate'}
                  onPress={() => toggle(item)}
                  hitSlop={8}
                  style={[
                    styles.cheer,
                    { backgroundColor: item.congratulated ? theme.highlightSoft : theme.backgroundElement, borderColor: item.congratulated ? theme.highlight : theme.border },
                  ]}>
                  <ThemedText style={styles.cheerGlyph}>🎉</ThemedText>
                </Pressable>
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
  list: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, paddingBottom: Spacing.six },
  manageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.one },
  manageText: { flex: 1 },
  signIn: { padding: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  glyphWrap: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 24, lineHeight: 30 },
  glyphSmall: { fontSize: 11, lineHeight: 14, textAlign: 'center', width: 40 },
  copy: { flex: 1, gap: 2 },
  cheer: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cheerGlyph: { fontSize: 18, lineHeight: 22 },
  count: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14 },
});
