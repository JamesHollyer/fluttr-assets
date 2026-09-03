import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { OptionCard } from '@/components/option-card';
import { ScreenHeader } from '@/components/screen-header';
import { SpeciesRow } from '@/components/species-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { searchSpecies, type SpeciesWithCount } from '@/db/species';
import { useTheme } from '@/hooks/use-theme';
import {
  BEHAVIORS,
  COLORS,
  MAX_COLORS,
  MONTHS,
  REGIONS,
  SIZES,
  rankCandidates,
  summarizeAnswers,
  type Answers,
  type ColorTag,
} from '@/lib/identify';

type Step = 'where' | 'size' | 'colors' | 'behavior' | 'results';
const STEPS: Step[] = ['where', 'size', 'colors', 'behavior', 'results'];

const TITLES: Record<Step, string> = {
  where: 'Where and when?',
  size: 'How big was it?',
  colors: 'What were its main colors?',
  behavior: 'What was it doing?',
  results: 'Likely matches',
};

function initialAnswers(): Answers {
  return { region: 'usca', month: new Date().getMonth() + 1, size: null, colors: [], behavior: null };
}

export default function IdentifyScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [all, setAll] = useState<SpeciesWithCount[]>([]);
  const [step, setStep] = useState<Step>('where');
  const [answers, setAnswers] = useState<Answers>(initialAnswers);

  useEffect(() => {
    searchSpecies(db, '').then(setAll).catch(console.error);
  }, [db]);

  const results = useMemo(
    () => (step === 'results' ? rankCandidates(all, answers) : []),
    [step, all, answers],
  );

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(index - 1, 0)]);
  const restart = () => {
    setAnswers(initialAnswers());
    setStep('where');
  };

  const toggleColor = (c: ColorTag) =>
    setAnswers((a) => {
      if (a.colors.includes(c)) return { ...a, colors: a.colors.filter((x) => x !== c) };
      if (a.colors.length >= MAX_COLORS) return a;
      return { ...a, colors: [...a.colors, c] };
    });

  if (step === 'results') {
    return (
      <ThemedView style={styles.container}>
        <FlatList
          data={results}
          keyExtractor={(item) => item.species.code}
          style={styles.list}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <ScreenHeader title={TITLES.results} subtitle={summarizeAnswers(answers)}>
              <View style={styles.row}>
                <Button title="Adjust" variant="secondary" onPress={back} style={styles.grow} />
                <Button title="Start over" variant="secondary" onPress={restart} style={styles.grow} />
              </View>
            </ScreenHeader>
          }
          ListEmptyComponent={
            <EmptyState
              title="No good matches"
              hint="Try fewer colors, or the next size up or down."
            />
          }
          renderItem={({ item }) => (
            <SpeciesRow
              code={item.species.code}
              commonName={item.species.commonName}
              scientificName={item.species.scientificName}
              detail={item.species.familyCommon}
              catchCount={item.species.catchCount}
            />
          )}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.list} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={TITLES[step]} subtitle={`Step ${index + 1} of ${STEPS.length - 1}`} />

        <View style={styles.body}>
          {step === 'where' && (
            <>
              {REGIONS.map((r) => (
                <OptionCard
                  key={r.value}
                  label={r.label}
                  hint={r.hint}
                  selected={answers.region === r.value}
                  onPress={() => setAnswers((a) => ({ ...a, region: r.value }))}
                />
              ))}
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                MONTH
              </ThemedText>
              <View style={styles.chips}>
                {MONTHS.map((m, i) => {
                  const selected = answers.month === i + 1;
                  return (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setAnswers((a) => ({ ...a, month: i + 1 }))}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? theme.accent : theme.backgroundElement,
                        },
                      ]}>
                      <ThemedText type="small" style={{ color: selected ? theme.accentText : theme.text }}>
                        {m}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {step === 'size' &&
            SIZES.map((s) => (
              <OptionCard
                key={s.value}
                label={s.label}
                hint={s.hint}
                selected={answers.size === s.value}
                onPress={() => setAnswers((a) => ({ ...a, size: a.size === s.value ? null : s.value }))}
                leading={
                  <View
                    style={{
                      width: 10 + s.value * 8,
                      height: 10 + s.value * 8,
                      borderRadius: 5 + s.value * 4,
                      backgroundColor: theme.textSecondary,
                    }}
                  />
                }
              />
            ))}

          {step === 'colors' && (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Pick up to {MAX_COLORS}. Skip if you are not sure.
              </ThemedText>
              {COLORS.map((c) => (
                <OptionCard
                  key={c.value}
                  label={c.label}
                  selected={answers.colors.includes(c.value)}
                  onPress={() => toggleColor(c.value)}
                  leading={
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: c.swatch, borderColor: theme.border },
                      ]}
                    />
                  }
                />
              ))}
            </>
          )}

          {step === 'behavior' &&
            BEHAVIORS.map((b) => (
              <OptionCard
                key={b.value}
                label={b.label}
                selected={answers.behavior === b.value}
                onPress={() =>
                  setAnswers((a) => ({ ...a, behavior: a.behavior === b.value ? null : b.value }))
                }
              />
            ))}
        </View>

        <View style={styles.row}>
          {index > 0 ? <Button title="Back" variant="secondary" onPress={back} style={styles.grow} /> : null}
          <Button
            title={step === 'behavior' ? 'Show matches' : 'Next'}
            onPress={next}
            style={styles.grow}
            disabled={all.length === 0}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  body: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  label: {
    letterSpacing: 0.6,
    fontSize: 12,
    marginTop: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  grow: {
    flex: 1,
  },
});
