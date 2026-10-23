// ============================================================
// Feature B — Discover endpoint (paste into auth worker)
// ============================================================

// Daily seed: resets at 11:00 UTC (= 21:00 AEST)
function _discoverSeed(viewerId, fresh = false) {
  const nowMs = Date.now();
  const key = fresh
    ? `${viewerId}:${nowMs}`
    : `${viewerId}:${Math.floor((nowMs - 11 * 3600 * 1000) / 86400000)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function handleDiscoverRoutes(request, env, url) {
  if (url.pathname !== '/api/users/discover' || request.method !== 'GET') return null;

  const user = await getUserFromToken(request, env);
  if (!user) return feedJson({ error: 'Unauthorized' }, 401);

  const seedMode  = (url.searchParams.get('seed') || 'today').toLowerCase();
  const limit     = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '24', 10) || 24, 1), 48);
  const offset    = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  // ↓ flip to '1' to enforce spec (exclude 0-torch users)
  const minTorches = Math.max(parseInt(url.searchParams.get('min_torches') || '0', 10) || 0, 0);

  const seed        = _discoverSeed(user.id, seedMode === 'fresh');
  const activeSince = Date.now() - 30 * 86400 * 1000;
  const viewerId    = user.id;

  const sql = `
    WITH exclude_ids AS (
      SELECT ? AS id
      UNION SELECT network_user_id FROM network WHERE user_id = ?
      UNION SELECT user_id        FROM network WHERE network_user_id = ?
      UNION SELECT blocked_user_id FROM blocks  WHERE user_id = ?
      UNION SELECT user_id        FROM blocks  WHERE blocked_user_id = ?
    ),
    candidates AS (
      SELECT
        u.id,
        u.username,
        COALESCE(u.name, u.username)                AS display_name,
        COALESCE(u.avatar_preset, 'owner')          AS avatar_preset,
        COALESCE(u.role, 'owner')                   AS role,
        COALESCE((SELECT SUM(points) FROM user_points WHERE user_id = u.id), 0) AS total_points,
        COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = u.id AND status = 'published'), 0) AS torch_count,
        (SELECT MAX(created_at) FROM posts WHERE user_id = u.id AND status = 'published') AS last_post_at
      FROM users u
      WHERE u.profile_public = 1
        AND u.username IS NOT NULL
        AND u.id NOT IN (SELECT id FROM exclude_ids)
    )
    SELECT * FROM candidates
    WHERE torch_count >= ?
    ORDER BY
      CASE WHEN last_post_at > ? THEN 0 ELSE 1 END,
      ((id * 2654435761 + ?) % 2147483647),
      id
    LIMIT ? OFFSET ?
  `;

  const rows = await env.MY_BINDING.prepare(sql).bind(
    viewerId, viewerId, viewerId, viewerId, viewerId,
    minTorches,
    activeSince,
    seed,
    limit + 1,
    offset
  ).all();

  const results = rows.results || [];
  const hasMore = results.length > limit;
  if (hasMore) results.pop();

  return feedJson({
    users: results,
    seed: seedMode,
    limit,
    offset,
    has_more: hasMore
  });
}
