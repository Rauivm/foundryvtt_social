const MODULE_ID = "foundryvtt-social";

const PARTIALS: Record<string, string> = {
  "tabs/missions": `modules/${MODULE_ID}/templates/tabs/missions.hbs`,
  "tabs/graveyard": `modules/${MODULE_ID}/templates/tabs/graveyard.hbs`,
  "tabs/polls": `modules/${MODULE_ID}/templates/tabs/polls.hbs`,
  "tabs/arena": `modules/${MODULE_ID}/templates/tabs/arena.hbs`,
  "tabs/patches": `modules/${MODULE_ID}/templates/tabs/patches.hbs`,
};

export async function registerTemplatePartials(): Promise<void> {
  await loadTemplates(Object.values(PARTIALS));
  for (const [name, path] of Object.entries(PARTIALS)) {
    const tpl = await getTemplate(path);
    Handlebars.registerPartial(name, tpl);
  }
}
