import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Bottom tab bar. Icons are SF Symbols on iOS and Material Symbols on Android
 * so each platform draws its own crisp glyph; labels stay visible on every tab.
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundSelected}
      iconColor={{ default: colors.textSecondary, selected: colors.accent }}
      labelStyle={{ default: { color: colors.textSecondary }, selected: { color: colors.text } }}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Species</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bird', selected: 'bird.fill' }} md="raven" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="identify">
        <NativeTabs.Trigger.Label>Identify</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'questionmark.circle', selected: 'questionmark.circle.fill' }}
          md="quiz"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="listen">
        <NativeTabs.Trigger.Label>Sound ID</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="waveform" md="graphic_eq" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="life-list">
        <NativeTabs.Trigger.Label>Life list</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
