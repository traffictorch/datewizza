// shared/social/feed.js
// Feed + comments + endorsements + reports. All take `ctx` (Alpine `this`).
import { apiFetch, apiPost, apiPatch, apiDelete, getToken } from './api.js';

export async function loadFeed(ctx, reset = true) {
  if (reset) {
    ctx.feed.posts = [];
    ctx.feed.cursor = null;
    ctx.feed.hasMore = true;
    ctx.feed.loading = true;
  }
  ctx.feed.error = null;
  try {
    const limit = reset ? 6 : 12;
    let url = `/api/feed?limit=${limit}`;
    if (ctx.feed.category && ctx.feed.category !== 'all') url += `&category=${ctx.feed.category}`;
    if (ctx.feed.cursor) url += `&cursor=${encodeURIComponent(ctx.feed.cursor)}`;
    const data = await apiFetch(url);
    const incoming = data.posts || [];
    incoming.forEach(p => { if (p._showDetails === undefined) p._showDetails = false; });
    ctx.feed.posts = reset ? incoming : [...ctx.feed.posts, ...incoming];
    ctx.feed.cursor = data.cursor || null;
    ctx.feed.hasMore = !!data.cursor;
    ctx.feed.slots = data.slots || ctx.feed.slots;
  } catch (e) {
    ctx.feed.error = e.message;
  } finally {
    ctx.feed.loading = false;
  }
}

export async function loadMoreFeed(ctx) {
  if (ctx.feed.loadingMore || !ctx.feed.hasMore) return;
  ctx.feed.loadingMore = true;
  try { await loadFeed(ctx, false); }
  finally { ctx.feed.loadingMore = false; }
}

export async function setFeedCategory(ctx, cat) {
  ctx.feed.category = cat;
  return loadFeed(ctx, true);
}

export async function toggleComments(ctx, postId) {
  if (ctx.feed.openComments[postId]) { ctx.feed.openComments[postId] = false; return; }
  ctx.feed.openComments[postId] = true;
  if (!ctx.feed.commentLists[postId]) {
    await loadComments(ctx, postId, 0);
  }
}

export async function loadComments(ctx, postId, offset = 0) {
  const limit = 30;
  const meta = ctx.feed.commentMeta?.[postId] || { total: 0, offset: 0, limit, has_more: false, loading: false };
  if (meta.loading) return;
  if (!ctx.feed.commentMeta) ctx.feed.commentMeta = {};
  ctx.feed.commentMeta[postId] = { ...meta, loading: true };
  try {
    const data = await apiFetch(`/api/posts/${postId}/comments?offset=${offset}&limit=${limit}`);
    const incoming = data.comments || [];
    const existing = offset === 0 ? [] : (ctx.feed.commentLists[postId] || []);
    ctx.feed.commentLists[postId] = [...existing, ...incoming];
    ctx.feed.commentMeta[postId] = {
      total: data.total || 0,
      offset: offset + incoming.length,
      limit: data.limit || limit,
      has_more: !!data.has_more,
      loading: false
    };
  } catch {
    ctx.feed.commentMeta[postId] = { ...meta, loading: false };
  }
}

export async function loadMoreComments(ctx, postId) {
  const meta = ctx.feed.commentMeta?.[postId];
  if (!meta || !meta.has_more || meta.loading) return;
  await loadComments(ctx, postId, meta.offset);
}

export async function submitComment(ctx, postId) {
  if (!getToken()) return;
  const body = (ctx.feed.commentDrafts[postId] || '').trim();
  if (!body || body.length > 6000) return;
  try {
    const data = await apiPost(`/api/posts/${postId}/comments`, {
      body,
      images: ctx.feed.commentImages?.[postId] || []
    });
    if (data.success) {
      ctx.feed.commentLists[postId] = [...(ctx.feed.commentLists[postId] || []), data.comment];
      ctx.feed.commentDrafts[postId] = '';
      if (ctx.feed.commentImages) ctx.feed.commentImages[postId] = [];
      const meta = ctx.feed.commentMeta?.[postId];
      if (meta) { meta.total = (meta.total || 0) + 1; meta.offset = (meta.offset || 0) + 1; }
      const p = ctx.feed.posts.find(x => x.id === postId);
      if (p) p.comment_count = (p.comment_count || 0) + 1;
      if (data.total_points !== undefined && ctx.profile) ctx.profile.total_points = data.total_points;
    } else {
      alert(data.error || 'Comment rejected');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

export async function editComment(ctx, postId, comment) {
  if (!getToken()) return;
  const newBody = prompt('Edit comment (6000 chars max):', comment.body);
  if (newBody === null) return;
  if (!newBody.trim() || newBody.length > 6000) { alert('Must be 1–6000 chars'); return; }
  try {
    await apiPatch(`/api/comments/${comment.id}`, { body: newBody.trim() });
    comment.body = newBody.trim();
  } catch (e) { alert('Error: ' + e.message); }
}

export async function deleteComment(ctx, postId, commentId) {
  if (!getToken()) return;
  if (!confirm('Delete this comment?')) return;
  try {
    await apiDelete(`/api/comments/${commentId}`);
    ctx.feed.commentLists[postId] = (ctx.feed.commentLists[postId] || []).filter(c => c.id !== commentId);
    const meta = ctx.feed.commentMeta?.[postId];
    if (meta) { meta.total = Math.max(0, (meta.total || 1) - 1); meta.offset = Math.max(0, (meta.offset || 1) - 1); }
    const p = ctx.feed.posts.find(x => x.id === postId);
    if (p) p.comment_count = Math.max(0, (p.comment_count || 1) - 1);
  } catch (e) { alert('Error: ' + e.message); }
}

export async function endorsePost(ctx, postId) {
  if (!getToken()) {
    if (ctx.showUpgradeModal) ctx.showUpgradeModal();
    else window.location.href = '/login/';
    return;
  }
  const post = ctx.feed.posts.find(p => p.id === postId);
  if (!post) return;
  if (post.viewer_endorsed || post._endorsing) return;
  post._endorsing = true;
  try {
    const data = await apiPost(`/api/posts/${postId}/endorse`, {});
    if (data.success) {
      post.viewer_endorsed = true;
      post.endorse_count = data.endorse_count || ((post.endorse_count || 0) + 1);
      if (ctx.profile) ctx.profile.endorsement_count = (ctx.profile.endorsement_count || 0) + 1;
    } else {
      alert(data.error || 'Could not endorse');
    }
  } catch (e) {
    alert('Network error: ' + e.message);
  } finally {
    post._endorsing = false;
  }
}

export async function deletePost(ctx, postId) {
  if (!getToken()) return;
  if (!confirm('Delete this post?')) return;
  try {
    await apiDelete(`/api/posts/${postId}`);
    ctx.feed.posts = ctx.feed.posts.filter(p => p.id !== postId);
  } catch (e) { alert('Error: ' + e.message); }
}

export async function reportPost(ctx, postId) {
  if (!getToken()) return;
  const reason = prompt('Reason for report:');
  if (!reason) return;
  try {
    await apiPost('/api/reports', { type: 'post', target_id: postId, reason });
    alert('Reported. Thank you.');
  } catch (e) { alert('Error: ' + e.message); }
}
