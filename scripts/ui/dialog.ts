export function confirmDialog(title: string, content: string, onConfirm: () => void | Promise<void>): void {
  new Dialog({
    title,
    content,
    buttons: {
      yes: {
        icon: '<i class="fas fa-check"></i>',
        label: "Confirmar",
        callback: () => void onConfirm(),
      },
      no: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancelar",
      },
    },
    default: "no",
  }).render(true);
}

export function openFormDialog(config: ConstructorParameters<typeof Dialog>[0]): void {
  new Dialog(config).render(true);
}
