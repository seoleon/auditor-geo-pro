"use client";

import { ExternalLink, FileSearch } from "lucide-react";
import { useEffect, useState } from "react";

import { KeyValue } from "@/components/app/common";
import { Alert, Badge, Button, Dialog, DialogContent, Input, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { FETCH_LABELS, FIELD_LABELS, PriorityBadge, STATUS_LABELS, StatusBadge, TYPE_LABELS } from "@/lib/labels";
import type { Source, SourceDetail } from "@/lib/types";
import { fmtDate, shortUrl } from "@/lib/utils";

interface PageResp {
  items: Source[];
  total: number;
  page: number;
  page_size: number;
}

export function SourcesTable({ auditId, initialStatus, onChanged }: { auditId: number; initialStatus?: string; onChanged?: () => void }) {
  const [status, setStatus] = useState(initialStatus || "");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [sort, setSort] = useState("priority");
  const [order, setOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const pageSize = 25;

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [status, type, priority, qDebounced, sort, order]);

  const params = new URLSearchParams({ sort, order, page: String(page), page_size: String(pageSize) });
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  if (priority) params.set("priority", priority);
  if (qDebounced) params.set("q", qDebounced);
  const { data, error, reload } = useApi<PageResp>(`/api/audits/${auditId}/sources?${params}`, [params.toString()]);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar URL, dominio o fuente" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Buscar" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[210px]" aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS)
            .filter(([k]) => k !== "NOT_APPLICABLE")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="max-w-[200px]" aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="max-w-[150px]" aria-label="Prioridad">
          <option value="">Toda prioridad</option>
          {["P0", "P1", "P2", "P3"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="max-w-[180px]" aria-label="Ordenar por">
          <option value="priority">Ordenar: prioridad</option>
          <option value="confidence">Ordenar: confianza</option>
          <option value="status">Ordenar: estado</option>
          <option value="type">Ordenar: tipo</option>
          <option value="domain">Ordenar: dominio</option>
          <option value="date">Ordenar: fecha</option>
        </Select>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setOrder(order === "asc" ? "desc" : "asc")}>
          {order === "asc" ? "Ascendente ↑" : "Descendente ↓"}
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Table className="text-xs">
        <THead>
          <TR>
            <TH>Fuente</TH>
            <TH>Tipo</TH>
            <TH>Nombre detectado</TH>
            <TH>Dirección detectada</TH>
            <TH>Teléfono detectado</TH>
            <TH>Estado NAP</TH>
            <TH>Conf.</TH>
            <TH>Fecha</TH>
            <TH>Prior.</TH>
            <TH>Acción recomendada</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {(data?.items || []).map((s) => (
            <TR key={s.id}>
              <TD className="max-w-[220px]">
                <div className="font-medium">{s.is_official ? "Web oficial" : s.source_name || s.domain}</div>
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary hover:underline">
                  {shortUrl(s.url, 55)}
                </a>
                {s.fetch_status !== "ok" && <div className="text-muted-foreground">{FETCH_LABELS[s.fetch_status] || s.fetch_status}</div>}
              </TD>
              <TD>{TYPE_LABELS[s.source_type] || s.source_type}</TD>
              <TD className="max-w-[160px] break-words">{s.extracted?.name || "—"}</TD>
              <TD className="max-w-[200px] break-words">{s.extracted?.address || "—"}</TD>
              <TD className="whitespace-nowrap">{s.extracted?.phone || "—"}</TD>
              <TD>
                <StatusBadge status={s.overall_status} />
                {s.manual_status && <div className="mt-1 text-[10px] text-muted-foreground">(manual)</div>}
              </TD>
              <TD className="tabular-nums">{s.confidence}</TD>
              <TD className="whitespace-nowrap">{fmtDate(s.fetched_at)}</TD>
              <TD>
                <PriorityBadge priority={s.priority} />
              </TD>
              <TD className="max-w-[240px]">{s.recommended_action}</TD>
              <TD>
                <Button variant="ghost" size="sm" onClick={() => setSelected(s.id)} aria-label="Ver evidencias">
                  <FileSearch /> Evidencias
                </Button>
              </TD>
            </TR>
          ))}
          {data && !data.items.length && (
            <TR>
              <TD colSpan={11} className="text-muted-foreground">
                Sin resultados con estos filtros.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{data ? `${data.total} fuentes` : "Cargando…"}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span>
            {page} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Siguiente
          </Button>
        </div>
      </div>
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected !== null && (
          <SourceEvidence
            id={selected}
            onSaved={() => {
              reload();
              onChanged?.();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function SourceEvidence({ id, onSaved }: { id: number; onSaved: () => void }) {
  const { data: s, setData } = useApi<SourceDetail>(`/api/sources/${id}`, [id]);
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (s) {
      setManual(s.manual_status || "");
      setNote(s.manual_note || "");
    }
  }, [s]);
  if (!s) return <DialogContent title="Evidencias">Cargando…</DialogContent>;

  async function save() {
    const r = await api<SourceDetail>(`/api/sources/${id}`, { method: "PATCH", json: { manual_status: manual || null, manual_note: note || null } });
    setData(r);
    onSaved();
  }

  return (
    <DialogContent title={s.is_official ? "Web oficial" : s.source_name || s.domain}>
      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 break-all text-sm text-primary">
        {s.url} <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
      {s.extracted?.demo && <Alert variant="warning">DATOS SIMULADOS — MODO DEMO</Alert>}
      <KeyValue
        items={[
          ["Tipo", TYPE_LABELS[s.source_type]],
          ["Consulta", `${FETCH_LABELS[s.fetch_status] || s.fetch_status}${s.http_status ? ` (HTTP ${s.http_status})` : ""}${s.fetch_detail ? ` — ${s.fetch_detail}` : ""}`],
          ["Fecha de consulta", fmtDate(s.fetched_at)],
          ["Método de obtención", s.render_method],
          ["URL final / canonical", [s.final_url, s.canonical].filter(Boolean).join(" · ")],
          ["Atribución al negocio", `${s.attribution?.level ?? "—"}${s.attribution?.signals?.length ? ": " + s.attribution.signals.join("; ") : ""}`],
          ["Confianza interna", `${s.confidence} / 100 (no es un factor de Google)`],
          ["Descubierta por", s.discovered_by.map((h) => `${h.provider}${h.query ? ` «${h.query}»` : ""}${h.rank ? ` #${h.rank}` : ""}`).join(" | ")],
        ]}
      />
      <Table className="text-xs">
        <THead>
          <TR>
            <TH>Campo</TH>
            <TH>Estado</TH>
            <TH>Dato detectado</TH>
            <TH>Método</TH>
            <TH>Evidencia / motivo</TH>
          </TR>
        </THead>
        <TBody>
          {Object.keys(FIELD_LABELS).map((f) => {
            const val = f === "hours" ? (s.extracted?.hours ? JSON.stringify(s.extracted.hours) : null) : (s.extracted?.[f] as string | undefined);
            return (
              <TR key={f}>
                <TD className="font-medium">{FIELD_LABELS[f]}</TD>
                <TD>
                  <StatusBadge status={s.field_status?.[f]} />
                </TD>
                <TD className="max-w-[180px] break-words">{val || "—"}</TD>
                <TD>{s.extraction_methods?.[f] || "—"}</TD>
                <TD className="max-w-[260px] break-words">
                  {s.evidence?.[f] && <div className="rounded bg-muted px-1.5 py-1 font-mono text-[11px]">{s.evidence[f]}</div>}
                  {(s.field_notes?.[f] || []).map((n) => (
                    <div key={n} className="mt-1">
                      {n}
                    </div>
                  ))}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {s.extracted?.ambiguity && Object.keys(s.extracted.ambiguity).length > 0 && (
        <Alert variant="warning">Ambigüedad: {Object.values(s.extracted.ambiguity).join(" · ")}</Alert>
      )}
      {(s.extracted?.phone_candidates?.length ?? 0) > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">Teléfonos candidatos ({s.extracted.phone_candidates!.length})</summary>
          <ul className="mt-1 space-y-1">
            {s.extracted.phone_candidates!.map((c) => (
              <li key={c.e164}>
                <Badge variant="outline">{c.score}</Badge> {c.value} · {c.method} — <span className="text-muted-foreground">{c.evidence}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(s.extracted?.address_candidates?.length ?? 0) > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">Direcciones candidatas ({s.extracted.address_candidates!.length})</summary>
          <ul className="mt-1 space-y-1">
            {s.extracted.address_candidates!.map((c, i) => (
              <li key={i}>
                <Badge variant="outline">{c.score}</Badge> {c.value} · {c.method}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="text-sm font-medium">Revisión manual</div>
        <div className="flex flex-wrap gap-2">
          <Select value={manual} onChange={(e) => setManual(e.target.value)} className="max-w-xs">
            <option value="">Sin modificar (automático)</option>
            {Object.entries(STATUS_LABELS)
              .filter(([k]) => k !== "NOT_APPLICABLE")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </Select>
          <Button onClick={save} size="sm" className="h-9">
            Guardar
          </Button>
        </div>
        <Textarea rows={2} placeholder="Nota del analista" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </DialogContent>
  );
}
