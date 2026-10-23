#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "→ Writing discover files…"

# ── 01-discover-endpoint.js ─────────────────────────────────
cat > 01-discover-endpoint.js << 'FILE_EOF'
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
FILE_EOF

# ── 02-discover-alpine.js ───────────────────────────────────
cat > 02-discover-alpine.js << 'FILE_EOF'
// ============================================================
// Alpine state + methods to add to profilePage() / dashboardApp()
// ============================================================
// Add this state property:

//   discover: { loading: false, users: [], hasMore: false, error: null, addLoading: {} },

// Add these methods:

// async loadDiscover(fresh = false) {
//   const token = localStorage.getItem('authToken');
//   if (!token) return;                       // Discover needs auth
//   this.discover.loading = true;
//   this.discover.error = null;
//   try {
//     const res = await fetch(
//       `${API_BASE}/api/users/discover?seed=${fresh ? 'fresh' : 'today'}&limit=24&offset=0`,
//       { headers: { 'Authorization': 'Bearer ' + token } }
//     );
//     if (!res.ok) throw new Error('Failed to load Discover');
//     const data = await res.json();
//     this.discover.users = data.users || [];
//     this.discover.hasMore = !!data.has_more;
//   } catch (e) { this.discover.error = e.message; }
//   finally { this.discover.loading = false; }
// },
//
// async randomizeDiscover() { return this.loadDiscover(true); },
//
// async addDiscoverUser(u) {
//   if (this.discover.addLoading[u.id]) return;
//   this.discover.addLoading[u.id] = true;
//   try {
//     const token = localStorage.getItem('authToken');
//     if (!token) { window.location.href = '/login/'; return; }
//     const res = await fetch(`${API_BASE}/api/network/add`, {
//       method: 'POST',
//       headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
//       body: JSON.stringify({ user_id: u.id })
//     });
//     if (res.ok) {
//       this.discover.users = this.discover.users.filter(x => x.id !== u.id);
//     } else {
//       const d = await res.json().catch(() => ({}));
//       alert(d.error || 'Failed to add');
//     }
//   } catch (e) { alert('Network error: ' + e.message); }
//   finally { this.discover.addLoading[u.id] = false; }
// },

// In profilePage().init(), after successful load + only if token exists:
//   this.loadDiscover();
// In dashboardApp().initDashboard(), inside the `if (token)` block:
//   this.loadDiscover();
FILE_EOF

# ── 03-profile-discover.html ────────────────────────────────
cat > 03-profile-discover.html << 'FILE_EOF'
<!-- ============================================================
     Feature B — Discover section
     Insert INSIDE the profile.html block:
       <div x-show="activeTab === 'network'" x-cloak>
         ...existing network grid...
         <!-- PASTE HERE -->
       </div>
     ============================================================ -->

<div class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
  <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
    <div>
      <h3 class="text-lg font-bold">🌟 Discover more people</h3>
      <p class="text-xs text-gray-500 mt-0.5">Random people you're not connected to yet</p>
    </div>
    <button @click="randomizeDiscover()" :disabled="discover.loading"
            class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition disabled:opacity-50">
      🎲 Randomize
    </button>
  </div>

  <div x-show="discover.loading" class="text-center py-8">
    <div class="spinner mx-auto"></div>
  </div>

  <div x-show="!discover.loading && discover.users.length === 0" class="glass rounded-2xl p-6 text-center">
    <p class="text-3xl mb-2">🌱</p>
    <p class="text-sm text-gray-500">No new people to discover right now.</p>
    <p class="text-xs text-gray-400 mt-1">Check back tomorrow — the list reshuffles daily.</p>
  </div>

  <div x-show="!discover.loading && discover.users.length > 0"
       class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <template x-for="u in discover.users" :key="'disc-' + u.id">
      <div class="glass rounded-2xl p-3 flex flex-col items-center text-center hover:bg-white/10 transition">
        <img :src="`/images/avatars/${u.avatar_preset || 'owner'}.svg`"
             width="56" height="56" style="width:56px;height:56px;"
             class="rounded-full object-cover mb-2" alt="" loading="lazy">
        <a :href="'/torcher/' + u.username + '/'"
           class="font-bold text-sm hover:text-orange-500 truncate w-full"
           x-text="u.display_name || u.username"></a>
        <p class="text-xs text-gray-500 truncate w-full">@<span x-text="u.username"></span></p>
        <span class="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-orange-500/20 text-orange-500"
              x-text="roleLabel(u.role)"></span>
        <div class="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500">
          <span x-show="u.total_points > 0">🏅 <span x-text="u.total_points"></span></span>
          <span x-show="u.torch_count > 0">🔥 <span x-text="u.torch_count"></span></span>
        </div>
        <button @click="addDiscoverUser(u)" :disabled="discover.addLoading[u.id]"
                class="mt-2 w-full py-1.5 text-xs font-bold rounded-lg border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition disabled:opacity-50">
          <span x-show="!discover.addLoading[u.id]">+ Add</span>
          <span x-show="discover.addLoading[u.id]">…</span>
        </button>
      </div>
    </template>
  </div>

  <p x-show="discover.error" class="text-red-500 text-xs text-center mt-3" x-text="discover.error"></p>
</div>
FILE_EOF

# ── 04-dashboard-discover.html ──────────────────────────────
cat > 04-dashboard-discover.html << 'FILE_EOF'
<!-- ============================================================
     Feature B — Discover sub-tab for dashboard network tab
     Insert TWO places in dashboard/index.html:

     1) Add sub-tab button alongside Feed / Network / Invite:
        <button @click="networkSubTab = 'discover'; loadDiscover()"
                class="px-4 py-2 rounded-lg text-sm font-medium transition"
                :class="networkSubTab === 'discover' ? 'bg-orange-500 text-white' : 'bg-gray-200 dark:bg-gray-700'">
          Discover
        </button>

     2) Add this panel inside the Network tab region:
     ============================================================ -->

<div x-show="networkSubTab === 'discover'" x-cloak class="max-w-4xl mx-auto">
  <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
    <div>
      <h3 class="text-lg font-bold">🌟 Discover</h3>
      <p class="text-xs text-gray-500 mt-0.5">Random people you're not connected to yet — reshuffles daily at 11:00 UTC</p>
    </div>
    <button @click="randomizeDiscover()" :disabled="discover.loading"
            class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition disabled:opacity-50">
      🎲 Randomize
    </button>
  </div>

  <div x-show="discover.loading" class="text-center py-10">
    <div class="spinner mx-auto"></div>
  </div>

  <div x-show="!discover.loading && discover.users.length === 0" class="glass rounded-2xl p-8 text-center">
    <p class="text-4xl mb-3">🌱</p>
    <p class="text-gray-500">No new people to discover yet.</p>
    <p class="text-sm text-gray-400 mt-2">Invite a colleague or wait for the daily reshuffle.</p>
  </div>

  <div x-show="!discover.loading && discover.users.length > 0"
       class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    <template x-for="u in discover.users" :key="'dash-disc-' + u.id">
      <div class="glass rounded-2xl p-3 flex flex-col items-center text-center hover:bg-white/10 transition">
        <img :src="`/images/avatars/${u.avatar_preset || 'owner'}.svg`"
             width="56" height="56" style="width:56px;height:56px;"
             class="rounded-full object-cover mb-2" alt="" loading="lazy">
        <a :href="'/torcher/' + u.username + '/'"
           class="font-bold text-sm hover:text-orange-500 truncate w-full"
           x-text="u.display_name || u.username"></a>
        <p class="text-xs text-gray-500 truncate w-full">@<span x-text="u.username"></span></p>
        <span class="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-orange-500/20 text-orange-500"
              x-text="roleLabel(u.role)"></span>
        <div class="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500">
          <span x-show="u.total_points > 0">🏅 <span x-text="u.total_points"></span></span>
          <span x-show="u.torch_count > 0">🔥 <span x-text="u.torch_count"></span></span>
        </div>
        <button @click="addDiscoverUser(u)" :disabled="discover.addLoading[u.id]"
                class="mt-2 w-full py-1.5 text-xs font-bold rounded-lg border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition disabled:opacity-50">
          <span x-show="!discover.addLoading[u.id]">+ Add</span>
          <span x-show="discover.addLoading[u.id]">…</span>
        </button>
      </div>
    </template>
  </div>

  <p x-show="discover.error" class="text-red-500 text-xs text-center mt-3" x-text="discover.error"></p>
</div>
FILE_EOF

# ── TEST-discover.sh ────────────────────────────────────────
cat > TEST-discover.sh << 'FILE_EOF'
#!/bin/bash
# Smoke test for GET /api/users/discover
# Usage:  TOKEN="eyJ..." bash TEST-discover.sh
#    or:  bash TEST-discover.sh        (will prompt for token)

API="https://traffic-torch-auth.traffictorch.workers.dev"

if [ -z "$TOKEN" ]; then
  echo -n "Paste JWT: "
  read -r TOKEN
fi

echo ""
echo "── today (stable, 24) ─────────────────────────"
curl -sS "$API/api/users/discover?seed=today&limit=24&offset=0" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "── fresh (randomised, 24) ─────────────────────"
curl -sS "$API/api/users/discover?seed=fresh&limit=24&offset=0" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "── unauth (should 401) ────────────────────────"
curl -sS "$API/api/users/discover" | python3 -m json.tool
FILE_EOF

chmod +x TEST-discover.sh

# ── README.md ───────────────────────────────────────────────
cat > README.md << 'FILE_EOF'
# Feature B — Discover

## Files
- `01-discover-endpoint.js`   → paste into auth worker (2 functions + helper)
- `02-discover-alpine.js`     → Alpine state + methods (both pages)
- `03-profile-discover.html`  → snippet under network grid on profile.html
- `04-dashboard-discover.html`→ snippet + sub-tab on dashboard/index.html
- `TEST-discover.sh`          → curl smoke test

## Deploy steps
1. Paste `01-discover-endpoint.js` into auth worker at CF dashboard:
   - `_discoverSeed()` after `slugifyUsername()`
   - `handleDiscoverRoutes()` after `handleNetworkRoutes()`
   - Add to `handleNewRoutes` isNew:  `p === '/api/users/discover' ||`
   - Add to try chain:  `|| (await handleDiscoverRoutes(request, env, url))`
2. Save & Deploy in CF dashboard.
3. Run smoke test:  `TOKEN="eyJ..." bash TEST-discover.sh`
4. Patch `profile.html`: add Alpine state + methods + snippet (03).
5. Patch `dashboard/index.html`: add Alpine state + methods + snippet (04).
6. Rebuild + deploy pages:  `cd ~/Desktop/traffic-torch-new && npm run build`

## Cold-start note
Only 2 users in the DB currently have torches. Default `min_torches=0` so the grid
isn't empty. To enforce spec (exclude 0-torch users), edit `01-discover-endpoint.js`
line:  `... || '0', 10) || 0, 0);`  → change `'0'` to `'1'`.

## Daily seed
Resets at 11:00 UTC (= 21:00 AEST). Same 24 per viewer per day.
`?seed=fresh` bypasses — used by the Randomize button.
FILE_EOF

echo "✓ Discover files written:"
ls -la
