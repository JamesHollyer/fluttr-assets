// Delivers one notification row to the recipient's devices through Firebase Cloud Messaging.
// Called by the database trigger in migrations/20260913200000_notifications.sql with
// { notification_id } and a shared secret header. Needs secrets:
//   PUSH_SECRET            the same value as private.push_config 'secret'
//   FCM_SERVICE_ACCOUNT    the Firebase service-account JSON (one line)
import { createClient } from 'npm:@supabase/supabase-js@2';

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

const encoder = new TextEncoder();
const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cachedToken: { value: string; expires: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const { notification_id } = await req.json();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: n, error } = await supabase.from('notifications').select('*').eq('id', notification_id).single();
  if (error || !n) return new Response('no such notification', { status: 404 });

  const { data: tokens } = await supabase.from('push_tokens').select('token, platform').eq('user_id', n.user_id);
  if (!tokens?.length) return Response.json({ delivered: 0, reason: 'no tokens' });

  const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!saRaw) return Response.json({ delivered: 0, reason: 'FCM_SERVICE_ACCOUNT not set' });
  const sa = JSON.parse(saRaw) as ServiceAccount;
  const bearer = await accessToken(sa);

  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', n.user_id).is('read_at', null);

  let delivered = 0;
  const dead: string[] = [];
  for (const t of tokens.filter((t) => t.platform === 'android' || t.platform === 'ios')) {
    const message = {
      message: {
        token: t.token,
        notification: { title: n.title, body: n.body ?? undefined },
        data: { kind: n.kind, item_kind: n.item_kind ?? '', item_id: n.item_id ?? '', owner_id: n.owner_id ?? '', notification_id: n.id },
        android: { notification: { channel_id: 'social', tag: n.id } },
        apns: { payload: { aps: { badge: count ?? 0, sound: 'default' } } },
      },
    };
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (res.ok) {
      delivered++;
    } else {
      const text = await res.text();
      if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT')) dead.push(t.token);
      console.error('fcm error', res.status, text.slice(0, 300));
    }
  }
  if (dead.length) await supabase.from('push_tokens').delete().eq('user_id', n.user_id).in('token', dead);
  return Response.json({ delivered, removed: dead.length });
});
