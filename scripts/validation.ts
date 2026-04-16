/**
 * validation.ts
 * Pure validation functions (no side-effects, easy to unit-test).
 * All functions return { ok: true } or { ok: false, reason: string }.
 */

import type { Mission, Poll, Post, Grave } from "./types";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

// ─── Mission ──────────────────────────────────────────────────────────────────

export function validateMissionJoin(
  mission: Mission | undefined,
  userId: string
): ValidationResult {
  if (!mission) return { ok: false, reason: "mission_not_found" };
  if (mission.status === "closed") return { ok: false, reason: "mission_closed" };
  if (mission.participants.includes(userId)) return { ok: true }; // idempotent
  if (mission.reserves.includes(userId)) return { ok: true };     // already queued

  const totalCapacity = mission.maxSlots + mission.reserveSlots;
  const totalEnrolled = mission.participants.length + mission.reserves.length;
  if (totalEnrolled >= totalCapacity) return { ok: false, reason: "no_slots" };

  return { ok: true };
}

export function validateMissionLeave(
  mission: Mission | undefined,
  userId: string
): ValidationResult {
  if (!mission) return { ok: false, reason: "mission_not_found" };
  const enrolled =
    mission.participants.includes(userId) || mission.reserves.includes(userId);
  if (!enrolled) return { ok: false, reason: "not_enrolled" };
  return { ok: true };
}

export function validateMissionCreate(input: Partial<Mission>): ValidationResult {
  if (!input.title?.trim()) return { ok: false, reason: "missing_title" };
  if ((input.maxSlots ?? 0) < 1) return { ok: false, reason: "invalid_max_slots" };
  if ((input.reserveSlots ?? 0) < 0) return { ok: false, reason: "invalid_reserve_slots" };
  const [min, max] = input.levelRange ?? [0, 0];
  if (min < 1 || max > 20 || min > max)
    return { ok: false, reason: "invalid_level_range" };
  return { ok: true };
}

// ─── Post ─────────────────────────────────────────────────────────────────────

export function validatePostCreate(input: Partial<Post>): ValidationResult {
  if (!input.content?.trim()) return { ok: false, reason: "empty_content" };
  if (input.content.length > 2000) return { ok: false, reason: "content_too_long" };
  if (input.type === "summary" && !input.meta?.missionId)
    return { ok: false, reason: "summary_requires_mission" };
  return { ok: true };
}

export function validateRating(rating: number): ValidationResult {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return { ok: false, reason: "invalid_rating" };
  return { ok: true };
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

export function validatePollCreate(
  question: string,
  options: string[]
): ValidationResult {
  if (!question?.trim()) return { ok: false, reason: "missing_question" };
  if (!options || options.length < 2) return { ok: false, reason: "too_few_options" };
  if (options.length > 10) return { ok: false, reason: "too_many_options" };
  if (options.some((o) => !String(o).trim())) return { ok: false, reason: "empty_option" };
  return { ok: true };
}

export function validatePollVote(
  poll: Poll | undefined,
  optionId: string,
  userId: string
): ValidationResult {
  if (!poll) return { ok: false, reason: "poll_not_found" };
  if (poll.closed) return { ok: false, reason: "poll_closed" };
  if (poll.endsAt && Date.now() > poll.endsAt) return { ok: false, reason: "poll_expired" };
  if (!poll.options.find((o) => o.id === optionId))
    return { ok: false, reason: "option_not_found" };
  return { ok: true };
}

// ─── Grave ────────────────────────────────────────────────────────────────────

export function validateGraveAdd(input: Partial<Grave>): ValidationResult {
  if (!input.name?.trim()) return { ok: false, reason: "missing_name" };
  if (input.epitaph && input.epitaph.length > 500)
    return { ok: false, reason: "epitaph_too_long" };
  return { ok: true };
}

export function validateRespect(
  grave: Grave | undefined,
  userId: string
): ValidationResult {
  if (!grave) return { ok: false, reason: "grave_not_found" };
  if (grave.respects.includes(userId)) return { ok: true }; // idempotent
  return { ok: true };
}

// ─── Generic rate-limit guard (client-side debounce supplement) ───────────────

const _actionTimestamps = new Map<string, number>();
const RATE_LIMIT_MS = 1000; // 1 action per second per user+action key

export function checkRateLimit(userId: string, action: string): ValidationResult {
  const key = `${userId}:${action}`;
  const last = _actionTimestamps.get(key) ?? 0;
  if (Date.now() - last < RATE_LIMIT_MS) return { ok: false, reason: "rate_limited" };
  _actionTimestamps.set(key, Date.now());
  return { ok: true };
}