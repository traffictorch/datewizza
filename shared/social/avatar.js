// shared/social/avatar.js
// ESM version of /shared/avatar.js. Same URL-resolution rules, plus upload
// and delete helpers. HTML can still use window.ttAvatarSrc as a fallback.
import { API_BASE, apiFetch, getToken } from './api.js';

/** Resolve any user/post/comment object to an avatar URL. */
export function avatarSrc(o) {
  if (!o) return '/images/avatars/owner.svg';
  if (typeof o === 'string') {
    if (o.charAt(0) === '/' || o.slice(0, 4) === 'http') return o;
    return '/images/avatars/' + o + '.svg';
  }
  if (o.avatar_url) {
    return o.avatar_url.slice(0, 4) === 'http' ? o.avatar_url : API_BASE + o.avatar_url;
  }
  if (o.avatar_r2_key) {
    const m = String(o.avatar_r2_key).match(/^avatars\/(\d+)\//);
    if (m) return API_BASE + '/api/profile/avatar/' + m[1] + '?v=' + (o.avatar_updated_at || 0);
  }
  return '/images/avatars/' + (o.avatar_preset || 'owner') + '.svg';
}

/** Resize an image file to a 400×400 square WebP (or JPEG fallback). */
export async function processAvatarFile(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  const S = 400;
  const sw = Math.min(src.width, src.height);
  const sx = (src.width - sw) / 2;
  const sy = (src.height - sw) / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sw, 0, 0, S, S);
  const toBlob = (type, q) => new Promise(r => c.toBlob(r, type, q));
  let blob = await toBlob('image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  if (blob.size > 500 * 1024) blob = await toBlob(blob.type, 0.7);
  return blob;
}

/** Upload a custom avatar. Mutates ctx.profile and ctx.avatarError/avatarUploading. */
export async function uploadAvatar(ctx, file) {
  ctx.avatarError = null;
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) { ctx.avatarError = 'Max 15 MB.'; return; }
  ctx.avatarUploading = true;
  try {
    const blob = await processAvatarFile(file);
    const fd = new FormData();
    fd.append('file', blob, 'avatar.' + (blob.type === 'image/webp' ? 'webp' : 'jpg'));
    const res = await fetch(API_BASE + '/api/profile/avatar', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getToken() },
      body: fd
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    ctx.profile.avatar_r2_key = data.avatar_r2_key;
    ctx.profile.avatar_updated_at = data.avatar_updated_at;
    ctx.profile.avatar_url = data.avatar_url;
  } catch (e) {
    ctx.avatarError = e.message;
  } finally {
    ctx.avatarUploading = false;
  }
}

/** Delete the custom avatar and fall back to the current preset. */
export async function removeAvatar(ctx) {
  if (!confirm('Remove custom photo and go back to the preset avatar?')) return;
  try {
    await apiFetch('/api/profile/avatar', { method: 'DELETE' });
    ctx.profile.avatar_r2_key = null;
    ctx.profile.avatar_updated_at = null;
    ctx.profile.avatar_url = null;
  } catch (e) { alert('Delete failed: ' + e.message); }
}

/** Server-side delete when user clicks a preset — keeps preset + custom in sync. */
export async function pickPreset(ctx, preset) {
  ctx.profile.avatar_preset = preset;
  if (!ctx.profile.avatar_r2_key) return;
  try {
    await apiFetch('/api/profile/avatar', { method: 'DELETE' });
    ctx.profile.avatar_r2_key = null;
    ctx.profile.avatar_updated_at = null;
    ctx.profile.avatar_url = null;
  } catch { /* non-fatal */ }
}
