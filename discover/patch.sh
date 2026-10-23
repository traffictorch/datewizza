#!/bin/bash
set -e
cat > /tmp/tt-patch.py << 'PY_EOF'
#!/usr/bin/env python3
import os, sys, shutil
from pathlib import Path

HOME = Path.home()
CANDIDATES = [
    HOME / 'Desktop/traffic-torch-new/profile.html',
    HOME / 'Desktop/traffic-torch-new/torcher/profile.html',
    HOME / 'Desktop/traffic-torch-new/profile/index.html',
]
PROFILE = next((p for p in CANDIDATES if p.is_file()), None)
DASH    = HOME / 'Desktop/traffic-torch-new/dashboard/index.html'

def apply(path, edits):
    if not path or not path.is_file():
        print(f"❌ Not found: {path}")
        return False
    src = path.read_text(encoding='utf-8')
    backup = path.with_suffix(path.suffix + '.bak')
    shutil.copy2(path, backup)
    print(f"  📦 backup → {backup.name}")
    for name, find, repl in edits:
        n = src.count(find)
        if n == 0:
            print(f"  ❌ {name}: anchor NOT found — no changes written")
            return False
        if n > 1:
            print(f"  ❌ {name}: anchor matches {n}× (expected 1) — no changes written")
            return False
        src = src.replace(find, repl, 1)
        print(f"  ✅ {name}")
    path.write_text(src, encoding='utf-8')
    print(f"  💾 Saved {path}")
    return True

# ────────────────────────────────────────────────────────────
# PROFILE.HTML
# ────────────────────────────────────────────────────────────
PROFILE_EDITS = [
("E1 state",
"""    inNetwork: false,
    activeTab: 'audits',
    isOwnProfile: false,
""",
"""    inNetwork: false,
    activeTab: 'audits',
    isOwnProfile: false,
    discover: { loading: false, users: [], hasMore: false, error: null, addLoading: {} },
"""),
("E2 init call",
"""        await this.checkOwnership();
      } catch (e) {""",
"""        await this.checkOwnership();
        this.loadDiscover();
      } catch (e) {"""),
("E3 methods",
"""    formatDate(ts) {
      try {
        const d = new Date(ts);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      } catch { return '—'; }
    }
  }
}""",
"""    formatDate(ts) {
      try {
        const d = new Date(ts);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      } catch { return '—'; }
    },

    async loadDiscover(fresh = false) {
      const token = localStorage.getItem('authToken');
      if (!token) return;
      this.discover.loading = true;
      this.discover.error = null;
      try {
        const res = await fetch(`${API_BASE}/api/users/discover?seed=${fresh ? 'fresh' : 'today'}&limit=24&offset=0`,
          { headers: { 'Authorization': 'Bearer ' + token } });
        if (!res.ok) throw new Error('Failed to load Discover');
        const data = await res.json();
        this.discover.users = data.users || [];
        this.discover.hasMore = !!data.has_more;
      } catch (e) { this.discover.error = e.message; }
      finally { this.discover.loading = false; }
    },

    async randomizeDiscover() { return this.loadDiscover(true); },

    async addDiscoverUser(u) {
      if (this.discover.addLoading[u.id]) return;
      this.discover.addLoading[u.id] = true;
      try {
        const token = localStorage.getItem('authToken');
        if (!token) { window.location.href = '/login/'; return; }
        const res = await fetch(`${API_BASE}/api/network/add`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: u.id })
        });
        if (res.ok) this.discover.users = this.discover.users.filter(x => x.id !== u.id);
        else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to add'); }
      } catch (e) { alert('Network error: ' + e.message); }
      finally { this.discover.addLoading[u.id] = false; }
    }
  }
}"""),
("E4 HTML",
"""            </template>
          </div>
        </div>

        <!-- About -->""",
"""            </template>
          </div>

          <div class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h3 class="text-lg font-bold">🌟 Discover more people</h3>
                <p class="text-xs text-gray-500 mt-0.5">Random people you're not connected to yet — reshuffles daily</p>
              </div>
              <button @click="randomizeDiscover()" :disabled="discover.loading"
                      class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition disabled:opacity-50">
                🎲 Randomize
              </button>
            </div>
            <div x-show="discover.loading" class="text-center py-8"><div class="spinner mx-auto"></div></div>
            <div x-show="!discover.loading && discover.users.length === 0" class="glass rounded-2xl p-6 text-center">
              <p class="text-3xl mb-2">🌱</p>
              <p class="text-sm text-gray-500">No new people to discover right now.</p>
            </div>
            <div x-show="!discover.loading && discover.users.length > 0" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <template x-for="u in discover.users" :key="'disc-' + u.id">
                <div class="glass rounded-2xl p-3 flex flex-col items-center text-center hover:bg-white/10 transition">
                  <img :src="`/images/avatars/${u.avatar_preset || 'owner'}.svg`" width="56" height="56" style="width:56px;height:56px;" class="rounded-full object-cover mb-2" alt="" loading="lazy">
                  <a :href="'/torcher/' + u.username + '/'" class="font-bold text-sm hover:text-orange-500 truncate w-full" x-text="u.display_name || u.username"></a>
                  <p class="text-xs text-gray-500 truncate w-full">@<span x-text="u.username"></span></p>
                  <span class="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-orange-500/20 text-orange-500" x-text="roleLabel(u.role)"></span>
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
        </div>

        <!-- About -->"""),
]

# ────────────────────────────────────────────────────────────
# DASHBOARD/INDEX.HTML
# ────────────────────────────────────────────────────────────
DASH_EDITS = [
("E1 state",
"""    networkSubTab: 'feed',
    profileSubTab: 'profile',
""",
"""    networkSubTab: 'feed',
    profileSubTab: 'profile',
    discover: { loading: false, users: [], hasMore: false, error: null, addLoading: {} },
"""),
("E2 init call",
"""        this.loadNotifications();
        this.initPush();""",
"""        this.loadNotifications();
        this.initPush();
        this.loadDiscover();"""),
("E3 methods",
"""    async reportPost(postId) {
      const reason = prompt('Reason for report:');
      if (!reason) return;
      try {
        await fetch(`${API_BASE}/api/reports`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'post', target_id: postId, reason })
        });
        alert('Reported. Thank you.');
      } catch {}
    }
  }
}""",
"""    async reportPost(postId) {
      const reason = prompt('Reason for report:');
      if (!reason) return;
      try {
        await fetch(`${API_BASE}/api/reports`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'post', target_id: postId, reason })
        });
        alert('Reported. Thank you.');
      } catch {}
    },

    async loadDiscover(fresh = false) {
      const token = localStorage.getItem('authToken');
      if (!token) return;
      this.discover.loading = true;
      this.discover.error = null;
      try {
        const res = await fetch(`${API_BASE}/api/users/discover?seed=${fresh ? 'fresh' : 'today'}&limit=24&offset=0`,
          { headers: { 'Authorization': 'Bearer ' + token } });
        if (!res.ok) throw new Error('Failed to load Discover');
        const data = await res.json();
        this.discover.users = data.users || [];
        this.discover.hasMore = !!data.has_more;
      } catch (e) { this.discover.error = e.message; }
      finally { this.discover.loading = false; }
    },

    async randomizeDiscover() { return this.loadDiscover(true); },

    async addDiscoverUser(u) {
      if (this.discover.addLoading[u.id]) return;
      this.discover.addLoading[u.id] = true;
      try {
        const token = localStorage.getItem('authToken');
        if (!token) { window.location.href = '/login/'; return; }
        const res = await fetch(`${API_BASE}/api/network/add`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: u.id })
        });
        if (res.ok) this.discover.users = this.discover.users.filter(x => x.id !== u.id);
        else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to add'); }
      } catch (e) { alert('Network error: ' + e.message); }
      finally { this.discover.addLoading[u.id] = false; }
    }
  }
}"""),
("E4a subtab btn",
"""              <button @click="networkSubTab = 'mine'; loadNetwork()"
                      class="px-4 py-2 rounded-lg text-sm font-medium transition"
                      :class="networkSubTab === 'mine' ? 'bg-orange-500 text-white' : 'bg-gray-200 dark:bg-gray-700'">
                Network <span x-text="network.list.length ? '(' + network.list.length + ')' : ''"></span>
              </button>
              <button @click="networkSubTab = 'invite'"
                      class="px-4 py-2 rounded-lg text-sm font-medium transition"
                      :class="networkSubTab === 'invite' ? 'bg-orange-500 text-white' : 'bg-gray-200 dark:bg-gray-700'">Invite</button>""",
"""              <button @click="networkSubTab = 'mine'; loadNetwork()"
                      class="px-4 py-2 rounded-lg text-sm font-medium transition"
                      :class="networkSubTab === 'mine' ? 'bg-orange-500 text-white' : 'bg-gray-200 dark:bg-gray-700'">
                Network <span x-text="network.list.length ? '(' + network.list.length + ')' : ''"></span>
              </button>
              <button @click="networkSubTab = 'discover'; loadDiscover()"
                      class="px-4 py-2 rounded-lg text-sm font-medium transition"
                      :class="networkSubTab === 'discover' ? 'bg-orange-500 text-white' : 'bg-gray-200 dark:bg-gray-700'">Discover</button>
              <button @click="networkSubTab = 'invite'"
                      class="px-4 py-2 rounded-lg text-sm font-medium transition"
                      :class="networkSubTab === 'invite' ? 'bg-orange-500 text-white' : 'bg-gray-200 dark:bg-gray-700'">Invite</button>"""),
("E4b panel",
"""          <div x-show="networkSubTab === 'invite'" class="max-w-md mx-auto glass rounded-2xl p-6">""",
"""          <div x-show="networkSubTab === 'discover'" x-cloak class="max-w-4xl mx-auto">
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
            <div x-show="discover.loading" class="text-center py-10"><div class="spinner mx-auto"></div></div>
            <div x-show="!discover.loading && discover.users.length === 0" class="glass rounded-2xl p-8 text-center">
              <p class="text-4xl mb-3">🌱</p>
              <p class="text-gray-500">No new people to discover yet.</p>
              <p class="text-sm text-gray-400 mt-2">Invite a colleague or wait for the daily reshuffle.</p>
            </div>
            <div x-show="!discover.loading && discover.users.length > 0" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <template x-for="u in discover.users" :key="'dash-disc-' + u.id">
                <div class="glass rounded-2xl p-3 flex flex-col items-center text-center hover:bg-white/10 transition">
                  <img :src="`/images/avatars/${u.avatar_preset || 'owner'}.svg`" width="56" height="56" style="width:56px;height:56px;" class="rounded-full object-cover mb-2" alt="" loading="lazy">
                  <a :href="'/torcher/' + u.username + '/'" class="font-bold text-sm hover:text-orange-500 truncate w-full" x-text="u.display_name || u.username"></a>
                  <p class="text-xs text-gray-500 truncate w-full">@<span x-text="u.username"></span></p>
                  <span class="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-orange-500/20 text-orange-500" x-text="roleLabel(u.role)"></span>
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

          <div x-show="networkSubTab === 'invite'" class="max-w-md mx-auto glass rounded-2xl p-6">"""),
]

print("═══ PROFILE.HTML ═══")
print(f"  path: {PROFILE}")
p_ok = apply(PROFILE, PROFILE_EDITS) if PROFILE else False

print("\n═══ DASHBOARD/INDEX.HTML ═══")
print(f"  path: {DASH}")
d_ok = apply(DASH, DASH_EDITS) if DASH.is_file() else False

print()
if p_ok and d_ok:
    print("✅ Both files patched. Run: cd ~/Desktop/traffic-torch-new && npm run build")
else:
    print("⚠️  One or more files failed. Backups exist at *.bak. Nothing was half-written.")
PY_EOF
python3 /tmp/tt-patch.py
