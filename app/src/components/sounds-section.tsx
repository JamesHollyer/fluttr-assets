import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { KIND_LABELS, listRecordings, setRecordingDownloaded, type Recording } from '@/db/recordings';
import { useTheme } from '@/hooks/use-theme';
import { canStoreOffline, isStoredOffline, localUriFor, removeOffline, storeOffline } from '@/lib/sounds/files';
import { MEDIA_HEADERS } from '@/lib/sounds/source';

const NOTICE_KEY = 'playback_notice_seen';

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Props = { speciesCode: string; commonName: string };

/**
 * Songs and calls for a species: tap to play, one at a time, with a per-species
 * offline download. Recordings stream from Wikimedia Commons unless saved.
 */
export function SoundsSection({ speciesCode, commonName }: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [offline, setOffline] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [noticeSeen, setNoticeSeen] = useState(true);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const recs = await listRecordings(db, speciesCode);
    setRecordings(recs);
    const stored = new Set<string>();
    for (const r of recs) if (await isStoredOffline(r.id)) stored.add(r.id);
    setOffline(stored);
    const seen = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', NOTICE_KEY);
    setNoticeSeen(Boolean(seen));
  }, [db, speciesCode]);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(() => {});
  }, []);

  // Reload on focus so offline state stays right after leaving and returning.
  useFocusEffect(
    useCallback(() => {
      load().catch(console.error);
    }, [load]),
  );

  // Clear the active row when a clip ends.
  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.error) console.warn('[sounds] playback error', s.error);
      if (s.didJustFinish) setActiveId(null);
    });
    return () => sub.remove();
  }, [player]);

  const dismissNotice = async () => {
    await db.runAsync("INSERT INTO meta (key, value) VALUES (?, '1') ON CONFLICT (key) DO NOTHING", NOTICE_KEY);
    setNoticeSeen(true);
  };

  const toggle = (rec: Recording) => {
    setError(null);
    if (activeId === rec.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    const local = offline.has(rec.id);
    try {
      player.replace(local ? { uri: localUriFor(rec.id) } : { uri: rec.url, headers: MEDIA_HEADERS });
      player.play();
      setActiveId(rec.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const downloadAll = async () => {
    setError(null);
    setDownloading(0);
    try {
      const todo = recordings.filter((r) => !offline.has(r.id));
      for (let i = 0; i < todo.length; i++) {
        await storeOffline(todo[i], (f) => setDownloading((i + f) / todo.length));
        await setRecordingDownloaded(db, todo[i].id, new Date().toISOString());
        setOffline((prev) => new Set(prev).add(todo[i].id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(null);
    }
  };

  const removeAll = async () => {
    for (const r of recordings) {
      await removeOffline(r.id);
      await setRecordingDownloaded(db, r.id, null);
    }
    setOffline(new Set());
  };

  if (recordings.length === 0) return null;

  const allOffline = recordings.every((r) => offline.has(r.id));
  const progress = activeId && status.duration > 0 ? status.currentTime / status.duration : 0;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
          {`SOUNDS · ${recordings.length}`}
        </ThemedText>
        {canStoreOffline ? (
          downloading !== null ? (
            <ThemedText type="small" themeColor="textSecondary">{`Saving… ${Math.round(downloading * 100)}%`}</ThemedText>
          ) : allOffline ? (
            <Pressable accessibilityRole="button" onPress={() => removeAll().catch(console.error)} hitSlop={6}>
              <ThemedText type="small" themeColor="textSecondary">Saved offline · Remove</ThemedText>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => downloadAll().catch(console.error)} hitSlop={6}>
              <ThemedText type="small" style={{ color: theme.accent }}>Save for offline</ThemedText>
            </Pressable>
          )
        ) : null}
      </View>

      {!noticeSeen ? (
        <View style={[styles.notice, { backgroundColor: theme.highlightSoft }]}>
          <ThemedText type="smallBold">Playback, kindly</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Playing a bird&apos;s song can draw it in, but it also costs the bird energy and can disturb nesting.
            Keep it brief, skip it near nests and for rare birds, and follow the rules where you are.
          </ThemedText>
          <Button title="Got it" variant="secondary" onPress={() => dismissNotice().catch(console.error)} />
        </View>
      ) : null}

      {recordings.map((rec) => {
        const active = activeId === rec.id;
        const playing = active && status.playing;
        return (
          <View key={rec.id} style={[styles.row, { borderBottomColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? `Pause ${commonName} ${KIND_LABELS[rec.kind]}` : `Play ${commonName} ${KIND_LABELS[rec.kind]}`}
              onPress={() => toggle(rec)}
              style={({ pressed }) => [styles.playButton, { backgroundColor: active ? theme.accent : theme.backgroundElement }, pressed && styles.pressed]}>
              <View style={playing ? styles.pauseIcon : styles.playIcon}>
                {playing ? (
                  <>
                    <View style={[styles.pauseBar, { backgroundColor: theme.accentText }]} />
                    <View style={[styles.pauseBar, { backgroundColor: theme.accentText }]} />
                  </>
                ) : (
                  <View style={[styles.triangle, { borderLeftColor: active ? theme.accentText : theme.text }]} />
                )}
              </View>
            </Pressable>
            <View style={styles.rowText}>
              <ThemedText>
                {KIND_LABELS[rec.kind]}
                <ThemedText themeColor="textSecondary">{`  ${formatDuration(rec.duration)}`}</ThemedText>
              </ThemedText>
              <Pressable accessibilityRole="link" disabled={!rec.pageUrl} onPress={() => rec.pageUrl && Linking.openURL(rec.pageUrl)} hitSlop={4}>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {[rec.recordist ?? 'Unknown recordist', rec.license, offline.has(rec.id) ? 'offline' : null].filter(Boolean).join(' · ')}
                </ThemedText>
              </Pressable>
              {active ? (
                <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                  <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: theme.accent }]} />
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
      {canStoreOffline ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/downloads')} hitSlop={6} style={styles.allLink}>
          <ThemedText type="small" themeColor="textSecondary">Want every bird&apos;s sounds offline? Download the whole region.</ThemedText>
        </Pressable>
      ) : null}
      {error ? <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText> : null}
      {status.error && activeId ? <ThemedText type="small" style={{ color: theme.danger }}>{`Could not play: ${status.error}`}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { letterSpacing: 0.6, fontSize: 12 },
  notice: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 2 },
  playButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  playIcon: { marginLeft: 3 },
  pauseIcon: { flexDirection: 'row', gap: 4 },
  pauseBar: { width: 4, height: 16, borderRadius: 1 },
  triangle: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 13, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  allLink: { paddingTop: Spacing.one },
  fill: { height: 3 },
});
