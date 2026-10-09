"use client";

import { CheckCircle2, Pencil, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AITestsPanel } from "@/components/app/ai-tests";
import { KeyValue, PageHeader } from "@/components/app/common";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Select,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { AuditStatusBadge, BUSINESS_TYPE_LABELS, MODE_LABELS } from "@/lib/labels";
import type { Audit, Business } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

interface Detected {
  audit_id: number | null;
  note?: string;
  names: { value: string; count: number; sources: string[] }[];
  phones: { value: string; count: number; sources: string[] }[];
  addresses: { value: string; count: number; sources: string[] }[];
}

export default function BusinessPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: b, error, setData } = useApi<Business>(`/api/businesses/${id}`);
  const { data: audits, reload: reloadAudits } = useApi<Audit[]>(`/api/businesses/${id}/audits`);
  const { data: changes } = useApi<{ id: number; field: string; old_value: string | null; new_value: string | null; created_at: string }[]>(
    `/api/businesses/${id}/changes`,
  );
  const { data: detected } = useApi<Detected>(`/api/businesses/${id}/detected-nap`);
  const [mode, setMode] = useState("real");
  const [msg, setMsg] = useState<{ kind: "danger" | "success"; text: string } | null>(null);
  const [cmp, setCmp] = useState<{ old: string; new: string }>({ old: "", new: "" });

  const running = (audits || []).some((a) => a.status === "queued" || a.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reloadAudits, 2500);
    return () => clearInterval(t);
  }, [running, reloadAudits]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!b) return <p className="text-muted-foreground">Cargando…</p>;

  async function confirmNap() {
    setMsg(null);
    try {
      setData(await api<Business>(`/api/businesses/${id}/confirm-nap`, { method: "POST" }));
      setMsg({ kind: "success", text: "NAP oficial confirmado: se usará como referencia en las próximas auditorías." });
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : String(e) });
    }
  }
  async function launch() {
    setMsg(null);
    try {
      const a = await api<Audit>(`/api/businesses/${id}/audits`, { method: "POST", json: { mode } });
      reloadAudits();
      router.push(`/audits/${a.id}`);
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : String(e) });
    }
  }
  async function variant(v: string, decision: "approve" | "reject" | "remove") {
    setData(await api<Business>(`/api/businesses/${id}/variants`, { method: "POST", json: { variant: v, decision } }));
  }
  async function remove() {
    if (!confirm(`¿Eliminar ${b!.official_name} y todas sus auditorías?`)) return;
    await api(`/api/businesses/${id}`, { method: "DELETE" });
    router.push("/businesses");
  }

  const address = [b.address_street, [b.postal_code, b.locality].filter(Boolean).join(" "), b.nap_province].filter(Boolean).join(", ");
  const pendingVariants = b.name_variants.filter((v) => !b.approved_name_variants.includes(v) && !b.rejected_name_variants.includes(v));

  return (
    <div className="space-y-6">
      <PageHeader
        title={b.official_name}
        description={`${b.domain} · ${BUSINESS_TYPE_LABELS[b.business_type]}`}
        actions={
          <>
            <Link href={`/businesses/${id}/edit`}>
              <Button variant="outline">
                <Pencil /> Editar
              </Button>
            </Link>
            <Button variant="outline" onClick={remove} aria-label="Eliminar">
              <Trash2 />
            </Button>
          </>
        }
      />
      {msg && <Alert variant={msg.kind}>{msg.text}</Alert>}
      <Tabs defaultValue="nap">
        <TabsList>
          <TabsTrigger value="nap">Resumen NAP</TabsTrigger>
          <TabsTrigger value="audits">Auditorías e informes</TabsTrigger>
          <TabsTrigger value="ai">Pruebas en IA</TabsTrigger>
          <TabsTrigger value="history">Historial de cambios</TabsTrigger>
        </TabsList>

        <TabsContent value="nap" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>NAP oficial</CardTitle>
                <CardDescription>
                  {b.nap_confirmed
                    ? `Confirmado el ${fmtDate(b.nap_confirmed_at)}`
                    : "Sin confirmar: las auditorías descubren fuentes pero no comparan ni priorizan discrepancias."}
                </CardDescription>
              </div>
              {b.nap_confirmed ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Confirmado
                </Badge>
              ) : (
                <Button onClick={confirmNap}>
                  <CheckCircle2 /> Confirmar NAP oficial
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <KeyValue
                items={[
                  ["Nombre comercial", b.nap_name || b.official_name],
                  ["Dirección", b.hide_address ? `${address || "—"} (oculta al público)` : address],
                  ["Teléfono principal", b.phone_primary],
                  ["Teléfonos secundarios", b.phones_secondary.join(", ")],
                  ["Teléfonos antiguos", b.old_phones.join(", ")],
                  ["Correo", b.email],
                  ["Web", b.website],
                  ["Horario", b.opening_hours],
                  ["Categoría", [b.primary_category, ...b.secondary_categories].filter(Boolean).join(", ")],
                  ["Google Maps / Place ID", [b.google_maps_url, b.place_id].filter(Boolean).join(" · ")],
                  ["Perfiles", Object.entries(b.social_profiles || {}).filter(([k, v]) => k !== "other" && v).map(([k]) => k).join(", ")],
                  ["Auditoría periódica", b.audit_frequency === "none" ? "Bajo demanda" : `${b.audit_frequency === "weekly" ? "Semanal" : "Mensual"} · próxima ${fmtDate(b.next_audit_at)}`],
                  ["Notas", b.reference_notes],
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Variantes de nombre</CardTitle>
              <CardDescription>Ninguna variante se aprueba automáticamente. Las aprobadas cuentan como «variante equivalente»; las rechazadas, como inconsistencia.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pendingVariants.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <Badge variant="warning">Pendiente</Badge> {v}
                  <Button size="sm" variant="outline" onClick={() => variant(v, "approve")}>
                    Aprobar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => variant(v, "reject")}>
                    Rechazar
                  </Button>
                </div>
              ))}
              {b.approved_name_variants.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <Badge variant="success">Aprobada</Badge> {v}
                  <Button size="sm" variant="ghost" onClick={() => variant(v, "remove")}>
                    Quitar
                  </Button>
                </div>
              ))}
              {b.rejected_name_variants.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <Badge variant="danger">Rechazada</Badge> {v}
                  <Button size="sm" variant="ghost" onClick={() => variant(v, "remove")}>
                    Quitar
                  </Button>
                </div>
              ))}
              {!b.name_variants.length && !b.approved_name_variants.length && !b.rejected_name_variants.length && (
                <p className="text-muted-foreground">Sin variantes registradas.</p>
              )}
            </CardContent>
          </Card>

          {detected && detected.audit_id && (
            <Card>
              <CardHeader>
                <CardTitle>Datos detectados en Internet</CardTitle>
                <CardDescription>{detected.note} (auditoría #{detected.audit_id})</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
                {(["names", "phones", "addresses"] as const).map((k) => (
                  <div key={k}>
                    <div className="mb-1 font-medium">{{ names: "Nombres", phones: "Teléfonos", addresses: "Direcciones" }[k]}</div>
                    <ul className="space-y-1">
                      {detected[k].map((x) => (
                        <li key={x.value} title={x.sources.join("\n")}>
                          {x.value} <span className="text-muted-foreground">({x.count})</span>
                        </li>
                      ))}
                      {!detected[k].length && <li className="text-muted-foreground">—</li>}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="audits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nueva auditoría</CardTitle>
              <CardDescription>
                Real: proveedores configurados y páginas públicas. Económico: menos consultas y páginas, reutiliza resultados recientes. Demo: datos
                simulados claramente identificados.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <Select value={mode} onChange={(e) => setMode(e.target.value)} className="max-w-xs">
                <option value="real">Real</option>
                <option value="economic">Económico</option>
                <option value="demo">Demo (simulado)</option>
              </Select>
              <Button onClick={launch} disabled={running}>
                <Play /> {running ? "Auditoría en curso…" : "Ejecutar auditoría"}
              </Button>
              {!b.nap_confirmed && <span className="text-xs text-amber-700">NAP sin confirmar: solo descubrimiento y extracción.</span>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Fecha</TH>
                    <TH>Modo</TH>
                    <TH>Origen</TH>
                    <TH>Estado</TH>
                    <TH>Fuentes</TH>
                    <TH>Verificadas</TH>
                    <TH>Inconsist.</TH>
                    <TH>Informes</TH>
                  </TR>
                </THead>
                <TBody>
                  {(audits || []).map((a) => (
                    <TR key={a.id}>
                      <TD>
                        <Link href={`/audits/${a.id}`} className="text-primary hover:underline">
                          #{a.id}
                        </Link>
                      </TD>
                      <TD>{fmtDate(a.created_at)}</TD>
                      <TD>{MODE_LABELS[a.mode]}</TD>
                      <TD className="text-xs">{a.trigger}</TD>
                      <TD className="min-w-32">
                        <AuditStatusBadge status={a.status} />
                        {(a.status === "running" || a.status === "queued") && <Progress value={a.progress} />}
                      </TD>
                      <TD>{a.summary?.sources_total ?? "—"}</TD>
                      <TD>{a.summary?.verified_citations ?? "—"}</TD>
                      <TD>{a.summary?.confirmed_inconsistencies ?? "—"}</TD>
                      <TD className="space-x-2 text-xs">
                        {["completed", "partial", "failed"].includes(a.status) &&
                          ["csv", "xlsx", "pdf"].map((f) => (
                            <a key={f} className="text-primary hover:underline" href={`/api/audits/${a.id}/export.${f}`}>
                              {f.toUpperCase()}
                            </a>
                          ))}
                      </TD>
                    </TR>
                  ))}
                  {!audits?.length && (
                    <TR>
                      <TD colSpan={9} className="text-muted-foreground">
                        Aún no hay auditorías.
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          {(audits || []).length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Comparar auditorías</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                {(["old", "new"] as const).map((k) => (
                  <Select key={k} value={cmp[k]} onChange={(e) => setCmp({ ...cmp, [k]: e.target.value })} className="max-w-xs">
                    <option value="">{k === "old" ? "Auditoría anterior" : "Auditoría posterior"}</option>
                    {(audits || []).map((a) => (
                      <option key={a.id} value={a.id}>
                        #{a.id} · {fmtDate(a.created_at)} · {MODE_LABELS[a.mode]}
                      </option>
                    ))}
                  </Select>
                ))}
                <Link href={cmp.old && cmp.new ? `/audits/${cmp.new}?compare=${cmp.old}` : "#"}>
                  <Button variant="outline" disabled={!cmp.old || !cmp.new}>
                    Comparar
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ai">
          <AITestsPanel businessId={b.id} />
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="pt-5">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Campo</TH>
                    <TH>Antes</TH>
                    <TH>Después</TH>
                  </TR>
                </THead>
                <TBody>
                  {(changes || []).map((c) => (
                    <TR key={c.id}>
                      <TD className="whitespace-nowrap">{fmtDate(c.created_at)}</TD>
                      <TD>{c.field}</TD>
                      <TD className="max-w-xs break-words text-xs text-muted-foreground">{c.old_value}</TD>
                      <TD className="max-w-xs break-words text-xs">{c.new_value}</TD>
                    </TR>
                  ))}
                  {!changes?.length && (
                    <TR>
                      <TD colSpan={4} className="text-muted-foreground">
                        Sin cambios registrados.
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
