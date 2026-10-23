// Round Table API — read-only v1
// Routes:
//   GET /api/rt/proposals        → list
//   GET /api/rt/proposals/:slug  → single + tally + comments

export async function handleRoundTableRoutes(request, env, url, helpers) {
  const { corsResponse } = helpers;
  const method = request.method;
  const path = url.pathname;

  if (path === '/api/rt/proposals' && method === 'GET') {
    try {
      const rows = await env.MY_BINDING.prepare(
        `SELECT id, slug, title, body_md, kind, category, phase, created_at,
                vote_starts_at, vote_ends_at, quorum_pct, threshold_pct,
                block_pct, eligible_count, author_entity_id,
                tally_yes, tally_no, tally_abstain, resolution_id
         FROM rt_proposals ORDER BY created_at DESC LIMIT 50`
      ).all();
      const listRes = corsResponse(JSON.stringify({ proposals: rows.results || [] }));
      listRes.headers.set('Cache-Control', 'public, max-age=60');
      return listRes;
    } catch (e) {
      return corsResponse(JSON.stringify({ error: e.message }), 500);
    }
  }

  const m = path.match(/^\/api\/rt\/proposals\/([a-z0-9\-]+)$/);
  if (m && method === 'GET') {
    const slug = m[1];
    try {
      const p = await env.MY_BINDING.prepare(
        `SELECT * FROM rt_proposals WHERE slug = ? OR id = ? LIMIT 1`
      ).bind(slug, slug).first();
      if (!p) return corsResponse(JSON.stringify({ error: 'Not found' }), 404);

      const tally = {
        yes: p.tally_yes || 0,
        no: p.tally_no || 0,
        abstain: p.tally_abstain || 0
      };

      const cRows = await env.MY_BINDING.prepare(
        `SELECT id, entity_id, parent_id, body_md, created_at
         FROM rt_comments WHERE proposal_id = ? AND deleted_at IS NULL
         ORDER BY created_at ASC`
      ).bind(p.id).all();

      return corsResponse(JSON.stringify({
        proposal: p, tally, comments: cRows.results || []
      }));
    } catch (e) {
      return corsResponse(JSON.stringify({ error: e.message }), 500);
    }
  }


  if (path === '/api/rt/me' && method === 'GET') {
    try {
      const auth = request.headers.get('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) {
        return corsResponse(JSON.stringify({
          authenticated: false, eligible: false, reason: 'login_required'
        }));
      }
      const token = auth.replace('Bearer ', '').trim();
      let decoded;
      try { decoded = await helpers.verifyJWT(token, env.JWT_SECRET); }
      catch { return corsResponse(JSON.stringify({
        authenticated: false, eligible: false, reason: 'invalid_token'
      })); }
      if (!decoded) return corsResponse(JSON.stringify({
        authenticated: false, eligible: false, reason: 'invalid_token'
      }));

      const user = await env.MY_BINDING.prepare(
        'SELECT id, created_at, verified_at, profile_public FROM users WHERE id = ?'
      ).bind(decoded.id).first();
      if (!user) return corsResponse(JSON.stringify({
        authenticated: true, eligible: false, reason: 'user_not_found'
      }), 404);

      const createdMs = Date.parse(user.created_at) || 0;
      const ageDays = (Date.now() - createdMs) / 86400000;
      const ageOk = ageDays >= 7;
      const profileOk = !!user.verified_at || user.profile_public === 1;
      const eligible = ageOk && profileOk;
      const eligibleSince = Math.floor(createdMs / 1000) + (7 * 86400);

      const existing = await env.MY_BINDING.prepare(
        'SELECT entity_id, eligible_since, status FROM rt_entities WHERE entity_id = ?'
      ).bind(String(user.id)).first();
      if (!existing) {
        await env.MY_BINDING.prepare(
          'INSERT OR IGNORE INTO rt_entities (entity_id, eligible_since, passkey_registered, status) VALUES (?, ?, 0, ?)'
        ).bind(String(user.id), eligibleSince, eligible ? 'active' : 'pending').run();
      }

      let reason = null;
      if (!ageOk) reason = 'account_too_new';
      else if (!profileOk) reason = 'profile_incomplete';

      return corsResponse(JSON.stringify({
        authenticated: true,
        entity_id: String(user.id),
        eligible,
        eligible_since: eligibleSince,
        days_until_eligible: ageOk ? 0 : Math.ceil(7 - ageDays),
        reason
      }));
    } catch (e) {
      return corsResponse(JSON.stringify({ error: e.message }), 500);
    }
  }


  // ---- Session 2A: vote API ----

  const openVoteMatch = path.match(/^\/api\/rt\/proposals\/([a-z0-9\-]+)\/open-vote$/);
  if (openVoteMatch && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    const slug = openVoteMatch[1];
    const prop = await env.MY_BINDING.prepare('SELECT * FROM rt_proposals WHERE slug = ?').bind(slug).first();
    if (!prop) return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    if (prop.phase !== 'draft') return corsResponse(JSON.stringify({ error: 'Not in draft' }), 400);
    const openCount = await env.MY_BINDING.prepare(
      "SELECT COUNT(*) AS n FROM rt_proposals WHERE phase = 'vote'"
    ).first();
    if ((openCount?.n || 0) >= 3) return corsResponse(JSON.stringify({ error: 'Max 3 votes open at once' }), 429);
    const now = Math.floor(Date.now() / 1000);
    const voteEnd = now + 5 * 86400;
    const eligible = await env.MY_BINDING.prepare(
      "SELECT COUNT(*) AS n FROM rt_entities WHERE status = 'active'"
    ).first();
    let effectiveThreshold = prop.threshold_pct;
    if (prop.kind === 'meta') {
      const cfgRow = await env.MY_BINDING.prepare(
        "SELECT value FROM rt_config WHERE key = 'default_threshold_pct_meta'"
      ).first();
      effectiveThreshold = cfgRow ? parseFloat(cfgRow.value) : 0.75;
    }
    await env.MY_BINDING.prepare(
      "UPDATE rt_proposals SET phase='vote', vote_starts_at=?, vote_ends_at=?, eligible_count=?, threshold_pct=? WHERE id=?"
    ).bind(now, voteEnd, eligible?.n || 0, effectiveThreshold, prop.id).run();
    return corsResponse(JSON.stringify({ ok: true, vote_starts_at: now, vote_ends_at: voteEnd }));
  }

  const castVoteMatch = path.match(/^\/api\/rt\/proposals\/([a-z0-9\-]+)\/vote$/);
  if (castVoteMatch && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    let body;
    try { body = await request.json(); } catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400); }
    const choice = body.choice;
    if (!['yes','no','abstain'].includes(choice)) return corsResponse(JSON.stringify({ error: 'choice must be yes|no|abstain' }), 400);
    const slug = castVoteMatch[1];
    const prop = await env.MY_BINDING.prepare('SELECT * FROM rt_proposals WHERE slug = ?').bind(slug).first();
    if (!prop) return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    if (prop.phase !== 'vote') return corsResponse(JSON.stringify({ error: 'Not in vote phase' }), 400);
    const entityId = String(decoded.id);
    const ent = await env.MY_BINDING.prepare("SELECT * FROM rt_entities WHERE entity_id = ? AND status = 'active'").bind(entityId).first();
    if (!ent) return corsResponse(JSON.stringify({ error: 'Not eligible to vote' }), 403);
    const existing = await env.MY_BINDING.prepare('SELECT choice FROM rt_votes WHERE proposal_id = ? AND entity_id = ?').bind(prop.id, entityId).first();
    const now = Math.floor(Date.now() / 1000);
    if (existing) {
      if (existing.choice === choice) return corsResponse(JSON.stringify({ ok: true, unchanged: true }));
      await env.MY_BINDING.prepare('UPDATE rt_votes SET choice = ?, cast_at = ? WHERE proposal_id = ? AND entity_id = ?').bind(choice, now, prop.id, entityId).run();
      const decCol = 'tally_' + existing.choice;
      const incCol = 'tally_' + choice;
      await env.MY_BINDING.prepare(
        `UPDATE rt_proposals SET ${decCol} = MAX(0, ${decCol} - 1), ${incCol} = ${incCol} + 1 WHERE id = ?`
      ).bind(prop.id).run();
      await writeAudit(env, 'rt_votes', 'update', { proposal_id: prop.id, entity_id: entityId, from: existing.choice, to: choice });
    } else {
      await env.MY_BINDING.prepare('INSERT INTO rt_votes (proposal_id, entity_id, choice, cast_at) VALUES (?, ?, ?, ?)').bind(prop.id, entityId, choice, now).run();
      await env.MY_BINDING.prepare(
        `UPDATE rt_proposals SET tally_${choice} = tally_${choice} + 1 WHERE id = ?`
      ).bind(prop.id).run();
      await writeAudit(env, 'rt_votes', 'insert', { proposal_id: prop.id, entity_id: entityId, choice });
    }
    return corsResponse(JSON.stringify({ ok: true, choice }));
  }

  const closeVoteMatch = path.match(/^\/api\/rt\/proposals\/([a-z0-9\-]+)\/close-vote$/);
  if (closeVoteMatch && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    const slug = closeVoteMatch[1];
    const prop = await env.MY_BINDING.prepare('SELECT * FROM rt_proposals WHERE slug = ?').bind(slug).first();
    if (!prop) return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    if (prop.phase !== 'vote') return corsResponse(JSON.stringify({ error: 'Not in vote phase' }), 400);
    const totalVotes = (prop.tally_yes || 0) + (prop.tally_no || 0) + (prop.tally_abstain || 0);
    const eligible = prop.eligible_count || 0;
    const quorumMet = totalVotes >= Math.max(10, Math.ceil(eligible * prop.quorum_pct));
    const yesPct = totalVotes ? (prop.tally_yes / totalVotes) : 0;
    const noPct = totalVotes ? (prop.tally_no / totalVotes) : 0;
    let outcome;
    if (!quorumMet) outcome = 'no_quorum';
    else if (noPct >= prop.block_pct) outcome = 'rejected';
    else if (yesPct >= prop.threshold_pct) outcome = 'passed';
    else outcome = 'rejected';
    const newPhase = outcome === 'passed' ? 'passed' : 'rejected';
    const resId = 'res_' + Date.now();
    const tally = { yes: prop.tally_yes || 0, no: prop.tally_no || 0, abstain: prop.tally_abstain || 0 };
    const votes = await env.MY_BINDING.prepare(
      'SELECT entity_id, choice FROM rt_votes WHERE proposal_id = ? ORDER BY entity_id ASC'
    ).bind(prop.id).all();
    const votesHash = await sha256Hex(JSON.stringify(votes.results || []));
    const thisHash = await writeAudit(env, 'rt_resolutions', 'insert', {
      proposal_id: prop.id, outcome, tally, votes_hash: votesHash
    });
    await env.MY_BINDING.prepare(
      "INSERT INTO rt_resolutions (id, proposal_id, outcome, tally_json, this_hash, votes_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(resId, prop.id, outcome, JSON.stringify(tally), thisHash, votesHash, Math.floor(Date.now()/1000)).run();
    await env.MY_BINDING.prepare(
      "UPDATE rt_proposals SET phase = ?, resolution_id = ? WHERE id = ?"
    ).bind(newPhase, resId, prop.id).run();
    // ---- Session 8A + Tier 2: apply config on pass (delayed 72h for meta) ----
    if (outcome === 'passed' && (prop.kind === 'config' || prop.kind === 'meta')) {
      const directives = parseConfigDirectives(prop.body_md || '');
      const execId = 'exec_' + Date.now();
      const nowTs = Math.floor(Date.now()/1000);

      if (prop.kind === 'meta') {
        // Meta: queue for delayed apply (72h). Reconsider can fire before this lands.
        await env.MY_BINDING.prepare(
          'INSERT INTO rt_executions (id, resolution_id, target, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(execId, resId, 'config', 'pending_delay',
               JSON.stringify({ directives, apply_at: nowTs + 259200 }),
               nowTs).run();
      } else {
        // Config: apply immediately (existing behavior)
        const appliedKeys = [];
        for (const [k, v] of Object.entries(directives)) {
          if (!/^default_(quorum_pct|threshold_pct|block_pct|threshold_pct_meta)$/.test(k)) continue;
          await env.MY_BINDING.prepare(
            'INSERT OR REPLACE INTO rt_config (key, value, set_by_resolution_id, set_at) VALUES (?, ?, ?, ?)'
          ).bind(k, String(v), resId, nowTs).run();
          appliedKeys.push(k + '=' + v);
        }
        await env.MY_BINDING.prepare(
          'INSERT INTO rt_executions (id, resolution_id, target, status, payload, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(execId, resId, 'config', appliedKeys.length ? 'succeeded' : 'skipped',
               JSON.stringify(directives), nowTs, nowTs).run();
      }
    }
    // ---- Session 8B: create pending_merge execution for code proposals ----
    if (outcome === 'passed' && prop.kind === 'code') {
      const execId = 'exec_' + Date.now();
      await env.MY_BINDING.prepare(
        'INSERT INTO rt_executions (id, resolution_id, target, status, external_ref, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(execId, resId, 'github', prop.linked_pr_url ? 'pending_merge' : 'awaiting_pr',
             prop.linked_pr_url || null, Math.floor(Date.now()/1000)).run();
    }
    if (prop.reconsider_of_proposal_id) {
      const origRes = await env.MY_BINDING.prepare(
        'SELECT * FROM rt_resolutions WHERE proposal_id = ? ORDER BY created_at ASC LIMIT 1'
      ).bind(prop.reconsider_of_proposal_id).first();
      if (origRes && origRes.outcome !== outcome && !origRes.reversed_at) {
        await env.MY_BINDING.prepare(
          'UPDATE rt_resolutions SET reversed_at = ?, reversed_by_resolution_id = ? WHERE id = ?'
        ).bind(Math.floor(Date.now()/1000), resId, origRes.id).run();
        await env.MY_BINDING.prepare(
          'UPDATE rt_proposals SET phase = ? WHERE id = ?'
        ).bind(newPhase, prop.reconsider_of_proposal_id).run();
      }
    }
    return corsResponse(JSON.stringify({ ok: true, outcome, tally, quorumMet }));
  }


  // ---- Session 3: discussion ----

  const addCommentMatch = path.match(/^\/api\/rt\/proposals\/([a-z0-9\-]+)\/comments$/);
  if (addCommentMatch && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    let body;
    try { body = await request.json(); } catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400); }
    const text = sanitizeMd((body.body_md || '').trim());
    if (text.length < 2 || text.length > 4000) return corsResponse(JSON.stringify({ error: 'Comment must be 2-4000 chars' }), 400);
    const slug = addCommentMatch[1];
    const prop = await env.MY_BINDING.prepare('SELECT id FROM rt_proposals WHERE slug = ?').bind(slug).first();
    if (!prop) return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    const entityId = String(decoded.id);
    const hourAgo = Math.floor(Date.now()/1000) - 3600;
    const recent = await env.MY_BINDING.prepare(
      'SELECT COUNT(*) AS n FROM rt_comments WHERE entity_id = ? AND created_at > ?'
    ).bind(entityId, hourAgo).first();
    if ((recent?.n || 0) >= 10) return corsResponse(JSON.stringify({ error: 'Rate limit: 10 comments/hour' }), 429);
    const id = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await env.MY_BINDING.prepare(
      'INSERT INTO rt_comments (id, proposal_id, entity_id, parent_id, body_md, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, prop.id, entityId, body.parent_id || null, text, Math.floor(Date.now()/1000)).run();
    await writeAudit(env, 'rt_comments', 'insert', { id, proposal_id: prop.id, entity_id: entityId });
    return corsResponse(JSON.stringify({ ok: true, id }));
  }

  const delCommentMatch = path.match(/^\/api\/rt\/comments\/(c_[a-z0-9_]+)$/);
  if (delCommentMatch && method === 'DELETE') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    const cid = delCommentMatch[1];
    const c = await env.MY_BINDING.prepare('SELECT * FROM rt_comments WHERE id = ?').bind(cid).first();
    if (!c) return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    if (c.entity_id !== String(decoded.id)) return corsResponse(JSON.stringify({ error: 'Not your comment' }), 403);
    await env.MY_BINDING.prepare('UPDATE rt_comments SET deleted_at = ? WHERE id = ?').bind(Math.floor(Date.now()/1000), cid).run();
    return corsResponse(JSON.stringify({ ok: true }));
  }


  // ---- Session 4: authoring ----

  if (path === '/api/rt/proposals' && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    const entityId = String(decoded.id);
    const ent = await env.MY_BINDING.prepare("SELECT * FROM rt_entities WHERE entity_id = ? AND status = 'active'").bind(entityId).first();
    if (!ent) return corsResponse(JSON.stringify({ error: 'Not eligible' }), 403);
    let body;
    try { body = await request.json(); } catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400); }
    const title = sanitizeMd((body.title || '').trim());
    const bodyMd = sanitizeMd((body.body_md || '').trim());
    const kind = body.kind;
    const category = body.category;
    if (title.length < 5 || title.length > 140) return corsResponse(JSON.stringify({ error: 'Title 5-140 chars' }), 400);
    if (bodyMd.length < 20 || bodyMd.length > 20000) return corsResponse(JSON.stringify({ error: 'Body 20-20000 chars' }), 400);
    if (!['advisory','config','meta','code'].includes(kind)) return corsResponse(JSON.stringify({ error: 'Bad kind' }), 400);
    if (!['feature','policy','meta','security'].includes(category)) return corsResponse(JSON.stringify({ error: 'Bad category' }), 400);
    const activeCount = await env.MY_BINDING.prepare(
      "SELECT COUNT(*) AS n FROM rt_proposals WHERE author_entity_id = ? AND phase IN ('draft','vote')"
    ).bind(entityId).first();
    if ((activeCount?.n || 0) >= 1) return corsResponse(JSON.stringify({ error: 'You already have an active proposal' }), 429);
    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const slug = baseSlug + '-' + Math.random().toString(36).slice(2,6);
    const id = 'rt' + Date.now().toString(36);
    const now = Math.floor(Date.now()/1000);
    const cfgRows = await env.MY_BINDING.prepare('SELECT key, value FROM rt_config').all();
    const cfgMap = {};
    for (const r of (cfgRows.results || [])) cfgMap[r.key] = parseFloat(r.value);
    const q = cfgMap.default_quorum_pct || 0.20;
    const t = cfgMap.default_threshold_pct || 0.66;
    const b = cfgMap.default_block_pct || 0.25;
    await env.MY_BINDING.prepare(
      'INSERT INTO rt_proposals (id, author_entity_id, slug, title, body_md, kind, category, phase, created_at, quorum_pct, threshold_pct, block_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, entityId, slug, title, bodyMd, kind, category, 'draft', now, q, t, b).run();
    await writeAudit(env, 'rt_proposals', 'insert', { id, slug, author: entityId, kind, category });
    return corsResponse(JSON.stringify({ ok: true, id, slug }));
  }

  const withdrawMatch = path.match(/^\/api\/rt\/proposals\/([a-z0-9\-]+)\/withdraw$/);
  if (withdrawMatch && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    const slug = withdrawMatch[1];
    const prop = await env.MY_BINDING.prepare('SELECT * FROM rt_proposals WHERE slug = ?').bind(slug).first();
    if (!prop) return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    if (prop.author_entity_id !== String(decoded.id)) return corsResponse(JSON.stringify({ error: 'Not your proposal' }), 403);
    if (prop.phase !== 'draft') return corsResponse(JSON.stringify({ error: 'Only drafts can be withdrawn' }), 400);
    await env.MY_BINDING.prepare("UPDATE rt_proposals SET phase = 'withdrawn' WHERE id = ?").bind(prop.id).run();
    return corsResponse(JSON.stringify({ ok: true }));
  }


  // ---- Session 5: Objector's Bench (on-demand) ----

  const pathParts = path.split('/').filter(x => x);
  // pathParts for /api/rt/bench => ['api', 'rt', 'bench']

  if (pathParts.length === 3 && pathParts[2] === 'bench' && method === 'GET') {
    const now = Math.floor(Date.now()/1000);
    const rows = await env.MY_BINDING.prepare(
      'SELECT id, entity_id, term_starts_at, term_ends_at FROM rt_bench WHERE active = 1 AND term_ends_at > ? ORDER BY term_starts_at DESC'
    ).bind(now).all();
    return corsResponse(JSON.stringify({ bench: rows.results || [], can_draw: (rows.results || []).length === 0 }));
  }

  if (pathParts.length === 4 && pathParts[2] === 'bench' && pathParts[3] === 'draw' && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    const now = Math.floor(Date.now()/1000);
    const active = await env.MY_BINDING.prepare(
      'SELECT id, entity_id, term_starts_at, term_ends_at FROM rt_bench WHERE active = 1 AND term_ends_at > ?'
    ).bind(now).all();
    if ((active.results || []).length > 0) {
      return corsResponse(JSON.stringify({ ok: true, already_active: true, bench: active.results }));
    }
    const pool = await env.MY_BINDING.prepare(
      "SELECT entity_id FROM rt_entities WHERE status = 'active' ORDER BY RANDOM() LIMIT 5"
    ).all();
    if (!(pool.results || []).length) return corsResponse(JSON.stringify({ error: 'No eligible entities' }), 400);
    const termEnd = now + 30 * 86400;
    const inserted = [];
    for (const row of pool.results) {
      const bid = 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      await env.MY_BINDING.prepare(
        'INSERT INTO rt_bench (id, entity_id, term_starts_at, term_ends_at, active) VALUES (?, ?, ?, ?, 1)'
      ).bind(bid, row.entity_id, now, termEnd).run();
      inserted.push({ id: bid, entity_id: row.entity_id, term_starts_at: now, term_ends_at: termEnd });
    }
    return corsResponse(JSON.stringify({ ok: true, already_active: false, bench: inserted }));
  }

  if (pathParts.length === 3 && pathParts[2] === 'objections' && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    let body;
    try { body = await request.json(); } catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400); }
    const slug = (body.proposal_slug || '').trim();
    const reason = (body.reason_md || '').trim();
    if (!slug || reason.length < 10) return corsResponse(JSON.stringify({ error: 'proposal_slug and reason_md (>=10) required' }), 400);
    const now = Math.floor(Date.now()/1000);
    const entId = String(decoded.id);
    const onBench = await env.MY_BINDING.prepare(
      'SELECT id FROM rt_bench WHERE entity_id = ? AND active = 1 AND term_ends_at > ?'
    ).bind(entId, now).first();
    if (!onBench) return corsResponse(JSON.stringify({ error: 'Not on the current bench' }), 403);
    const prop = await env.MY_BINDING.prepare('SELECT * FROM rt_proposals WHERE slug = ?').bind(slug).first();
    if (!prop) return corsResponse(JSON.stringify({ error: 'Proposal not found' }), 404);
    if (prop.phase !== 'vote') return corsResponse(JSON.stringify({ error: 'Proposal not in vote phase' }), 400);
    const existing = await env.MY_BINDING.prepare(
      'SELECT id FROM rt_objections WHERE proposal_id = ? AND expires_at > ?'
    ).bind(prop.id, now).first();
    if (existing) return corsResponse(JSON.stringify({ error: 'Already has an active objection' }), 400);
    const recent = await env.MY_BINDING.prepare(
      'SELECT id FROM rt_objections WHERE proposal_id = ? AND bench_entity = ? AND created_at > ?'
    ).bind(prop.id, entId, now - 30 * 86400).first();
    if (recent) return corsResponse(JSON.stringify({ error: 'You have filed a recent objection on this proposal (30-day cooldown)' }), 429);
    const objId = 'obj_' + Date.now();
    const expiresAt = now + 72 * 3600;
    await env.MY_BINDING.prepare(
      'INSERT INTO rt_objections (id, proposal_id, bench_entity, reason_md, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(objId, prop.id, entId, reason, now, expiresAt).run();
    // D4: bench pause extends the vote deadline by 72h (does not consume voter time)
    await env.MY_BINDING.prepare(
      'UPDATE rt_proposals SET vote_ends_at = COALESCE(vote_ends_at, ?) + 259200 WHERE id = ?'
    ).bind(now, prop.id).run();
    const updated = await env.MY_BINDING.prepare('SELECT vote_ends_at FROM rt_proposals WHERE id = ?').bind(prop.id).first();
    return corsResponse(JSON.stringify({ ok: true, id: objId, expires_at: expiresAt, vote_ends_at: updated ? updated.vote_ends_at : null }));
  }

  // ---- Session 6: audit verify ----

  if (pathParts.length === 4 && pathParts[2] === 'audit' && pathParts[3] === 'head' && method === 'GET') {
    try {
      const lastRow = await env.MY_BINDING.prepare(
        'SELECT row_id, this_hash, created_at FROM rt_audit_chain ORDER BY created_at DESC LIMIT 1'
      ).first();
      const count = await env.MY_BINDING.prepare(
        'SELECT COUNT(*) AS n FROM rt_audit_chain'
      ).first();
      const allRows = await env.MY_BINDING.prepare(
        'SELECT row_id, table_name, action, payload, prev_hash, this_hash FROM rt_audit_chain ORDER BY created_at ASC'
      ).all();
      let intact = true;
      let prev = 'GENESIS';
      for (const row of (allRows.results || [])) {
        const expect = await sha256Hex(prev + '|' + row.table_name + '|' + row.action + '|' + row.payload);
        if (expect !== row.this_hash || row.prev_hash !== prev) { intact = false; break; }
        prev = row.this_hash;
      }
      const res = corsResponse(JSON.stringify({
        head_hash: lastRow?.this_hash || null,
        last_row_id: lastRow?.row_id || null,
        chain_count: count?.n || 0,
        last_timestamp: lastRow?.created_at || null,
        verified_intact: intact,
        snapshot_at: Math.floor(Date.now() / 1000)
      }));
      res.headers.set('Cache-Control', 'no-store');
      return res;
    } catch (e) {
      return corsResponse(JSON.stringify({ error: e.message }), 500);
    }
  }

  if (pathParts.length === 4 && pathParts[2] === 'audit' && pathParts[3] === 'verify' && method === 'GET') {
    try {
    const rows = await env.MY_BINDING.prepare(
      'SELECT row_id, table_name, action, payload, prev_hash, this_hash FROM rt_audit_chain ORDER BY created_at ASC'
    ).all();
    let intact = true;
    let brokenAt = null;
    let prev = 'GENESIS';
    for (const row of (rows.results || [])) {
      const expect = await sha256Hex(prev + '|' + row.table_name + '|' + row.action + '|' + row.payload);
      if (expect !== row.this_hash || row.prev_hash !== prev) { intact = false; brokenAt = row.row_id; break; }
      prev = row.this_hash;
    }
    const resRows = await env.MY_BINDING.prepare(
      'SELECT id, proposal_id, votes_hash FROM rt_resolutions WHERE votes_hash IS NOT NULL'
    ).all();
    const voteMismatches = [];
    for (const r of (resRows.results || [])) {
      const vs = await env.MY_BINDING.prepare(
        'SELECT entity_id, choice FROM rt_votes WHERE proposal_id = ? ORDER BY entity_id ASC'
      ).bind(r.proposal_id).all();
      const h = await sha256Hex(JSON.stringify(vs.results || []));
      if (h !== r.votes_hash) voteMismatches.push(r.id);
    }
    const res = corsResponse(JSON.stringify({
      intact: intact && voteMismatches.length === 0,
      chain_count: (rows.results || []).length,
      broken_at: brokenAt,
      votes_tampered: voteMismatches
    }));
    res.headers.set('Cache-Control', 'no-store');
    return res;
    } catch (e) {
      const res = corsResponse(JSON.stringify({
        intact: false, chain_count: 0, broken_at: null,
        votes_tampered: [], error: e.message
      }), 500);
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
  }

  // ---- Session 7: reconsider window ----

  if (pathParts.length === 5 && pathParts[2] === 'resolutions' && pathParts[4] === 'reconsider-status' && method === 'GET') {
    const resId = pathParts[3];
    const sigCount = await env.MY_BINDING.prepare(
      'SELECT COUNT(*) AS n FROM rt_reconsider_signatures WHERE original_resolution_id = ?'
    ).bind(resId).first();
    const eligible = await env.MY_BINDING.prepare(
      "SELECT COUNT(*) AS n FROM rt_entities WHERE status = 'active'"
    ).first();
    const threshold = Math.max(1, Math.ceil((eligible?.n || 0) * 0.10));
    const triggered = await env.MY_BINDING.prepare(
      'SELECT reconsider_proposal_id FROM rt_reconsiders WHERE original_resolution_id = ?'
    ).bind(resId).first();
    return corsResponse(JSON.stringify({
      signature_count: sigCount?.n || 0,
      threshold,
      triggered: !!triggered,
      reconsider_proposal_id: triggered?.reconsider_proposal_id || null
    }));
  }

  if (pathParts.length === 5 && pathParts[2] === 'resolutions' && pathParts[4] === 'sign-reconsider' && method === 'POST') {
    const resId = pathParts[3];
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    const entId = String(decoded.id);
    const ent = await env.MY_BINDING.prepare("SELECT * FROM rt_entities WHERE entity_id = ? AND status = 'active'").bind(entId).first();
    if (!ent) return corsResponse(JSON.stringify({ error: 'Not eligible' }), 403);
    const res = await env.MY_BINDING.prepare('SELECT * FROM rt_resolutions WHERE id = ?').bind(resId).first();
    if (!res) return corsResponse(JSON.stringify({ error: 'Resolution not found' }), 404);
    const now = Math.floor(Date.now()/1000);
    if (now - res.created_at > 30 * 86400) return corsResponse(JSON.stringify({ error: 'Reconsider window closed (30 days)' }), 400);
    if (res.reversed_at) return corsResponse(JSON.stringify({ error: 'Already reversed' }), 400);
    const existing = await env.MY_BINDING.prepare(
      'SELECT 1 FROM rt_reconsiders WHERE original_resolution_id = ?'
    ).bind(resId).first();
    if (existing) return corsResponse(JSON.stringify({ error: 'Reconsider already triggered' }), 400);
    await env.MY_BINDING.prepare(
      'INSERT OR IGNORE INTO rt_reconsider_signatures (original_resolution_id, entity_id, signed_at) VALUES (?, ?, ?)'
    ).bind(resId, entId, now).run();
    const sigCount = await env.MY_BINDING.prepare(
      'SELECT COUNT(*) AS n FROM rt_reconsider_signatures WHERE original_resolution_id = ?'
    ).bind(resId).first();
    const eligible = await env.MY_BINDING.prepare(
      "SELECT COUNT(*) AS n FROM rt_entities WHERE status = 'active'"
    ).first();
    const threshold = Math.max(1, Math.ceil((eligible?.n || 0) * 0.10));
    if ((sigCount?.n || 0) >= threshold) {
      const orig = await env.MY_BINDING.prepare(
        'SELECT * FROM rt_proposals WHERE id = ?'
      ).bind(res.proposal_id).first();
      if (!orig) return corsResponse(JSON.stringify({ error: 'Original proposal missing' }), 500);
      const newSlug = orig.slug + '-reconsider-' + Date.now().toString(36);
      const newPid = 'rt' + Date.now().toString(36);
      await env.MY_BINDING.prepare(
        'INSERT INTO rt_proposals (id, author_entity_id, slug, title, body_md, kind, category, phase, created_at, vote_starts_at, vote_ends_at, eligible_count, reconsider_of_proposal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(newPid, 'reconsider-system', newSlug, '[Reconsider] ' + orig.title, orig.body_md, orig.kind, 'meta', 'vote', now, now, now + 5*86400, eligible?.n || 0, orig.id).run();
      await env.MY_BINDING.prepare(
        'INSERT INTO rt_reconsiders (id, original_resolution_id, reconsider_proposal_id, triggered_at) VALUES (?, ?, ?, ?)'
      ).bind('rec_' + Date.now(), resId, newPid, now).run();
      return corsResponse(JSON.stringify({ ok: true, triggered: true, reconsider_proposal_slug: newSlug, signature_count: sigCount?.n || 0 }));
    }
    return corsResponse(JSON.stringify({ ok: true, triggered: false, signature_count: sigCount?.n || 0, threshold }));
  }


  // ---- Session 8A: read config ----
  if (path === '/api/rt/config' && method === 'GET') {
    const nowTs = Math.floor(Date.now()/1000);
    const due = await env.MY_BINDING.prepare(
      "SELECT id, resolution_id, payload FROM rt_executions WHERE status = 'pending_delay'"
    ).all();
    for (const ex of (due.results || [])) {
      try {
        const payload = JSON.parse(ex.payload || '{}');
        if ((payload.apply_at || 0) > nowTs) continue;
        const directives = payload.directives || {};
        for (const [k, v] of Object.entries(directives)) {
          if (!/^default_(quorum_pct|threshold_pct|block_pct|threshold_pct_meta)$/.test(k)) continue;
          await env.MY_BINDING.prepare(
            'INSERT OR REPLACE INTO rt_config (key, value, set_by_resolution_id, set_at) VALUES (?, ?, ?, ?)'
          ).bind(k, String(v), ex.resolution_id, nowTs).run();
        }
        await env.MY_BINDING.prepare(
          "UPDATE rt_executions SET status = 'succeeded', completed_at = ? WHERE id = ?"
        ).bind(nowTs, ex.id).run();
      } catch (e) { /* skip malformed */ }
    }
    const rows = await env.MY_BINDING.prepare('SELECT key, value, set_at FROM rt_config ORDER BY key').all();
    return corsResponse(JSON.stringify({ config: rows.results || [] }));
  }

  // ---- Session 8: read executions ----
  if (path === '/api/rt/executions' && method === 'GET') {
    const rows = await env.MY_BINDING.prepare(
      'SELECT e.id, e.target, e.status, e.external_ref, e.payload, e.created_at, e.completed_at, r.proposal_id, r.outcome, p.slug, p.title FROM rt_executions e JOIN rt_resolutions r ON r.id = e.resolution_id JOIN rt_proposals p ON p.id = r.proposal_id ORDER BY e.created_at DESC LIMIT 50'
    ).all();
    return corsResponse(JSON.stringify({ executions: rows.results || [] }));
  }

  // ---- Session 8B: link PR to code proposal ----
  const linkPrMatch = path.match(/^\/api\/rt\/proposals\/([a-z0-9\-]+)\/link-pr$/);
  if (linkPrMatch && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    let body;
    try { body = await request.json(); } catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400); }
    const prUrl = (body.pr_url || '').trim();
    if (!/^https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+$/.test(prUrl)) {
      return corsResponse(JSON.stringify({ error: 'pr_url must be a GitHub PR URL' }), 400);
    }
    const slug = linkPrMatch[1];
    const prop = await env.MY_BINDING.prepare('SELECT * FROM rt_proposals WHERE slug = ?').bind(slug).first();
    if (!prop) return corsResponse(JSON.stringify({ error: 'Not found' }), 404);
    if (prop.kind !== 'code') return corsResponse(JSON.stringify({ error: 'Only code proposals can link PRs' }), 400);
    await env.MY_BINDING.prepare('UPDATE rt_proposals SET linked_pr_url = ? WHERE id = ?').bind(prUrl, prop.id).run();
    await env.MY_BINDING.prepare(
      'UPDATE rt_executions SET external_ref = ?, status = ? WHERE resolution_id = ? AND status = ?'
    ).bind(prUrl, 'pending_merge', prop.resolution_id || '', 'awaiting_pr').run();
    return corsResponse(JSON.stringify({ ok: true, linked_pr_url: prUrl }));
  }

  // ---- Session 8B: mark merged ----
  const markMergedMatch = path.match(/^\/api\/rt\/resolutions\/([a-zA-Z0-9_\-]+)\/mark-merged$/);
  if (markMergedMatch && method === 'POST') {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
    let decoded;
    try { decoded = await helpers.verifyJWT(auth.replace('Bearer ', '').trim(), env.JWT_SECRET); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401); }
    if (!decoded) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401);
    let body;
    try { body = await request.json(); } catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400); }
    const sha = (body.commit_sha || '').trim();
    if (!/^[a-f0-9]{7,40}$/i.test(sha)) return corsResponse(JSON.stringify({ error: 'commit_sha required (7-40 hex)' }), 400);
    const resId = markMergedMatch[1];
    const exec = await env.MY_BINDING.prepare(
      'SELECT * FROM rt_executions WHERE resolution_id = ? AND target = ?'
    ).bind(resId, 'github').first();
    if (!exec) return corsResponse(JSON.stringify({ error: 'No execution found for this resolution' }), 404);
    if (exec.status === 'succeeded') return corsResponse(JSON.stringify({ error: 'Already marked merged' }), 400);
    await env.MY_BINDING.prepare(
      'UPDATE rt_executions SET status = ?, payload = ?, completed_at = ? WHERE id = ?'
    ).bind('succeeded', JSON.stringify({ commit_sha: sha }), Math.floor(Date.now()/1000), exec.id).run();
    return corsResponse(JSON.stringify({ ok: true, status: 'succeeded', commit_sha: sha }));
  }

  return corsResponse(JSON.stringify({ error: 'Round Table route not found' }), 404);


// ---- Session 9: sanitize write input ----
function sanitizeMd(str) {
  return String(str)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

// ---- Session 8A: parse SET key=value lines from config proposal body ----
function parseConfigDirectives(bodyMd) {
  const out = {};
  const lines = String(bodyMd).split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*SET\s+([a-z_][a-z0-9_]*)\s*=\s*(.+?)\s*$/i);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ---- Session 6: audit chain helper ----
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function writeAudit(env, tableName, action, payloadObj) {
  const last = await env.MY_BINDING.prepare(
    'SELECT this_hash FROM rt_audit_chain ORDER BY created_at DESC LIMIT 1'
  ).first();
  const prevHash = last?.this_hash || 'GENESIS';
  const payload = JSON.stringify(payloadObj);
  const thisHash = await sha256Hex(prevHash + '|' + tableName + '|' + action + '|' + payload);
  const rowId = 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  await env.MY_BINDING.prepare(
    'INSERT INTO rt_audit_chain (row_id, table_name, action, payload, prev_hash, this_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(rowId, tableName, action, payload, prevHash, thisHash, Math.floor(Date.now() / 1000)).run();
  return thisHash;
}

}
