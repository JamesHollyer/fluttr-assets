import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAsync } from '@/lib/confirm';
import { isModelInstalled, MODEL_SIZE_MB } from '@/lib/sound/model';
import { canStoreOffline } from '@/lib/sounds/files';
import {
  downloadRegionPack,
  removeRegionPack,
  summarizeRegionPack,
  type PackProgress,
  type RegionPackSummary,
} from '@/lib/sounds/region-pack';

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

/**
 * What the phone has for offline use, per pack. Sound ID's model and the
 * regional sound library today; photos when the photo pack exists.
 */
export default function DownloadsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [sounds, setSounds] = useState<RegionPackSummary | null>(null);
  const [modelInstalled, setModelInstalled] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  const refresh = useCallback(async () => {
    setSounds(await summarizeRegionPack(db, 'usca'));
    setModelInstalled(await isModelInstalled());
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(console.error);
    }, [refresh]),
  );

  const startDownload = async () => {
    setError(null);
    stop.current = false;
    setProgress({ done: 0, total: sounds?.clips ?? 0, failed: 0 });
    try {
      const result = await downloadRegionPack(db, 'usca', setProgress, () => stop.current);
      if (result.failed > 0) setError(`${result.failed} clips could not be downloaded. Try again later to fill them in.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      await refresh();
    }
  };

  const removeAll = async () => {
    const ok = await confirmAsync('Remove saved sounds?', 'Clips will stream when you have a connection. You can download them again any time.');
    if (!ok) return;
    await removeRegionPack(db, 'usca');
    await refresh();
  };

  const card = { backgroundColor: theme.backgroundElement };
  const downloading = progress !== null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Downloads</ThemedText>
        <ThemedText themeColor="textSecondary">
          Everything here works with no signal once it is on your phone. Species, photos for lists, the
          identification wizard, and your catches are always available.
        </ThemedText>

        <View style={[styles.card, card]}>
          <ThemedText type="smallBold">Bird sounds · United States &amp; Canada</ThemedText>
          {sounds ? (
            <ThemedText type="small" themeColor="textSecondary">
              {`${sounds.clips.toLocaleString()} clips for ${sounds.species.toLocaleString()} species · about ${formatBytes(sounds.estimatedBytes)}`}
              {sounds.saved > 0 ? ` · ${sounds.saved.toLocaleString()} saved` : ''}
            </ThemedText>
          ) : null}
          {downloading ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {`Downloading ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}${progress.failed ? ` · ${progress.failed} failed` : ''}`}
              </ThemedText>
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[styles.fill, { width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`, backgroundColor: theme.accent }]}
                />
              </View>
              <Button title="Pause" variant="secondary" onPress={() => { stop.current = true; }} />
            </>
          ) : !canStoreOffline ? (
            <ThemedText type="small" themeColor="textSecondary">Offline downloads are not available on the web.</ThemedText>
          ) : sounds && sounds.saved >= sounds.clips && sounds.clips > 0 ? (
            <>
              <ThemedText type="small" style={{ color: theme.accent }}>All saved</ThemedText>
              <Button title="Remove saved sounds" variant="destructive" onPress={() => removeAll().catch(console.error)} />
            </>
          ) : (
            <>
              <Button title={sounds && sounds.saved > 0 ? 'Continue download' : 'Download all'} onPress={() => startDownload().catch(console.error)} />
              {sounds && sounds.saved > 0 ? (
                <Button title="Remove saved sounds" variant="destructive" onPress={() => removeAll().catch(console.error)} />
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                Keep the app open while it downloads. You can pause and continue later; nothing is lost.
              </ThemedText>
            </>
          )}
          {error ? <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText> : null}
        </View>

        <View style={[styles.card, card]}>
          <ThemedText type="smallBold">Sound ID model</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {modelInstalled === null ? 'Checking…' : modelInstalled ? `Installed · about ${MODEL_SIZE_MB} MB` : `Not downloaded · about ${MODEL_SIZE_MB} MB. Download it from the Sound ID tab.`}
          </ThemedText>
        </View>

        <View style={[styles.card, card]}>
          <ThemedText type="smallBold">Full-size photos</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Coming later as a download. List thumbnails are already built in; species-page photos need a connection.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
});
