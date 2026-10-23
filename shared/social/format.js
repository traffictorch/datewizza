// shared/social/format.js
// Date/time formatting. Pure functions, no side effects.

export function formatRelativeTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - (typeof ts === 'number' ? ts : new Date(ts).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const d = Math.floor(hr / 24);
  if (d < 7) return d + 'd ago';
  return new Date(ts).toLocaleDateString();
}

export function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch { return '—'; }
}

export function formatShortDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch { return '—'; }
}

/** Whole months between ts and now. Used for "member for X months" chips. */
export function monthsSince(ts) {
  if (!ts) return 0;
  const d = typeof ts === 'number' ? ts : new Date(ts).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / (86400000 * 30)));
}
