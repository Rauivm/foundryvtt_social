import { MissionService } from "../../scripts/api";
import { currentUserId, isGM, userRole, ROLES } from "../../scripts/types";
import { formatDate, getUserName } from "../../scripts/utils";
import { bindClick, getClosestDataId, parseForm } from "../../scripts/ui/dom";
import { confirmDialog, openFormDialog } from "../../scripts/ui/dialog";
import type { SocialTab } from "./types";

export class MissionsTab implements SocialTab {
  readonly id = "missions";
  readonly label = "Missões";
  readonly icon = "fas fa-map-marked-alt";

  getData(): Record<string, unknown> {
    const uid = currentUserId();
    const gm = isGM();
    return {
      canCreateMission: userRole() >= ROLES.ASSISTANT,
      missions: MissionService.getAll().map((m) => {
        const canManage = m.createdBy === uid || gm;
        const isOpen = m.status === "open";
        return {
          ...m,
          levelRange: m.levelRange ? `${m.levelRange[0]}-${m.levelRange[1]}` : "—",
          sessionDateFmt: formatDate(m.sessionDate),
          creatorName: getUserName(m.createdBy),
          userStatus: MissionService.getUserStatus(m, uid),
          canManage,
          canClose: canManage,
          canEdit: isOpen && canManage,
          canDelete: isOpen && canManage,
        };
      }),
    };
  }

  activateListeners(root: HTMLElement): void {
    root.querySelector("#mission-create-btn")?.addEventListener("click", () => this.openCreateDialog());

    root.querySelectorAll(".mission-desc").forEach((elm) => {
      elm.addEventListener("click", () => {
        elm.classList.toggle("expanded");
      });
    });

    root.querySelectorAll<HTMLElement>(".mission-join-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const missionId = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
        if (!missionId) return;
        await MissionService.join(missionId);
      });
    });
    bindClick(root, ".mission-leave-btn", async (btn) => MissionService.leave(getClosestDataId(btn, "data-mission-id")));
    bindClick(root, ".mission-close-btn", async (btn) => MissionService.close(getClosestDataId(btn, "data-mission-id")));
    bindClick(root, ".mission-edit-btn", (btn) => {
      const missionId = getClosestDataId(btn, "data-mission-id");
      this.openEditDialog(missionId);
    });
    bindClick(root, ".mission-delete-btn", (btn) => {
      const missionId = getClosestDataId(btn, "data-mission-id");
      confirmDialog("Excluir missão", "<p>Tem certeza que deseja excluir esta missão?</p>", async () => MissionService.delete(missionId));
    });
  }

  private openCreateDialog(): void {
    openFormDialog({
      title: "Nova Missão",
      content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Título</label><input name="title" type="text" required /></div>
          <div class="form-group"><label>Descrição</label><textarea name="description" rows="3"></textarea></div>
          <div class="form-group form-row"><div><label>Nível mín.</label><input name="levelMin" type="number" value="1" min="1" max="20" /></div><div><label>Nível máx.</label><input name="levelMax" type="number" value="20" min="1" max="20" /></div></div>
          <div class="form-group"><label>Faixa etária</label><input name="age" type="text" value="Livre" /></div>
          <div class="form-group"><label>Plataformas (vírgula)</label><input name="platforms" type="text" /></div>
          <div class="form-group form-row"><div><label>Data</label><input name="sessionDate" type="date" /></div><div><label>Hora</label><input name="sessionTime" type="time" value="20:00" /></div></div>
          <div class="form-group"><label>Sessão #</label><input type="number" name="sessionNumber" placeholder="Sessão #" /></div>
          <div class="form-group form-row"><div><label>Vagas</label><input name="maxSlots" type="number" value="6" min="1" /></div><div><label>Reservas</label><input name="reserveSlots" type="number" value="2" min="0" /></div></div>
        </form>`,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: "Criar",
          callback: async (html) => {
            const form = (html as JQuery).find("form")[0] as HTMLFormElement | undefined;
            if (!form) return;
            const data = parseForm<Record<string, FormDataEntryValue | null>>(form);
            await MissionService.create({
              title: String(data.title ?? ""),
              description: String(data.description ?? ""),
              levelRange: [parseInt(String(data.levelMin ?? "1"), 10), parseInt(String(data.levelMax ?? "20"), 10)],
              age: String(data.age ?? "Livre"),
              platforms: String(data.platforms ?? "").split(",").map((s) => s.trim()).filter(Boolean),
              sessionDate: String(data.sessionDate ?? ""),
              sessionTime: String(data.sessionTime ?? "20:00"),
              sessionNumber: Number(data.sessionNumber || 0),
              maxSlots: parseInt(String(data.maxSlots ?? "6"), 10),
              reserveSlots: parseInt(String(data.reserveSlots ?? "2"), 10),
            });
          },
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
      },
      default: "create",
    });
  }

  private openEditDialog(missionId: string): void {
    const mission = MissionService.getAll().find((m) => m.id === missionId);
    if (!mission) return;

    openFormDialog({
      title: "Editar Missão",
      content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Título</label><input name="title" type="text" required value="${mission.title}" /></div>
          <div class="form-group"><label>Descrição</label><textarea name="description" rows="3">${mission.description}</textarea></div>
          <div class="form-group form-row"><div><label>Nível mín.</label><input name="levelMin" type="number" value="${mission.levelRange[0]}" min="1" max="20" /></div><div><label>Nível máx.</label><input name="levelMax" type="number" value="${mission.levelRange[1]}" min="1" max="20" /></div></div>
          <div class="form-group"><label>Faixa etária</label><input name="age" type="text" value="${mission.age}" /></div>
          <div class="form-group"><label>Plataformas (vírgula)</label><input name="platforms" type="text" value="${mission.platforms.join(", ")}" /></div>
          <div class="form-group form-row"><div><label>Data</label><input name="sessionDate" type="date" value="${mission.sessionDate}" /></div><div><label>Hora</label><input name="sessionTime" type="time" value="${mission.sessionTime}" /></div></div>
          <div class="form-group"><label>Sessão #</label><input type="number" name="sessionNumber" placeholder="Sessão #" value="${mission.sessionNumber ?? 0}" /></div>
          <div class="form-group form-row"><div><label>Vagas</label><input name="maxSlots" type="number" value="${mission.maxSlots}" min="1" /></div><div><label>Reservas</label><input name="reserveSlots" type="number" value="${mission.reserveSlots}" min="0" /></div></div>
        </form>`,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Salvar",
          callback: async (html) => {
            const form = (html as JQuery).find("form")[0] as HTMLFormElement | undefined;
            if (!form) return;
            const data = parseForm<Record<string, FormDataEntryValue | null>>(form);
            await MissionService.update(missionId, {
              title: String(data.title ?? ""),
              description: String(data.description ?? ""),
              levelRange: [parseInt(String(data.levelMin ?? "1"), 10), parseInt(String(data.levelMax ?? "20"), 10)],
              age: String(data.age ?? "Livre"),
              platforms: String(data.platforms ?? "").split(",").map((s) => s.trim()).filter(Boolean),
              sessionDate: String(data.sessionDate ?? ""),
              sessionTime: String(data.sessionTime ?? "20:00"),
              sessionNumber: Number(data.sessionNumber || 0),
              maxSlots: parseInt(String(data.maxSlots ?? "6"), 10),
              reserveSlots: parseInt(String(data.reserveSlots ?? "2"), 10),
            });
          },
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
      },
      default: "save",
    });
  }
}
