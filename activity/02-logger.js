// Insert after getUserTotalPoints(), before "// Profile routes"
async function logActivity(env, userId, eventType, opts = {}) {
  try {
    const now = Date.now();
    await env.MY_BINDING.batch([
      env.MY_BINDING.prepare(
        `INSERT INTO user_activity (user_id, event_type, category, tool, target_id, target_label, link, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        userId, eventType,
        opts.category || null, opts.tool || null,
        opts.targetId || null, opts.targetLabel || null, opts.link || null,
        now
      ),
      env.MY_BINDING.prepare(
        `DELETE FROM user_activity WHERE user_id = ? AND id NOT IN (
           SELECT id FROM user_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 24
         )`
      ).bind(userId, userId)
    ]);
  } catch (e) { console.error('logActivity error:', e.message); }
}
