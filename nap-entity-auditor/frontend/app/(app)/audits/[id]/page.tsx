"use client";

import { Download, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { ActionsPanel, ComparePanel, DuplicatesPanel, GeoPanel, GooglePanel, QueriesPanel, SchemaPanel, SocialPanel } from "@/components/app/audit-panels";
import { PriorityBars, StatusBars } from "@/components/app/charts";
import { Kpi, PageHeader } from "@/components/app/common";
import { EntityGraph } from "@/components/app/entity-graph";
import { SourcesTable } from "@/components/app/sources-table";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Progress, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { AuditStatusBadge, MODE_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { AuditDetail, Business } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

const STEP_LABELS: Record<string, string> = {
  official_site: "Analizando la web oficial",
  search: "Buscando menciones",
  seeds: "Añadiendo URLs aportadas",
  google_places: "Consultando Google Places",
  gbp: "Google Business Profile",
  fetch_extract: "Extrayendo NAP de las fuentes",
  compare: "Comparando con el NAP oficial",
  duplicates: "Detectando duplicados",
  schema: "Auditando datos estructurados",
  social: "Revisando perfiles sociales",
  graph: "Construyendo el grafo de entidad",
  geo: "Señales GEO",
  actions: "Priorizando acciones",
};

function AuditView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const compare = search.get("compare");
  const { data: a, error, reload } = useApi<AuditDetail>(`/api/audits/${id}`);
  const { data: b } = useApi<Business>(a ? `/api/businesses/${a.business_id}` : null, [a?.business_id]);
  const active = a?.status === "queued" || a?.status === "running";

  useEffect(() => {
    if (!active) return;
    const t = setInterval(reload, 2000);
    return () => clearInterval(t);
  }, [active, reload]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!a) return <p className="text-muted-foreground">Cargando…</p>;
  const s = a.summary || {};

  async function resume() {
    await api(`/api/audits/${id}/resume`, { method: "POST" });
    reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Auditoría #${a.id}${b ? ` · ${b.official_name}` : ""}`}
        description={`${MODE_LABELS[a.mode]} · ${a.trigger} · ${fmtDate(a.created_at)}${a.finished_at ? ` → ${fmtDate(a.finished_at)}` : ""}`}
        actions={
          <>
            <AuditStatusBadge status={a.status} />
            {b && (
              <Link href={`/businesses/${b.id}`}>
                <Button variant="outline" size="sm">
                  Ficha de empresa
                </Button>
              </Link>
            )}
            {["failed", "partial"].includes(a.status) && (
              <Button variant="outline" size="sm" onClick={resume}>
                <RotateCcw /> Reanudar
              </Button>
            )}
            {!active &&
              ["csv", "xlsx", "pdf"].map((f) => (
                <a key={f} href={`/api/audits/${a.id}/export.${f}`}>
                  <Button variant="outline" size="sm">
                    <Download /> {f.toUpperCase()}
                  </Button>
                </a>
              ))}
          </>
        }
      />
      {a.mode === "demo" && <Alert variant="danger">DATOS SIMULADOS — MODO DEMO. Esta auditoría no describe información real del negocio.</Alert>}
      {active && (
        <Card className="p-4">
          <div className="mb-2 text-sm">{STEP_LABELS[a.current_step || ""] || "En cola…"}</div>
          <Progress value={a.progress} />
        </Card>
      )}
      {a.error && <Alert variant="danger">Error: {a.error}</Alert>}
      {!!a.limitations?.length && (
        <Alert variant="warning">
          <div className="mb-1 font-medium">Limitaciones de esta auditoría</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {a.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Tabs defaultValue={compare ? "compare" : "summary"}>
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="sources">Citaciones</TabsTrigger>
          <TabsTrigger value="actions">Acciones</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicados</TabsTrigger>
          <TabsTrigger value="schema">Datos estructurados</TabsTrigger>
          <TabsTrigger value="social">Perfiles sociales</TabsTrigger>
          <TabsTrigger value="google">Google</TabsTrigger>
          <TabsTrigger value="graph">Grafo de entidad</TabsTrigger>
          <TabsTrigger value="geo">GEO e IA</TabsTrigger>
          <TabsTrigger value="queries">Consultas y registro</TabsTrigger>
          {compare && <TabsTrigger value="compare">Comparación</TabsTrigger>}
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Fuentes descubiertas" value={s.sources_total} />
            <Kpi label="Atribuidas al negocio" value={s.attributed_sources} />
            <Kpi label="Citaciones verificadas" value={s.verified_citations} tone="good" />
            <Kpi label="Inconsistencias confirmadas" value={s.confirmed_inconsistencies} tone="bad" />
            <Kpi label="Posibles inconsistencias" value={s.possible_inconsistencies} tone="warn" hint="hipótesis" />
            <Kpi label="Posibles duplicados" value={s.possible_duplicate_groups} tone="warn" hint="grupos" />
            <Kpi label="No verificables" value={s.sources_unverifiable} />
            <Kpi
              label="Consistencia NAP"
              value={s.nap_consistency_pct !== null && s.nap_consistency_pct !== undefined ? `${s.nap_consistency_pct} %` : "—"}
              hint="Indicador interno, no de Google"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Estado NAP de las fuentes</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBars data={s.by_status || {}} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Acciones por prioridad</CardTitle>
              </CardHeader>
              <CardContent>
                <PriorityBars data={s.actions_by_priority || {}} />
                <p className="mt-2 text-xs text-muted-foreground">P0 crítica · P1 alta · P2 media · P3 baja</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Fuentes por tipo y consumo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-2">
              <ul className="space-y-1">
                {Object.entries(s.by_type || {}).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{TYPE_LABELS[k] || k}</span> <b className="tabular-nums">{v}</b>
                  </li>
                ))}
              </ul>
              <div className="space-y-1">
                <div>
                  Consultas de búsqueda: {s.queries?.total ?? 0} ({s.queries?.cached ?? 0} desde caché, {s.queries?.errors ?? 0} con error)
                </div>
                {(s.api_usage || []).map((u) => (
                  <div key={u.provider}>
                    {u.provider}: {u.units} unidades ·{" "}
                    {u.cost_known && u.estimated_cost !== null ? `coste estimado ${u.estimated_cost.toFixed(3)} $` : "coste no configurado"}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="sources">
          <SourcesTable auditId={a.id} />
        </TabsContent>
        <TabsContent value="actions">
          <ActionsPanel auditId={a.id} />
        </TabsContent>
        <TabsContent value="duplicates">
          <DuplicatesPanel auditId={a.id} />
        </TabsContent>
        <TabsContent value="schema">
          <SchemaPanel report={a.schema_report || {}} />
        </TabsContent>
        <TabsContent value="social">
          <SocialPanel report={a.social_report || {}} />
        </TabsContent>
        <TabsContent value="google">
          <GooglePanel report={a.gbp_report || {}} />
        </TabsContent>
        <TabsContent value="graph">
          <EntityGraph graph={a.entity_graph || {}} />
        </TabsContent>
        <TabsContent value="geo">
          <GeoPanel report={a.geo_report || {}} />
        </TabsContent>
        <TabsContent value="queries">
          <QueriesPanel auditId={a.id} log={a.log || []} />
        </TabsContent>
        {compare && (
          <TabsContent value="compare">
            <ComparePanel oldId={compare} newId={a.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <AuditView />
    </Suspense>
  );
}
