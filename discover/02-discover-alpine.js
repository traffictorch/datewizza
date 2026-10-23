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
