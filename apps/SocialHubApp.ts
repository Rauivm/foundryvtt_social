/**
 * SocialHubApp.ts
 * Main Application shell: sidebar button → tabbed window.
 */

import { PostService, MissionService, PollService, GraveService, PatchService } from "../scripts/api";
import { currentUserId, isGM, userRole, ROLES } from "../scripts/types";
import { timeAgo, formatDate, getUserName, debounce } from "../scripts/utils";

const MODULE_ID = "foundryvtt-social";

export class SocialHubApp extends Application {
  private _currentTab: string = "feed";
  private _refreshHandler: (tab: string) => void;

  static override get defaultOptions(): ApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "social-hub",
      title: "Social Hub",
      template: `modules/${MODULE_ID}/templates/hub.hbs`,
      width: 720,
      height: 640,
      resizable: true,
      classes: ["social-hub"],
      tabs: [
        {
          navSelector: ".social-tabs",
          contentSelector: ".social-content",
          initial: "feed",
        },
      ],
    });
  }

  constructor(options = {}) {
    super(options);
    this._refreshHandler = debounce((tab: any) => {
      if (this.rendered) this.render(false);
    }, 200) as (tab: string) => void;
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);
    const el = html[0];

    // ── Feed ──────────────────────────────────────────────────────────────────
    const typeEl = el.querySelector<HTMLSelectElement>("#social-post-type");
    const missionEl = el.querySelector<HTMLSelectElement>("#social-post-mission");

    const syncMissionLinkVisibility = (): void => {
      if (!typeEl || !missionEl) return;
      const shouldShowMission = typeEl.value === "summary";
      missionEl.style.display = shouldShowMission ? "inline-block" : "none";
      missionEl.disabled = !shouldShowMission;
      if (!shouldShowMission) missionEl.value = "";
    };

    typeEl?.addEventListener("change", syncMissionLinkVisibility);
    syncMissionLinkVisibility();

    el.querySelector("#social-post-submit")?.addEventListener("click", async () => {
      const ta = el.querySelector<HTMLTextAreaElement>("#social-post-content");
      if (!ta?.value.trim()) return;
      try {
        const postType = (typeEl?.value as "post" | "summary") ?? "post";
        const missionId = missionEl?.value?.trim();

        await PostService.create({
          content: ta.value,
          type: postType,
          meta: postType === "summary" && missionId ? { missionId } : undefined,
        });
        ta.value = "";
        if (missionEl) missionEl.value = "";
      } catch (e: unknown) {
        ui.notifications?.error(String(e));
      }
    });

    el.querySelectorAll<HTMLButtonElement>(".react-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const postId = btn.closest("[data-post-id]")?.getAttribute("data-post-id") ?? "";
        const emoji = btn.dataset.emoji ?? "👍";
        await PostService.react(postId, emoji);
      });
    });

    el.querySelectorAll<HTMLButtonElement>(".rate-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const postId = btn.closest("[data-post-id]")?.getAttribute("data-post-id") ?? "";
        const rating = parseInt(btn.dataset.rating ?? "0");
        await PostService.rateMission(postId, rating);
      });
    });

    el.querySelectorAll<HTMLButtonElement>(".delete-post-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const postId = btn.closest("[data-post-id]")?.getAttribute("data-post-id") ?? "";
        await PostService.delete(postId);
      });
    });

    // ── Missions ──────────────────────────────────────────────────────────────
    el.querySelector("#mission-create-btn")?.addEventListener("click", () => {
      new MissionCreateDialog().render(true);
    });

    el.querySelectorAll(".mission-join-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
        await MissionService.join(id);
      });
    });

    el.querySelectorAll(".mission-leave-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
      await MissionService.leave(id);
    });
  });

    el.querySelectorAll<HTMLButtonElement>(".mission-close-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
        await MissionService.close(id);
      });
    });
    // EDIT (simples)
    el.querySelectorAll(".edit-mission-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const missionId = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";

        const newTitle = prompt("Novo título:");
        if (!newTitle) return;

        await MissionService.update(missionId, { title: newTitle });
      });
    });

    // DELETE
    el.querySelectorAll(".delete-mission-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const missionId =
          btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";

        new Dialog({
          title: "Excluir missão",
          content: "<p>Tem certeza que deseja excluir esta missão?</p>",
          buttons: {
            yes: {
              icon: '<i class="fas fa-trash"></i>',
              label: "Excluir",
              callback: async () => {
                await MissionService.delete(missionId);
              },
            },
            no: {
              icon: '<i class="fas fa-times"></i>',
              label: "Cancelar",
            },
          },
          default: "no",
        }).render(true);
      });
    });
    // el.querySelectorAll(".delete-mission-btn").forEach((btn) => {
    //   btn.addEventListener("click", async () => {
    //     const missionId = btn.closest("[data-mission-id]")?.getAttribute("data-mission-id") ?? "";
        
    //     const confirmed = confirm("Excluir missão?");
    //     if (!confirmed) return;

    //     await MissionService.delete(missionId);
    //   });
    // });

    // ── Polls ─────────────────────────────────────────────────────────────────
    el.querySelector("#poll-create-btn")?.addEventListener("click", () => {
      new PollCreateDialog().render(true);
    });

    el.querySelectorAll<HTMLButtonElement>(".vote-option-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pollId = btn.closest("[data-poll-id]")?.getAttribute("data-poll-id") ?? "";
        const optionId = btn.dataset.optionId ?? "";
        await PollService.vote(pollId, optionId);
      });
    });

    el.querySelectorAll<HTMLButtonElement>(".poll-close-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pollId = btn.closest("[data-poll-id]")?.getAttribute("data-poll-id") ?? "";
        await PollService.close(pollId);
      });
    });
    //DELETE
    el.querySelectorAll(".delete-poll-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pollId =
          btn.closest("[data-poll-id]")?.getAttribute("data-poll-id") ??
          btn.getAttribute("data-poll-id") ??
          "";

        new Dialog({
          title: "Excluir enquete",
          content: "<p>Tem certeza que deseja excluir?</p>",
          buttons: {
            yes: {
              icon: '<i class="fas fa-trash"></i>',
              label: "Excluir",
              callback: async () => {
                await PollService.delete(pollId);
              },
            },
            no: {
              label: "Cancelar",
            },
          },
          default: "no",
        }).render(true);
      });
    });

    // ── Graveyard ─────────────────────────────────────────────────────────────
    function spawnRose(container: HTMLElement): void {
      const rose = document.createElement("div");
      rose.className = "rose-fx";
      rose.textContent = "🌹";
      rose.style.left = `${40 + Math.random() * 20}%`;
      container.appendChild(rose);
      rose.addEventListener("animationend", () => rose.remove(), { once: true });
    }

    el.querySelector("#grave-add-btn")?.addEventListener("click", () => {
      new GraveAddDialog().render(true);
    });

    if (!el.dataset.socialRespectBound) {
      el.dataset.socialRespectBound = "true";
      el.addEventListener("click", async (event) => {
        const target = event.target as HTMLElement | null;
        const respectBtn = target?.closest<HTMLButtonElement>(".f-btn");
        if (!respectBtn) return;

        const graveEl = respectBtn.closest<HTMLElement>("[data-grave-id]");
        const graveId = graveEl?.getAttribute("data-grave-id") ?? "";
        if (!graveId || !graveEl) return;

        await GraveService.respect(graveId);
        spawnRose(graveEl);
      });
    }

    el.querySelectorAll(".grave-open-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const graveEl = btn.closest("[data-grave-id]") as HTMLElement;
        const graveId = graveEl?.getAttribute("data-grave-id") ?? "";

        const grave = GraveService.getAll().find(g => g.id === graveId);
        if (!grave) return;

        new Dialog({
          title: `🪦 ${grave.name}`,
          content: `
            <div class="grave-modal">
              <div class="grave-photo-placeholder">
                🚧 Em construção (foto)
              </div>
              <h2>${grave.name}</h2>
              <p><i>Caiu em ${new Date(grave.deathAt).toLocaleDateString("pt-BR")}</i></p>
              ${grave.epitaph ? `<blockquote>"${grave.epitaph}"</blockquote>` : ""}
              <div class="grave-stats">
                🌹 ${grave.respects.length} homenagens
              </div>
            </div>
          `,
          buttons: {
            close: { label: "Fechar" }
          }
        }).render(true);
      });
    });

    // ── DELETE GRAVE ─────────────────────────────
el.querySelectorAll(".delete-grave-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const graveId =
      btn.closest("[data-grave-id]")?.getAttribute("data-grave-id") ?? "";

    new Dialog({
      title: "Excluir lápide",
      content: "<p>Confirmar exclusão?</p>",
      buttons: {
        yes: {
          label: "Excluir",
          callback: async () => {
            await GraveService.delete(graveId);
          },
        },
        no: { label: "Cancelar" },
      },
    }).render(true);
  });
});

// ── EDIT GRAVE ─────────────────────────────
el.querySelectorAll(".edit-grave-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const graveId =
      btn.closest("[data-grave-id]")?.getAttribute("data-grave-id") ?? "";

    const grave = GraveService.getAll().find((g) => g.id === graveId);
    if (!grave) return;

    new Dialog({
      title: "Editar lápide",
      content: `
        <form>
          <div class="form-group">
            <label>Nome</label>
            <input name="name" type="text" value="${grave.name}" />
          </div>
          <div class="form-group">
            <label>Epitáfio</label>
            <textarea name="epitaph" maxlength="200">${grave.epitaph ?? ""}</textarea>
          </div>
        </form>
      `,
      buttons: {
        save: {
          label: "Salvar",
          callback: async (html: any) => {
            const form = html.find("form")[0];
            const d = new FormData(form);

            await GraveService.update(graveId, {
              name: (d.get("name") as string) || "",
              epitaph: (d.get("epitaph") as string) || undefined,
            });
          },
        },
        cancel: { label: "Cancelar" },
      },
    }).render(true);
  });
});

    // ── Patches ───────────────────────────────────────────────────────────────
    el.querySelector("#patch-create-btn")?.addEventListener("click", () => {
      new PatchCreateDialog().render(true);
    });
  }

  override async getData(): Promise<object> {
    const uid = currentUserId();
    const gm = isGM();
    const canCreateMission = userRole() >= ROLES.ASSISTANT;

    const posts = PostService.getAll().map((post) => ({
      ...post,
      authorName: getUserName(post.authorId),
      timeAgo: timeAgo(post.createdAt),
      isOwn: post.authorId === uid,
      canDelete: post.authorId === uid || gm,
      reactionList: Object.entries(post.reactions).map(([emoji, users]) => ({
        emoji,
        count: users.length,
        active: users.includes(uid),
      })),
      myRating: post.meta?.rating?.[uid] ?? 0,
      ratingStats: post.type === "summary" ? PostService.getMissionRating(post) : null,
      missionName: post.meta?.missionId
        ? (MissionService.getAll().find((m) => m.id === post.meta?.missionId)?.title ?? "—")
        : null,
    }));

    const allMissions = MissionService.getAll();

    const missions = allMissions.map((m) => ({
      ...m,
      sessionDateFmt: formatDate(m.sessionDate),
      creatorName: getUserName(m.createdBy),
      userStatus: MissionService.getUserStatus(m, uid),
      isFull: m.participants.length >= m.maxSlots,
      canManage: m.createdBy === uid || gm,
    }));

    const feedMissions = allMissions
      .filter((m) => m.status !== "closed")
      .map((m) => ({ id: m.id, title: m.title }));

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

    const graves = GraveService.getAll().map((g) => ({
      ...g,
      deathDateFmt: new Date(g.deathAt).toLocaleDateString("pt-BR"),
      respectCount: g.respects.length,
      hasRespected: g.respects.includes(uid),
      canDelete: gm,
      topRespecters: g.respects.slice(0, 5).map(getUserName).join(", "),
    }));

    const patches = PatchService.getAll();

    return {
      posts,
      missions,
      feedMissions,
      polls,
      graves,
      patches,
      isGM: gm,
      canCreateMission,
      currentUserId: uid,
      EMOJIS: ["👍", "❤️", "😂", "😮", "😢", "🎲"],
    };
  }

  /** Re-register refresh hook when window opens */
  async _render(...args: any[]): Promise<void> {
    await super._render(...args);
    Hooks.on("social:refresh", this._refreshHandler);
  }

  async close(...args: any[]): Promise<void> {
    Hooks.off("social:refresh", this._refreshHandler);
    return super.close(...args);
  }
}

// ─── Sub-dialogs ──────────────────────────────────────────────────────────────

class MissionCreateDialog extends Dialog {
  constructor() {
    super({
      title: "Nova Missão",
      content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Título</label><input name="title" type="text" required /></div>
          <div class="form-group"><label>Descrição</label><textarea name="description" rows="3"></textarea></div>
          <div class="form-group form-row">
            <div><label>Nível mín.</label><input name="levelMin" type="number" value="1" min="1" max="20" /></div>
            <div><label>Nível máx.</label><input name="levelMax" type="number" value="20" min="1" max="20" /></div>
          </div>
          <div class="form-group"><label>Faixa etária</label><input name="age" type="text" value="Livre" /></div>
          <div class="form-group"><label>Plataformas (vírgula)</label><input name="platforms" type="text" /></div>
          <div class="form-group form-row">
            <div><label>Data</label><input name="sessionDate" type="date" /></div>
            <div><label>Hora</label><input name="sessionTime" type="time" value="20:00" /></div>
          </div>
          <div class="form-group form-row">
            <div><label>Vagas</label><input name="maxSlots" type="number" value="6" min="1" /></div>
            <div><label>Reservas</label><input name="reserveSlots" type="number" value="2" min="0" /></div>
          </div>
        </form>`,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: "Criar",
          callback: async (html: any) => {
            const f = html[0].querySelector("form")!;
            const d = new FormData(f);
            await MissionService.create({
              title: d.get("title") as string,
              description: d.get("description") as string,
              levelRange: [
                parseInt(d.get("levelMin") as string),
                parseInt(d.get("levelMax") as string),
              ],
              age: d.get("age") as string,
              platforms: (d.get("platforms") as string).split(",").map((s) => s.trim()).filter(Boolean),
              sessionDate: d.get("sessionDate") as string,
              sessionTime: d.get("sessionTime") as string,
              maxSlots: parseInt(d.get("maxSlots") as string),
              reserveSlots: parseInt(d.get("reserveSlots") as string),
            });
          },
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
      },
      default: "create",
    });
  }
}

class PollCreateDialog extends Dialog {
  constructor() {
    super({
      title: "Nova Enquete",
      content: `
        <form class="social-dialog-form">
          <div class="form-group"><label>Pergunta</label><input name="question" type="text" required /></div>
          <div class="form-group"><label>Opções (uma por linha)</label><textarea name="options" rows="4" placeholder="Opção 1&#10;Opção 2&#10;Opção 3"></textarea></div>
          <div class="form-group form-row">
            <div><label>Multi-voto</label><input name="multiple" type="checkbox" /></div>
            <div><label>Encerra em (horas, 0=sem limite)</label><input name="hours" type="number" value="0" min="0" /></div>
          </div>
        </form>`,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: "Criar",
          callback: async (html: any) => {
            const f = html[0].querySelector("form")!;
            const d = new FormData(f);
            const options = (d.get("options") as string).split("\n").map((s) => s.trim()).filter(Boolean);
            if (options.length < 2) { ui.notifications?.warn("Mínimo 2 opções."); return; }
            const hours = parseFloat(d.get("hours") as string);
            await PollService.create({
              question: d.get("question") as string,
              options: options.map((o: string) => ({
                //id: randomID(),
                id: foundry.utils.randomID(),
                text: o,
                votes: [] as string[]
              })) as any,
              multiple: !!(d.get("multiple")),
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

class GraveAddDialog extends Dialog {
  constructor() {
    super({
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
          callback: async (html: any) => {
            const f = html[0].querySelector("form")!;
            const d = new FormData(f);
            const dateStr = d.get("deathDate") as string;
            await GraveService.add({
              name: d.get("name") as string,
              epitaph: d.get("epitaph") as string || undefined,
              deathAt: dateStr ? new Date(dateStr).getTime() : Date.now(),
            });
          },
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
      },
      default: "add",
    });
  }
}

class PatchCreateDialog extends Dialog {
  constructor() {
    super({
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
          callback: async (html: any) => {
            const f = html[0].querySelector("form")!;
            const d = new FormData(f);
            await PatchService.create({
              version: d.get("version") as string,
              title: d.get("title") as string,
              content: d.get("content") as string,
              link: (d.get("link") as string) || undefined,
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
