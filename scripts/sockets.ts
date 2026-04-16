/**
 * sockets.ts
 * All mutations that require atomicity go through the GM via socketlib.
 * The GM is the single source of truth for state changes.
 */

import type {
  MissionJoinPayload,
  MissionLeavePayload,
  PostReactPayload,
  PollVotePayload,
  GraveRespectPayload,
} from "./types";

import {
  getMissions,
  saveMissions,
  getPosts,
  savePosts,
  getPolls,
  savePolls,
  getGraves,
  saveGraves,
} from "./settings";

import {
  validateMissionJoin,
  validateMissionLeave,
  validatePollVote,
  validateRespect,
  checkRateLimit,
} from "./validation";

// Hooks is a Foundry global — no import needed

declare const socketlib: {
  registerModule(id: string): {
    register(event: string, handler: (...args: unknown[]) => unknown): void;
    executeAsGM(event: string, ...args: unknown[]): Promise<unknown>;
    executeForEveryone(event: string, ...args: unknown[]): Promise<unknown>;
  };
};

export let socket: ReturnType<typeof socketlib.registerModule>;

export const SOCKET_EVENTS = {
  MISSION_JOIN: "mission:join",
  MISSION_LEAVE: "mission:leave",
  POST_REACT: "post:react",
  POLL_VOTE: "poll:vote",
  GRAVE_RESPECT: "grave:respect",
  BROADCAST_REFRESH: "broadcast:refresh",
} as const;

// ─── Registration (called in Hooks.once('setup')) ─────────────────────────────

export function registerSockets(): void {
  console.log("REGISTERING SOCKETS"); 
  socket = socketlib.registerModule("foundryvtt-social");

  socket.register(SOCKET_EVENTS.MISSION_JOIN, handleMissionJoin);
  socket.register(SOCKET_EVENTS.MISSION_LEAVE, handleMissionLeave);
  socket.register(SOCKET_EVENTS.POST_REACT, handlePostReact);
  socket.register(SOCKET_EVENTS.POLL_VOTE, handlePollVote);
  socket.register(SOCKET_EVENTS.GRAVE_RESPECT, handleGraveRespect);
  socket.register(SOCKET_EVENTS.BROADCAST_REFRESH, handleBroadcastRefresh);
}

// ─── Mission Join (GM authority) ──────────────────────────────────────────────

async function handleMissionJoin(payload: any): Promise<{ ok: boolean; reason?: string }> {
  const rl = checkRateLimit(payload.userId, "mission:join");
  if (!rl.ok) return rl;

  const missions = getMissions();
  const mission = missions.find((m) => m.id === payload.missionId);

  const check = validateMissionJoin(mission, payload.userId);
  if (!check.ok) return check;
  if (!mission) return { ok: false, reason: "mission_not_found" };

  // Already enrolled (idempotent check handled in validation)
  if (mission.participants.includes(payload.userId)) return { ok: true };
  if (mission.reserves.includes(payload.userId)) return { ok: true };

  if (mission.participants.length < mission.maxSlots) {
    mission.participants.push(payload.userId);
    if (mission.participants.length >= mission.maxSlots) mission.status = "full";
  } else {
    mission.reserves.push(payload.userId);
  }

  await saveMissions(missions);
  await broadcastRefresh("missions");
  return { ok: true };
}

export function getSocket() {
  if (!socket) {
    throw new Error("socket_not_initialized");
  }
  return socket;
}

// ─── Mission Leave ─────────────────────────────────────────────────────────────

async function handleMissionLeave(payload: any): Promise<{ ok: boolean }> {
  const rl = checkRateLimit(payload.userId, "mission:leave");
  if (!rl.ok) return rl;

  const missions = getMissions();
  const mission = missions.find((m) => m.id === payload.missionId);

  const check = validateMissionLeave(mission, payload.userId);
  if (!check.ok) return check;
  if (!mission) return { ok: false };

  const pIdx = mission.participants.indexOf(payload.userId);
  const rIdx = mission.reserves.indexOf(payload.userId);

  if (pIdx !== -1) {
    mission.participants.splice(pIdx, 1);
    // promote first reserve
    if (mission.reserves.length > 0) {
      const promoted = mission.reserves.shift()!;
      mission.participants.push(promoted);
    }
    // update status
    if (mission.status === "full" && mission.participants.length < mission.maxSlots) {
      mission.status = "open";
    }
  } else if (rIdx !== -1) {
    mission.reserves.splice(rIdx, 1);
  }

  await saveMissions(missions);
  await broadcastRefresh("missions");
  return { ok: true };
}

// ─── Post React (toggle idempotent) ───────────────────────────────────────────

async function handlePostReact(payload: any): Promise<void> {
  const posts = getPosts();
  const post = posts.find((p) => p.id === payload.postId);
  if (!post) return;

  if (!post.reactions[payload.emoji]) post.reactions[payload.emoji] = [];
  const arr = post.reactions[payload.emoji];
  const idx = arr.indexOf(payload.userId);
  if (idx === -1) arr.push(payload.userId);
  else arr.splice(idx, 1);

  await savePosts(posts);
  await broadcastRefresh("feed");
}

// ─── Poll Vote ────────────────────────────────────────────────────────────────

async function handlePollVote(payload: any): Promise<{ ok: boolean; reason?: string }> {
  const rl = checkRateLimit(payload.userId, "poll:vote");
  if (!rl.ok) return rl;

  const polls = getPolls();
  const poll = polls.find((p) => p.id === payload.pollId);

  const check = validatePollVote(poll, payload.optionId, payload.userId);
  if (!check.ok) {
    // Auto-close if expired
    if (check.reason === "poll_expired" && poll) {
      poll.closed = true;
      await savePolls(polls);
    }
    return check;
  }
  if (!poll) return { ok: false, reason: "poll_not_found" };

  const option = poll.options.find((o) => o.id === payload.optionId)!;

  if (!poll.multiple) {
    // single vote: remove from all other options first
    for (const opt of poll.options) {
      const i = opt.votes.indexOf(payload.userId);
      if (i !== -1) opt.votes.splice(i, 1);
    }
  }

  // toggle on the target option
  const idx = option.votes.indexOf(payload.userId);
  if (idx === -1) option.votes.push(payload.userId);
  else option.votes.splice(idx, 1);

  await savePolls(polls);
  await broadcastRefresh("polls");
  return { ok: true };
}

// ─── Grave Respect ────────────────────────────────────────────────────────────

async function handleGraveRespect(payload: any): Promise<void> {
  const graves = getGraves();
  const grave = graves.find((g) => g.id === payload.graveId);

  const check = validateRespect(grave, payload.userId);
  if (!check.ok || !grave) return;

  if (!grave.respects.includes(payload.userId)) {
    grave.respects.push(payload.userId);
    await saveGraves(graves);
    await broadcastRefresh("graveyard");
  }
}

// ─── Broadcast Refresh ────────────────────────────────────────────────────────

async function handleBroadcastRefresh(tab: any): Promise<void> {
  Hooks.callAll("social:refresh", tab);
}

async function broadcastRefresh(tab: any): Promise<void> {
  await socket.executeForEveryone(SOCKET_EVENTS.BROADCAST_REFRESH, tab);
}