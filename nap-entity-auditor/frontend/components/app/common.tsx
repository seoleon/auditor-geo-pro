"use client";

import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: number | string | null | undefined; hint?: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "good" && "text-emerald-700",
          tone === "bad" && "text-red-700",
          tone === "warn" && "text-amber-700",
        )}
      >
        {value ?? "—"}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function KeyValue({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-words">{v === null || v === undefined || v === "" ? <span className="text-muted-foreground">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}
