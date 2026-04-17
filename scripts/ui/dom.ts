export function bindClick(
  root: ParentNode,
  selector: string,
  handler: (el: HTMLElement, ev: MouseEvent) => void | Promise<void>
): void {
  const nodes = root.querySelectorAll<HTMLElement>(selector);
  nodes.forEach((node) => {
    node.addEventListener("click", (ev: Event) => {
      void handler(node, ev as MouseEvent);
    });
  });
}

export function getClosestDataId(element: HTMLElement, attr: string): string {
  return element.closest(`[${attr}]`)?.getAttribute(attr) ?? "";
}

export function parseForm<T extends Record<string, FormDataEntryValue | null>>(form: HTMLFormElement): T {
  const data = new FormData(form);
  const result = {} as T;
  data.forEach((value, key) => {
    (result as Record<string, FormDataEntryValue | null>)[key] = value;
  });
  return result;
}
