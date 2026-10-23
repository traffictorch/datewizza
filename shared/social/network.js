// shared/social/network.js
// Network + discover + invite. Both the dashboard and community page use these.
import { apiFetch, apiPost, getToken } from './api.js';

export async function loadNetwork(ctx) {
  if (!getToken()) return;
  ctx.network.loading = true;
  ctx.network.addLoading = {};
  try {
    const data = await apiFetch('/api/network/list');
    ctx.network.list = data.network || [];
  } catch { /* swallow */ }
  finally { ctx.network.loading = false; }
}

export function setNetworkSearchMode(ctx, mode) {
  ctx.network.searchMode = mode;
  ctx.network.search = '';
  if (mode === 'all') ctx.network.searchResults = [];
}

export async function searchAllUsers(ctx) {
  if (!getToken()) return;
  const q = (ctx.network.search || '').trim();
  if (q.length < 2) { ctx.network.searchResults = []; return; }
  ctx.network.searching = true;
  try {
    const data = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    ctx.network.searchResults = data.users || [];
  } catch { /* swallow */ }
  finally { ctx.network.searching = false; }
}

export async function addToNetwork(ctx, userId) {
  if (!getToken()) { window.location.href = '/login/'; return; }
  if (!ctx.network.addLoading) ctx.network.addLoading = {};
  if (ctx.network.addLoading[userId]) return;
  ctx.network.addLoading[userId] = true;
  try {
    await apiPost('/api/network/add', { user_id: userId });
    if (ctx.feed?.posts) {
      ctx.feed.posts.forEach(p => { if (p.user_id === userId) p.in_network = true; });
    }
    await loadNetwork(ctx);
  } catch (e) {
    alert('Could not add: ' + e.message);
  } finally {
    ctx.network.addLoading[userId] = false;
  }
}

export async function removeFromNetwork(ctx, userId) {
  if (!getToken()) return;
  try {
    await apiPost('/api/network/remove', { user_id: userId });
    ctx.network.list = ctx.network.list.filter(u => u.id !== userId);
    if (ctx.feed?.posts) {
      ctx.feed.posts.forEach(p => { if (p.user_id === userId) p.in_network = false; });
    }
  } catch (e) {
    alert('Could not remove: ' + e.message);
  }
}

export async function inviteColleague(ctx) {
  if (!getToken()) return;
  const email = (ctx.network.inviteEmail || '').trim().toLowerCase();
  if (!email) { ctx.network.inviteStatus = '⚠️ Enter an email address first'; return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    ctx.network.inviteStatus = '⚠️ Invalid email format'; return;
  }
  ctx.network.inviteStatus = 'Sending…';
  try {
    const data = await apiPost('/api/network/invite', { email });
    ctx.network.inviteStatus = data.success ? '✓ Invite sent to ' + email : ('⚠️ ' + (data.error || 'Failed'));
    if (data.success) ctx.network.inviteEmail = '';
    setTimeout(() => { ctx.network.inviteStatus = ''; }, 5000);
  } catch (e) {
    ctx.network.inviteStatus = '⚠️ ' + e.message;
  }
}

export async function loadDiscover(ctx, fresh = false) {
  if (!getToken()) return;
  ctx.discover.loading = true;
  ctx.discover.error = null;
  ctx.discover.addLoading = {};
  try {
    const seed = fresh ? 'fresh' : 'today';
    const data = await apiFetch(`/api/users/discover?seed=${seed}&limit=24&offset=0`);
    ctx.discover.users = data.users || [];
    ctx.discover.hasMore = !!data.has_more;
  } catch (e) {
    ctx.discover.error = e.message;
  } finally {
    ctx.discover.loading = false;
  }
}

export async function randomizeDiscover(ctx) { return loadDiscover(ctx, true); }

export async function addDiscoverUser(ctx, u) {
  const uid = u && u.id;
  if (!uid) return;
  if (ctx.discover.addLoading[uid]) return;
  if (!getToken()) { window.location.href = '/login/'; return; }
  ctx.discover.addLoading[uid] = true;
  try {
    await apiPost('/api/network/add', { user_id: uid });
    ctx.discover.users = ctx.discover.users.filter(x => x.id !== uid);
  } catch (e) {
    alert('Could not add: ' + e.message);
  } finally {
    ctx.discover.addLoading[uid] = false;
  }
}
