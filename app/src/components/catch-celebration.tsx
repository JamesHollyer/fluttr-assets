import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Badge } from '@/lib/badges';

type Props = {
  commonName: string;
  isLifer: boolean;
  catchNumber: number;
  badges?: Badge[];
  onDone: () => void;
};

type ParticleSpec = {
  id: number;
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  shape: 'dot' | 'feather';
};

function makeParticles(count: number, colors: string[], spread: number): ParticleSpec[] {
  const out: ParticleSpec[] = [];
  for (let i = 0; i < count; i++) {
    // Bias upward: most particles leave between 200° and 340° (screen coords, y down).
    const angle = ((200 + Math.random() * 140) * Math.PI) / 180;
    out.push({
      id: i,
      angle,
      distance: spread * (0.55 + Math.random() * 0.45),
      size: 6 + Math.random() * 8,
      color: colors[i % colors.length],
      delay: Math.random() * 120,
      duration: 900 + Math.random() * 500,
      shape: Math.random() < 0.35 ? 'feather' : 'dot',
    });
  }
  return out;
}

function Particle({ spec, animate }: { spec: ParticleSpec; animate: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animate) return;
    progress.value = withDelay(
      spec.delay,
      withTiming(1, { duration: spec.duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [animate, progress, spec.delay, spec.duration]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const x = Math.cos(spec.angle) * spec.distance * p;
    // A little gravity so the burst arcs instead of radiating flatly.
    const y = Math.sin(spec.angle) * spec.distance * p + 90 * p * p;
    const fade = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
    return {
      opacity: p === 0 ? 0 : fade,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${p * 540 * (spec.id % 2 === 0 ? 1 : -1)}deg` },
        { scale: 1 - 0.4 * p },
      ],
    };
  });

  const shapeStyle =
    spec.shape === 'feather'
      ? { width: spec.size * 0.6, height: spec.size * 2, borderRadius: spec.size }
      : { width: spec.size, height: spec.size, borderRadius: spec.size / 2 };

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.particle, shapeStyle, { backgroundColor: spec.color }, style]}
    />
  );
}

export function CatchCelebration({ commonName, isLifer, catchNumber, badges = [], onDone }: Props) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion;

  const particles = useMemo(
    () =>
      makeParticles(
        isLifer ? 34 : 18,
        [theme.highlight, theme.accent, theme.highlightSoft, theme.backgroundSelected],
        isLifer ? 190 : 140,
      ),
    [isLifer, theme.highlight, theme.accent, theme.highlightSoft, theme.backgroundSelected],
  );

  const badgeScale = useSharedValue(animate ? 0.2 : 1);
  const badgeRotate = useSharedValue(0);
  const ring = useSharedValue(0);
  const textIn = useSharedValue(animate ? 0 : 1);
  const buttonIn = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    if (!animate) return;

    badgeScale.value = withSequence(
      withSpring(1.18, { damping: 9, stiffness: 220, mass: 0.7 }),
      withSpring(1, { damping: 12, stiffness: 180 }),
    );
    badgeRotate.value = withSequence(
      withTiming(-7, { duration: 90 }),
      withTiming(7, { duration: 120 }),
      withTiming(-3, { duration: 110 }),
      withTiming(0, { duration: 140 }),
    );
    ring.value = withDelay(60, withTiming(1, { duration: 750, easing: Easing.out(Easing.quad) }));
    textIn.value = withDelay(220, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    buttonIn.value = withDelay(520, withTiming(1, { duration: 300 }));
  }, [animate, badgeScale, badgeRotate, ring, textIn, buttonIn]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }, { rotate: `${badgeRotate.value}deg` }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.6 * (1 - ring.value),
    transform: [{ scale: 0.6 + ring.value * 2.4 }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textIn.value,
    transform: [{ translateY: (1 - textIn.value) * 14 }],
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonIn.value,
    transform: [{ translateY: (1 - buttonIn.value) * 10 }],
  }));

  const badgeColor = isLifer ? theme.highlight : theme.accent;
  const badgeBackground = isLifer ? theme.highlightSoft : theme.backgroundElement;

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <View style={styles.center} pointerEvents="none">
          {particles.map((p) => (
            <Particle key={p.id} spec={p} animate={animate} />
          ))}
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { borderColor: badgeColor }, ringStyle]}
        />
        <Animated.View style={[styles.badge, { backgroundColor: badgeBackground }, badgeStyle]}>
          <ThemedText type="subtitle" style={[styles.badgeText, { color: badgeColor }]}>
            {isLifer ? 'Lifer!' : `#${catchNumber}`}
          </ThemedText>
        </Animated.View>
      </View>

      <Animated.View style={[styles.text, textStyle]}>
        <ThemedText type="subtitle" style={styles.center_text}>
          {commonName}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center_text}>
          {isLifer
            ? 'First time on your life list.'
            : `You have caught this bird ${catchNumber} times.`}
        </ThemedText>
      </Animated.View>

      {badges.length ? (
        <Animated.View style={[styles.badges, buttonStyle]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center_text}>
            {badges.length === 1 ? 'BADGE EARNED' : 'BADGES EARNED'}
          </ThemedText>
          {badges.map((b) => (
            <View key={b.id} style={[styles.badgeRow, { backgroundColor: theme.highlightSoft }]}>
              <ThemedText style={styles.badgeGlyph}>{b.glyph}</ThemedText>
              <View style={styles.badgeCopy}>
                <ThemedText type="smallBold">{b.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{b.description}</ThemedText>
              </View>
            </View>
          ))}
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.done, buttonStyle]}>
        <Button title="Done" onPress={onDone} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  stage: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 0,
    height: 0,
  },
  particle: {
    position: 'absolute',
    left: -6,
    top: -6,
  },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
  },
  badge: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four + 4,
    borderRadius: Spacing.five,
  },
  badgeText: {
    lineHeight: 40,
  },
  text: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  center_text: {
    textAlign: 'center',
  },
  done: {
    alignSelf: 'stretch',
  },
  badges: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  badgeGlyph: {
    fontSize: 28,
    lineHeight: 34,
  },
  badgeCopy: {
    flex: 1,
    gap: 2,
  },
});
