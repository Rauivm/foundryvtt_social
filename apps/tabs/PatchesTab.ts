import { PatchService } from "../../scripts/api";
import { isGM } from "../../scripts/types";
import { bindClick, parseForm } from "../../scripts/ui/dom";
import { openFormDialog } from "../../scripts/ui/dialog";
import type { SocialTab } from "./types";

export class PatchesTab implements SocialTab {
  readonly id = "patches";
  readonly label = "Patch Notes";
  readonly icon = "fas fa-scroll";

  getData(): Record<string, unknown> {
    return { patches: PatchService.getAll(), isGM: isGM() };
  }

  activateListeners(root: HTMLElement): void {
    root.querySelector("#patch-create-btn")?.addEventListener("click", () => this.openCreateDialog());
    bindClick(root, ".delete-patch-btn", async (btn) => {
      const patchId = btn.closest("[data-patch-id]")?.getAttribute("data-patch-id") ?? "";
      if (!patchId) return;
      await PatchService.delete(patchId);
    });
  }

  private openCreateDialog(): void {
    openFormDialog({
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
            const form = (html as JQuery).find("form")[0] as HTMLFormElement | undefined;
            if (!form) return;
            const data = parseForm<Record<string, FormDataEntryValue | null>>(form);
            await PatchService.create({
              version: String(data.version ?? "1.0.0"),
              title: String(data.title ?? ""),
              content: String(data.content ?? ""),
              link: String(data.link ?? "").trim() || undefined,
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
