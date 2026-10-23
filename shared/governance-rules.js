/**
 * Governance Rules Engine — v2
 *
 * Pure functions. No DOM, no fetch, no dependencies.
 * Runs in browser, node, and Cloudflare Workers.
 * Mirrors the close-vote logic in traffic-torch-auth/src/round-table.js.
 *
 * If you change this file, change the worker too — the test file catches drift.
 *
 * Decisions locked for v2:
 *   D1: Pass/block thresholds use ALL VOTES CAST (incl. abstain) as denominator.
 *   D2: Eligibility = 7 days old AND (verified profile OR public profile).
 *   D3: Comment Meta 30d / Config 14d / Code 14d / Advisory 7d. Vote 5d all kinds.
 *   D4: Bench objection pauses AND extends vote deadline by 72h.
 */

(function (global) {
  'use strict';

  var DEFAULT_CONFIG = {
    quorum_pct:         0.20,
    threshold_pct:      0.66,
    threshold_pct_meta: 0.75,
    block_pct:          0.25
  };

  var MIN_QUORUM = 10;
  var BENCH_PAUSE_SECONDS = 259200;
  var META_APPLY_DELAY_SECONDS = 259200;

  function pickConfig(config) {
    var c = config || {};
    return {
      quorum_pct:         typeof c.quorum_pct         === 'number' ? c.quorum_pct         : DEFAULT_CONFIG.quorum_pct,
      threshold_pct:      typeof c.threshold_pct      === 'number' ? c.threshold_pct      : DEFAULT_CONFIG.threshold_pct,
      threshold_pct_meta: typeof c.threshold_pct_meta === 'number' ? c.threshold_pct_meta : DEFAULT_CONFIG.threshold_pct_meta,
      block_pct:          typeof c.block_pct          === 'number' ? c.block_pct          : DEFAULT_CONFIG.block_pct
    };
  }

  function thresholdFor(kind, config) {
    var c = pickConfig(config);
    return kind === 'meta' ? c.threshold_pct_meta : c.threshold_pct;
  }

  function computeQuorum(eligible, config) {
    var c = pickConfig(config);
    if (!eligible || eligible < 1) return MIN_QUORUM;
    return Math.max(MIN_QUORUM, Math.ceil(eligible * c.quorum_pct));
  }

  function fmtPct(x) {
    return Math.round(x * 100) + '%';
  }

  function computeOutcome(args) {
    var kind = args.kind || 'advisory';
    var tallies = args.tallies || {};
    var yes = tallies.yes || 0;
    var no = tallies.no || 0;
    var abstain = tallies.abstain || 0;
    var eligible = args.eligible || 0;
    var config = pickConfig(args.config);

    var totalVotes = yes + no + abstain;
    var quorum = computeQuorum(eligible, config);
    var quorumMet = totalVotes >= quorum;

    var yesPct = totalVotes ? (yes / totalVotes) : 0;
    var noPct  = totalVotes ? (no  / totalVotes) : 0;

    var thresholdUsed = thresholdFor(kind, config);
    var blockUsed = config.block_pct;
    var outcome, blocked, passed, reason;

    if (!quorumMet) {
      outcome = 'no_quorum';
      blocked = false;
      passed = false;
      reason = 'Only ' + totalVotes + ' of ' + quorum + ' required votes were cast — no quorum.';
    } else if (noPct >= blockUsed) {
      outcome = 'rejected';
      blocked = true;
      passed = false;
      reason = 'NO is ' + fmtPct(noPct) + ' — at or above the ' + fmtPct(blockUsed) +
               ' block threshold, so the proposal fails regardless of YES.';
    } else if (yesPct >= thresholdUsed) {
      outcome = 'passed';
      blocked = false;
      passed = true;
      reason = 'YES is ' + fmtPct(yesPct) + ' — at or above the ' + fmtPct(thresholdUsed) +
               ' pass threshold' + (kind === 'meta' ? ' (meta)' : '') +
               ', and NO is ' + fmtPct(noPct) + ' — below the ' + fmtPct(blockUsed) + ' block threshold.';
    } else {
      outcome = 'rejected';
      blocked = false;
      passed = false;
      reason = 'YES is ' + fmtPct(yesPct) + ' — below the ' + fmtPct(thresholdUsed) +
               ' pass threshold.';
    }

    return {
      outcome: outcome,
      passed: passed,
      blocked: blocked,
      quorumMet: quorumMet,
      quorum: quorum,
      totalVotes: totalVotes,
      yesPct: yesPct,
      noPct: noPct,
      thresholdUsed: thresholdUsed,
      blockUsed: blockUsed,
      kind: kind,
      reason: reason
    };
  }

  function computeCommentPeriodDays(kind) {
    if (kind === 'meta') return 30;
    if (kind === 'config') return 14;
    if (kind === 'code') return 14;
    return 7;
  }

  function computeVotePeriodDays(kind) {
    return 5;
  }

  function computeApplyDelaySeconds(kind) {
    return kind === 'meta' ? META_APPLY_DELAY_SECONDS : 0;
  }

  function computeEligibility(args) {
    var accountAgeDays = args.accountAgeDays || 0;
    var hasVerifiedProfile = !!args.hasVerifiedProfile;
    var hasPublicProfile = !!args.hasPublicProfile;

    if (accountAgeDays < 7) {
      return { eligible: false, reason: 'account_too_new', daysUntil: 7 - accountAgeDays };
    }
    if (!hasVerifiedProfile && !hasPublicProfile) {
      return { eligible: false, reason: 'no_profile', daysUntil: 0 };
    }
    return { eligible: true, reason: null, daysUntil: 0 };
  }

  async function sha256Hex(str) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  var API = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    MIN_QUORUM: MIN_QUORUM,
    BENCH_PAUSE_SECONDS: BENCH_PAUSE_SECONDS,
    META_APPLY_DELAY_SECONDS: META_APPLY_DELAY_SECONDS,
    pickConfig: pickConfig,
    thresholdFor: thresholdFor,
    computeQuorum: computeQuorum,
    computeOutcome: computeOutcome,
    computeCommentPeriodDays: computeCommentPeriodDays,
    computeVotePeriodDays: computeVotePeriodDays,
    computeApplyDelaySeconds: computeApplyDelaySeconds,
    computeEligibility: computeEligibility,
    sha256Hex: sha256Hex
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
  global.GovernanceRules = API;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
