import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { listPhotoCredits, type PhotoCredit } from '@/db/species';
import { useTheme } from '@/hooks/use-theme';

function Header() {
  return (
    <View style={styles.header}>
      <ThemedText>
        Species descriptions are adapted from Wikipedia and are available under the Creative
        Commons Attribution-ShareAlike 4.0 license. Photos come from Wikimedia Commons and iNaturalist
        and are the work of the photographers credited under each one. Species list and
        taxonomy from eBird/Clements (Cornell Lab of Ornithology) and the AOS North American
        checklist. Regional frequency from GBIF occurrence data. Bird sounds come from Xeno-canto and
        Wikimedia Commons contributors; each recording shows its recordist and license.
      </ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
        PHOTOS
      </ThemedText>
    </View>
  );
}

export default function CreditsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [credits, setCredits] = useState<PhotoCredit[]>([]);

  useEffect(() => {
    listPhotoCredits(db).then(setCredits).catch(console.error);
  }, [db]);

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={credits}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<Header />}
        initialNumToRender={30}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="link"
            disabled={!item.imagePage}
            onPress={() => item.imagePage && Linking.openURL(item.imagePage)}
            style={[styles.row, { borderBottomColor: theme.border }]}>
            <ThemedText type="small">{item.commonName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[item.imageArtist ?? 'Unknown photographer', item.imageLicense].filter(Boolean).join(' · ')}
            </ThemedText>
          </Pressable>
        )}
      />
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  header: {
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
  sectionLabel: {
    letterSpacing: 0.6,
    fontSize: 12,
  },
  row: {
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 1,
  },
});
