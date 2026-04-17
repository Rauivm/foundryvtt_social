import { registerHelpers } from "./helpers";
import { exposeModuleApi, registerGameHooks, registerUiHooks } from "./hooks";
import { registerSettings, hydrateIndexes } from "./settings";
import { registerSockets } from "./sockets";
import { registerTemplatePartials } from "./templates";

const MODULE_ID = "foundryvtt-social";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
  registerHelpers();
  void registerTemplatePartials();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  registerSockets();
  hydrateIndexes();
  exposeModuleApi();
  registerUiHooks();
  registerGameHooks();
});
