import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, useColorScheme } from 'react-native';

import { SplashOverlay } from '@/components/splash-overlay';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/database';
import { AuthProvider } from '@/lib/auth';
import { routeForNotification, type NotificationData } from '@/lib/notifications';
import { SyncProvider } from '@/lib/sync/use-sync';

SplashScreen.preventAutoHideAsync();

/** Sends a tapped notification to the right screen, including the tap that launched the app. */
function NotificationRouter() {
  const router = useRouter();
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as NotificationData | undefined;
      router.push(routeForNotification(data) as never);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
  return null;
}

function Loading() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </ThemedView>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const colors = dark ? Colors.dark : Colors.light;
  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <SplashOverlay />
      <Suspense fallback={<Loading />}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} useSuspense>
          <AuthProvider>
            <NotificationRouter />
            <SyncProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="species/[code]" options={{ title: '', headerBackButtonDisplayMode: 'minimal' }} />
            <Stack.Screen name="catch/[code]" options={{ title: 'Catch', presentation: 'modal' }} />
            <Stack.Screen name="credits" options={{ title: 'Credits' }} />
            <Stack.Screen name="downloads" options={{ title: 'Downloads' }} />
            <Stack.Screen name="friends/manage" options={{ title: 'Friends' }} />
            <Stack.Screen name="friends/[id]" options={{ title: '', headerBackButtonDisplayMode: 'minimal' }} />
            <Stack.Screen name="account" options={{ title: 'Account' }} />
            <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
          </Stack>
            </SyncProvider>
          </AuthProvider>
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}
