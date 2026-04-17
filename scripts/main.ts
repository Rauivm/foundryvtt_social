/**
 * main.ts – Module entry point
 * Registers settings, sockets, helpers, sidebar button, and all hooks.
 */

import { registerSettings, hydrateIndexes } from "./settings";
import { registerSockets } from "./sockets";
import { registerHelpers } from "./helpers";
import { registerTemplatePartials } from "./templates";
import { SocialHubApp } from "../apps/SocialHubApp";
import { isGM } from "./types";
import { PollService, MissionService, GraveService, PostService, DuelService } from "./api";


const MODULE_ID = "foundryvtt-social";

let socialHub: SocialHubApp | null = null;
function getSocialHub(): SocialHubApp {
  if (!socialHub || !socialHub.rendered) socialHub = new SocialHubApp();
  return socialHub;
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
  registerHelpers();
  void registerTemplatePartials();
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
  (game as any).modules.get("foundryvtt-social").api = {
    PollService,
    MissionService,
    GraveService,
    PostService,
    DuelService,
  };
});

Hooks.on("renderSidebarTab", (_app: Application, html: JQuery) => {
  if (!(_app instanceof Settings)) return;
  if (html.find("#social-hub-sidebar-btn").length) return;
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
      } else {
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
  } else {
    app.render(true);
  }
}

Hooks.once("ready", () => {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    // Ctrl + Alt + S
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      toggleSocialHub();
    }
  });
});



Hooks.on("updateActor", async (actor: Actor, diff: object) => {
  if (!isGM()) return;
  const sys = (diff as Record<string, unknown>)?.system as Record<string, unknown> | undefined;
  const hpObj = (sys?.attributes as Record<string, unknown>)?.hp as Record<string, unknown> | undefined;
  if (typeof hpObj?.value === "number" && hpObj.value <= 0) {
    const { GraveService } = await import("./api");
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

Hooks.on("createChatMessage", (msg: ChatMessage) => {
  const content = (msg as any).content ?? "";
  const match = content.match(/\[RESUMO:([^\]]+)\]/i);
  if (!match) return;
  const missionId = match[1].trim();
  const clean = content.replace(/\[RESUMO:[^\]]+\]/gi, "").trim();
  import("./api").then(({ PostService }) =>
    PostService.create({ content: clean, type: "summary", meta: { missionId } }).catch(console.error)
  );
});
