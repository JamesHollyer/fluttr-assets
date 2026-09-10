import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { SpeciesThumb } from '@/components/species-thumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MODEL_SIZE_MB } from '@/lib/sound/model';
import { useSoundId, type HeardSpecies } from '@/lib/sound/use-sound-id';
import { useSpeciesNames } from '@/lib/sound/use-species-names';

function LevelMeter({ levels, active }: { levels: number[]; active: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.meter}>
      {levels.map((v, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: 6 + v * 54,
              backgroundColor: active ? theme.accent : theme.backgroundSelected,
              opacity: active ? 0.35 + 0.65 * (i / levels.length) : 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

function HeardRow({ item, name, sci, onPress }: { item: HeardSpecies; name: string; sci: string; onPress: () => void }) {
  const theme = useTheme();
  const pulse = useSharedValue(item.nowScore > 0 ? 1 : 0);
  useEffect(() => {
    pulse.value = withTiming(item.nowScore > 0 ? 1 : 0, { duration: 250 });
  }, [item.nowScore, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * pulse.value, transform: [{ scale: 0.8 + 0.4 * pulse.value }] }));
  const pct = Math.round(item.score * 100);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { borderBottomColor: theme.border }, pressed && styles.pressed]}>
      <SpeciesThumb code={item.code} />
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1}>{name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sci}>{sci}</ThemedText>
          {`  ·  ${pct}%`}
        </ThemedText>
      </View>
      <Animated.View style={[styles.pulse, { backgroundColor: theme.highlight }, pulseStyle]} />
    </Pressable>
  );
}

export default function ListenScreen() {
  const theme = useTheme();
  const router = useRouter();
  const names = useSpeciesNames();
  const id = useSoundId('usca');
  const listening = id.listenState === 'listening' || id.listenState === 'starting';

  if (Platform.OS === 'web') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title="Sound ID" />
        <EmptyState title="Not on the web yet" hint="Sound ID runs on the phone. Use the iOS or Android app to listen." />
      </ThemedView>
    );
  }

  const header = (
    <ScreenHeader
      title="Sound ID"
      subtitle={
        id.modelState === 'ready'
          ? listening
            ? id.windowsRun === 0
              ? 'Listening… first result in about 5 seconds'
              : `${id.heard.length} ${id.heard.length === 1 ? 'species' : 'species'} heard`
            : 'Tap Listen and hold the phone toward the bird'
          : 'Identify birds by their songs and calls'
      }>
      {id.modelState === 'missing' && (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Download the Sound ID model</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            About {MODEL_SIZE_MB} MB, once. Runs entirely on your phone, so it works with no signal.
          </ThemedText>
          <Button title="Download" onPress={() => id.download().catch(console.error)} />
        </View>
      )}
      {id.modelState === 'downloading' && (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Downloading… {Math.round(id.progress * 100)}%</ThemedText>
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { width: `${Math.round(id.progress * 100)}%`, backgroundColor: theme.accent }]} />
          </View>
        </View>
      )}
      {id.modelState === 'checking' && (
        <ThemedText type="small" themeColor="textSecondary">Checking for the model…</ThemedText>
      )}
      {id.modelState === 'ready' && (
        <>
          <LevelMeter levels={id.levels} active={listening} />
          <Button
            title={listening ? 'Stop' : 'Listen'}
            variant={listening ? 'secondary' : 'primary'}
            loading={id.listenState === 'starting'}
            onPress={() => (listening ? id.stop() : id.start()).catch(console.error)}
          />
          {__DEV__ && !listening ? (
            <Button title="Test with sample clip" variant="secondary" onPress={() => id.testWithSample().catch(console.error)} />
          ) : null}
        </>
      )}
      {id.error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>{id.error}</ThemedText>
      ) : null}
    </ScreenHeader>
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={id.heard}
        keyExtractor={(item) => item.code}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={
          id.modelState === 'ready' && !listening ? (
            <EmptyState title="Nothing heard yet" hint="Birds you hear will appear here. Tap one to catch it." />
          ) : null
        }
        renderItem={({ item }) => (
          <HeardRow
            item={item}
            name={names.get(item.code)?.commonName ?? item.code}
            sci={names.get(item.code)?.scientificName ?? ''}
            onPress={() => router.push({ pathname: '/species/[code]', params: { code: item.code, method: 'sound' } })}
          />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, paddingBottom: BottomTabInset + Spacing.four },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
  meter: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 64 },
  bar: { flex: 1, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.four, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 1 },
  sci: { fontStyle: 'italic' },
  pulse: { width: 10, height: 10, borderRadius: 5 },
});
