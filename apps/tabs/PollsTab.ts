import { PollService } from "../../scripts/api";
import { currentUserId, isGM } from "../../scripts/types";
import { getUserName, timeAgo } from "../../scripts/utils";
import { bindClick, getClosestDataId, parseForm } from "../../scripts/ui/dom";
import { confirmDialog, openFormDialog } from "../../scripts/ui/dialog";
import type { SocialTab } from "./types";

export class PollsTab implements SocialTab {
  readonly id = "polls";
  readonly label = "Enquetes";
  readonly icon = "fas fa-poll";

  getData(): Record<string, unknown> {
    const uid = currentUserId();
    const gm = isGM();
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
    return { polls };
  }

  activateListeners(root: HTMLElement): void {
    root.querySelector("#poll-create-btn")?.addEventListener("click", () => this.openCreateDialog());
    bindClick(root, ".vote-option-btn", async (btn) => {
      await PollService.vote(getClosestDataId(btn, "data-poll-id"), btn.dataset.optionId ?? "");
    });
    bindClick(root, ".poll-close-btn", async (btn) => PollService.close(getClosestDataId(btn, "data-poll-id")));
    bindClick(root, ".delete-poll-btn", (btn) => {
      const pollId = getClosestDataId(btn, "data-poll-id") || btn.getAttribute("data-poll-id") || "";
      confirmDialog("Excluir enquete", "<p>Tem certeza que deseja excluir?</p>", async () => PollService.delete(pollId));
    });
  }

  private openCreateDialog(): void {
    openFormDialog({
      title: "Nova Enquete",
      content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Pergunta</label><input name="question" type="text" required /></div>
          <div class="form-group"><label>Opções (uma por linha)</label><textarea name="options" rows="4"></textarea></div>
          <div class="form-group form-row"><div><label>Multi-voto</label><input name="multiple" type="checkbox" /></div><div><label>Encerra em (horas, 0=sem limite)</label><input name="hours" type="number" value="0" min="0" /></div></div>
        </form>`,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: "Criar",
          callback: async (html) => {
            const form = (html as JQuery).find("form")[0] as HTMLFormElement | undefined;
            if (!form) return;
            const data = parseForm<Record<string, FormDataEntryValue | null>>(form);
            const options = String(data.options ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
            const hours = parseFloat(String(data.hours ?? "0"));
            await PollService.create({
              question: String(data.question ?? ""),
              options,
              multiple: !!data.multiple,
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
