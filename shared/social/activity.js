// shared/social/activity.js
// Activity stream: me / network scope, filters, burst collapse, day grouping.
import { apiFetch, getToken } from './api.js';

export async function loadActivity(ctx, mode = 'me') {
  if (!getToken()) return;
  ctx.activity.loading = true;
  ctx.activity.error = null;
  try {
    let url;
    if (mode === 'network') {
      const p = new URLSearchParams({
        scope: ctx.activity.scope,
        type: ctx.activity.type,
        category: ctx.activity.category,
        tool: ctx.activity.tool,
        time: ctx.activity.time,
        limit: '20'
      });
      if (ctx.activity.cursor) p.set('cursor', ctx.activity.cursor);
      url = `/api/activity/network?${p}`;
    } else {
      const p = new URLSearchParams({
        type: ctx.activity.type,
        category: ctx.activity.category,
        limit: '20'
      });
      if (ctx.activity.cursor) p.set('cursor', ctx.activity.cursor);
      url = `/api/activity/me?${p}`;
    }
    const data = await apiFetch(url);
    ctx.activity.items = ctx.activity.cursor
      ? [...ctx.activity.items, ...(data.items || [])]
      : (data.items || []);
    ctx.activity.cursor = data.cursor || null;
    ctx.activity.hasMore = !!data.has_more;
    markNewItems(ctx, mode);
  } catch (e) {
    ctx.activity.error = e.message;
  } finally {
    ctx.activity.loading = false;
  }
}

export function resetActivity(ctx, field, value, mode) {
  ctx.activity[field] = value;
  ctx.activity.cursor = null;
  ctx.activity.items = [];
  return loadActivity(ctx, mode);
}

export function activityIcon(t) {
  return ({
    torch: '🔥', comment: '💬', network: '🤝', contribution: '🛠️',
    points_milestone: '🏅', rank_change: '📈', score_up: '⬆️', endorse: '⭐'
  })[t] || '•';
}

export function activityVerb(item) {
  return ({
    torch: ' shared a torch',
    comment: ' commented on a torch',
    network: ' added someone to their network',
    contribution: ' made a contribution',
    points_milestone: ' reached a milestone',
    rank_change: ' moved up the leaderboard',
    score_up: ' improved a score',
    endorse: ' endorsed a torch'
  })[item.event_type] || ' did something';
}

export function activityLinkText(item) {
  return ({
    torch: 'View torch →',
    comment: 'Read thread →',
    network: 'View profile →',
    contribution: 'View contribution →',
    points_milestone: 'View leaderboard →',
    rank_change: 'View leaderboard →',
    score_up: 'Re-run audit →',
    endorse: 'View torch →'
  })[item.event_type] || 'Open →';
}

export function collapseBursts(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const out = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last
        && last.user_id === item.user_id
        && last.event_type === item.event_type
        && last.target_id === item.target_id
        && Number.isFinite(last.target_id)
        && (last.created_at - item.created_at) < 10 * 60 * 1000) {
      last.burst_count = (last.burst_count || 1) + 1;
    } else {
      out.push({ ...item, burst_count: 1 });
    }
  }
  return out;
}

export function activityFiltered(ctx) {
  return ctx.activity.filterUser
    ? ctx.activity.items.filter(i => i.user_id === ctx.activity.filterUser)
    : ctx.activity.items;
}

export function filterActivityByUser(ctx, item) {
  ctx.activity.filterUser = item.user_id;
  ctx.activity.filterUsername = item.username;
}

export function clearUserFilter(ctx) {
  ctx.activity.filterUser = null;
  ctx.activity.filterUsername = null;
}

export function markNewItems(ctx, mode) {
  const key = 'activity_' + mode;
  const lastSeen = parseInt(localStorage.getItem('tt_activity_last_seen_' + key) || '0', 10);
  let lastNewIdx = -1;
  ctx.activity.items.forEach((item, i) => {
    item._is_new = lastSeen > 0 && item.created_at > lastSeen;
    delete item._show_after_divider;
    if (item._is_new) lastNewIdx = i;
  });
  if (lastNewIdx >= 0 && lastNewIdx < ctx.activity.items.length - 1) {
    ctx.activity.items[lastNewIdx]._show_after_divider = true;
  }
  setTimeout(() => {
    localStorage.setItem('tt_activity_last_seen_' + key, String(Date.now()));
  }, 3000);
}

export function groupActivityByDay(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayMs = todayMs - 86400000;
  const currentYear = now.getFullYear();
  const groups = [];
  let lastLabel = null;
  for (const item of items) {
    const d = new Date(item.created_at);
    const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    let label;
    if (dayMs === todayMs) label = 'Today';
    else if (dayMs === yesterdayMs) label = 'Yesterday';
    else label = d.toLocaleDateString(undefined, {
      day: 'numeric', month: 'short',
      year: d.getFullYear() !== currentYear ? 'numeric' : undefined
    });
    if (label !== lastLabel) { groups.push({ label, items: [] }); lastLabel = label; }
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}
