import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(iso?: string | null, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  return d.toLocaleString("es-ES", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" });
}

export function shortUrl(url: string, max = 60): string {
  const u = url.replace(/^https?:\/\/(www\.)?/, "");
  return u.length > max ? u.slice(0, max - 1) + "…" : u;
}
