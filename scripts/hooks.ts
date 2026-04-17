import { SocialHubApp } from "../apps/SocialHubApp";
import { DuelService, GraveService, MissionService, PollService, PostService } from "./api";
import { isGM } from "./types";

const MODULE_ID = "foundryvtt-social";

let socialHub: SocialHubApp | null = null;

function getSocialHub(): SocialHubApp {
  if (!socialHub || !socialHub.rendered) socialHub = new SocialHubApp();
  return socialHub;
}

function toggleSocialHub(): void {
  const app = getSocialHub();
  if (app.rendered) app.close();
  else app.render(true);
}

export function exposeModuleApi(): void {
  const mod = (game as Game).modules?.get(MODULE_ID) as any;
  if (!mod) return;
  mod.api = {
    PollService,
    MissionService,
    GraveService,
    PostService,
    DuelService,
  };
}

export function registerUiHooks(): void {
  Hooks.on("renderSidebarTab", (app: Application, html: JQuery) => {
    if (!(app instanceof Settings)) return;
    if (html.find("#social-hub-sidebar-btn").length) return;

    const button = $(`
      <div class="social-hub-sidebar-btn" id="social-hub-sidebar-btn">
        <button type="button"><i class="fas fa-newspaper"></i> Social Hub</button>
      </div>
    `);

    button.on("click", "button", () => getSocialHub().render(true));
    html.find(".directory-footer").append(button);
  });

  Hooks.on("getSceneControlButtons", (controls: any[]) => {
    const tokenControls = controls.find((control) => control.name === "token");
    if (!tokenControls) return;

    tokenControls.tools.push({
      name: "social-hub",
      title: "Social Hub",
      icon: "fas fa-newspaper",
      button: true,
      visible: true,
      onClick: () => toggleSocialHub(),
    });
  });

  window.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      toggleSocialHub();
    }
  });
}

export function registerGameHooks(): void {
  Hooks.on("updateActor", async (actor: Actor, diff: object) => {
    if (!isGM()) return;
    const sys = (diff as Record<string, unknown>)?.system as Record<string, unknown> | undefined;
    const hpObj = (sys?.attributes as Record<string, unknown>)?.hp as Record<string, unknown> | undefined;
    if (typeof hpObj?.value !== "number" || hpObj.value > 0) return;

    const existing = GraveService.getAll().find((grave) => grave.actorId === actor.id);
    if (existing) return;

    await GraveService.add({
      actorId: actor.id ?? undefined,
      name: actor.name ?? "Desconhecido",
      deathAt: Date.now(),
    });

    ui.notifications?.info(`${actor.name} adicionado ao Cemitério.`);
  });

  Hooks.on("createChatMessage", (msg: ChatMessage) => {
    const content = (msg as any).content ?? "";
    const match = content.match(/\[RESUMO:([^\]]+)\]/i);
    if (!match) return;

    const missionId = match[1].trim();
    const cleanContent = content.replace(/\[RESUMO:[^\]]+\]/gi, "").trim();
    void PostService.create({
      content: cleanContent,
      type: "summary",
      meta: { missionId },
    }).catch(console.error);
  });
}
