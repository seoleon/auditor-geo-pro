"use client";

import Link from "next/link";

import { HistoryLines } from "@/components/app/charts";
import { Kpi, PageHeader } from "@/components/app/common";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useApi } from "@/lib/api";
import { AuditStatusBadge, MODE_LABELS } from "@/lib/labels";
import type { Summary } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

interface Dashboard {
  businesses: number;
  audits: number;
  demo_audits: number;
  totals: Record<string, number>;
  history: { audit_id: number; date: string; verified: number; confirmed_inconsistencies: number; mode: string }[];
  recent: { id: number; business: string; business_id: number; status: string; mode: string; progress: number; created_at: string; summary: Summary }[];
  note: string;
}

export default function DashboardPage() {
  const { data, error } = useApi<Dashboard>("/api/dashboard");
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  const t = data.totals;
  return (
    <div className="space-y-6">
      <PageHeader title="Panel" description="Resumen de la última auditoría finalizada de cada empresa" />
      {data.demo_audits > 0 && (
        <Alert variant="warning">Hay {data.demo_audits} auditorías en modo demo: sus datos son simulados y se identifican como tales.</Alert>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Empresas auditadas" value={data.businesses} />
        <Kpi label="Auditorías realizadas" value={data.audits} />
        <Kpi label="Fuentes descubiertas" value={t.sources_total ?? 0} />
        <Kpi label="Citaciones verificadas" value={t.verified_citations ?? 0} tone="good" />
        <Kpi label="Inconsistencias confirmadas" value={t.confirmed_inconsistencies ?? 0} tone="bad" />
        <Kpi label="Posibles duplicados" value={t.possible_duplicate_groups ?? 0} tone="warn" hint="grupos" />
        <Kpi label="Pendientes de revisión" value={t.pending_review ?? 0} tone="warn" />
        <Kpi label="No verificables" value={t.sources_unverifiable ?? 0} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Evolución histórica</CardTitle>
          <CardDescription>Citaciones verificadas e inconsistencias confirmadas por auditoría</CardDescription>
        </CardHeader>
        <CardContent>
          <HistoryLines data={data.history} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Auditorías recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Empresa</TH>
                <TH>Modo</TH>
                <TH>Estado</TH>
                <TH>Fuentes</TH>
                <TH>Inconsistencias</TH>
                <TH>Fecha</TH>
              </TR>
            </THead>
            <TBody>
              {data.recent.map((a) => (
                <TR key={a.id}>
                  <TD>
                    <Link className="text-primary hover:underline" href={`/audits/${a.id}`}>
                      #{a.id}
                    </Link>
                  </TD>
                  <TD>
                    <Link className="hover:underline" href={`/businesses/${a.business_id}`}>
                      {a.business}
                    </Link>
                  </TD>
                  <TD>{MODE_LABELS[a.mode]}</TD>
                  <TD>
                    <AuditStatusBadge status={a.status} />
                  </TD>
                  <TD>{a.summary?.sources_total ?? "—"}</TD>
                  <TD>{a.summary?.confirmed_inconsistencies ?? "—"}</TD>
                  <TD>{fmtDate(a.created_at)}</TD>
                </TR>
              ))}
              {!data.recent.length && (
                <TR>
                  <TD colSpan={7} className="text-muted-foreground">
                    Sin auditorías. <Link href="/businesses/new" className="text-primary underline">Da de alta una empresa</Link> para empezar.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{data.note} Las puntuaciones son internas y no son factores de ranking de Google.</p>
    </div>
  );
}
