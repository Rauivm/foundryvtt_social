/**
 * utils.ts – shared helpers
 */

declare const DOMPurify: { sanitize(s: string, cfg?: object): string };

/** Generate a short random ID compatible with Foundry conventions */
export function randomID(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

/** Sanitize user-supplied HTML with DOMPurify */
export function sanitize(html: string): string {
  if (typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "br"], ALLOWED_ATTR: ["href"] });
  }
  // fallback: strip all tags
  const d = document.createElement("div");
  d.textContent = html;
  return d.innerHTML;
}

/** Format a timestamp as relative string */
export function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "agora mesmo";
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)}h`;
  return `há ${Math.floor(seconds / 86400)}d`;
}

/** Format ISO date string to locale */
export function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

/** Get user name from id */
export function getUserName(userId: string): string {
  const user = (game as Game).users?.get(userId);
  return user?.name ?? userId.slice(0, 8);
}

/** Debounce helper */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
