"use client";

import { PageHeader } from "@/components/app/common";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useApi } from "@/lib/api";

interface Providers {
  search: { name: string; configured: boolean; cost_per_1000: number | null }[];
  google_places: { configured: boolean; cost_per_1000: number | null };
  google_business_profile: { configured: boolean };
  ai: { name: string; configured: boolean; model: string }[];
  task_backend: string;
  playwright_enabled: boolean;
  limits: Record<string, number>;
  note: string;
}
interface Usage {
  month: { provider: string; units: number; estimated_cost: number | null; cost_known: boolean }[];
  note: string;
}

const ENV: Record<string, string> = {
  brave: "BRAVE_API_KEY",
  serpapi: "SERPAPI_API_KEY",
  google_cse: "GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX",
  searxng: "SEARXNG_URL",
  chatgpt: "OPENAI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  gemini: "GEMINI_API_KEY",
};

function Status({ ok }: { ok: boolean }) {
  return ok ? <Badge variant="success">Configurado</Badge> : <Badge variant="muted">No configurado</Badge>;
}

export default function SettingsPage() {
  const { data: p, error } = useApi<Providers>("/api/settings/providers");
  const { data: u } = useApi<Usage>("/api/settings/usage");
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!p) return <p className="text-muted-foreground">Cargando…</p>;
  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Estado de proveedores, límites y consumo. Las claves se configuran en el servidor (.env)." />
      <Alert>{p.note}</Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Búsqueda web</CardTitle>
            <CardDescription>Se usan en el orden de SEARCH_PROVIDERS, con reserva automática si uno falla.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Proveedor</TH>
                  <TH>Variable</TH>
                  <TH>Estado</TH>
                  <TH>Coste / 1000</TH>
                </TR>
              </THead>
              <TBody>
                {p.search.map((s) => (
                  <TR key={s.name}>
                    <TD>{s.name}</TD>
                    <TD className="font-mono text-xs">{ENV[s.name]}</TD>
                    <TD>
                      <Status ok={s.configured} />
                    </TD>
                    <TD>{s.cost_per_1000 ?? "desconocido"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Google e IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Google Places API (GOOGLE_PLACES_API_KEY)</span> <Status ok={p.google_places.configured} />
            </div>
            <div className="flex justify-between">
              <span>Business Profile OAuth (GBP_*)</span> <Status ok={p.google_business_profile.configured} />
            </div>
            {p.ai.map((a) => (
              <div key={a.name} className="flex justify-between">
                <span>
                  {a.name} ({ENV[a.name]}, {a.model})
                </span>{" "}
                <Status ok={a.configured} />
              </div>
            ))}
            <div className="flex justify-between">
              <span>Renderizado Playwright</span> <Status ok={p.playwright_enabled} />
            </div>
            <div className="flex justify-between">
              <span>Sistema de trabajos</span> <Badge variant="secondary">{p.task_backend}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Límites (modo económico entre paréntesis)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              <li>
                Consultas por auditoría: {p.limits.max_queries_per_audit} ({p.limits.economic_max_queries})
              </li>
              <li>
                Páginas por auditoría: {p.limits.max_pages_per_audit} ({p.limits.economic_max_pages})
              </li>
              <li>Límite mensual por proveedor: {p.limits.monthly_query_limit_per_provider} consultas</li>
              <li>Caché de búsquedas: {p.limits.cache_ttl_hours} h</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Consumo del mes</CardTitle>
            <CardDescription>{u?.note}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Proveedor</TH>
                  <TH>Unidades</TH>
                  <TH>Coste estimado</TH>
                </TR>
              </THead>
              <TBody>
                {(u?.month || []).map((m) => (
                  <TR key={m.provider}>
                    <TD>{m.provider}</TD>
                    <TD>{m.units}</TD>
                    <TD>{m.cost_known && m.estimated_cost !== null ? `${m.estimated_cost.toFixed(3)} $` : "desconocido"}</TD>
                  </TR>
                ))}
                {!u?.month.length && (
                  <TR>
                    <TD colSpan={3} className="text-muted-foreground">
                      Sin consumo este mes.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
