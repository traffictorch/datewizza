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
