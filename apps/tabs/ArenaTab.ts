import { DuelService } from "../../scripts/api";
import { currentUserId } from "../../scripts/types";
import { bindClick, getClosestDataId } from "../../scripts/ui/dom";
import type { SocialTab } from "./types";

export class ArenaTab implements SocialTab {
  readonly id = "arena";
  readonly label = "Arena";
  readonly icon = "fas fa-khanda";

  getData(): Record<string, unknown> {
    const g = game as Game;
    const duels = DuelService.getAll().map((duel) => {
      const player1 = g.users?.get(duel.player1Id)?.name ?? "Desconhecido";
      const player2 = g.users?.get(duel.player2Id)?.name ?? "Desconhecido";
      const p1Won = duel.winnerId === duel.player1Id;
      const p2Won = duel.winnerId === duel.player2Id;
      return {
        ...duel,
        player1,
        player2,
        statusLeft: duel.winnerId ? (p1Won ? "🏆" : "❌") : "—",
        statusRight: duel.winnerId ? (p2Won ? "🏆" : "❌") : "—",
      };
    });

    const opponents = (g.users?.contents ?? [])
      .filter((u: User) => u.id !== currentUserId())
      .map((u: User) => ({ id: u.id, name: u.name }));

    return { duels, opponents };
  }

  activateListeners(root: HTMLElement): void {
    root.querySelector("#duel-create-btn")?.addEventListener("click", async () => {
      const select = root.querySelector<HTMLSelectElement>("#duel-opponent");
      const opponentId = select?.value ?? "";
      if (!opponentId) return;
      await DuelService.create(opponentId);
    });

    bindClick(root, ".duel-finish-btn", async (btn) => {
      const duelId = getClosestDataId(btn, "data-duel-id");
      const winnerId = btn.getAttribute("data-winner-id") ?? "";
      if (!duelId || !winnerId) return;
      await DuelService.finish(duelId, winnerId);
    });
  }
}
