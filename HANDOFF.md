# Traffic Torch — Session Handoff

## Stack
- Cloudflare Workers + D1 + R2
- Dashboard: dashboard/index.html (Alpine.js, copy to dist/dashboard/index.html before git push, dist is gitignored)
- Deploy: `npx wrangler deploy` from each worker folder

## Workers
- **traffic-torch-auth** (`src/index.js`) — auth, posts, comments, uploads, feed. DB binding: MY_BINDING. R2: ATTACHMENTS
- **torches** (`src/handlers/torch.js`, `src/lib/meta.js`, `src/lib/jsonld.js`, `src/handlers/og.js`) — SSR torch pages + OG images
- **api-worker** — Stripe/auth separate
- DB name: `traffic-torch-db` (id d5c9fa6f-178f-4a5b-ae07-eebd161c6371)

## Shipped
- Posts/comments: 6000 chars, no comment cap, paginated (30/page)
- Markdown in dashboard (markdown-it + hljs, html:false)
- Discussion posts: post_type='discussion', title, body_md, images JSON, category
- Composer: Write/Preview tabs, Cmd+Enter, category pills (SEO default), edit discussion, edit/delete comments
- Image uploads: POST /api/uploads/image → R2 posts/<userId>/<uuid>.webp. Client-side 1600px WebP resize, drag/drop/paste
- Meta: discussion OG title/desc/image → /og/discussion/:id.png
- JSON-LD: DiscussionForumPosting on /torch/:id/

## Broken / pending
- **Torch page Alpine errors**: `renderMarkdown is not defined`, `shouldCollapse is not defined`, `torchPage is not defined` in browser console. Body renders plain-text SSR but markdown expansion broken. ROOT: `torchPageScript()` template literal mangles backslashes even with String.raw. NEXT: rewrite as array-of-strings joined, or move to a separate .js file served by worker.
- **Torch page images**: post.images / c.images not rendered in SSR HTML yet
- **OG worker** `/og/discussion/:id.png` — not built
- **Embeds**: YouTube/Vimeo/Spotify iframes + OG preview cards
- Test posts 12/13/14 need cleanup

## Test page
https://traffictorch.net/torch/15/

## User style
- Minimal commands, one action at a time
- All patches as Node scripts in /tmp/ then run with node
- Always `node --check` before `wrangler deploy`
- No long walls of text — short focused instructions


## Round Table (v1)

Decentralized governance. **No admins. No override.**

- **Page:** /community/round-table/ (source: community/round-table/index.html)
- **API:** traffic-torch-auth/src/round-table.js under /api/rt/*
- **Tables:** rt_proposals, rt_votes, rt_comments, rt_resolutions, rt_entities, rt_bench, rt_objections, rt_audit_chain, rt_audit_checkpoints, rt_reconsiders, rt_reconsider_signatures, rt_config, rt_executions
- **Cadence:** max 3 binding votes at once; Round Table Day = 1st Monday monthly; auto-close per kind
- **Audit:** hash-chained SHA-256; verify at /api/rt/audit/verify
- **Config exec:** config proposals with "SET key=value" in body apply to rt_config on pass
- **Code exec:** code proposals require linked_pr_url; merged SHA recorded via /api/rt/resolutions/:id/mark-merged
- **Self-amending:** thresholds read from rt_config at proposal-create time

### Deploy
Auth worker first, then Pages:
  cd traffic-torch-auth && npx wrangler@4.16.1 deploy
  cd .. && npm run build && find dist -type d -name node_modules -exec rm -rf {} + && npx wrangler@4.16.1 pages deploy dist --project-name=traffic-torch --branch=main --commit-dirty=true
