import { DuelService, MissionService, PatchService, PollService, PostService } from "../scripts/api";
import { FEATURES } from "../scripts/config";
import { currentUserId, isGM, ROLES, userRole } from "../scripts/types";
import { debounce, formatDate, getUserName, timeAgo } from "../scripts/utils";
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
    const posts = PostService.getAll().map((post) => ({
      ...post,
      authorName: getUserName(post.authorId),
      timeAgo: timeAgo(post.createdAt),
      canDelete: post.authorId === uid || gm,
      reactionList: Object.entries(post.reactions).map(([emoji, users]) => ({ emoji, count: users.length, active: users.includes(uid) })),
      myRating: post.meta?.rating?.[uid] ?? 0,
      ratingStats: post.type === "summary" ? PostService.getMissionRating(post) : null,
      missionName: post.meta?.missionId ? MissionService.getAll().find((m) => m.id === post.meta?.missionId)?.title ?? "—" : null,
    }));

    return {
      posts,
      missions: MissionService.getAll().map((m) => ({ id: m.id, title: m.title, sessionDateFmt: formatDate(m.sessionDate) })),
      EMOJIS: ["👍", "❤️", "😂", "😮", "😢", "🎲"],
      canCreateMission: userRole() >= ROLES.ASSISTANT,
      isGM: gm,
      duelsCount: DuelService.getAll().length,
      pollsCount: PollService.getAll().length,
      patchesCount: PatchService.getAll().length,
    };
  }

  private activateFeedListeners(root: HTMLElement): void {
    const typeEl = root.querySelector<HTMLSelectElement>("#social-post-type");
    const missionEl = root.querySelector<HTMLSelectElement>("#social-post-mission");
    const syncMissionSelectVisibility = (): void => {
      if (!missionEl || !typeEl) return;
      missionEl.style.display = typeEl.value === "summary" ? "inline-block" : "none";
    };

    typeEl?.addEventListener("change", syncMissionSelectVisibility);
    syncMissionSelectVisibility();

    root.querySelector("#social-post-submit")?.addEventListener("click", async () => {
      const ta = root.querySelector<HTMLTextAreaElement>("#social-post-content");
      if (!ta?.value.trim()) return;

      await PostService.create({
        content: ta.value,
        type: (typeEl?.value as "post" | "summary") ?? "post",
        meta: typeEl?.value === "summary" && missionEl?.value ? { missionId: missionEl.value } : undefined,
      });

      ta.value = "";
      if (missionEl) missionEl.value = "";
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
  }
}
