// ─── Data Models ─────────────────────────────────────────────────────────────

export interface Post {
  id: string;
  authorId: string;
  content: string;
  mentions: string[];
  createdAt: number;
  reactions: Record<string, string[]>; // emoji -> userIds
  type: "post" | "summary" | "patch";
  meta?: {
    missionId?: string;
    rating?: Record<string, number>; // userId -> 1-5
  };
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  levelRange: [number, number];
  age: string;
  platforms: string[];
  sessionDate: string;
  sessionTime: string;
  maxSlots: number;
  reserveSlots: number;
  participants: string[];
  reserves: string[];
  status: "open" | "full" | "closed";
  createdBy: string;
  createdAt: number;
}

export interface Poll {
  id: string;
  question: string;
  options: { id: string; text: string; votes: string[] }[];
  multiple: boolean;
  createdBy: string;
  createdAt: number;
  endsAt?: number;
  closed: boolean;
}

export type PollInput = {
  question: string;
  options: string[];
  multiple?: boolean;
  endsAt?: number;
};

export interface Grave {
  id: string;
  actorId?: string;
  name: string;
  epitaph?: string;
  deathAt: number;
  respects: string[];
  addedBy: string;
}

export interface PatchNote {
  id: string;
  version: string;
  title: string;
  content: string;
  createdAt: number;
  createdBy: string;
  official: boolean;
  link?: string;
}

export interface Duel {
  id: string;
  player1Id: string;
  player2Id: string;
  createdAt: number;
  finishedAt?: number;
  winnerId?: string;
}

// ─── Socket Payloads ──────────────────────────────────────────────────────────

export interface MissionJoinPayload {
  missionId: string;
  userId: string;
}

export interface MissionLeavePayload {
  missionId: string;
  userId: string;
}

export interface PostReactPayload {
  postId: string;
  emoji: string;
  userId: string;
}

export interface PollVotePayload {
  pollId: string;
  optionId: string;
  userId: string;
}

export interface GraveRespectPayload {
  graveId: string;
  userId: string;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

export const ROLES = {
  NONE: 0,
  PLAYER: 1,
  TRUSTED: 2,
  ASSISTANT: 3,
  GAMEMASTER: 4,
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export function isGM(): boolean {
  return (game as Game).user?.isGM ?? false;
}

export function userRole(): number {
  return (game as Game).user?.role ?? 0;
}

export function currentUserId(): string {
  return (game as Game).user?.id ?? "";
}
