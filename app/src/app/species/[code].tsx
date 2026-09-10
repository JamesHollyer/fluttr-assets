import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { SoundsSection } from '@/components/sounds-section';
import { SpeciesPhoto } from '@/components/species-photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { deleteSighting, listSightingsForSpecies, type Sighting } from '@/db/sightings';
import { getSpecies, type SpeciesWithCount } from '@/db/species';
import { confirmAsync } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { requestSync } from '@/lib/sync/sync';
import { useTheme } from '@/hooks/use-theme';

export default function SpeciesDetailScreen() {
  const { code, method } = useLocalSearchParams<{ code: string; method?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const [species, setSpecies] = useState<SpeciesWithCount | null>(null);
  const [sightings, setSightings] = useState<Sighting[]>([]);

  const load = useCallback(async () => {
    const [s, list] = await Promise.all([getSpecies(db, code), listSightingsForSpecies(db, code)]);
    setSpecies(s);
    setSightings(list);
  }, [db, code]);

  useFocusEffect(
    useCallback(() => {
      load().catch(console.error);
    }, [load]),
  );

  async function onRemove(sighting: Sighting) {
    const ok = await confirmAsync(
      'Remove this catch?',
      `${species?.commonName ?? 'This bird'} on ${formatDateTime(sighting.observedAt)} will be removed from your life list.`,
    );
    if (!ok) return;
    await deleteSighting(db, sighting.id);
    requestSync();
    await load();
  }

  if (!species) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState title="Species not found" />
      </ThemedView>
    );
  }

  const tags = [species.familyCommon, species.order, species.introduced ? 'Introduced' : null].filter(Boolean);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: species.commonName }} />
      <ScrollView contentContainerStyle={styles.content}>
        <SpeciesPhoto
          commonName={species.commonName}
          imageUrl={species.imageUrl}
          imageWidth={species.imageWidth}
          imageHeight={species.imageHeight}
          imageArtist={species.imageArtist}
          imageLicense={species.imageLicense}
          imagePage={species.imagePage}
        />

        <View style={styles.hero}>
          <ThemedText type="subtitle" style={styles.title}>
            {species.commonName}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.sci}>
            {species.scientificName}
          </ThemedText>
          <View style={styles.tags}>
            {tags.map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {tag}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        <Button
          title={species.catchCount === 0 ? 'Catch it' : 'Catch it again'}
          onPress={() => router.push({ pathname: '/catch/[code]', params: method ? { code, method } : { code } })}
        />

        {species.description ? (
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
              ABOUT
            </ThemedText>
            <ThemedText style={styles.description}>{species.description}</ThemedText>
            {species.wikiUrl ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => species.wikiUrl && Linking.openURL(species.wikiUrl)}
                hitSlop={6}>
                <ThemedText type="small" style={{ color: theme.accent }}>
                  From Wikipedia (CC BY-SA)
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <SoundsSection speciesCode={species.code} commonName={species.commonName} />

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            {sightings.length === 0
              ? 'NOT CAUGHT YET'
              : `YOUR CATCHES · ${sightings.length}`}
          </ThemedText>
          {sightings.map((s) => (
            <View key={s.id} style={[styles.sightingRow, { borderBottomColor: theme.border }]}>
              <View style={styles.sightingText}>
                <ThemedText>{formatDateTime(s.observedAt)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[s.lat != null ? 'Location saved' : 'No location', s.note].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove catch"
                hitSlop={8}
                onPress={() => onRemove(s).catch(console.error)}>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  Remove
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  hero: {
    gap: Spacing.one,
  },
  title: {
    lineHeight: 38,
  },
  sci: {
    fontStyle: 'italic',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  tag: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    letterSpacing: 0.6,
    fontSize: 12,
  },
  description: {
    fontWeight: 400,
    lineHeight: 25,
  },
  sightingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sightingText: {
    flex: 1,
    gap: 1,
  },
});
