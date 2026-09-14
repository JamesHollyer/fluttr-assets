import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/feed';
import { fetchActivity, markAllRead, routeForNotification, type ActivityItem } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

const GLYPH: Record<ActivityItem['kind'], string> = { reaction: '🎉', comment: '💬', friend_request: '👋', friend_accept: '🤝' };

/** Everything that happened to you: cheers, comments, and friend requests. Opening it marks all read. */
export default function ActivityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client || !user) return;
    fetchActivity(client)
      .then((list) => {
        setItems(list);
        return markAllRead(client, user.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [user]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Activity' }} />
      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          error ? <EmptyState title="Could not load activity" hint={error} /> : items === null ? null : <EmptyState title="Nothing yet" hint="Cheers, comments, and friend requests will land here." />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(routeForNotification({ kind: item.kind, item_kind: item.itemKind ?? undefined, item_id: item.itemId ?? undefined, owner_id: item.ownerId ?? undefined }) as never)}
            style={[styles.row, { borderColor: theme.border, backgroundColor: item.readAt ? 'transparent' : theme.highlightSoft }]}>
            <ThemedText style={styles.glyph}>{GLYPH[item.kind]}</ThemedText>
            <View style={styles.copy}>
              <ThemedText type="smallBold">{item.title}</ThemedText>
              {item.body ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{item.body}</ThemedText> : null}
              <ThemedText type="small" themeColor="textSecondary">{timeAgo(item.createdAt)}</ThemedText>
            </View>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, paddingBottom: Spacing.six },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  glyph: { fontSize: 22, lineHeight: 28 },
  copy: { flex: 1, gap: 2 },
});
