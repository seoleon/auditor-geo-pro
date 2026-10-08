"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/app/common";
import { Alert, Badge, Button, Card, CardContent, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useApi } from "@/lib/api";
import { AuditStatusBadge, BUSINESS_TYPE_LABELS } from "@/lib/labels";
import type { Business, Client } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export default function BusinessesPage() {
  const [clientId, setClientId] = useState("");
  const [q, setQ] = useState("");
  const { data, error } = useApi<Business[]>(`/api/businesses${clientId ? `?client_id=${clientId}` : ""}`, [clientId]);
  const { data: clients } = useApi<Client[]>("/api/clients");
  const rows = (data || []).filter((b) => !q || `${b.official_name} ${b.domain} ${b.city || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas"
        description="Negocios y ubicaciones auditadas"
        actions={
          <Link href="/businesses/new">
            <Button>
              <Plus /> Nueva empresa
            </Button>
          </Link>
        }
      />
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar por nombre, dominio o ciudad" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="max-w-xs">
          <option value="">Todos los clientes</option>
          {(clients || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        <CardContent className="pt-5">
          <Table>
            <THead>
              <TR>
                <TH>Empresa</TH>
                <TH>Dominio</TH>
                <TH>Tipo</TH>
                <TH>NAP oficial</TH>
                <TH>Última auditoría</TH>
                <TH>Inconsistencias</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((b) => (
                <TR key={b.id}>
                  <TD>
                    <Link href={`/businesses/${b.id}`} className="font-medium text-primary hover:underline">
                      {b.official_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{b.city}</div>
                  </TD>
                  <TD>{b.domain}</TD>
                  <TD className="text-xs">{BUSINESS_TYPE_LABELS[b.business_type]}</TD>
                  <TD>{b.nap_confirmed ? <Badge variant="success">Confirmado</Badge> : <Badge variant="warning">Pendiente</Badge>}</TD>
                  <TD>
                    {b.last_audit ? (
                      <Link href={`/audits/${b.last_audit.id}`} className="flex items-center gap-2">
                        <AuditStatusBadge status={b.last_audit.status} />
                        <span className="text-xs text-muted-foreground">{fmtDate(b.last_audit.created_at)}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD>{b.last_audit?.summary?.confirmed_inconsistencies ?? "—"}</TD>
                </TR>
              ))}
              {!rows.length && (
                <TR>
                  <TD colSpan={6} className="text-muted-foreground">
                    No hay empresas.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
