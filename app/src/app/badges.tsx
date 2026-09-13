import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { badgeStatus, CATEGORY_LABELS, type BadgeCategory, type BadgeStatus } from '@/lib/badges';
import { formatDate } from '@/lib/format';

const ORDER: BadgeCategory[] = ['lifelist', 'catching', 'streaks', 'skills', 'groups', 'moments', 'friends'];

/** Every badge, earned or not, with progress toward the next tier. */
export default function BadgesScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [rows, setRows] = useState<BadgeStatus[] | null>(null);

  useEffect(() => {
    badgeStatus(db).then(setRows).catch(console.error);
  }, [db]);

  const sections = useMemo(() => {
    if (!rows) return [];
    return ORDER.map((cat) => ({
      title: CATEGORY_LABELS[cat],
      data: rows.filter((r) => r.badge.category === cat),
    })).filter((s) => s.data.length);
  }, [rows]);

  const earned = rows?.filter((r) => r.earnedAt).length ?? 0;
  const total = rows?.length ?? 0;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Badges' }} />
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.badge.id}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="subtitle">Badges</ThemedText>
            <ThemedText themeColor="textSecondary">
              {rows ? `${earned} of ${total} earned` : 'Loading…'}
            </ThemedText>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
            {section.title.toUpperCase()}
          </ThemedText>
        )}
        renderItem={({ item }) => {
          const done = Boolean(item.earnedAt);
          const ratio = item.target > 0 ? item.current / item.target : 0;
          return (
            <View style={[styles.row, { borderColor: theme.border }]}>
              <View
                style={[
                  styles.glyphWrap,
                  { backgroundColor: done ? theme.highlightSoft : theme.backgroundElement, borderColor: done ? theme.highlight : theme.border },
                ]}>
                <ThemedText style={[styles.glyph, !done && styles.glyphLocked]}>{item.badge.glyph}</ThemedText>
              </View>
              <View style={styles.copy}>
                <ThemedText type="smallBold" themeColor={done ? 'text' : 'textSecondary'}>{item.badge.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{item.badge.description}</ThemedText>
                {done ? (
                  <ThemedText type="small" style={{ color: theme.accent }}>Earned {formatDate(item.earnedAt!)}</ThemedText>
                ) : (
                  <View style={styles.progressRow}>
                    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                      <View style={[styles.fill, { backgroundColor: theme.accent, width: `${Math.round(ratio * 100)}%` }]} />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.progressText}>
                      {item.target === 1 ? 'Not yet' : `${item.current} / ${item.target}`}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  header: { gap: Spacing.one, marginBottom: Spacing.two },
  sectionTitle: { letterSpacing: 1, marginTop: Spacing.four, marginBottom: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  glyphWrap: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 26, lineHeight: 32 },
  glyphLocked: { opacity: 0.35 },
  copy: { flex: 1, gap: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: 4 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  progressText: { minWidth: 56, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
