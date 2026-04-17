import { GraveService } from "../../scripts/api";
import { currentUserId, isGM } from "../../scripts/types";
import { bindClick, getClosestDataId, parseForm } from "../../scripts/ui/dom";
import { confirmDialog, openFormDialog } from "../../scripts/ui/dialog";
import type { SocialTab } from "./types";

export class GraveyardTab implements SocialTab {
  readonly id = "graveyard";
  readonly label = "Cemitério";
  readonly icon = "fas fa-cross";

  getData(): Record<string, unknown> {
    const uid = currentUserId();
    const gm = isGM();
    const gameRef = game as Game;
    const graves = GraveService.getAll().map((grave) => ({
      ...grave,
      deathDateFmt: new Date(grave.deathAt).toLocaleDateString("pt-BR"),
      respectCount: grave.respects.length,
      hasRespected: grave.respects.includes(uid),
      topRespecters: grave.respects.slice(0, 5).map((id) => gameRef.users?.get(id)?.name ?? "?").join(", "),
      isGM: gm,
    }));
    return { graves, isGM: gm };
  }

  activateListeners(root: HTMLElement): void {
    root.querySelector("#grave-add-btn")?.addEventListener("click", () => this.openCreateDialog());

    bindClick(root, ".f-btn", async (btn) => {
      const graveId = getClosestDataId(btn, "data-grave-id");
      if (!graveId) return;
      await GraveService.respect(graveId);
    });

    bindClick(root, ".delete-grave-btn", async (btn) => {
      const graveId = getClosestDataId(btn, "data-grave-id");
      if (!graveId) return;
      confirmDialog("Excluir lápide", "<p>Confirmar exclusão?</p>", async () => GraveService.delete(graveId));
    });

    bindClick(root, ".edit-grave-btn", (btn) => {
      const graveId = getClosestDataId(btn, "data-grave-id");
      const grave = GraveService.getAll().find((g) => g.id === graveId);
      if (!grave) return;
      openFormDialog({
        title: "Editar lápide",
        content: `
          <form>
            <div class="form-group"><label>Nome</label><input name="name" value="${grave.name}" /></div>
            <div class="form-group"><label>Epitáfio</label><textarea name="epitaph">${grave.epitaph ?? ""}</textarea></div>
          </form>
        `,
        buttons: {
          save: {
            label: "Salvar",
            callback: async (html) => {
              const form = (html as JQuery).find("form")[0] as HTMLFormElement | undefined;
              if (!form) return;
              const data = parseForm<{ name: FormDataEntryValue | null; epitaph: FormDataEntryValue | null }>(form);
              await GraveService.update(graveId, {
                name: String(data.name ?? "").trim(),
                epitaph: String(data.epitaph ?? "").trim() || undefined,
              });
            },
          },
          cancel: { label: "Cancelar" },
        },
      });
    });
  }

  private openCreateDialog(): void {
    openFormDialog({
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
            const form = (html as JQuery).find("form")[0] as HTMLFormElement | undefined;
            if (!form) return;
            const data = parseForm<{ name: FormDataEntryValue | null; epitaph: FormDataEntryValue | null; deathDate: FormDataEntryValue | null }>(form);
            const deathDate = String(data.deathDate ?? "").trim();
            await GraveService.add({
              name: String(data.name ?? "").trim(),
              epitaph: String(data.epitaph ?? "").trim() || undefined,
              deathAt: deathDate ? new Date(deathDate).getTime() : Date.now(),
            });
          },
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
      },
      default: "add",
    });
  }
}
