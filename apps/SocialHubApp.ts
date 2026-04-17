import { DuelService, MissionService, PatchService, PollService, PostService } from "../scripts/api";
import { FEATURES } from "../scripts/config";
import { currentUserId, isGM, ROLES, userRole } from "../scripts/types";
import {
  debounce,
  formatDate,
  getUserName,
  nl2br,
  parseMarkdown,
  parseMentions,
  parseSpoiler,
  sanitize,
  timeAgo,
} from "../scripts/utils";
import { bindClick, getClosestDataId } from "../scripts/ui/dom";
import { ArenaTab } from "./tabs/ArenaTab";
import { GraveyardTab } from "./tabs/GraveyardTab";
import { MissionsTab } from "./tabs/MissionsTab";
import { PatchesTab } from "./tabs/PatchesTab";
import { PollsTab } from "./tabs/PollsTab";
import type { SocialTab } from "./tabs/types";

const MODULE_ID = "foundryvtt-social";

export class SocialHubApp extends Application {
  private readonly _refreshHandler: (tab: string) => void;
  private readonly tabs: SocialTab[];
  private readonly _mentionNotifications = new Set<string>();

  static override get defaultOptions(): ApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "social-hub",
      title: "Social Hub",
      template: `modules/${MODULE_ID}/templates/hub.hbs`,
      width: 720,
      height: 640,
      resizable: true,
      classes: ["social-hub"],
      tabs: [{ navSelector: ".social-tabs", contentSelector: ".social-content", initial: "feed" }],
    });
  }

  constructor(options = {}) {
    super(options);
    this.tabs = this.buildTabs();
    this._refreshHandler = debounce(() => {
      if (this.rendered) this.render(false);
    }, 200) as (tab: string) => void;
  }

  override async getData(): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      ...this.getFeedData(),
      features: FEATURES,
      navTabs: this.tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon })),
    };
    for (const tab of this.tabs) {
      data[tab.id] = await tab.getData();
    }
    return data;
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);
    const root = html[0];
    this.activateFeedListeners(root);
    for (const tab of this.tabs) {
      const tabRoot = root.querySelector<HTMLElement>(`.tab[data-tab="${tab.id}"]`);
      if (tabRoot) tab.activateListeners(tabRoot);
    }
  }

  override async _render(...args: any[]): Promise<void> {
    await super._render(...args);
    Hooks.off("social:refresh", this._refreshHandler);
    Hooks.on("social:refresh", this._refreshHandler);
  }

  override async close(...args: any[]): Promise<void> {
    Hooks.off("social:refresh", this._refreshHandler);
    return super.close(...args);
  }

  private buildTabs(): SocialTab[] {
    const built: SocialTab[] = [];
    if (FEATURES.missions) built.push(new MissionsTab());
    if (FEATURES.polls) built.push(new PollsTab());
    if (FEATURES.graveyard) built.push(new GraveyardTab());
    if (FEATURES.arena) built.push(new ArenaTab());
    if (FEATURES.patches) built.push(new PatchesTab());
    return built;
  }

  private getFeedData(): Record<string, unknown> {
    const uid = currentUserId();
    const gm = isGM();
    const allMissions = MissionService.getAll();
    const missions = gm ? allMissions : allMissions.filter((m) => m.createdBy === uid);
    const users = (game as Game).users;
    const emojis = ["👍", "❤️", "😂", "😮", "😢", "🎲"];
    const posts = PostService.getAll().map((post) => ({
      ...post,
      content: this.renderPostContent(post.content),
      authorName: getUserName(post.authorId),
      timeAgo: timeAgo(post.createdAt),
      createdAtFmt: new Date(post.createdAt).toLocaleString("pt-BR"),
      canDelete: post.authorId === uid || gm,
      canEdit: gm,
      reactionList: emojis.map((emoji) => {
        const reactedUsers = post.reactions[emoji] ?? [];
        return {
          emoji,
          count: reactedUsers.length,
          active: reactedUsers.includes(uid),
          users: reactedUsers.map((userId) => {
            const user = users?.get(userId);
            return {
              id: userId,
              name: user?.name ?? userId,
              img: user?.character?.img ?? user?.avatar ?? "",
            };
          }),
        };
      }),
      myRating: post.meta?.rating?.[uid] ?? 0,
      ratingStats: post.type === "summary" ? PostService.getMissionRating(post) : null,
      missionName: post.meta?.missionId ? allMissions.find((m) => m.id === post.meta?.missionId)?.title ?? "—" : null,
    }));

    this.notifyMentions(posts, uid);

    return {
      posts,
      missions: missions.map((m) => ({
        id: m.id,
        title: m.title || "Missão sem nome",
        sessionDateFmt: formatDate(m.sessionDate),
      })),
      canCreateNormalPost: gm,
      canCreateSummary: userRole() >= ROLES.PLAYER,
      hasSummaryMissions: missions.length > 0,
      EMOJIS: emojis,
      canCreateMission: userRole() >= ROLES.ASSISTANT,
      isGM: gm,
      duelsCount: DuelService.getAll().length,
      pollsCount: PollService.getAll().length,
      patchesCount: PatchService.getAll().length,
    };
  }

  private activateFeedListeners(root: HTMLElement): void {
    const contentEl = root.querySelector<HTMLTextAreaElement>("#social-post-content");
    const typeEl = root.querySelector<HTMLSelectElement>("#social-post-type");
    const missionEl = root.querySelector<HTMLSelectElement>('select[name="missionId"]');
    const noMissionEl = root.querySelector<HTMLElement>(".compose-no-mission-msg");
    const syncMissionSelectVisibility = (): void => {
      if (!missionEl || !typeEl) return;
      missionEl.style.display = typeEl.value === "summary" ? "inline-block" : "none";
      if (noMissionEl) noMissionEl.style.display = typeEl.value === "summary" && missionEl.options.length <= 1 ? "block" : "none";
    };

    typeEl?.addEventListener("change", syncMissionSelectVisibility);
    syncMissionSelectVisibility();

    root.querySelector("#social-post-submit")?.addEventListener("click", async () => {
      if (!contentEl?.value.trim()) return;
      if (!typeEl) return;
      const formData = new FormData();
      if (contentEl) formData.set("content", contentEl.value);
      if (typeEl) formData.set("type", typeEl.value);
      if (missionEl) formData.set("missionId", missionEl.value);
      const missionId = String(formData.get("missionId") || "");

      if (typeEl.value === "summary" && !missionId) {
        ui.notifications?.warn("Selecione uma missão para o resumo.");
        return;
      }

      await PostService.create({
        content: contentEl.value,
        type: (typeEl?.value as "post" | "summary") ?? "post",
        meta: typeEl?.value === "summary" && missionId ? { missionId } : undefined,
      });

      contentEl.value = "";
      if (missionEl) missionEl.value = "";
    });

    root.querySelectorAll<HTMLElement>(".spoiler").forEach((elm) => {
      elm.addEventListener("click", () => {
        elm.classList.toggle("revealed");
      });
    });

    bindClick(root, ".react-btn", async (btn) => {
      await PostService.react(getClosestDataId(btn, "data-post-id"), btn.dataset.emoji ?? "👍");
    });
    bindClick(root, ".rate-btn", async (btn) => {
      await PostService.rateMission(getClosestDataId(btn, "data-post-id"), parseInt(btn.dataset.rating ?? "0", 10));
    });
    bindClick(root, ".delete-post-btn", async (btn) => {
      await PostService.delete(getClosestDataId(btn, "data-post-id"));
    });
    bindClick(root, ".edit-post-btn", async (btn) => {
      const postId = getClosestDataId(btn, "data-post-id");
      const post = PostService.getAll().find((p) => p.id === postId);
      if (!post) return;
      const content = await Dialog.prompt({
        title: "Editar publicação",
        content: `<textarea id="edit-post-content" rows="8">${post.content}</textarea>`,
        callback: (html) => html.find("#edit-post-content").val(),
      });
      if (typeof content !== "string" || !content.trim()) return;
      await PostService.update(postId, { content });
    });
  }

  private renderPostContent(content: string): string {
    const parsed = parseSpoiler(parseMarkdown(content));
    const markdownParsed = parsed;
    const mentionParsed = parseMentions(markdownParsed).html;
    const withBreaks = nl2br(mentionParsed);
    return sanitize(withBreaks);
  }

  private notifyMentions(
    posts: Array<{ id: string; authorId: string; mentions?: string[]; authorName: string }>,
    uid: string
  ): void {
    const myName = (game as Game).user?.name?.toLowerCase() ?? "";
    for (const post of posts) {
      if (post.authorId === uid) continue;
      const mentionKeys = (post.mentions ?? []).map((m) => m.toLowerCase());
      if (!mentionKeys.includes(myName)) continue;
      const key = `${post.id}:${uid}`;
      if (this._mentionNotifications.has(key)) continue;
      this._mentionNotifications.add(key);
      ui.notifications?.info(`${post.authorName} mencionou você`);
    }
  }
}
