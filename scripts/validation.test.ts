/**
 * validation.test.ts
 * Lightweight test suite for validation.ts — no framework required.
 * Run with: npx ts-node scripts/validation.test.ts
 * (or adapt for vitest/jest)
 */

import {
  validateMissionJoin,
  validateMissionLeave,
  validateMissionCreate,
  validatePostCreate,
  validateRating,
  validatePollCreate,
  validatePollVote,
  validateGraveAdd,
  validateRespect,
} from "./validation";
import type { Mission, Poll, Grave } from "./types";

let passed = 0;
let failed = 0;

function expect(label: string, result: { ok: boolean }, expectedOk: boolean, expectedReason?: string): void {
  const ok = result.ok === expectedOk;
  const reason = !result.ok ? (result as { ok: false; reason: string }).reason : undefined;
  const reasonOk = expectedReason ? reason === expectedReason : true;
  if (ok && reasonOk) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected ok=${expectedOk}${expectedReason ? ` reason=${expectedReason}` : ""}`);
    console.error(`    got     ok=${result.ok}${reason ? ` reason=${reason}` : ""}`);
    failed++;
  }
}

// ─── Mission Join ─────────────────────────────────────────────────────────────

console.log("\n── validateMissionJoin ──");

const openMission: Mission = {
  id: "m1", title: "Test", description: "", levelRange: [1, 5], age: "Livre",
  platforms: [], sessionDate: "", sessionTime: "20:00", sessionNumber: 0,
  maxSlots: 2, reserveSlots: 1,
  participants: [], reserves: [], status: "open",
  createdBy: "gm", createdAt: Date.now(),
};

expect("join open mission", validateMissionJoin(openMission, "u1"), true);
expect("join undefined mission", validateMissionJoin(undefined, "u1"), false, "mission_not_found");

const closedMission = { ...openMission, status: "closed" as const };
expect("join closed mission", validateMissionJoin(closedMission, "u1"), false, "mission_closed");

const fullMission: Mission = { ...openMission, participants: ["ua", "ub"], reserves: ["uc"], status: "full" };
expect("join full+reserve full", validateMissionJoin(fullMission, "u1"), false, "no_slots");

const partialFull: Mission = { ...openMission, participants: ["ua", "ub"], reserves: [], status: "full" };
expect("join full but reserve open", validateMissionJoin(partialFull, "u1"), true);

expect("join already participant (idempotent)", validateMissionJoin(partialFull, "ua"), true);

// ─── Mission Leave ────────────────────────────────────────────────────────────

console.log("\n── validateMissionLeave ──");

const withParticipant: Mission = { ...openMission, participants: ["u1"], reserves: [] };
expect("leave as participant", validateMissionLeave(withParticipant, "u1"), true);
expect("leave not enrolled", validateMissionLeave(withParticipant, "u99"), false, "not_enrolled");
expect("leave undefined mission", validateMissionLeave(undefined, "u1"), false, "mission_not_found");

// ─── Mission Create ───────────────────────────────────────────────────────────

console.log("\n── validateMissionCreate ──");

expect("valid mission", validateMissionCreate({ title: "Epic Quest", levelRange: [1, 10], maxSlots: 4, reserveSlots: 2 }), true);
expect("missing title", validateMissionCreate({ title: "", levelRange: [1, 5], maxSlots: 4, reserveSlots: 0 }), false, "missing_title");
expect("invalid maxSlots", validateMissionCreate({ title: "Q", levelRange: [1, 5], maxSlots: 0, reserveSlots: 0 }), false, "invalid_max_slots");
expect("invalid level range (min > max)", validateMissionCreate({ title: "Q", levelRange: [10, 5], maxSlots: 4, reserveSlots: 0 }), false, "invalid_level_range");

// ─── Post ─────────────────────────────────────────────────────────────────────

console.log("\n── validatePostCreate ──");

expect("valid post", validatePostCreate({ content: "Hello realm!" }), true);
expect("empty content", validatePostCreate({ content: "" }), false, "empty_content");
expect("summary without mission", validatePostCreate({ content: "Session recap", type: "summary" }), false, "summary_requires_mission");
expect("summary with mission", validatePostCreate({ content: "Great session", type: "summary", meta: { missionId: "m1" } }), true);
expect("content too long", validatePostCreate({ content: "x".repeat(2001) }), false, "content_too_long");

console.log("\n── validateRating ──");

expect("rating 1", validateRating(1), true);
expect("rating 5", validateRating(5), true);
expect("rating 0", validateRating(0), false, "invalid_rating");
expect("rating 6", validateRating(6), false, "invalid_rating");
expect("rating 2.5", validateRating(2.5), false, "invalid_rating");

// ─── Poll ─────────────────────────────────────────────────────────────────────

console.log("\n── validatePollCreate ──");

expect("valid poll", validatePollCreate("Best system?", ["D&D", "PF2e", "CoC"]), true);
expect("missing question", validatePollCreate("", ["A", "B"]), false, "missing_question");
expect("only 1 option", validatePollCreate("Q?", ["A"]), false, "too_few_options");
expect("11 options", validatePollCreate("Q?", Array(11).fill("opt")), false, "too_many_options");
expect("empty option", validatePollCreate("Q?", ["A", ""]), false, "empty_option");

console.log("\n── validatePollVote ──");

const openPoll: Poll = {
  id: "p1", question: "Q?", multiple: false,
  options: [{ id: "o1", text: "A", votes: [] }, { id: "o2", text: "B", votes: [] }],
  createdBy: "gm", createdAt: Date.now(), closed: false,
};

expect("vote valid", validatePollVote(openPoll, "o1", "u1"), true);
expect("vote undefined poll", validatePollVote(undefined, "o1", "u1"), false, "poll_not_found");
expect("vote closed poll", validatePollVote({ ...openPoll, closed: true }, "o1", "u1"), false, "poll_closed");
expect("vote bad option", validatePollVote(openPoll, "o99", "u1"), false, "option_not_found");
expect("vote expired poll", validatePollVote({ ...openPoll, endsAt: Date.now() - 1000 }, "o1", "u1"), false, "poll_expired");

// ─── Grave ────────────────────────────────────────────────────────────────────

console.log("\n── validateGraveAdd ──");

expect("valid grave", validateGraveAdd({ name: "Sir Garek", epitaph: "A hero." }), true);
expect("missing name", validateGraveAdd({ name: "" }), false, "missing_name");
expect("epitaph too long", validateGraveAdd({ name: "X", epitaph: "x".repeat(501) }), false, "epitaph_too_long");

console.log("\n── validateRespect ──");

const grave: Grave = { id: "g1", name: "Hero", deathAt: Date.now(), respects: ["u1"], addedBy: "gm" };
expect("respect new user", validateRespect(grave, "u2"), true);
expect("respect again (idempotent)", validateRespect(grave, "u1"), true);
expect("respect undefined grave", validateRespect(undefined, "u1"), false, "grave_not_found");

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n─────────────────────────────────`);
console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) process.exit(1);
