import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { CatchCelebration } from '@/components/catch-celebration';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { addSighting, type CatchResult } from '@/db/sightings';
import { getSpecies, type SpeciesWithCount } from '@/db/species';
import { useTheme } from '@/hooks/use-theme';
import { captureLocation, type Coords } from '@/lib/location';

type LocationState = { status: 'finding' } | { status: 'found'; coords: Coords } | { status: 'none' };

export default function CatchScreen() {
  const { code, method } = useLocalSearchParams<{ code: string; method?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();

  const [species, setSpecies] = useState<SpeciesWithCount | null>(null);
  const [note, setNote] = useState('');
  const [location, setLocation] = useState<LocationState>({ status: 'finding' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CatchResult | null>(null);

  useEffect(() => {
    getSpecies(db, code).then(setSpecies).catch(console.error);
  }, [db, code]);

  // Start the location fix immediately so it is usually ready by the time the user taps Catch.
  useEffect(() => {
    let cancelled = false;
    captureLocation().then((coords) => {
      if (cancelled) return;
      setLocation(coords ? { status: 'found', coords } : { status: 'none' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCatch() {
    if (!species || saving) return;
    setSaving(true);
    try {
      const coords = location.status === 'found' ? location.coords : null;
      const saved = await addSighting(db, {
        speciesCode: species.code,
        note,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        method: method === 'sound' || method === 'wizard' ? method : 'manual',
      });
      setResult(saved);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  }

  if (!species) {
    return <ThemedView style={styles.container} />;
  }

  if (result) {
    return (
      <ThemedView style={styles.container}>
        <CatchCelebration
          commonName={species.commonName}
          isLifer={result.isLifer}
          catchNumber={result.catchNumber}
          onDone={() => router.back()}
        />
      </ThemedView>
    );
  }

  const locationLabel =
    location.status === 'finding'
      ? 'Finding your location…'
      : location.status === 'found'
        ? 'Location will be saved with this catch'
        : 'No location (you can still catch it)';

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <ThemedText type="small" themeColor="textSecondary">
            CATCHING
          </ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            {species.commonName}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.sci}>
            {species.scientificName}
          </ThemedText>
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold">Note</ThemedText>
          <TextInput
            multiline
            placeholder="Where was it, what was it doing?"
            placeholderTextColor={theme.textSecondary}
            value={note}
            onChangeText={setNote}
            style={[
              styles.noteInput,
              { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border },
            ]}
          />
        </View>

        <ThemedText type="small" themeColor="textSecondary">
          {locationLabel}
        </ThemedText>

        <Button title="Catch it" onPress={() => onCatch().catch(console.error)} loading={saving} />
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
  field: {
    gap: Spacing.two,
  },
  noteInput: {
    minHeight: 96,
    fontSize: 16,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: 'top',
  },
});
