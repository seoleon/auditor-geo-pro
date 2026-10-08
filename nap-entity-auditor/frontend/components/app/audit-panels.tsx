"use client";

import { useState } from "react";

import { KeyValue } from "@/components/app/common";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { FIELD_LABELS, PriorityBadge, STATUS_LABELS, StatusBadge } from "@/lib/labels";
import type { Action, AuditDetail, DuplicateGroup } from "@/lib/types";
import { fmtDate, shortUrl } from "@/lib/utils";

export function DuplicatesPanel({ auditId }: { auditId: number }) {
  const { data, reload } = useApi<DuplicateGroup[]>(`/api/audits/${auditId}/duplicates`);
  const [notes, setNotes] = useState<Record<number, string>>({});
  async function decide(g: DuplicateGroup, status: DuplicateGroup["status"]) {
    await api(`/api/duplicates/${g.id}`, { method: "PATCH", json: { status, note: notes[g.id] ?? g.note } });
    reload();
  }
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  return (
    <div className="space-y-4">
      <Alert variant="warning">
        Un posible duplicado es una hipótesis. Antes de solicitar la fusión o eliminación de una ficha, comprueba que no representa una ubicación real distinta.
        Las decisiones se conservan en auditorías posteriores.
      </Alert>
      {!data.length && <p className="text-sm text-muted-foreground">No se han detectado posibles duplicados.</p>}
      {data.map((g) => (
        <Card key={g.id}>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">
                {g.platform} · {g.members.length} fichas
              </CardTitle>
              <CardDescription>{g.reasons.join(" · ")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <PriorityBadge priority={g.priority} />
              <Badge variant={g.status === "confirmed" ? "danger" : g.status === "dismissed" ? "muted" : "warning"}>
                {{ pending: "Pendiente", confirmed: "Duplicado confirmado", dismissed: "Descartado" }[g.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {g.warnings.map((w) => (
              <Alert key={w} variant="warning">
                {w}
              </Alert>
            ))}
            <Table className="text-xs">
              <THead>
                <TR>
                  <TH>URL</TH>
                  <TH>Nombre</TH>
                  <TH>Teléfonos</TH>
                  <TH>Dirección</TH>
                  <TH>Identificador</TH>
                </TR>
              </THead>
              <TBody>
                {g.members.map((m) => (
                  <TR key={m.url}>
                    <TD>
                      <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary">
                        {shortUrl(m.url, 60)}
                      </a>
                    </TD>
                    <TD>{m.name}</TD>
                    <TD>{m.phones.join(", ")}</TD>
                    <TD>{m.address}</TD>
                    <TD className="break-all">{m.listing_id}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Textarea rows={2} placeholder="Nota (motivo de la decisión)" value={notes[g.id] ?? g.note ?? ""} onChange={(e) => setNotes({ ...notes, [g.id]: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => decide(g, "confirmed")}>
                Confirmar duplicado
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide(g, "dismissed")}>
                Descartar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => decide(g, "pending")}>
                Volver a pendiente
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SchemaPanel({ report }: { report: AuditDetail["schema_report"] }) {
  const sev = { error: "danger", warning: "warning", info: "info" } as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted-foreground">{report.pages_analyzed ?? 0} páginas oficiales analizadas · tipos:</span>
        {Object.entries(report.types_found || {}).map(([t, n]) => (
          <Badge key={t} variant="secondary">
            {t} × {n}
          </Badge>
        ))}
      </div>
      {!report.compared_with_official_nap && <Alert variant="warning">Sin NAP confirmado: no se ha comparado el schema con los datos oficiales.</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Incidencias</CardTitle>
          <CardDescription>Las propiedades opcionales ausentes se tratan como recomendaciones, no como errores.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="text-xs">
            <THead>
              <TR>
                <TH>Gravedad</TH>
                <TH>Incidencia</TH>
                <TH>Página</TH>
                <TH>Entidad / evidencia</TH>
              </TR>
            </THead>
            <TBody>
              {(report.issues || []).map((i, k) => (
                <TR key={k}>
                  <TD>
                    <Badge variant={sev[i.severity]}>{i.severity}</Badge>
                  </TD>
                  <TD>{i.message}</TD>
                  <TD className="break-all">{shortUrl(i.page_url, 45)}</TD>
                  <TD className="max-w-xs break-words text-muted-foreground">{[i.entity, i.evidence].filter(Boolean).join(" — ")}</TD>
                </TR>
              ))}
              {!report.issues?.length && (
                <TR>
                  <TD colSpan={4} className="text-muted-foreground">
                    Sin incidencias.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      {!!report.recommendations?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Recomendaciones técnicas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {report.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Entidades detectadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(report.entities || []).map((e, k) => (
            <details key={k} className="rounded border p-2 text-xs">
              <summary className="cursor-pointer">
                <b>{e.types.join(", ")}</b> · {e.syntax} · {shortUrl(e.page_url, 50)}
              </summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">{JSON.stringify(e.properties, null, 2)}</pre>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const SOCIAL_STATUS: Record<string, [string, "success" | "info" | "warning" | "danger" | "muted"]> = {
  verified: ["Verificado", "success"],
  linked: ["Enlazado desde la web / sameAs", "info"],
  registered: ["Registrado, sin enlazar", "warning"],
  unknown_profile: ["Perfil no registrado", "danger"],
};

export function SocialPanel({ report }: { report: AuditDetail["social_report"] }) {
  return (
    <div className="space-y-3">
      <Alert>{report.note}</Alert>
      <Table className="text-xs">
        <THead>
          <TR>
            <TH>Plataforma</TH>
            <TH>Perfil</TH>
            <TH>Estado</TH>
            <TH>Registrado</TH>
            <TH>Enlazado desde web</TH>
            <TH>En sameAs</TH>
            <TH>Estado NAP</TH>
          </TR>
        </THead>
        <TBody>
          {(report.profiles || []).map((p) => (
            <TR key={p.url}>
              <TD className="capitalize">{p.platform}</TD>
              <TD>
                <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary">
                  {shortUrl(p.url, 50)}
                </a>
              </TD>
              <TD>
                <Badge variant={SOCIAL_STATUS[p.status]?.[1] || "muted"}>{SOCIAL_STATUS[p.status]?.[0] || p.status}</Badge>
                {p.status_detail && <div className="mt-1 text-muted-foreground">{p.status_detail}</div>}
              </TD>
              <TD>{p.known ? "Sí" : "No"}</TD>
              <TD>{p.linked_from_website ? "Sí" : "No"}</TD>
              <TD>{p.in_same_as ? "Sí" : "No"}</TD>
              <TD>
                <StatusBadge status={p.nap_status} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function GooglePanel({ report }: { report: AuditDetail["gbp_report"] }) {
  const m = report.main_listing;
  return (
    <div className="space-y-4">
      {!report.configured && <Alert variant="warning">{report.limitation || "Google Places API no configurada."}</Alert>}
      {report.error && <Alert variant="danger">{report.error}</Alert>}
      {report.place_id_mismatch && <Alert variant="warning">Place ID: {report.place_id_mismatch}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Ficha pública principal</CardTitle>
          <CardDescription>{report.source}</CardDescription>
        </CardHeader>
        <CardContent>
          {m ? (
            <div className="space-y-4">
              <KeyValue
                items={[
                  ["Place ID", m.place_id],
                  ["Estado de funcionamiento", m.business_status === "OPERATIONAL" ? <Badge variant="success">Operativo</Badge> : <Badge variant="danger">{m.business_status}</Badge>],
                  ["Categoría", `${m.category || "—"} · ${m.category_check?.detail || ""}`],
                  ["Ver en Google Maps", m.maps_uri ? <a className="text-primary" href={m.maps_uri} target="_blank" rel="noopener noreferrer">{m.maps_uri}</a> : null],
                ]}
              />
              <Table className="text-xs">
                <THead>
                  <TR>
                    <TH>Campo</TH>
                    <TH>Dato en Google</TH>
                    <TH>Estado</TH>
                    <TH>Detalle</TH>
                  </TR>
                </THead>
                <TBody>
                  {(["name", "address", "phone", "website", "hours"] as const).map((f) => (
                    <TR key={f}>
                      <TD className="font-medium">{FIELD_LABELS[f]}</TD>
                      <TD className="break-words">{f === "hours" ? JSON.stringify(m.hours || {}) : (m[f] as string) || "—"}</TD>
                      <TD>
                        <StatusBadge status={m.field_status?.[f]} />
                      </TD>
                      <TD>{(m.field_notes?.[f] || []).join("; ")}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{report.note || "No se ha localizado una ficha pública atribuible al negocio."}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Google Business Profile (API autorizada)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {report.authorized ? (
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{JSON.stringify(report.authorized_data, null, 2)}</pre>
          ) : (
            <Alert variant="warning">{report.authorized_limitation}</Alert>
          )}
        </CardContent>
      </Card>
      {!!report.candidates?.length && (
        <p className="text-xs text-muted-foreground">Lugares devueltos por la API: {report.candidates.map((c) => `${c.name} (${c.place_id})`).join(" · ")}</p>
      )}
    </div>
  );
}

export function GeoPanel({ report }: { report: AuditDetail["geo_report"] }) {
  const st = { pass: ["Cumple", "success"], warn: ["Mejorable", "warning"], fail: ["No cumple", "danger"], unknown: ["Sin datos", "muted"] } as const;
  return (
    <div className="space-y-4">
      <Alert>{report.disclaimer}</Alert>
      {report.signal_score !== null && report.signal_score !== undefined && (
        <p className="text-sm">
          Puntuación interna de señales: <b>{report.signal_score}/100</b> <span className="text-muted-foreground">(no es una métrica de ningún buscador)</span>
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {(report.checks || []).map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <CardTitle className="text-sm">{c.label}</CardTitle>
              <Badge variant={st[c.status][1]}>{st[c.status][0]}</Badge>
            </CardHeader>
            <CardContent className="text-sm">
              <p>{c.detail}</p>
              {!!c.evidence.length && <p className="mt-1 break-words text-xs text-muted-foreground">{c.evidence.join(" · ")}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      {report.robots_ai?.available && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Acceso de rastreadores de IA según robots.txt</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(report.robots_ai.bots).map(([b, ok]) => (
              <Badge key={b} variant={ok ? "success" : "muted"}>
                {ok ? "✓" : "✗"} {b}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ActionsPanel({ auditId }: { auditId: number }) {
  const { data, reload } = useApi<Action[]>(`/api/audits/${auditId}/actions`);
  const [cat, setCat] = useState("");
  async function setStatus(a: Action, status: Action["status"]) {
    await api(`/api/actions/${a.id}`, { method: "PATCH", json: { status } });
    reload();
  }
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  const rows = data.filter((a) => !cat || a.category === cat);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="max-w-[220px]">
          <option value="">Todas las categorías</option>
          {["nap", "duplicate", "schema", "gbp", "social", "geo"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">
          «Confirmada» = respaldada por evidencias suficientes; «Hipótesis» = requiere verificación antes de pedir cambios.
        </span>
      </div>
      <Table className="text-xs">
        <THead>
          <TR>
            <TH>Prior.</TH>
            <TH>Certeza</TH>
            <TH>Acción</TH>
            <TH>Detalle</TH>
            <TH>Desde</TH>
            <TH>Estado</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((a) => (
            <TR key={a.id} className={a.status !== "open" ? "opacity-60" : ""}>
              <TD>
                <PriorityBadge priority={a.priority} />
              </TD>
              <TD>
                <Badge variant={a.certainty === "confirmed" ? "danger" : "warning"}>{a.certainty === "confirmed" ? "Confirmada" : "Hipótesis"}</Badge>
              </TD>
              <TD className="max-w-xs">
                <div className="font-medium">{a.title}</div>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary">
                    {shortUrl(a.url, 50)}
                  </a>
                )}
              </TD>
              <TD className="max-w-md">{a.detail}</TD>
              <TD>{a.first_seen_audit_id && a.first_seen_audit_id !== a.audit_id ? `#${a.first_seen_audit_id}` : "Nueva"}</TD>
              <TD>
                <Select value={a.status} onChange={(e) => setStatus(a, e.target.value as Action["status"])} className="h-8 w-32 text-xs">
                  <option value="open">Abierta</option>
                  <option value="done">Hecha</option>
                  <option value="dismissed">Descartada</option>
                </Select>
              </TD>
            </TR>
          ))}
          {!rows.length && (
            <TR>
              <TD colSpan={6} className="text-muted-foreground">
                Sin acciones.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}

export function QueriesPanel({ auditId, log }: { auditId: number; log: AuditDetail["log"] }) {
  const { data } = useApi<{ id: number; provider: string; query: string; kind: string; page: number; results: number; status: string; cached: boolean; error: string | null }[]>(
    `/api/audits/${auditId}/queries`,
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Consultas de búsqueda</CardTitle>
          <CardDescription>Origen de cada resultado descubierto</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="text-xs">
            <THead>
              <TR>
                <TH>Proveedor</TH>
                <TH>Consulta</TH>
                <TH>Pág.</TH>
                <TH>Res.</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {(data || []).map((q) => (
                <TR key={q.id}>
                  <TD>{q.provider}</TD>
                  <TD className="break-words">{q.query}</TD>
                  <TD>{q.page}</TD>
                  <TD>{q.results}</TD>
                  <TD title={q.error || ""}>{q.cached ? "caché" : q.status}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registro de ejecución</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 font-mono text-[11px]">
            {log.map((l, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{fmtDate(l.t)}</span> {l.msg}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

interface Comparison {
  old_audit: { id: number; date: string | null };
  new_audit: { id: number; date: string | null };
  new_citations: { url: string; type: string; status: string }[];
  not_observed: { url: string; type: string; status_before: string }[];
  not_observed_note: string;
  changed_data: { url: string; changes: Record<string, { before: unknown; after: unknown }> }[];
  status_changes: { url: string; before: string; after: string }[];
  resolved_issues: { title: string; priority: string }[];
  unverified_issues: { title: string; priority: string }[];
  new_issues: { title: string; priority: string }[];
  persisting_issues: { title: string; priority: string }[];
}

export function ComparePanel({ oldId, newId }: { oldId: string; newId: number }) {
  const { data, error } = useApi<Comparison>(`/api/audits/compare?old=${oldId}&new=${newId}`);
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  const Section = ({ title, items, render }: { title: string; items: unknown[]; render: (x: never) => React.ReactNode }) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {title} ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs">
        <ul className="space-y-1">{items.slice(0, 100).map((x, i) => <li key={i}>{render(x as never)}</li>)}</ul>
      </CardContent>
    </Card>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Auditoría #{data.old_audit.id} ({fmtDate(data.old_audit.date)}) → #{data.new_audit.id} ({fmtDate(data.new_audit.date)})
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Citaciones nuevas" items={data.new_citations} render={(x: Comparison["new_citations"][0]) => <>{shortUrl(x.url)} · {STATUS_LABELS[x.status]}</>} />
        <Section title="No observadas en esta ejecución" items={data.not_observed} render={(x: Comparison["not_observed"][0]) => <>{shortUrl(x.url)}</>} />
        <Section
          title="Datos modificados"
          items={data.changed_data}
          render={(x: Comparison["changed_data"][0]) => (
            <>
              {shortUrl(x.url)}:{" "}
              {Object.entries(x.changes)
                .map(([f, c]) => `${FIELD_LABELS[f] || f}: ${String(c.before ?? "—")} → ${String(c.after ?? "—")}`)
                .join("; ")}
            </>
          )}
        />
        <Section title="Cambios de estado" items={data.status_changes} render={(x: Comparison["status_changes"][0]) => <>{shortUrl(x.url)}: {STATUS_LABELS[x.before]} → {STATUS_LABELS[x.after]}</>} />
        <Section title="Discrepancias resueltas" items={data.resolved_issues} render={(x: Comparison["resolved_issues"][0]) => <>{x.priority} · {x.title}</>} />
        <Section title="Nuevas incidencias" items={data.new_issues} render={(x: Comparison["new_issues"][0]) => <>{x.priority} · {x.title}</>} />
        <Section title="Sin verificar (fuente no observada)" items={data.unverified_issues} render={(x: Comparison["unverified_issues"][0]) => <>{x.priority} · {x.title}</>} />
        <Section title="Incidencias que persisten" items={data.persisting_issues} render={(x: Comparison["persisting_issues"][0]) => <>{x.priority} · {x.title}</>} />
      </div>
      <Alert variant="warning">{data.not_observed_note}</Alert>
    </div>
  );
}
