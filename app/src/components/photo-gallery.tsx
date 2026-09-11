import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { listSpeciesPhotos, type PhotoSex } from '@/db/photos';
import type { Species } from '@/db/species';
import { useTheme } from '@/hooks/use-theme';

type Slide = {
  id: string;
  label: string;
  sex: PhotoSex;
  url: string;
  ratio: number;
  credit: string;
  page: string | null;
};

const SEX_LABELS: Record<PhotoSex, string> = { male: 'Male', female: 'Female', unknown: 'Adult' };

type Props = Pick<
  Species,
  'code' | 'commonName' | 'imageUrl' | 'imageWidth' | 'imageHeight' | 'imageArtist' | 'imageLicense' | 'imagePage'
>;

/**
 * Swipeable photos for a species: sex-labeled iNaturalist photos first (males,
 * then females), then the Wikipedia lead photo. Every slide carries its credit.
 */
export function PhotoGallery(species: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    listSpeciesPhotos(db, species.code)
      .then((rows) => {
        const extra: Slide[] = rows.map((r) => ({
          id: r.id,
          label: SEX_LABELS[r.sex],
          sex: r.sex,
          url: r.url,
          ratio: r.width && r.height ? r.width / r.height : 4 / 3,
          credit: [r.photographer ?? r.attribution?.replace(/^\(c\)\s*/, '').replace(/,\s*(some|no) rights reserved.*$/i, ''), r.license].filter(Boolean).join(' · '),
          page: r.pageUrl,
        }));
        const lead: Slide[] = species.imageUrl
          ? [{
              id: 'lead',
              label: 'Photo',
              sex: 'unknown',
              url: species.imageUrl,
              ratio: species.imageWidth && species.imageHeight ? species.imageWidth / species.imageHeight : 4 / 3,
              credit: [species.imageArtist, species.imageLicense].filter(Boolean).join(' · '),
              page: species.imagePage,
            }]
          : [];
        setSlides([...extra, ...lead]);
      })
      .catch(console.error);
  }, [db, species.code, species.imageUrl, species.imageWidth, species.imageHeight, species.imageArtist, species.imageLicense, species.imagePage]);

  const slideWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.four * 2;
  // One height for the strip so swiping does not jump; landscape photos fill it, tall ones letterbox.
  const height = Math.round(slideWidth / (4 / 3));

  if (slides.length === 0) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.backgroundElement, height }]}>
        <ThemedText type="small" themeColor="textSecondary">No photo yet</ThemedText>
      </View>
    );
  }

  const current = slides[Math.min(index, slides.length - 1)];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / slideWidth))}
        style={{ width: slideWidth, height }}>
        {slides.map((s) => (
          <View key={s.id} style={{ width: slideWidth, height }}>
            <Image
              source={{ uri: s.url }}
              accessibilityLabel={`${s.label} ${species.commonName}`}
              contentFit={s.ratio >= 1.2 ? 'cover' : 'contain'}
              transition={200}
              cachePolicy="disk"
              style={[styles.image, { backgroundColor: theme.backgroundElement }]}
            />
            <View style={[styles.chip, { backgroundColor: s.sex === 'unknown' ? theme.backgroundElement : theme.accent }]}>
              <ThemedText type="smallBold" style={{ color: s.sex === 'unknown' ? theme.text : theme.accentText, fontSize: 12 }}>
                {s.label}
              </ThemedText>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable accessibilityRole="link" disabled={!current.page} onPress={() => current.page && Linking.openURL(current.page)} hitSlop={6} style={styles.creditWrap}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.credit}>
            {current.credit ? `Photo: ${current.credit}` : ''}
          </ThemedText>
        </Pressable>
        {slides.length > 1 ? (
          <View style={styles.dots}>
            {slides.map((s, i) => (
              <View key={s.id} style={[styles.dot, { backgroundColor: i === index ? theme.accent : theme.backgroundSelected }]} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  image: { width: '100%', height: '100%', borderRadius: Spacing.three },
  chip: { position: 'absolute', left: Spacing.two + 4, top: Spacing.two + 4, paddingVertical: 3, paddingHorizontal: Spacing.two + 2, borderRadius: Spacing.two },
  placeholder: { width: '100%', borderRadius: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  creditWrap: { flex: 1 },
  credit: { fontSize: 12, lineHeight: 16 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
