import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

/**
 * Landing screen for the sign-in email's link (fluttr://auth-callback). The
 * AuthProvider reads the tokens from the URL; this screen just waits for the
 * session and then returns to the life list.
 */
export default function AuthCallbackScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => router.replace('/life-list'), user ? 300 : 4000);
    return () => clearTimeout(timer);
  }, [user, loading, router]);

  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator />
      <ThemedText themeColor="textSecondary">{user ? 'Signed in' : 'Signing you in…'}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
});
