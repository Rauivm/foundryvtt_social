/**
 * api.ts
 * High-level service classes consumed by App classes.
 * Mutations go through GM socket; reads use local indexes.
 */

import { randomID } from "./utils";
import { isGM, currentUserId, userRole, ROLES } from "./types";
import type { Post, Mission, Poll, Grave, PatchNote, Duel } from "./types";
import {
  getPosts, savePosts, getMissions, saveMissions,
  getPolls, savePolls, getGraves, saveGraves,
  getPatchNotes, savePatchNotes, getDuels, saveDuels, indexes,
} from "./settings";
import { getSocket, socket, SOCKET_EVENTS } from "./sockets";
import { escapeHtml, parseMentions, sanitize } from "./utils";
import {
  validatePostCreate, validateRating,
  validateMissionCreate, validatePollCreate,
  validateGraveAdd,
} from "./validation";
import type { PollInput } from "./types";

// ─── PostService ──────────────────────────────────────────────────────────────

export class PostService {
  static getAll(): Post[] {
    return getPosts().sort((a, b) => b.createdAt - a.createdAt);
  }

  static async create(input: Partial<Post>): Promise<void> {
    if (userRole() < ROLES.PLAYER) throw new Error("permission_denied");
    const content = escapeHtml(input.content ?? "");
    const type = input.type ?? "post";
    const missionId = input.meta?.missionId;
    if (!isGM() && type !== "summary") throw new Error("permission_denied");
    if (type === "summary") {
      if (!missionId) throw new Error("summary_requires_mission");
      const mission = getMissions().find((m) => m.id === missionId);
      if (!mission) throw new Error("mission_not_found");
      if (!isGM() && mission.createdBy !== currentUserId()) throw new Error("permission_denied");
    }
    const check = validatePostCreate({ ...input, content });
    if (!check.ok) throw new Error(check.reason);
    const mentions = parseMentions(content).mentions;

    const post: Post = {
      id: foundry.utils.randomID(),
      authorId: currentUserId(),
      content,
      mentions,
      createdAt: Date.now(),
      reactions: {},
      type,
      meta: type === "summary" ? { ...(input.meta ?? {}), missionId } : input.meta,
    };

    const posts = getPosts();
    posts.push(post);
    await savePosts(posts);
    Hooks.callAll("social:refresh", "feed");
  }

  static async delete(postId: string): Promise<void> {
    const post = indexes.posts.get(postId);
    if (!post) return;
    if (post.authorId !== currentUserId() && !isGM()) throw new Error("permission_denied");

    const posts = getPosts().filter((p) => p.id !== postId);
    await savePosts(posts);
    Hooks.callAll("social:refresh", "feed");
  }

  static async update(postId: string, input: Partial<Post>): Promise<void> {
    const posts = getPosts();
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (!isGM()) throw new Error("permission_denied");
    const safeContent = escapeHtml(input.content ?? post.content);
    const mentions = parseMentions(safeContent).mentions;
    post.content = safeContent;
    post.mentions = mentions;
    await savePosts(posts);
    Hooks.callAll("social:refresh", "feed");
  }

  static async react(postId: string, emoji: string): Promise<void> {
    await socket.executeAsGM(SOCKET_EVENTS.POST_REACT, {
      postId,
      emoji,
      userId: currentUserId(),
    });
  }

  static async rateMission(postId: string, rating: number): Promise<void> {
    const ratingCheck = validateRating(rating);
    if (!ratingCheck.ok) throw new Error(ratingCheck.reason);
    const posts = getPosts();
    const post = posts.find((p) => p.id === postId);
    if (!post || post.type !== "summary") throw new Error("not_a_summary");
    if (!post.meta) post.meta = {};
    if (!post.meta.rating) post.meta.rating = {};
    post.meta.rating[currentUserId()] = rating;
    await savePosts(posts);
    Hooks.callAll("social:refresh", "feed");
  }

  static getMissionRating(post: Post): { avg: number; count: number; distribution: number[] } {
    const dist = [0, 0, 0, 0, 0];
    const ratings = Object.values(post.meta?.rating ?? {});
    if (!ratings.length) return { avg: 0, count: 0, distribution: dist };
    for (const r of ratings) dist[r - 1]++;
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    return { avg: Math.round(avg * 10) / 10, count: ratings.length, distribution: dist };
  }
}

// ─── MissionService ───────────────────────────────────────────────────────────

export class MissionService {
  static getAll(): Mission[] {
    return getMissions().sort((a, b) => b.createdAt - a.createdAt);
  }

  static async create(input: Partial<Mission>): Promise<void> {
    if (userRole() < ROLES.ASSISTANT) throw new Error("permission_denied");
    const levelRange: [number, number] = input.levelRange ?? [1, 20];
    const candidate = { ...input, levelRange, maxSlots: input.maxSlots ?? 6, reserveSlots: input.reserveSlots ?? 2 };
    const check = validateMissionCreate(candidate);
    if (!check.ok) throw new Error(check.reason);
    const mission: Mission = {
      //id: randomID(),
      id: foundry.utils.randomID(),
      title: sanitize(input.title ?? "Nova Missão"),
      description: sanitize(input.description ?? ""),
      levelRange,
      age: input.age ?? "Livre",
      platforms: input.platforms ?? [],
      sessionDate: input.sessionDate ?? "",
      sessionTime: input.sessionTime ?? "20:00",
      maxSlots: Math.max(1, input.maxSlots ?? 6),
      reserveSlots: Math.max(0, input.reserveSlots ?? 2),
      participants: [],
      reserves: [],
      status: "open",
      createdBy: currentUserId(),
      createdAt: Date.now(),
    };

    const missions = getMissions();
    missions.push(mission);
    await saveMissions(missions);
    Hooks.callAll("social:refresh", "missions");
  }

  static async delete(missionId: string): Promise<void> {
    if (!isGM()) throw new Error("permission_denied");
    const missions = getMissions().filter((m) => m.id !== missionId);
    await saveMissions(missions);
    Hooks.callAll("social:refresh", "missions");
  }

  static async close(missionId: string): Promise<void> {
    if (userRole() < ROLES.ASSISTANT) throw new Error("permission_denied");
    const missions = getMissions();
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return;
    mission.status = "closed";
    await saveMissions(missions);
    Hooks.callAll("social:refresh", "missions");
  }

  /** Join via GM socket (atomic) */
  static async join(missionId: string): Promise<void> {
    const missions = getMissions();
    const mission = missions.find(m => m.id === missionId);

    if (!mission) return;

    const userId = currentUserId();

    if (!mission.participants.includes(userId)) {
      if (mission.participants.length < mission.maxSlots) {
        mission.participants.push(userId);
      } else if (mission.reserves.length < mission.reserveSlots) {
        mission.reserves.push(userId);
      }
    }

    await saveMissions(missions);

    Hooks.callAll("social:refresh", "missions");
  }

  static async leave(missionId: string): Promise<void> {
    const missions = getMissions();
    const mission = missions.find(m => m.id === missionId);

    if (!mission) return;

    const userId = currentUserId();

    // remove de participantes
    mission.participants = mission.participants.filter(id => id !== userId);

    // remove de reservas
    mission.reserves = mission.reserves.filter(id => id !== userId);

    await saveMissions(missions);

    Hooks.callAll("social:refresh", "missions");
  }

  static async update(missionId: string, data: Partial<Mission>): Promise<void> {
    if (!isGM()) return;

    const missions = getMissions();
    const mission = missions.find(m => m.id === missionId);

    if (!mission) return;

    Object.assign(mission, data);

    await saveMissions(missions);

    Hooks.callAll("social:refresh", "missions");
  }

  static getUserStatus(mission: Mission, userId: string): "participant" | "reserve" | "none" {
    if (mission.participants.includes(userId)) return "participant";
    if (mission.reserves.includes(userId)) return "reserve";
    return "none";
  }
}

// ─── PollService ──────────────────────────────────────────────────────────────

export class PollService {
  static getAll(): Poll[] {
    return getPolls().sort((a, b) => b.createdAt - a.createdAt);
  }
  static async create(input: PollInput): Promise<void> {
  const check = validatePollCreate(input.question, input.options);
  if (!check.ok) throw new Error(check.reason);

  const poll: Poll = {
    //id: randomID(),
    id: foundry.utils.randomID(),
    question: sanitize(input.question),
    options: input.options.map((text) => ({
      id: foundry.utils.randomID(),
      text: sanitize(text),
      votes: [],
    })),
    multiple: input.multiple ?? false,
    createdBy: currentUserId(),
    createdAt: Date.now(),
    endsAt: input.endsAt,
    closed: false,
  };

  const polls = getPolls();
  polls.push(poll);
  await savePolls(polls);

  Hooks.callAll("social:refresh", "polls");

  // static async create(input: Partial<Poll> & { options: string[] }): Promise<void> {
  //   if (userRole() < ROLES.PLAYER) throw new Error("permission_denied");
  //   const check = validatePollCreate(input.question ?? "", input.options);
  //   if (!check.ok) throw new Error(check.reason);
  //   const poll: Poll = {
  //     id: randomID(),
  //     question: sanitize(input.question ?? ""),
  //     options: input.options.map((text) => ({
  //       id: randomID(),
  //       text: sanitize(String(text)),
  //       votes: [],
  //     })),
  //     multiple: input.multiple ?? false,
  //     createdBy: currentUserId(),
  //     createdAt: Date.now(),
  //     endsAt: input.endsAt,
  //     closed: false,
  //   };

  //   const polls = getPolls();
  //   polls.push(poll);
  //   await savePolls(polls);
  //   Hooks.callAll("social:refresh", "polls");
  }

  static async vote(pollId: string, optionId: string): Promise<void> {
    await getSocket().executeAsGM(SOCKET_EVENTS.POLL_VOTE, {
      pollId,
      optionId,
      userId: currentUserId(),
    });
  }

  static async close(pollId: string): Promise<void> {
    const poll = indexes.polls.get(pollId);
    if (!poll) return;
    if (poll.createdBy !== currentUserId() && !isGM()) throw new Error("permission_denied");

    const polls = getPolls();
    const p = polls.find((x) => x.id === pollId);
    if (p) { p.closed = true; await savePolls(polls); }
    Hooks.callAll("social:refresh", "polls");
  }

  static async delete(pollId: string): Promise<void> {
    if (!isGM()) throw new Error("permission_denied");
    const polls = getPolls().filter((p) => p.id !== pollId);
    await savePolls(polls);
    Hooks.callAll("social:refresh", "polls");
  }

  static getTotalVotes(poll: Poll): number {
    const unique = new Set(poll.options.flatMap((o) => o.votes));
    return unique.size;
  }
}

// ─── GraveService ─────────────────────────────────────────────────────────────

export class GraveService {
  static getAll(): Grave[] {
    return getGraves().sort((a, b) => b.deathAt - a.deathAt);
  }

  static async add(input: Partial<Grave>): Promise<void> {
    if (!isGM()) throw new Error("permission_denied");
    const check = validateGraveAdd(input);
    if (!check.ok) throw new Error(check.reason);
    const grave: Grave = {
      //id: randomID(),
      id: foundry.utils.randomID(),
      actorId: input.actorId,
      name: sanitize(input.name ?? "Desconhecido"),
      epitaph: input.epitaph ? sanitize(input.epitaph) : undefined,
      deathAt: input.deathAt ?? Date.now(),
      respects: [],
      addedBy: currentUserId(),
    };

    const graves = getGraves();
    graves.push(grave);
    await saveGraves(graves);
    Hooks.callAll("social:refresh", "graveyard");
  }

  static async delete(graveId: string): Promise<void> {
    if (!isGM()) throw new Error("permission_denied");
    const graves = getGraves().filter((g) => g.id !== graveId);
    await saveGraves(graves);
    Hooks.callAll("social:refresh", "graveyard");
  }

  static async respect(graveId: string): Promise<void> {
    const graves = getGraves();
    const grave = graves.find(g => g.id === graveId);

    if (!grave) return;

    const userId = currentUserId();

    if (!grave.respects.includes(userId)) {
      grave.respects.push(userId);
    }

    await saveGraves(graves);

    Hooks.callAll("social:refresh", "graveyard");
  }

  static async update(graveId: string, data: Partial<Grave>): Promise<void> {
    if (!isGM()) throw new Error("permission_denied");

    const graves = getGraves();
    const g = graves.find(g => g.id === graveId);
    if (!g) return;

    Object.assign(g, data);

    await saveGraves(graves);

    Hooks.callAll("social:refresh", "graveyard");
  }
}

// ─── PatchService ─────────────────────────────────────────────────────────────

export class PatchService {
  static getAll(): PatchNote[] {
    return getPatchNotes().sort((a, b) => b.createdAt - a.createdAt);
  }

  static async create(input: Partial<PatchNote>): Promise<void> {
    if (!isGM()) throw new Error("permission_denied");
    const patch: PatchNote = {
      //id: randomID(),
      id: foundry.utils.randomID(),
      version: sanitize(input.version ?? "1.0.0"),
      title: sanitize(input.title ?? ""),
      content: sanitize(input.content ?? ""),
      createdAt: Date.now(),
      createdBy: currentUserId(),
      official: input.official ?? false,
      link: input.link,
    };

    const patches = getPatchNotes();
    patches.push(patch);
    await savePatchNotes(patches);
    Hooks.callAll("social:refresh", "patches");
  }

  static async delete(patchId: string): Promise<void> {
    if (!isGM()) throw new Error("permission_denied");
    const patches = getPatchNotes().filter((p) => p.id !== patchId);
    await savePatchNotes(patches);
    Hooks.callAll("social:refresh", "patches");
  }
}

// ─── DuelService ──────────────────────────────────────────────────────────────

export class DuelService {
  static getAll(): Duel[] {
    return getDuels().sort((a, b) => b.createdAt - a.createdAt);
  }

  static async create(opponentId: string): Promise<void> {
    const player1Id = currentUserId();
    if (!player1Id || !opponentId || opponentId === player1Id) throw new Error("invalid_duel");
    const duel: Duel = {
      id: foundry.utils.randomID(),
      player1Id,
      player2Id: opponentId,
      createdAt: Date.now(),
    };
    const duels = getDuels();
    duels.push(duel);
    await saveDuels(duels);
    Hooks.callAll("social:refresh", "arena");
  }

  static async finish(duelId: string, winnerId: string): Promise<void> {
    if (!winnerId) throw new Error("invalid_winner");
    const duels = getDuels();
    const duel = duels.find((item) => item.id === duelId);
    if (!duel) return;
    if (winnerId !== duel.player1Id && winnerId !== duel.player2Id) throw new Error("invalid_winner");
    duel.winnerId = winnerId;
    duel.finishedAt = Date.now();
    await saveDuels(duels);
    Hooks.callAll("social:refresh", "arena");
  }
}
