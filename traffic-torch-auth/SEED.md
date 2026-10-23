# Round Table — Founding Seed

**Date seeded:** 2026-10-17
**Seeded by:** maintainer (traffictorch@gmail.com, user id 53)
**Database:** traffic-torch-db
**Table:** rt_proposals

## Why these 7 proposals

A voting system needs rules before it can vote. Rules need proposals. Proposals need a mechanism that doesn't exist until the rules exist. Bootstrap problem. Solution: seed the minimum viable ruleset, then hand control to the community.

## The 7 founding proposals

- rt0000 ratify-constitution — ratifies the complete ruleset
- rt0001 define-entity — defines who can participate
- rt0002 default-thresholds — sets quorum/pass/block numbers
- rt0003 objectors-bench — establishes the sortition circuit breaker
- rt0004 execution-bridge — config-only for v1
- rt0005 reconsider-window — 10% can reopen within 30 days
- rt0006 first-feature — reserved for community's first decision

All 7 are subject to the same voting process. Any entity can vote against any of them.

## How to verify

Run: npx wrangler@4.16.1 d1 execute traffic-torch-db --remote --command "SELECT id, slug, author_entity_id, created_at FROM rt_proposals ORDER BY id"

All 7 will show author_entity_id = 'system' and identical created_at timestamps.

## What the maintainer can and cannot do

Can: deploy code, restart the worker, add features, merge PRs after votes pass.
Cannot: override a vote, remove a resolution from history, hide a comment (only authors can soft-delete their own), change a vote tally after close.

The hash chain at /api/rt/audit/verify proves the last three.
