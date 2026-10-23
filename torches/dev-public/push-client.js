// DateWizza — Web Push client
// Handles subscribe/unsubscribe/status and the "send test" flow.
// Depends on no external libs — the SW does the receiving, this does the wiring.

const PUSH_API = '/push-api';
const SW_URL = '/sw.js';

let cachedVapidKey = null;

async function getVapidPublicKey() {
  if (cachedVapidKey) return cachedVapidKey;
  const res = await fetch(`${PUSH_API}/vapid-public-key`);
  if (!res.ok) throw new Error('Could not load VAPID key');
  const data = await res.json();
  cachedVapidKey = data.publicKey;
  return cachedVapidKey;
}

export function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getRegistration() {
  let reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  return reg;
}

/**
 * @returns {'unsupported'|'denied'|'granted'|'prompt'}
 */
export function getPermissionStatus() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Returns { subscribed: boolean, endpoint?: string }
 */
export async function getSubscriptionStatus() {
  if (!isPushSupported()) return { subscribed: false };
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return { subscribed: false };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { subscribed: false };
  return { subscribed: true, endpoint: sub.endpoint };
}

/**
 * Subscribe the current browser. Caller must supply the auth token so we can
 * POST it to the worker (which verifies it via the auth service binding).
 */
export async function subscribe(authToken) {
  if (!isPushSupported()) throw new Error('Push not supported in this browser');
  if (!authToken) throw new Error('Not logged in');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: permission };
  }

  const reg = await getRegistration();
  const vapidKey = await getVapidPublicKey();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  const payload = {
    subscription: {
      endpoint: sub.endpoint,
      keys: {
        p256dh: bufToBase64Url(sub.getKey('p256dh')),
        auth: bufToBase64Url(sub.getKey('auth')),
      },
    },
  };

  const res = await fetch(`${PUSH_API}/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Subscribe failed');
  }

  return { ok: true, endpoint: sub.endpoint };
}

/**
 * Unsubscribe from push on this device. Also tells the worker to revoke.
 */
export async function unsubscribe(authToken) {
  if (!isPushSupported()) return { ok: true };
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return { ok: true };

  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };

  const endpoint = sub.endpoint;

  try {
    await sub.unsubscribe();
  } catch {}

  if (authToken) {
    await fetch(`${PUSH_API}/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  }

  return { ok: true };
}

/**
 * Ask the worker to send a test push to the current user.
 */
export async function sendTest(authToken) {
  const res = await fetch(`${PUSH_API}/test`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Test failed');
  return data;
}

// Expose on window for non-module contexts (dashboard inline Alpine).
window.TTPush = { isPushSupported, getPermissionStatus, getSubscriptionStatus, subscribe, unsubscribe, sendTest };
