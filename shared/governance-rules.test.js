/**
 * Governance Rules Engine — tests
 * Plain node. Run with:  node shared/governance-rules.test.js
 * No framework, no dependencies.
 */

import './governance-rules.js';
var R = globalThis.GovernanceRules;

var passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  OK   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name); console.log('       ' + e.message); }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}
function approx(a, b, tol, msg) {
  if (Math.abs(a - b) > (tol || 0.0001)) throw new Error((msg || '') + ' expected ~' + b + ' got ' + a);
}

console.log('computeQuorum');
test('floor of 10 for small electorate', function () { eq(R.computeQuorum(40, {}), 10); });
test('20% at 100 eligible', function () { eq(R.computeQuorum(100, {}), 20); });
test('20% at 200 eligible', function () { eq(R.computeQuorum(200, {}), 40); });
test('custom 30% quorum at 100', function () { eq(R.computeQuorum(100, { quorum_pct: 0.30 }), 30); });
test('0 eligible → floor', function () { eq(R.computeQuorum(0, {}), 10); });

console.log('computeOutcome — clean pass');
test('66/24/10 all-cast passes', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 66, no: 24, abstain: 10 }, eligible: 200, config: {} });
  eq(r.outcome, 'passed'); eq(r.passed, true); eq(r.blocked, false); eq(r.quorumMet, true);
  approx(r.yesPct, 0.66); approx(r.noPct, 0.24);
});
test('exactly 66% YES passes (NO under 25% block)', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 66, no: 20, abstain: 14 }, eligible: 200 });
  eq(r.outcome, 'passed'); eq(r.blocked, false); eq(r.quorumMet, true);
});
test('66% YES but NO 34% fails (block wins)', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 66, no: 34, abstain: 0 }, eligible: 200 });
  eq(r.outcome, 'rejected'); eq(r.blocked, true);
});
test('65% YES does not pass', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 65, no: 35, abstain: 0 }, eligible: 200 });
  eq(r.outcome, 'rejected'); eq(r.passed, false);
});

console.log('computeOutcome — block beats pass');
test('74/26 fails (block)', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 74, no: 26, abstain: 0 }, eligible: 200 });
  eq(r.outcome, 'rejected'); eq(r.blocked, true); eq(r.passed, false);
  if (r.reason.indexOf('block') < 0) throw new Error('reason missing block: ' + r.reason);
});
test('exactly 25% NO triggers block', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 75, no: 25, abstain: 0 }, eligible: 200 });
  eq(r.outcome, 'rejected'); eq(r.blocked, true);
});
test('24.9% NO does not block', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 75, no: 24, abstain: 1 }, eligible: 200 });
  eq(r.blocked, false); eq(r.outcome, 'passed');
});

console.log('computeOutcome — meta');
test('meta 75/25 fails (block at 25%)', function () {
  var r = R.computeOutcome({ kind: 'meta', tallies: { yes: 75, no: 25, abstain: 0 }, eligible: 200 });
  eq(r.outcome, 'rejected'); eq(r.blocked, true);
});
test('meta 75/20/5 passes', function () {
  var r = R.computeOutcome({ kind: 'meta', tallies: { yes: 75, no: 20, abstain: 5 }, eligible: 200 });
  eq(r.outcome, 'passed'); eq(r.blocked, false);
});
test('meta 70% YES fails (below 75%)', function () {
  var r = R.computeOutcome({ kind: 'meta', tallies: { yes: 70, no: 20, abstain: 10 }, eligible: 200 });
  eq(r.outcome, 'rejected'); eq(r.blocked, false);
});

console.log('computeOutcome — no quorum');
test('empty tallies → no_quorum', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 0, no: 0, abstain: 0 }, eligible: 200 });
  eq(r.outcome, 'no_quorum'); eq(r.quorumMet, false);
});
test('40 eligible, 8 votes → no_quorum (floor 10)', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 6, no: 2, abstain: 0 }, eligible: 40 });
  eq(r.outcome, 'no_quorum'); eq(r.quorumMet, false); eq(r.quorum, 10);
});
test('40 eligible, 10 votes → quorum met', function () {
  var r = R.computeOutcome({ kind: 'config', tallies: { yes: 8, no: 2, abstain: 0 }, eligible: 40 });
  eq(r.quorumMet, true); eq(r.outcome, 'passed');
});

console.log('computeCommentPeriodDays');
test('meta 30d', function () { eq(R.computeCommentPeriodDays('meta'), 30); });
test('config 14d', function () { eq(R.computeCommentPeriodDays('config'), 14); });
test('code 14d', function () { eq(R.computeCommentPeriodDays('code'), 14); });
test('advisory 7d', function () { eq(R.computeCommentPeriodDays('advisory'), 7); });

console.log('computeVotePeriodDays');
test('all kinds 5d', function () {
  eq(R.computeVotePeriodDays('meta'), 5);
  eq(R.computeVotePeriodDays('config'), 5);
  eq(R.computeVotePeriodDays('code'), 5);
  eq(R.computeVotePeriodDays('advisory'), 5);
});

console.log('computeApplyDelaySeconds');
test('meta 72h', function () { eq(R.computeApplyDelaySeconds('meta'), 259200); });
test('config immediate', function () { eq(R.computeApplyDelaySeconds('config'), 0); });
test('code immediate', function () { eq(R.computeApplyDelaySeconds('code'), 0); });

console.log('computeEligibility');
test('new account ineligible', function () {
  var r = R.computeEligibility({ accountAgeDays: 3, hasPublicProfile: true });
  eq(r.eligible, false); eq(r.reason, 'account_too_new');
});
test('7-day with public profile eligible', function () {
  var r = R.computeEligibility({ accountAgeDays: 7, hasPublicProfile: true });
  eq(r.eligible, true);
});
test('7-day with verified profile eligible', function () {
  var r = R.computeEligibility({ accountAgeDays: 7, hasVerifiedProfile: true });
  eq(r.eligible, true);
});
test('7-day with no profile ineligible', function () {
  var r = R.computeEligibility({ accountAgeDays: 7 });
  eq(r.eligible, false); eq(r.reason, 'no_profile');
});

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
