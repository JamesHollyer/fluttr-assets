import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 500;

/**
 * Covers the app with the same owl-on-green as the native splash screen until
 * the first frame is laid out, then fades away so the hand-off is seamless.
 */
export function SplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const fade = new Keyframe({
    0: { opacity: 1, transform: [{ scale: 1 }] },
    30: { opacity: 1 },
    100: { opacity: 0, transform: [{ scale: 1.08 }], easing: Easing.out(Easing.quad) },
  });

  const owl = <Image style={styles.owl} source={require('@/assets/images/splash-icon.png')} contentFit="contain" />;

  return animate ? (
    <Animated.View
      entering={fade.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={styles.overlay}
      pointerEvents="none">
      {owl}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => setAnimate(true));
      }}
      style={styles.overlay}>
      {owl}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#2F5F4E',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  owl: { width: 120, height: 120 },
});
