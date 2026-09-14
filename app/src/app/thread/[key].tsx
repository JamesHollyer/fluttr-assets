import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { addComment, deleteComment, fetchComments, profileLabel, timeAgo, type Comment } from '@/lib/feed';
import { supabase } from '@/lib/supabase';

/** The comment thread on one feed item. The key is `kind:itemId:ownerId`. */
export default function ThreadScreen() {
  const { key, title, when } = useLocalSearchParams<{ key: string; title?: string; when?: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, itemId, ownerId] = (key ?? '').split(':');
  const item = { kind: kind as 'catch' | 'badge', itemId, userId: ownerId };

  const load = useCallback(() => {
    const client = supabase;
    if (!client || !itemId) return Promise.resolve();
    return fetchComments(client, { kind: kind as 'catch' | 'badge', itemId, userId: ownerId })
      .then((list) => {
        setComments(list);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [kind, itemId, ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const client = supabase;
    if (!client || !user || !draft.trim()) return;
    setBusy(true);
    try {
      await addComment(client, user.id, item, draft);
      setDraft('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const client = supabase;
    if (!client) return;
    setComments((prev) => prev?.filter((c) => c.id !== id) ?? null);
    try {
      await deleteComment(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      load();
    }
  }

  const inputStyle = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Comments' }} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={[styles.item, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">{title ?? 'Catch'}</ThemedText>
              {when ? <ThemedText type="small" themeColor="textSecondary">{timeAgo(when)}</ThemedText> : null}
            </View>
          }
          ListEmptyComponent={
            error ? (
              <EmptyState title="Could not load comments" hint={error} />
            ) : comments === null ? null : (
              <EmptyState title="No comments yet" hint="Say something nice. Only the owner and their friends can see this thread." />
            )
          }
          renderItem={({ item: c }) => {
            const mine = c.authorId === user?.id;
            const canDelete = mine || ownerId === user?.id;
            return (
              <View style={styles.comment}>
                <View style={[styles.avatar, { backgroundColor: mine ? theme.highlightSoft : theme.backgroundSelected }]}>
                  <ThemedText type="smallBold">{(c.author ? profileLabel(c.author) : '?').replace('@', '').slice(0, 1).toUpperCase()}</ThemedText>
                </View>
                <View style={styles.bubbleWrap}>
                  <View style={styles.meta}>
                    <ThemedText type="smallBold">{mine ? 'You' : c.author ? profileLabel(c.author) : 'A friend'}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.metaFixed}>{timeAgo(c.createdAt)}</ThemedText>
                    {canDelete ? (
                      <Pressable accessibilityRole="button" onPress={() => remove(c.id)} hitSlop={8}>
                        <ThemedText type="small" style={{ color: theme.danger }}>Delete</ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                  <ThemedText>{c.body}</ThemedText>
                </View>
              </View>
            );
          }}
        />
        <View style={[styles.composer, { borderColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.two) }]}>
          <TextInput
            style={inputStyle}
            placeholder={user ? 'Write a comment' : 'Sign in to comment'}
            placeholderTextColor={theme.textSecondary}
            value={draft}
            onChangeText={setDraft}
            editable={Boolean(user)}
            multiline
            maxLength={500}
          />
          <Button title="Send" loading={busy} disabled={!user || !draft.trim()} onPress={send} style={styles.send} />
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, padding: Spacing.four, gap: Spacing.three, flexGrow: 1 },
  item: { paddingBottom: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  comment: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bubbleWrap: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, flexWrap: 'nowrap' },
  metaFixed: { flexShrink: 0 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: Spacing.three, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  send: { minWidth: 84 },
});
