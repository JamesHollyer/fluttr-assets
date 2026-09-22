import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Deletes the signed-in user's account. The server function removes the auth row and every
 * row that cascades from it (profile, catches, badges, friendships, cheers, comments,
 * notifications, device tokens). The local copy of the user's data is wiped afterwards so
 * the phone does not re-upload it on the next sign-in.
 */
export async function deleteAccount(supabase: SupabaseClient, db: SQLiteDatabase, userId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_account');
  if (error) throw new Error(`Could not delete the account: ${error.message}`);
  await wipeLocalUserData(db, userId);
  // The session is invalid now that the user is gone; drop it without a server round trip.
  await supabase.auth.signOut({ scope: 'local' });
}

/** Removes catches, badges, and sync state that belonged to a user from the local database. */
export async function wipeLocalUserData(db: SQLiteDatabase, userId: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM sightings WHERE user_id = ? OR user_id IS NULL', userId);
    await tx.runAsync('DELETE FROM badges_earned');
    await tx.runAsync("DELETE FROM meta WHERE key LIKE 'sync_cursor:%' OR key = 'friend_count'");
  });
}
