const MODULE_ID$2 = "foundryvtt-social";
// ─── Setting keys ─────────────────────────────────────────────────────────────
const KEYS = {
    POSTS: "posts",
    MISSIONS: "missions",
    POLLS: "polls",
    GRAVES: "graves",
    PATCHES: "patches",
};
// ─── In-memory indexes for O(1) reads ─────────────────────────────────────────
const indexes = {
    posts: new Map(),
    missions: new Map(),
    polls: new Map(),
    graves: new Map(),
    patches: new Map(),
};
function buildIndex(map, items) {
    map.clear();
    for (const item of items)
        map.set(item.id, item);
}
// ─── Registration ─────────────────────────────────────────────────────────────
function registerSettings() {
    const g = game;
    const defs = [
        [KEYS.POSTS, []],
        [KEYS.MISSIONS, []],
        [KEYS.POLLS, []],
        [KEYS.GRAVES, []],
        [KEYS.PATCHES, []],
    ];
    for (const [key, def] of defs) {
        g.settings.register(MODULE_ID$2, key, {
            scope: "world",
            config: false,
            type: Array,
            default: def,
        });
    }
}
// ─── Generic CRUD helpers ─────────────────────────────────────────────────────
function getAll(key) {
    return game.settings.get(MODULE_ID$2, key) ?? [];
}
async function saveAll(key, items) {
    await game.settings.set(MODULE_ID$2, key, items);
}
// ─── Typed accessors ─────────────────────────────────────────────────────────
function getPosts() {
    return getAll(KEYS.POSTS);
}
async function savePosts(posts) {
    await saveAll(KEYS.POSTS, posts);
    buildIndex(indexes.posts, posts);
}
// export function getMissions(): Mission[] {
//   const raw = (game as Game).settings.storage.get("world")?.get(`${MODULE_ID}.${KEYS.MISSIONS}`);
//   return raw ? JSON.parse(JSON.stringify(raw)) : [];
// }
function getMissions() {
    return getAll(KEYS.MISSIONS);
}
async function saveMissions(missions) {
    await saveAll(KEYS.MISSIONS, missions);
    buildIndex(indexes.missions, missions);
}
function getPolls() {
    return getAll(KEYS.POLLS);
}
async function savePolls(polls) {
    await saveAll(KEYS.POLLS, polls);
    buildIndex(indexes.polls, polls);
}
function getGraves() {
    return getAll(KEYS.GRAVES);
}
async function saveGraves(graves) {
    await saveAll(KEYS.GRAVES, graves);
    buildIndex(indexes.graves, graves);
}
function getPatchNotes() {
    return getAll(KEYS.PATCHES);
}
async function savePatchNotes(patches) {
    await saveAll(KEYS.PATCHES, patches);
    buildIndex(indexes.patches, patches);
}
// ─── Hydrate indexes on ready ─────────────────────────────────────────────────
function hydrateIndexes() {
    buildIndex(indexes.posts, getPosts());
    buildIndex(indexes.missions, getMissions());
    buildIndex(indexes.polls, getPolls());
    buildIndex(indexes.graves, getGraves());
    buildIndex(indexes.patches, getPatchNotes());
}

/**
 * validation.ts
 * Pure validation functions (no side-effects, easy to unit-test).
 * All functions return { ok: true } or { ok: false, reason: string }.
 */
// ─── Mission ──────────────────────────────────────────────────────────────────
function validateMissionJoin(mission, userId) {
    if (!mission)
        return { ok: false, reason: "mission_not_found" };
    if (mission.status === "closed")
        return { ok: false, reason: "mission_closed" };
    if (mission.participants.includes(userId))
        return { ok: true }; // idempotent
    if (mission.reserves.includes(userId))
        return { ok: true }; // already queued
    const totalCapacity = mission.maxSlots + mission.reserveSlots;
    const totalEnrolled = mission.participants.length + mission.reserves.length;
    if (totalEnrolled >= totalCapacity)
        return { ok: false, reason: "no_slots" };
    return { ok: true };
}
function validateMissionLeave(mission, userId) {
    if (!mission)
        return { ok: false, reason: "mission_not_found" };
    const enrolled = mission.participants.includes(userId) || mission.reserves.includes(userId);
    if (!enrolled)
        return { ok: false, reason: "not_enrolled" };
    return { ok: true };
}
function validateMissionCreate(input) {
    if (!input.title?.trim())
        return { ok: false, reason: "missing_title" };
    if ((input.maxSlots ?? 0) < 1)
        return { ok: false, reason: "invalid_max_slots" };
    if ((input.reserveSlots ?? 0) < 0)
        return { ok: false, reason: "invalid_reserve_slots" };
    const [min, max] = input.levelRange ?? [0, 0];
    if (min < 1 || max > 20 || min > max)
        return { ok: false, reason: "invalid_level_range" };
    return { ok: true };
}
// ─── Post ─────────────────────────────────────────────────────────────────────
function validatePostCreate(input) {
    if (!input.content?.trim())
        return { ok: false, reason: "empty_content" };
    if (input.content.length > 2000)
        return { ok: false, reason: "content_too_long" };
    if (input.type === "summary" && !input.meta?.missionId)
        return { ok: false, reason: "summary_requires_mission" };
    return { ok: true };
}
function validateRating(rating) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        return { ok: false, reason: "invalid_rating" };
    return { ok: true };
}
// ─── Poll ─────────────────────────────────────────────────────────────────────
function validatePollCreate(question, options) {
    if (!question?.trim())
        return { ok: false, reason: "missing_question" };
    if (!options || options.length < 2)
        return { ok: false, reason: "too_few_options" };
    if (options.length > 10)
        return { ok: false, reason: "too_many_options" };
    if (options.some((o) => !String(o).trim()))
        return { ok: false, reason: "empty_option" };
    return { ok: true };
}
function validatePollVote(poll, optionId, userId) {
    if (!poll)
        return { ok: false, reason: "poll_not_found" };
    if (poll.closed)
        return { ok: false, reason: "poll_closed" };
    if (poll.endsAt && Date.now() > poll.endsAt)
        return { ok: false, reason: "poll_expired" };
    if (!poll.options.find((o) => o.id === optionId))
        return { ok: false, reason: "option_not_found" };
    return { ok: true };
}
// ─── Grave ────────────────────────────────────────────────────────────────────
function validateGraveAdd(input) {
    if (!input.name?.trim())
        return { ok: false, reason: "missing_name" };
    if (input.epitaph && input.epitaph.length > 500)
        return { ok: false, reason: "epitaph_too_long" };
    return { ok: true };
}
function validateRespect(grave, userId) {
    if (!grave)
        return { ok: false, reason: "grave_not_found" };
    if (grave.respects.includes(userId))
        return { ok: true }; // idempotent
    return { ok: true };
}
// ─── Generic rate-limit guard (client-side debounce supplement) ───────────────
const _actionTimestamps = new Map();
const RATE_LIMIT_MS = 1000; // 1 action per second per user+action key
function checkRateLimit(userId, action) {
    const key = `${userId}:${action}`;
    const last = _actionTimestamps.get(key) ?? 0;
    if (Date.now() - last < RATE_LIMIT_MS)
        return { ok: false, reason: "rate_limited" };
    _actionTimestamps.set(key, Date.now());
    return { ok: true };
}

/**
 * sockets.ts
 * All mutations that require atomicity go through the GM via socketlib.
 * The GM is the single source of truth for state changes.
 */
let socket;
const SOCKET_EVENTS = {
    MISSION_JOIN: "mission:join",
    MISSION_LEAVE: "mission:leave",
    POST_REACT: "post:react",
    POLL_VOTE: "poll:vote",
    GRAVE_RESPECT: "grave:respect",
    BROADCAST_REFRESH: "broadcast:refresh",
};
// ─── Registration (called in Hooks.once('setup')) ─────────────────────────────
function registerSockets() {
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
async function handleMissionJoin(payload) {
    const rl = checkRateLimit(payload.userId, "mission:join");
    if (!rl.ok)
        return rl;
    const missions = getMissions();
    const mission = missions.find((m) => m.id === payload.missionId);
    const check = validateMissionJoin(mission, payload.userId);
    if (!check.ok)
        return check;
    if (!mission)
        return { ok: false, reason: "mission_not_found" };
    // Already enrolled (idempotent check handled in validation)
    if (mission.participants.includes(payload.userId))
        return { ok: true };
    if (mission.reserves.includes(payload.userId))
        return { ok: true };
    if (mission.participants.length < mission.maxSlots) {
        mission.participants.push(payload.userId);
        if (mission.participants.length >= mission.maxSlots)
            mission.status = "full";
    }
    else {
        mission.reserves.push(payload.userId);
    }
    await saveMissions(missions);
    await broadcastRefresh("missions");
    return { ok: true };
}
function getSocket() {
    if (!socket) {
        throw new Error("socket_not_initialized");
    }
    return socket;
}
// ─── Mission Leave ─────────────────────────────────────────────────────────────
async function handleMissionLeave(payload) {
    const rl = checkRateLimit(payload.userId, "mission:leave");
    if (!rl.ok)
        return rl;
    const missions = getMissions();
    const mission = missions.find((m) => m.id === payload.missionId);
    const check = validateMissionLeave(mission, payload.userId);
    if (!check.ok)
        return check;
    if (!mission)
        return { ok: false };
    const pIdx = mission.participants.indexOf(payload.userId);
    const rIdx = mission.reserves.indexOf(payload.userId);
    if (pIdx !== -1) {
        mission.participants.splice(pIdx, 1);
        // promote first reserve
        if (mission.reserves.length > 0) {
            const promoted = mission.reserves.shift();
            mission.participants.push(promoted);
        }
        // update status
        if (mission.status === "full" && mission.participants.length < mission.maxSlots) {
            mission.status = "open";
        }
    }
    else if (rIdx !== -1) {
        mission.reserves.splice(rIdx, 1);
    }
    await saveMissions(missions);
    await broadcastRefresh("missions");
    return { ok: true };
}
// ─── Post React (toggle idempotent) ───────────────────────────────────────────
async function handlePostReact(payload) {
    const posts = getPosts();
    const post = posts.find((p) => p.id === payload.postId);
    if (!post)
        return;
    if (!post.reactions[payload.emoji])
        post.reactions[payload.emoji] = [];
    const arr = post.reactions[payload.emoji];
    const idx = arr.indexOf(payload.userId);
    if (idx === -1)
        arr.push(payload.userId);
    else
        arr.splice(idx, 1);
    await savePosts(posts);
    await broadcastRefresh("feed");
}
// ─── Poll Vote ────────────────────────────────────────────────────────────────
async function handlePollVote(payload) {
    const rl = checkRateLimit(payload.userId, "poll:vote");
    if (!rl.ok)
        return rl;
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
    if (!poll)
        return { ok: false, reason: "poll_not_found" };
    const option = poll.options.find((o) => o.id === payload.optionId);
    if (!poll.multiple) {
        // single vote: remove from all other options first
        for (const opt of poll.options) {
            const i = opt.votes.indexOf(payload.userId);
            if (i !== -1)
                opt.votes.splice(i, 1);
        }
    }
    // toggle on the target option
    const idx = option.votes.indexOf(payload.userId);
    if (idx === -1)
        option.votes.push(payload.userId);
    else
        option.votes.splice(idx, 1);
    await savePolls(polls);
    await broadcastRefresh("polls");
    return { ok: true };
}
// ─── Grave Respect ────────────────────────────────────────────────────────────
async function handleGraveRespect(payload) {
    const graves = getGraves();
    const grave = graves.find((g) => g.id === payload.graveId);
    const check = validateRespect(grave, payload.userId);
    if (!check.ok || !grave)
        return;
    if (!grave.respects.includes(payload.userId)) {
        grave.respects.push(payload.userId);
        await saveGraves(graves);
        await broadcastRefresh("graveyard");
    }
}
// ─── Broadcast Refresh ────────────────────────────────────────────────────────
async function handleBroadcastRefresh(tab) {
    Hooks.callAll("social:refresh", tab);
}
async function broadcastRefresh(tab) {
    await socket.executeForEveryone(SOCKET_EVENTS.BROADCAST_REFRESH, tab);
}

/**
 * utils.ts – shared helpers
 */
/** Generate a short random ID compatible with Foundry conventions */
/** Sanitize user-supplied HTML with DOMPurify */
function sanitize(html) {
    if (typeof DOMPurify !== "undefined") {
        return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "br"], ALLOWED_ATTR: ["href"] });
    }
    // fallback: strip all tags
    const d = document.createElement("div");
    d.textContent = html;
    return d.innerHTML;
}
/** Format a timestamp as relative string */
function timeAgo(ts) {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60)
        return "agora mesmo";
    if (seconds < 3600)
        return `há ${Math.floor(seconds / 60)}min`;
    if (seconds < 86400)
        return `há ${Math.floor(seconds / 3600)}h`;
    return `há ${Math.floor(seconds / 86400)}d`;
}
/** Format ISO date string to locale */
function formatDate(iso) {
    if (!iso)
        return "";
    try {
        return new Date(iso).toLocaleDateString("pt-BR");
    }
    catch {
        return iso;
    }
}
/** Get user name from id */
function getUserName(userId) {
    const user = game.users?.get(userId);
    return user?.name ?? userId.slice(0, 8);
}
/** Debounce helper */
function debounce(fn, ms) {
    let timer;
    return ((...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    });
}

/**
 * helpers.ts – Register Handlebars helpers used in templates
 */
function registerHelpers() {
    // Abbreviate name to 2 initials
    Handlebars.registerHelper("abbrev", (name) => {
        if (!name)
            return "?";
        const parts = name.trim().split(/\s+/);
        return parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : name.slice(0, 2).toUpperCase();
    });
    // timeAgo from timestamp
    Handlebars.registerHelper("timeAgo", function () {
        return timeAgo(this.createdAt ?? 0);
    });
    // Format timestamp to locale date
    Handlebars.registerHelper("formatDate", (ts) => {
        if (typeof ts === "number")
            return new Date(ts).toLocaleDateString("pt-BR");
        return formatDate(ts);
    });
    // Join array with separator
    Handlebars.registerHelper("join", (arr, sep) => {
        if (!Array.isArray(arr))
            return "";
        return arr.join(sep);
    });
    // Equality check
    Handlebars.registerHelper("eq", (a, b) => a === b);
    // Or check
    Handlebars.registerHelper("or", (a, b) => a || b);
    // Range helper: {{range 1 5}} -> [1,2,3,4,5]
    Handlebars.registerHelper("range", (start, end) => {
        const out = [];
        for (let i = start; i <= end; i++)
            out.push(i);
        return out;
    });
    // Slot percent
    Handlebars.registerHelper("slotPercent", (current, max) => {
        if (!max)
            return 0;
        return Math.min(100, Math.round((current / max) * 100));
    });
    // Mission status label
    Handlebars.registerHelper("statusLabel", (status) => {
        const map = {
            open: "Aberta",
            full: "Lotada",
            closed: "Encerrada",
        };
        return map[status] ?? status;
    });
    Handlebars.registerHelper("nl2br", function (text) {
        if (!text)
            return "";
        const escaped = Handlebars.escapeExpression(text);
        return new Handlebars.SafeString(escaped.replace(/\n/g, "<br>"));
    });
    Handlebars.registerHelper("roseCounter", function (count) {
        if (!count)
            return "—";
        const bouquets = Math.floor(count / 5);
        const roses = count % 5;
        const bouquetStr = "💐".repeat(bouquets);
        const roseStr = "🌹".repeat(roses);
        return new Handlebars.SafeString(`${bouquetStr}${roseStr} <small>(${count})</small>`);
    });
    Handlebars.registerHelper("truncate", (text, len) => {
        if (!text)
            return "";
        return text.length > len ? text.slice(0, len) + "..." : text;
    });
}

// ─── Data Models ─────────────────────────────────────────────────────────────
// ─── Role helpers ─────────────────────────────────────────────────────────────
const ROLES = {
    NONE: 0,
    PLAYER: 1,
    TRUSTED: 2,
    ASSISTANT: 3,
    GAMEMASTER: 4,
};
function isGM() {
    return game.user?.isGM ?? false;
}
function userRole() {
    return game.user?.role ?? 0;
}
function currentUserId() {
    return game.user?.id ?? "";
}

/**
 * api.ts
 * High-level service classes consumed by App classes.
 * Mutations go through GM socket; reads use local indexes.
 */
// ─── PostService ──────────────────────────────────────────────────────────────
class PostService {
    static getAll() {
        return getPosts().sort((a, b) => b.createdAt - a.createdAt);
    }
    static async create(input) {
        if (userRole() < ROLES.PLAYER)
            throw new Error("permission_denied");
        const content = sanitize(input.content ?? "");
        const check = validatePostCreate({ ...input, content });
        if (!check.ok)
            throw new Error(check.reason);
        const post = {
            id: foundry.utils.randomID(),
            authorId: currentUserId(),
            content,
            createdAt: Date.now(),
            reactions: {},
            type: input.type ?? "post",
            meta: input.meta,
        };
        const posts = getPosts();
        posts.push(post);
        await savePosts(posts);
        Hooks.callAll("social:refresh", "feed");
    }
    static async delete(postId) {
        const post = indexes.posts.get(postId);
        if (!post)
            return;
        if (post.authorId !== currentUserId() && !isGM())
            throw new Error("permission_denied");
        const posts = getPosts().filter((p) => p.id !== postId);
        await savePosts(posts);
        Hooks.callAll("social:refresh", "feed");
    }
    static async react(postId, emoji) {
        await socket.executeAsGM(SOCKET_EVENTS.POST_REACT, {
            postId,
            emoji,
            userId: currentUserId(),
        });
    }
    static async rateMission(postId, rating) {
        const ratingCheck = validateRating(rating);
        if (!ratingCheck.ok)
            throw new Error(ratingCheck.reason);
        const posts = getPosts();
        const post = posts.find((p) => p.id === postId);
        if (!post || post.type !== "summary")
            throw new Error("not_a_summary");
        if (!post.meta)
            post.meta = {};
        if (!post.meta.rating)
            post.meta.rating = {};
        post.meta.rating[currentUserId()] = rating;
        await savePosts(posts);
        Hooks.callAll("social:refresh", "feed");
    }
    static getMissionRating(post) {
        const dist = [0, 0, 0, 0, 0];
        const ratings = Object.values(post.meta?.rating ?? {});
        if (!ratings.length)
            return { avg: 0, count: 0, distribution: dist };
        for (const r of ratings)
            dist[r - 1]++;
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        return { avg: Math.round(avg * 10) / 10, count: ratings.length, distribution: dist };
    }
}
// ─── MissionService ───────────────────────────────────────────────────────────
class MissionService {
    static getAll() {
        return getMissions().sort((a, b) => b.createdAt - a.createdAt);
    }
    static async create(input) {
        if (userRole() < ROLES.ASSISTANT)
            throw new Error("permission_denied");
        const levelRange = input.levelRange ?? [1, 20];
        const candidate = { ...input, levelRange, maxSlots: input.maxSlots ?? 6, reserveSlots: input.reserveSlots ?? 2 };
        const check = validateMissionCreate(candidate);
        if (!check.ok)
            throw new Error(check.reason);
        const mission = {
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
    static async delete(missionId) {
        if (!isGM())
            throw new Error("permission_denied");
        const missions = getMissions().filter((m) => m.id !== missionId);
        await saveMissions(missions);
        Hooks.callAll("social:refresh", "missions");
    }
    static async close(missionId) {
        if (userRole() < ROLES.ASSISTANT)
            throw new Error("permission_denied");
        const missions = getMissions();
        const mission = missions.find((m) => m.id === missionId);
        if (!mission)
            return;
        mission.status = "closed";
        await saveMissions(missions);
        Hooks.callAll("social:refresh", "missions");
    }
    /** Join via GM socket (atomic) */
    static async join(missionId) {
        const missions = getMissions();
        const mission = missions.find(m => m.id === missionId);
        if (!mission)
            return;
        const userId = currentUserId();
        if (!mission.participants.includes(userId)) {
            if (mission.participants.length < mission.maxSlots) {
                mission.participants.push(userId);
            }
            else if (mission.reserves.length < mission.reserveSlots) {
                mission.reserves.push(userId);
            }
        }
        await saveMissions(missions);
        Hooks.callAll("social:refresh", "missions");
    }
    static async leave(missionId) {
        const missions = getMissions();
        const mission = missions.find(m => m.id === missionId);
        if (!mission)
            return;
        const userId = currentUserId();
        // remove de participantes
        mission.participants = mission.participants.filter(id => id !== userId);
        // remove de reservas
        mission.reserves = mission.reserves.filter(id => id !== userId);
        await saveMissions(missions);
        Hooks.callAll("social:refresh", "missions");
    }
    static async update(missionId, data) {
        if (!isGM())
            return;
        const missions = getMissions();
        const mission = missions.find(m => m.id === missionId);
        if (!mission)
            return;
        Object.assign(mission, data);
        await saveMissions(missions);
        Hooks.callAll("social:refresh", "missions");
    }
    static getUserStatus(mission, userId) {
        if (mission.participants.includes(userId))
            return "participant";
        if (mission.reserves.includes(userId))
            return "reserve";
        return "none";
    }
}
// ─── PollService ──────────────────────────────────────────────────────────────
class PollService {
    static getAll() {
        return getPolls().sort((a, b) => b.createdAt - a.createdAt);
    }
    static async create(input) {
        const check = validatePollCreate(input.question, input.options);
        if (!check.ok)
            throw new Error(check.reason);
        const poll = {
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
    static async vote(pollId, optionId) {
        await getSocket().executeAsGM(SOCKET_EVENTS.POLL_VOTE, {
            pollId,
            optionId,
            userId: currentUserId(),
        });
    }
    static async close(pollId) {
        const poll = indexes.polls.get(pollId);
        if (!poll)
            return;
        if (poll.createdBy !== currentUserId() && !isGM())
            throw new Error("permission_denied");
        const polls = getPolls();
        const p = polls.find((x) => x.id === pollId);
        if (p) {
            p.closed = true;
            await savePolls(polls);
        }
        Hooks.callAll("social:refresh", "polls");
    }
    static async delete(pollId) {
        if (!isGM())
            throw new Error("permission_denied");
        const polls = getPolls().filter((p) => p.id !== pollId);
        await savePolls(polls);
        Hooks.callAll("social:refresh", "polls");
    }
    static getTotalVotes(poll) {
        const unique = new Set(poll.options.flatMap((o) => o.votes));
        return unique.size;
    }
}
// ─── GraveService ─────────────────────────────────────────────────────────────
class GraveService {
    static getAll() {
        return getGraves().sort((a, b) => b.deathAt - a.deathAt);
    }
    static async add(input) {
        if (!isGM())
            throw new Error("permission_denied");
        const check = validateGraveAdd(input);
        if (!check.ok)
            throw new Error(check.reason);
        const grave = {
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
    static async delete(graveId) {
        if (!isGM())
            throw new Error("permission_denied");
        const graves = getGraves().filter((g) => g.id !== graveId);
        await saveGraves(graves);
        Hooks.callAll("social:refresh", "graveyard");
    }
    static async respect(graveId) {
        const graves = getGraves();
        const grave = graves.find(g => g.id === graveId);
        if (!grave)
            return;
        const userId = currentUserId();
        if (!grave.respects.includes(userId)) {
            grave.respects.push(userId);
        }
        await saveGraves(graves);
        Hooks.callAll("social:refresh", "graveyard");
    }
    static async update(graveId, data) {
        if (!isGM())
            throw new Error("permission_denied");
        const graves = getGraves();
        const g = graves.find(g => g.id === graveId);
        if (!g)
            return;
        Object.assign(g, data);
        await saveGraves(graves);
        Hooks.callAll("social:refresh", "graveyard");
    }
}
// ─── PatchService ─────────────────────────────────────────────────────────────
class PatchService {
    static getAll() {
        return getPatchNotes().sort((a, b) => b.createdAt - a.createdAt);
    }
    static async create(input) {
        if (!isGM())
            throw new Error("permission_denied");
        const patch = {
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
    static async delete(patchId) {
        if (!isGM())
            throw new Error("permission_denied");
        const patches = getPatchNotes().filter((p) => p.id !== patchId);
        await savePatchNotes(patches);
        Hooks.callAll("social:refresh", "patches");
    }
}

var api = /*#__PURE__*/Object.freeze({
    __proto__: null,
    GraveService: GraveService,
    MissionService: MissionService,
    PatchService: PatchService,
    PollService: PollService,
    PostService: PostService
});

/**
 * SocialHubApp.ts
 * Main Application shell: sidebar button → tabbed window.
 */
const MODULE_ID$1 = "foundryvtt-social";
class SocialHubApp extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "social-hub",
            title: "Social Hub",
            template: `modules/${MODULE_ID$1}/templates/hub.hbs`,
            width: 720,
            height: 640,
            resizable: true,
            classes: ["social-hub"],
            tabs: [
                {
                    navSelector: ".social-tabs",
                    contentSelector: ".social-content",
                    initial: "feed",
                },
            ],
        });
    }
    constructor(options = {}) {
        super(options);
        this._currentTab = "feed";
        this._refreshHandler = debounce((tab) => {
            if (this.rendered)
                this.render(false);
        }, 200);
    }
    activateListeners(html) {
        super.activateListeners(html);
        const el = html[0];
        // ── Feed ──────────────────────────────────────────────────────────────────
        const typeEl = el.querySelector("#social-post-type");
        const missionEl = el.querySelector("#social-post-mission");
        const syncMissionLinkVisibility = () => {
            if (!typeEl || !missionEl)
                return;
            const shouldShowMission = typeEl.value === "summary";
            missionEl.style.display = shouldShowMission ? "inline-block" : "none";
            missionEl.disabled = !shouldShowMission;
            if (!shouldShowMission)
                missionEl.value = "";
        };
        typeEl?.addEventListener("change", syncMissionLinkVisibility);
        syncMissionLinkVisibility();
        el.querySelector("#social-post-submit")?.addEventListener("click", async () => {
            const ta = el.querySelector("#social-post-content");
            if (!ta?.value.trim())
                return;
            try {
                const postType = typeEl?.value ?? "post";
                const missionId = missionEl?.value?.trim();
                await PostService.create({
                    content: ta.value,
                    type: postType,
                    meta: postType === "summary" && missionId ? { missionId } : undefined,
                });
                ta.value = "";
                if (missionEl)
                    missionEl.value = "";
            }
            catch (e) {
                ui.notifications?.error(String(e));
            }
        });
        el.querySelectorAll(".react-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const postId = btn.closest("[data-post-id]")?.getAttribute("data-post-id") ?? "";
                const emoji = btn.dataset.emoji ?? "👍";
                await PostService.react(postId, emoji);
            });
        });
        el.querySelectorAll(".rate-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const postId = btn.closest("[data-post-id]")?.getAttribute("data-post-id") ?? "";
                const rating = parseInt(btn.dataset.rating ?? "0");
                await PostService.rateMission(postId, rating);
            });
        });
        el.querySelectorAll(".delete-post-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const postId = btn.closest("[data-post-id]")?.getAttribute("data-post-id") ?? "";
                await PostService.delete(postId);
            });
        });
        // ── Missions ──────────────────────────────────────────────────────────────
        el.querySelector("#mission-create-btn")?.addEventListener("click", () => {
            new MissionCreateDialog().render(true);
        });
        el.querySelectorAll(".mission-join-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
                await MissionService.join(id);
            });
        });
        el.querySelectorAll(".mission-leave-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
                await MissionService.leave(id);
            });
        });
        el.querySelectorAll(".mission-close-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
                await MissionService.close(id);
            });
        });
        // EDIT (simples)
        el.querySelectorAll(".edit-mission-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const missionId = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
                const newTitle = prompt("Novo título:");
                if (!newTitle)
                    return;
                await MissionService.update(missionId, { title: newTitle });
            });
        });
        // DELETE
        el.querySelectorAll(".delete-mission-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const missionId = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
                new Dialog({
                    title: "Excluir missão",
                    content: "<p>Tem certeza que deseja excluir esta missão?</p>",
                    buttons: {
                        yes: {
                            icon: '<i class="fas fa-trash"></i>',
                            label: "Excluir",
                            callback: async () => {
                                await MissionService.delete(missionId);
                            },
                        },
                        no: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Cancelar",
                        },
                    },
                    default: "no",
                }).render(true);
            });
        });
        // el.querySelectorAll(".delete-mission-btn").forEach((btn) => {
        //   btn.addEventListener("click", async () => {
        //     const missionId = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
        //     const confirmed = confirm("Excluir missão?");
        //     if (!confirmed) return;
        //     await MissionService.delete(missionId);
        //   });
        // });
        // ── Polls ─────────────────────────────────────────────────────────────────
        el.querySelector("#poll-create-btn")?.addEventListener("click", () => {
            new PollCreateDialog().render(true);
        });
        el.querySelectorAll(".vote-option-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const pollId = btn.closest("[data-poll-id]")?.getAttribute("data-poll-id") ?? "";
                const optionId = btn.dataset.optionId ?? "";
                await PollService.vote(pollId, optionId);
            });
        });
        el.querySelectorAll(".poll-close-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const pollId = btn.closest("[data-poll-id]")?.getAttribute("data-poll-id") ?? "";
                await PollService.close(pollId);
            });
        });
        //DELETE
        el.querySelectorAll(".delete-poll-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const pollId = btn.closest("[data-poll-id]")?.getAttribute("data-poll-id") ??
                    btn.getAttribute("data-poll-id") ??
                    "";
                new Dialog({
                    title: "Excluir enquete",
                    content: "<p>Tem certeza que deseja excluir?</p>",
                    buttons: {
                        yes: {
                            icon: '<i class="fas fa-trash"></i>',
                            label: "Excluir",
                            callback: async () => {
                                await PollService.delete(pollId);
                            },
                        },
                        no: {
                            label: "Cancelar",
                        },
                    },
                    default: "no",
                }).render(true);
            });
        });
        // ── Graveyard ─────────────────────────────────────────────────────────────
        function spawnRose(container) {
            const rose = document.createElement("div");
            rose.className = "rose-fx";
            rose.textContent = "🌹";
            rose.style.left = `${40 + Math.random() * 20}%`;
            container.appendChild(rose);
            rose.addEventListener("animationend", () => rose.remove(), { once: true });
        }
        el.querySelector("#grave-add-btn")?.addEventListener("click", () => {
            new GraveAddDialog().render(true);
        });
        if (!el.dataset.socialRespectBound) {
            el.dataset.socialRespectBound = "true";
            el.addEventListener("click", async (event) => {
                const target = event.target;
                const respectBtn = target?.closest(".f-btn");
                if (!respectBtn)
                    return;
                const graveEl = respectBtn.closest("[data-grave-id]");
                const graveId = graveEl?.getAttribute("data-grave-id") ?? "";
                if (!graveId || !graveEl)
                    return;
                await GraveService.respect(graveId);
                spawnRose(graveEl);
            });
        }
        el.querySelectorAll(".grave-open-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const graveEl = btn.closest("[data-grave-id]");
                const graveId = graveEl?.getAttribute("data-grave-id") ?? "";
                const grave = GraveService.getAll().find(g => g.id === graveId);
                if (!grave)
                    return;
                new Dialog({
                    title: `🪦 ${grave.name}`,
                    content: `
            <div class="grave-modal">
              <div class="grave-photo-placeholder">
                🚧 Em construção (foto)
              </div>
              <h2>${grave.name}</h2>
              <p><i>Caiu em ${new Date(grave.deathAt).toLocaleDateString("pt-BR")}</i></p>
              ${grave.epitaph ? `<blockquote>"${grave.epitaph}"</blockquote>` : ""}
              <div class="grave-stats">
                🌹 ${grave.respects.length} homenagens
              </div>
            </div>
          `,
                    buttons: {
                        close: { label: "Fechar" }
                    }
                }).render(true);
            });
        });
        // ── DELETE GRAVE ─────────────────────────────
        el.querySelectorAll(".delete-grave-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const graveId = btn.closest("[data-grave-id]")?.getAttribute("data-grave-id") ?? "";
                new Dialog({
                    title: "Excluir lápide",
                    content: "<p>Confirmar exclusão?</p>",
                    buttons: {
                        yes: {
                            label: "Excluir",
                            callback: async () => {
                                await GraveService.delete(graveId);
                            },
                        },
                        no: { label: "Cancelar" },
                    },
                }).render(true);
            });
        });
        // ── EDIT GRAVE ─────────────────────────────
        el.querySelectorAll(".edit-grave-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const graveId = btn.closest("[data-grave-id]")?.getAttribute("data-grave-id") ?? "";
                const grave = GraveService.getAll().find((g) => g.id === graveId);
                if (!grave)
                    return;
                new Dialog({
                    title: "Editar lápide",
                    content: `
        <form>
          <div class="form-group">
            <label>Nome</label>
            <input name="name" type="text" value="${grave.name}" />
          </div>
          <div class="form-group">
            <label>Epitáfio</label>
            <textarea name="epitaph" maxlength="200">${grave.epitaph ?? ""}</textarea>
          </div>
        </form>
      `,
                    buttons: {
                        save: {
                            label: "Salvar",
                            callback: async (html) => {
                                const form = html.find("form")[0];
                                const d = new FormData(form);
                                await GraveService.update(graveId, {
                                    name: d.get("name") || "",
                                    epitaph: d.get("epitaph") || undefined,
                                });
                            },
                        },
                        cancel: { label: "Cancelar" },
                    },
                }).render(true);
            });
        });
        // ── Patches ───────────────────────────────────────────────────────────────
        el.querySelector("#patch-create-btn")?.addEventListener("click", () => {
            new PatchCreateDialog().render(true);
        });
    }
    async getData() {
        const uid = currentUserId();
        const gm = isGM();
        const canCreateMission = userRole() >= ROLES.ASSISTANT;
        const posts = PostService.getAll().map((post) => ({
            ...post,
            authorName: getUserName(post.authorId),
            timeAgo: timeAgo(post.createdAt),
            isOwn: post.authorId === uid,
            canDelete: post.authorId === uid || gm,
            reactionList: Object.entries(post.reactions).map(([emoji, users]) => ({
                emoji,
                count: users.length,
                active: users.includes(uid),
            })),
            myRating: post.meta?.rating?.[uid] ?? 0,
            ratingStats: post.type === "summary" ? PostService.getMissionRating(post) : null,
            missionName: post.meta?.missionId
                ? (MissionService.getAll().find((m) => m.id === post.meta?.missionId)?.title ?? "—")
                : null,
        }));
        const allMissions = MissionService.getAll();
        const missions = allMissions.map((m) => ({
            ...m,
            sessionDateFmt: formatDate(m.sessionDate),
            creatorName: getUserName(m.createdBy),
            userStatus: MissionService.getUserStatus(m, uid),
            isFull: m.participants.length >= m.maxSlots,
            canManage: m.createdBy === uid || gm,
        }));
        const feedMissions = allMissions
            .filter((m) => m.status !== "closed")
            .map((m) => ({ id: m.id, title: m.title }));
        const polls = PollService.getAll().map((poll) => {
            const total = PollService.getTotalVotes(poll);
            return {
                ...poll,
                creatorName: getUserName(poll.createdBy),
                timeAgo: timeAgo(poll.createdAt),
                canClose: poll.createdBy === uid || gm,
                canDelete: gm,
                isExpired: poll.endsAt ? Date.now() > poll.endsAt : false,
                options: poll.options.map((opt) => ({
                    ...opt,
                    hasVoted: opt.votes.includes(uid),
                    percent: total ? Math.round((opt.votes.length / total) * 100) : 0,
                    voteCount: opt.votes.length,
                })),
                total,
            };
        });
        const graves = GraveService.getAll().map((g) => ({
            ...g,
            deathDateFmt: new Date(g.deathAt).toLocaleDateString("pt-BR"),
            respectCount: g.respects.length,
            hasRespected: g.respects.includes(uid),
            canDelete: gm,
            topRespecters: g.respects.slice(0, 5).map(getUserName).join(", "),
        }));
        const patches = PatchService.getAll();
        return {
            posts,
            missions,
            feedMissions,
            polls,
            graves,
            patches,
            isGM: gm,
            canCreateMission,
            currentUserId: uid,
            EMOJIS: ["👍", "❤️", "😂", "😮", "😢", "🎲"],
        };
    }
    /** Re-register refresh hook when window opens */
    async _render(...args) {
        await super._render(...args);
        Hooks.on("social:refresh", this._refreshHandler);
    }
    async close(...args) {
        Hooks.off("social:refresh", this._refreshHandler);
        return super.close(...args);
    }
}
// ─── Sub-dialogs ──────────────────────────────────────────────────────────────
class MissionCreateDialog extends Dialog {
    constructor() {
        super({
            title: "Nova Missão",
            content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Título</label><input name="title" type="text" required /></div>
          <div class="form-group"><label>Descrição</label><textarea name="description" rows="3"></textarea></div>
          <div class="form-group form-row">
            <div><label>Nível mín.</label><input name="levelMin" type="number" value="1" min="1" max="20" /></div>
            <div><label>Nível máx.</label><input name="levelMax" type="number" value="20" min="1" max="20" /></div>
          </div>
          <div class="form-group"><label>Faixa etária</label><input name="age" type="text" value="Livre" /></div>
          <div class="form-group"><label>Plataformas (vírgula)</label><input name="platforms" type="text" /></div>
          <div class="form-group form-row">
            <div><label>Data</label><input name="sessionDate" type="date" /></div>
            <div><label>Hora</label><input name="sessionTime" type="time" value="20:00" /></div>
          </div>
          <div class="form-group form-row">
            <div><label>Vagas</label><input name="maxSlots" type="number" value="6" min="1" /></div>
            <div><label>Reservas</label><input name="reserveSlots" type="number" value="2" min="0" /></div>
          </div>
        </form>`,
            buttons: {
                create: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Criar",
                    callback: async (html) => {
                        const f = html[0].querySelector("form");
                        const d = new FormData(f);
                        await MissionService.create({
                            title: d.get("title"),
                            description: d.get("description"),
                            levelRange: [
                                parseInt(d.get("levelMin")),
                                parseInt(d.get("levelMax")),
                            ],
                            age: d.get("age"),
                            platforms: d.get("platforms").split(",").map((s) => s.trim()).filter(Boolean),
                            sessionDate: d.get("sessionDate"),
                            sessionTime: d.get("sessionTime"),
                            maxSlots: parseInt(d.get("maxSlots")),
                            reserveSlots: parseInt(d.get("reserveSlots")),
                        });
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
            },
            default: "create",
        });
    }
}
class PollCreateDialog extends Dialog {
    constructor() {
        super({
            title: "Nova Enquete",
            content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Pergunta</label><input name="question" type="text" required /></div>
          <div class="form-group"><label>Opções (uma por linha)</label><textarea name="options" rows="4" placeholder="Opção 1&#10;Opção 2&#10;Opção 3"></textarea></div>
          <div class="form-group form-row">
            <div><label>Multi-voto</label><input name="multiple" type="checkbox" /></div>
            <div><label>Encerra em (horas, 0=sem limite)</label><input name="hours" type="number" value="0" min="0" /></div>
          </div>
        </form>`,
            buttons: {
                create: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Criar",
                    callback: async (html) => {
                        const f = html[0].querySelector("form");
                        const d = new FormData(f);
                        const options = d.get("options").split("\n").map((s) => s.trim()).filter(Boolean);
                        if (options.length < 2) {
                            ui.notifications?.warn("Mínimo 2 opções.");
                            return;
                        }
                        const hours = parseFloat(d.get("hours"));
                        await PollService.create({
                            question: d.get("question"),
                            options: options.map((o) => ({
                                //id: randomID(),
                                id: foundry.utils.randomID(),
                                text: o,
                                votes: []
                            })),
                            multiple: !!(d.get("multiple")),
                            endsAt: hours > 0 ? Date.now() + hours * 3600 * 1000 : undefined,
                        });
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
            },
            default: "create",
        });
    }
}
class GraveAddDialog extends Dialog {
    constructor() {
        super({
            title: "Registrar Morte",
            content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Nome do Personagem</label><input name="name" maxlength="200" type="text" required /></div>
          <div class="form-group"><label>Epitáfio</label><textarea name="epitaph" maxlength="200" rows="3"></textarea></div>
          <div class="form-group"><label>Data da morte</label><input name="deathDate" type="date" /></div>
        </form>`,
            buttons: {
                add: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Registrar",
                    callback: async (html) => {
                        const f = html[0].querySelector("form");
                        const d = new FormData(f);
                        const dateStr = d.get("deathDate");
                        await GraveService.add({
                            name: d.get("name"),
                            epitaph: d.get("epitaph") || undefined,
                            deathAt: dateStr ? new Date(dateStr).getTime() : Date.now(),
                        });
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
            },
            default: "add",
        });
    }
}
class PatchCreateDialog extends Dialog {
    constructor() {
        super({
            title: "Nova Patch Note",
            content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Versão</label><input name="version" type="text" value="1.0.0" /></div>
          <div class="form-group"><label>Título</label><input name="title" type="text" /></div>
          <div class="form-group"><label>Conteúdo</label><textarea name="content" rows="5"></textarea></div>
          <div class="form-group"><label>Link externo (opcional)</label><input name="link" type="url" /></div>
        </form>`,
            buttons: {
                create: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Publicar",
                    callback: async (html) => {
                        const f = html[0].querySelector("form");
                        const d = new FormData(f);
                        await PatchService.create({
                            version: d.get("version"),
                            title: d.get("title"),
                            content: d.get("content"),
                            link: d.get("link") || undefined,
                            official: false,
                        });
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
            },
            default: "create",
        });
    }
}

/**
 * main.ts – Module entry point
 * Registers settings, sockets, helpers, sidebar button, and all hooks.
 */
const MODULE_ID = "foundryvtt-social";
let socialHub = null;
function getSocialHub() {
    if (!socialHub || !socialHub.rendered)
        socialHub = new SocialHubApp();
    return socialHub;
}
Hooks.once("init", () => {
    console.log(`${MODULE_ID} | init`);
    registerSettings();
    registerHelpers();
    //registerSockets();
});
Hooks.once("ready", () => {
    console.log("READY HOOK FIRED"); // <<< ADICIONE
    console.log(`${MODULE_ID} | ready`);
    registerSockets(); // ✔ AQUI
});
Hooks.once("ready", () => {
    console.log("Social Hub READY");
    getSocialHub().render(true);
    // expõe globalmente (debug)
    //  (game as any).socialHub = new SocialHubApp();
    // abre automaticamente
    //  (game as any).socialHub.render(true);
});
Hooks.once("ready", () => {
    hydrateIndexes();
    console.log(`${MODULE_ID} | ready`);
});
Hooks.once("ready", () => {
    game.modules.get("foundryvtt-social").api = {
        PollService,
        MissionService,
        GraveService,
        PostService,
    };
});
Hooks.on("renderSidebarTab", (_app, html) => {
    if (!(_app instanceof Settings))
        return;
    if (html.find("#social-hub-sidebar-btn").length)
        return;
    const btn = $(`
    <div class="social-hub-sidebar-btn" id="social-hub-sidebar-btn">
      <button type="button"><i class="fas fa-newspaper"></i> Social Hub</button>
    </div>`);
    btn.on("click", "button", () => getSocialHub().render(true));
    html.find(".directory-footer").append(btn);
});
Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.find(c => c.name === "token");
    if (!tokenControls) {
        console.warn("Token controls não encontrados");
        return;
    }
    tokenControls.tools.push({
        name: "social-hub",
        title: "Social Hub",
        icon: "fas fa-newspaper",
        button: true,
        visible: true,
        onClick: () => {
            const app = getSocialHub();
            if (app.rendered) {
                app.close();
            }
            else {
                app.render(true);
            }
        }
    });
    console.log("Social Hub button registrado");
});
function toggleSocialHub() {
    const app = getSocialHub();
    //if (!app) app = new SocialHubApp();
    if (app.rendered) {
        app.close();
    }
    else {
        app.render(true);
    }
}
Hooks.once("ready", () => {
    window.addEventListener("keydown", (e) => {
        // Ctrl + Alt + S
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "s") {
            e.preventDefault();
            toggleSocialHub();
        }
    });
});
Hooks.on("updateActor", async (actor, diff) => {
    if (!isGM())
        return;
    const sys = diff?.system;
    const hpObj = sys?.attributes?.hp;
    if (typeof hpObj?.value === "number" && hpObj.value <= 0) {
        const { GraveService } = await Promise.resolve().then(function () { return api; });
        const existing = GraveService.getAll().find((g) => g.actorId === actor.id);
        if (!existing) {
            await GraveService.add({
                actorId: actor.id ?? undefined,
                name: actor.name ?? "Desconhecido",
                deathAt: Date.now()
            });
            ui.notifications?.info(`${actor.name} adicionado ao Cemitério.`);
        }
    }
});
Hooks.on("createChatMessage", (msg) => {
    const content = msg.content ?? "";
    const match = content.match(/\[RESUMO:([^\]]+)\]/i);
    if (!match)
        return;
    const missionId = match[1].trim();
    const clean = content.replace(/\[RESUMO:[^\]]+\]/gi, "").trim();
    Promise.resolve().then(function () { return api; }).then(({ PostService }) => PostService.create({ content: clean, type: "summary", meta: { missionId } }).catch(console.error));
});
//# sourceMappingURL=main.js.map
