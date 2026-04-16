/**
 * helpers.ts – Register Handlebars helpers used in templates
 */
import { timeAgo, formatDate } from "./utils";

export function registerHelpers(): void {
  // Abbreviate name to 2 initials
  Handlebars.registerHelper("abbrev", (name: string) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  });

  // timeAgo from timestamp
  Handlebars.registerHelper("timeAgo", function (this: { createdAt?: number }) {
    return timeAgo(this.createdAt ?? 0);
  });

  // Format timestamp to locale date
  Handlebars.registerHelper("formatDate", (ts: number | string) => {
    if (typeof ts === "number") return new Date(ts).toLocaleDateString("pt-BR");
    return formatDate(ts);
  });

  // Join array with separator
  Handlebars.registerHelper("join", (arr: unknown[], sep: string) => {
    if (!Array.isArray(arr)) return "";
    return arr.join(sep);
  });

  // Equality check
  Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

  // Or check
  Handlebars.registerHelper("or", (a: unknown, b: unknown) => a || b);

  // Range helper: {{range 1 5}} -> [1,2,3,4,5]
  Handlebars.registerHelper("range", (start: number, end: number) => {
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  });

  // Slot percent
  Handlebars.registerHelper("slotPercent", (current: number, max: number) => {
    if (!max) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  });

  // Mission status label
  Handlebars.registerHelper("statusLabel", (status: string) => {
    const map: Record<string, string> = {
      open: "Aberta",
      full: "Lotada",
      closed: "Encerrada",
    };
    return map[status] ?? status;
  });

  Handlebars.registerHelper("nl2br", function (text: string) {
    if (!text) return "";
    const escaped = Handlebars.escapeExpression(text);
    return new Handlebars.SafeString(
      escaped.replace(/\n/g, "<br>")
    );
  });

  Handlebars.registerHelper("roseCounter", function (count: number) {
    if (!count) return "—";

    const bouquets = Math.floor(count / 5);
    const roses = count % 5;

    const bouquetStr = "💐".repeat(bouquets);
    const roseStr = "🌹".repeat(roses);

    return new Handlebars.SafeString(
      `${bouquetStr}${roseStr} <small>(${count})</small>`
    );
  });
  Handlebars.registerHelper("truncate", (text: string, len: number) => {
  if (!text) return "";
  return text.length > len ? text.slice(0, len) + "..." : text;
  });
}
