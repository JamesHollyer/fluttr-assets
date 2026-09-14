import type { SupabaseClient } from '@supabase/supabase-js';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Foreground notifications show as a banner; the Activity list is the record. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export type NotificationData = { kind?: string; item_kind?: string; item_id?: string; owner_id?: string; notification_id?: string };

/**
 * Asks for permission (once), registers this device's native push token with the server,
 * and returns whether push is active. Safe to call on every sign-in; a missing Firebase
 * config simply leaves push off and the in-app Activity list keeps working.
 */
export async function registerForPush(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice && Platform.OS === 'ios') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('social', {
        name: 'Friends',
        description: 'Congratulations, comments, and friend requests',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#2F5F4E',
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const status = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!status.granted) return false;
    const token = await Notifications.getDevicePushTokenAsync();
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token: String(token.data), platform: token.type === 'ios' ? 'ios' : 'android', updated_at: new Date().toISOString() }, { onConflict: 'user_id,token' });
    if (error) throw error;
    return true;
  } catch (e) {
    // Expected without Firebase credentials in the build; push is optional.
    console.log('push registration skipped:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function unregisterPush(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    await supabase.from('push_tokens').delete().match({ user_id: userId, token: String(token.data) });
  } catch {
    // No token on this device; nothing to remove.
  }
}

/** Where a tapped notification should take the user. */
export function routeForNotification(data: NotificationData | undefined): string {
  if (!data) return '/activity';
  if ((data.kind === 'reaction' || data.kind === 'comment') && data.item_kind && data.item_id && data.owner_id) {
    return `/thread/${encodeURIComponent(`${data.item_kind}:${data.item_id}:${data.owner_id}`)}`;
  }
  if (data.kind === 'friend_request' || data.kind === 'friend_accept') return '/friends/manage';
  return '/activity';
}

export type ActivityItem = {
  id: string;
  kind: 'reaction' | 'comment' | 'friend_request' | 'friend_accept';
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
  itemKind: string | null;
  itemId: string | null;
  ownerId: string | null;
};

export async function fetchActivity(supabase: SupabaseClient, limit = 100): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, created_at, read_at, item_kind, item_id, owner_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id, kind: n.kind, title: n.title, body: n.body, createdAt: n.created_at, readAt: n.read_at,
    itemKind: n.item_kind, itemId: n.item_id, ownerId: n.owner_id,
  }));
}

export async function unreadCount(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('unread_notifications');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function markAllRead(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
  if (error) throw error;
  await Notifications.setBadgeCountAsync(0).catch(() => {});
}
