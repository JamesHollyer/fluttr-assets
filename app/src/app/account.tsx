import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { getMyProfile, saveMyProfile } from '@/lib/friends';
import { supabase } from '@/lib/supabase';
import { useSync } from '@/lib/sync/use-sync';
import { formatDateTime } from '@/lib/format';

export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [devPassword, setDevPassword] = useState('');

  const inputStyle = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }];

  const userId = auth.user?.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    getMyProfile(supabase, userId)
      .then((p) => {
        setUsername(p?.username ?? '');
        setDisplayName(p?.displayName ?? '');
        setSavedUsername(p?.username ?? null);
      })
      .catch(() => {});
  }, [userId]);

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (done) setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!auth.configured) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <ThemedText type="subtitle">Account</ThemedText>
          <ThemedText themeColor="textSecondary">
            This build has no sync server configured. Your catches stay on this phone.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (auth.user) {
    const statusLine =
      sync.status === 'syncing'
        ? 'Syncing…'
        : sync.status === 'error'
          ? `Could not sync: ${sync.error}`
          : sync.lastSyncedAt
            ? `Last synced ${formatDateTime(new Date(sync.lastSyncedAt).toISOString())}`
            : 'Not synced yet';
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Account</ThemedText>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{auth.user.email}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{statusLine}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {sync.pending === 0 ? 'Everything is backed up.' : `${sync.pending} ${sync.pending === 1 ? 'catch' : 'catches'} waiting to upload.`}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Catches are saved on this phone first and uploaded whenever you have a connection, so
            you can keep catching birds with no signal.
          </ThemedText>

          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">Profile</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Friends find you by username. Letters, numbers, and underscores.
            </ThemedText>
            <TextInput
              style={inputStyle}
              placeholder="username"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase())}
              maxLength={20}
            />
            <TextInput
              style={inputStyle}
              placeholder="Display name (optional)"
              placeholderTextColor={theme.textSecondary}
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={40}
            />
            <Button
              title={savedUsername ? 'Save profile' : 'Choose username'}
              loading={busy}
              disabled={username.trim().length < 3}
              onPress={() => run(() => saveMyProfile(supabase!, userId!, username, displayName).then(() => setSavedUsername(username.trim().toLowerCase())), 'Profile saved.')}
            />
            {savedUsername ? (
              <Button title="Friends" variant="secondary" onPress={() => router.push('/friends')} />
            ) : null}
          </View>
          <Button title="Sync now" variant="secondary" loading={sync.status === 'syncing'} onPress={() => sync.syncNow().catch(console.error)} />
          <Button title="Sign out" variant="destructive" onPress={() => run(auth.signOut)} />
          {message ? <ThemedText type="small" style={{ color: theme.danger }}>{message}</ThemedText> : null}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">Sign in</ThemedText>
        <ThemedText themeColor="textSecondary">
          Back up your catches and share them with friends. We email you a 6-digit code; no password to remember.
        </ThemedText>
        {step === 'email' ? (
          <>
            <TextInput
              style={inputStyle}
              placeholder="you@example.com"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Button
              title="Email me a code"
              loading={busy}
              disabled={!email.includes('@')}
              onPress={() => run(() => auth.sendCode(email).then(() => setStep('code')), 'Sent. Check your email for the code.')}
            />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Enter the code we emailed to {email.trim()}. Tapping the link in the email works too.
            </ThemedText>
            <TextInput
              style={inputStyle}
              placeholder="123456"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              value={code}
              onChangeText={setCode}
              maxLength={10}
            />
            <Button title="Sign in" loading={busy} disabled={code.trim().length < 6} onPress={() => run(() => auth.verifyCode(email, code))} />
            <Button title="Send a new code" variant="secondary" loading={busy} onPress={() => run(() => auth.sendCode(email), 'Sent again. Codes expire after 10 minutes.')} />
            <Button title="Use a different email" variant="secondary" onPress={() => { setStep('email'); setCode(''); setMessage(null); }} />
          </>
        )}
        {message ? <ThemedText type="small" themeColor="textSecondary">{message}</ThemedText> : null}
        {__DEV__ ? (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">Development: password sign-in</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">For test accounts only; not shown in release builds.</ThemedText>
            <TextInput
              style={inputStyle}
              placeholder="password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              value={devPassword}
              onChangeText={setDevPassword}
            />
            <Button title="Sign in with password" variant="secondary" loading={busy} disabled={!email.includes('@') || !devPassword} onPress={() => run(() => auth.signInWithPassword(email, devPassword))} />
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth, padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  input: { fontSize: 18, paddingVertical: Spacing.three - 2, paddingHorizontal: Spacing.three, borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth },
});
