/**
 * Governance Simulator — scenario timelines (v2)
 *
 * Each scenario is a sequence of events. The rules engine (governance-rules.js)
 * computes every outcome — no scenario ever hardcodes "passed" or "rejected".
 *
 * Event types:
 *   propose          start of the proposal (t=0 always)
 *   comment          { author, body }
 *   open_vote        start of the 5-day vote
 *   vote_batch       { yes, no, abstain }  — incrementally adds votes
 *   objection        { bench_member, reason, pause_until_t }  — 72h pause, extends deadline
 *   resume_vote      after objection expires — deadline already extended
 *   close_vote       engine computes outcome from current tallies
 *   apply            { note } — config applied immediately, meta after 72h, advisory recorded
 *   awaiting_merge   { pr_url, note } — code proposal waiting for human merge
 *   merge            { commit_sha, note } — code proposal merged
 *   reconsider_sign  { count, note } — 10% threshold met
 *   reconsider_open  — new vote opens on the same proposal
 *   reversed         { note } — reconsider vote reversed the original
 *
 * Fields:
 *   id, title, teaches, kind, category, eligible, author, body_md, config, timeline
 *   config = {} to use live/default config from /api/rt/config.
 */

window.GOVERNANCE_SIM_SCENARIOS = [

  // ─────────────────────────────────────────────────────────────
  // 1. Config passes cleanly
  // ─────────────────────────────────────────────────────────────
  {
    id: 'config-passes',
    title: 'Config passes cleanly',
    teaches: 'Clean path through Propose → Discuss → Vote → Execute.',
    kind: 'config',
    category: 'feature',
    eligible: 100,
    author: 'u42',
    config: {},
    body_md: '**Enable read-aloud mode by default**\n\nTurn on read-aloud for all new sessions, with an opt-out toggle in settings. Improves accessibility for commuters and users with screen fatigue.\n\n**Implementation:** one feature flag flip. Already tested in staging.',
    timeline: [
      { t: 0,  type: 'propose' },
      { t: 2,  type: 'comment', author: 'u17', body: 'Strong accessibility win. Ship it.' },
      { t: 4,  type: 'comment', author: 'u9',  body: 'Could we make it opt-in instead to be safer?' },
      { t: 5,  type: 'comment', author: 'u42', body: 'Opt-in means most users never enable it. The proposal already includes an opt-out toggle — nobody is stuck.' },
      { t: 8,  type: 'comment', author: 'u31', body: 'Agreed. Opt-out is the right default for accessibility.' },
      { t: 14, type: 'open_vote' },
      { t: 15, type: 'vote_batch', yes: 30, no: 5, abstain: 2 },
      { t: 16, type: 'vote_batch', yes: 20, no: 6, abstain: 3 },
      { t: 17, type: 'vote_batch', yes: 15, no: 7, abstain: 2 },
      { t: 19, type: 'close_vote' },
      { t: 19, type: 'apply', note: 'read_aloud_default = true — applied immediately' }
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 2. Block beats pass
  // ─────────────────────────────────────────────────────────────
  {
    id: 'block-beats-pass',
    title: 'Block beats pass',
    teaches: '66%+ YES can still fail if NO reaches the 25% block threshold.',
    kind: 'config',
    category: 'policy',
    eligible: 100,
    author: 'u8',
    config: {},
    body_md: '**Require a minimum karma to post proposals**\n\nProposals would require 100+ karma to submit. Intended to reduce spam.\n\n**Concern raised during discussion:** critics argue this gatekeeps and contradicts the equal-authority principle. The block threshold exists for exactly this case.',
    timeline: [
      { t: 0,  type: 'propose' },
      { t: 3,  type: 'comment', author: 'u4',  body: 'Gatekeeping contradicts equal authority. The eligibility rule already requires 7 days + activity.' },
      { t: 6,  type: 'comment', author: 'u29', body: 'Some friction protects quality. We have no way to filter out low-effort proposals.' },
      { t: 10, type: 'comment', author: 'u11', body: 'The current rules are enough. This would exclude newer voices for no clear gain.' },
      { t: 14, type: 'open_vote' },
      { t: 15, type: 'vote_batch', yes: 35, no: 12, abstain: 1 },
      { t: 16, type: 'vote_batch', yes: 20, no: 10, abstain: 2 },
      { t: 17, type: 'vote_batch', yes: 13, no: 6,  abstain: 1 },
      { t: 19, type: 'close_vote' }
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 3. Meta change with 72h delay
  // ─────────────────────────────────────────────────────────────
  {
    id: 'meta-change',
    title: 'Meta change with 72h delay',
    teaches: 'Meta proposals need 75% YES, a 30-day comment period, and a 72h apply delay.',
    kind: 'meta',
    category: 'meta',
    eligible: 100,
    author: 'u9',
    config: {},
    body_md: '**Extend the reconsider window from 30 to 45 days**\n\nThe current 30-day window is short for async communities. Extending to 45 days gives slower participants a fair shot at reopening a decision.\n\n**Apply:** 72-hour delay after passing, so the community can reconsider before the new rule takes effect.',
    timeline: [
      { t: 0,  type: 'propose' },
      { t: 5,  type: 'comment', author: 'u17', body: '45 days feels long, but our async pattern supports it.' },
      { t: 12, type: 'comment', author: 'u31', body: 'Support. The current window closes before many people even read the resolution.' },
      { t: 20, type: 'comment', author: 'u6',  body: 'Could we go to 60? Or is 45 the compromise?' },
      { t: 25, type: 'comment', author: 'u9',  body: '45 is the compromise. 60 would slow too much.' },
      { t: 30, type: 'open_vote' },
      { t: 31, type: 'vote_batch', yes: 40, no: 5, abstain: 2 },
      { t: 32, type: 'vote_batch', yes: 25, no: 4, abstain: 2 },
      { t: 33, type: 'vote_batch', yes: 13, no: 3, abstain: 1 },
      { t: 35, type: 'close_vote' },
      { t: 38, type: 'apply', note: 'reconsider_window_days = 45 — applied after 72h delay' }
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 4. Code proposal — human merge required
  // ─────────────────────────────────────────────────────────────
  {
    id: 'code-proposal',
    title: 'Code proposal — human merge required',
    teaches: 'A vote records intent. Code requires a linked PR and human merge.',
    kind: 'code',
    category: 'security',
    eligible: 100,
    author: 'u22',
    config: {},
    body_md: '**Add WebAuthn passkey login**\n\nSecond login option alongside email/password. Uses the browser\'s native WebAuthn API. PR #142 implements the full flow with a password fallback for older browsers.\n\n**No auto-merge:** the proposal records intent. A maintainer reviews the PR and merges. The merge SHA is recorded on the audit chain.',
    timeline: [
      { t: 0,  type: 'propose' },
      { t: 3,  type: 'comment', author: 'u14', body: 'Big security upgrade. PR #142 looks clean.' },
      { t: 7,  type: 'comment', author: 'u6',  body: 'Is there a fallback for older browsers? Yes — the PR keeps password login available.' },
      { t: 12, type: 'comment', author: 'u22', body: 'Bumping the PR with the requested test coverage.' },
      { t: 14, type: 'open_vote' },
      { t: 15, type: 'vote_batch', yes: 38, no: 7, abstain: 3 },
      { t: 16, type: 'vote_batch', yes: 22, no: 5, abstain: 3 },
      { t: 17, type: 'vote_batch', yes: 12, no: 3, abstain: 2 },
      { t: 19, type: 'close_vote' },
      { t: 19, type: 'awaiting_merge', pr_url: 'https://github.com/example/repo/pull/142', note: 'Waiting for maintainer review' },
      { t: 25, type: 'merge', commit_sha: 'a3f9c2d7e1b8', note: 'PR #142 merged — SHA recorded on chain' }
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 5. Bench pause + reconsider
  // ─────────────────────────────────────────────────────────────
  {
    id: 'bench-reconsider',
    title: 'Bench pause + reconsider',
    teaches: 'Bench can pause 72h (extends the deadline). 10% can then trigger a reconsider vote.',
    kind: 'config',
    category: 'feature',
    eligible: 100,
    author: 'u35',
    config: {},
    body_md: '**Add a "Featured Posts" section to the community feed**\n\nPin 3-5 high-quality posts per week to the top of the feed.\n\n**Concern raised:** the amendment says one featured slot is the maintainer\'s pick and two are community-voted. Does that give the maintainer too much editorial power? The Objector\'s Bench will pause to discuss.',
    timeline: [
      { t: 0,  type: 'propose' },
      { t: 3,  type: 'comment', author: 'u19', body: 'Featured sections help new users find good content. I support this.' },
      { t: 5,  type: 'comment', author: 'u4',  body: 'Who decides what\'s "featured"? That is a popularity lever we did not vote for.' },
      { t: 8,  type: 'comment', author: 'u35', body: 'Fair — let me add an amendment: featured slots rotate weekly, one maintainer pick + two community-voted.' },
      { t: 14, type: 'open_vote' },
      { t: 15, type: 'vote_batch', yes: 28, no: 8, abstain: 2 },
      { t: 16, type: 'vote_batch', yes: 15, no: 5, abstain: 1 },
      { t: 17, type: 'objection', bench_member: 'u12', reason: 'The maintainer-pick amendment needs more discussion. Pausing 72h.', pause_until_t: 20 },
      { t: 20, type: 'resume_vote', note: 'Deadline extended by 72h — objection expired' },
      { t: 21, type: 'vote_batch', yes: 18, no: 6, abstain: 1 },
      { t: 22, type: 'vote_batch', yes: 10, no: 3, abstain: 1 },
      { t: 22, type: 'close_vote' },
      { t: 22, type: 'apply', note: 'featured_posts = true — applied immediately' },
      { t: 25, type: 'reconsider_sign', count: 10, note: '10% of eligible signed a reconsider request' },
      { t: 25, type: 'reconsider_open', note: 'New vote opened on the same proposal' },
      { t: 26, type: 'vote_batch', yes: 25, no: 15, abstain: 2 },
      { t: 27, type: 'vote_batch', yes: 20, no: 14, abstain: 1 },
      { t: 28, type: 'vote_batch', yes: 17, no: 6,  abstain: 0 },
      { t: 30, type: 'close_vote' },
      { t: 30, type: 'reversed', note: 'Original resolution reversed — NO crossed the 25% block on reconsider' }
    ]
  },

  // ─────────────────────────────────────────────────────────────
  // 6. No quorum
  // ─────────────────────────────────────────────────────────────
  {
    id: 'no-quorum',
    title: 'No quorum',
    teaches: 'A proposal with fewer than 10 votes has no quorum and fails.',
    kind: 'advisory',
    category: 'feature',
    eligible: 40,
    author: 'u50',
    config: {},
    body_md: '**Change the community feed sort order to chronological**\n\nSort posts by timestamp instead of by engagement score. Simpler and fairer to new posts.\n\n**Note:** this is a smaller community (40 eligible), so quorum requires 10 votes minimum.',
    timeline: [
      { t: 0,  type: 'propose' },
      { t: 2,  type: 'comment', author: 'u51', body: 'Chronological is simpler but hides the good stuff.' },
      { t: 4,  type: 'comment', author: 'u52', body: 'Agreed. Current algorithm works well enough.' },
      { t: 7,  type: 'open_vote' },
      { t: 8,  type: 'vote_batch', yes: 4, no: 1, abstain: 0 },
      { t: 10, type: 'vote_batch', yes: 2, no: 1, abstain: 0 },
      { t: 12, type: 'close_vote' }
    ]
  }

];
