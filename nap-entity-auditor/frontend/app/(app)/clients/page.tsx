"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PageHeader } from "@/components/app/common";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import type { Business, Client } from "@/lib/types";

const schema = z.object({ name: z.string().min(1, "Obligatorio").max(200), notes: z.string().max(5000).optional() });
type FormData = z.infer<typeof schema>;

export default function ClientsPage() {
  const { data: clients, reload, error } = useApi<Client[]>("/api/clients");
  const { data: businesses } = useApi<Business[]>("/api/businesses");
  const { register, handleSubmit, reset, formState } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(d: FormData) {
    await api("/api/clients", { method: "POST", json: d });
    reset();
    reload();
  }
  async function remove(id: number) {
    if (!confirm("¿Eliminar el cliente? Sus empresas quedarán sin cliente asignado.")) return;
    await api(`/api/clients/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Agrupa empresas y proyectos por cliente" />
      {error && <Alert variant="danger">{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Nuevo cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap gap-2">
            <Input placeholder="Nombre del cliente" className="max-w-xs" {...register("name")} />
            <Input placeholder="Notas (opcional)" className="max-w-md" {...register("notes")} />
            <Button type="submit" disabled={formState.isSubmitting}>
              Añadir
            </Button>
          </form>
          {formState.errors.name && <p className="mt-1 text-xs text-red-600">{formState.errors.name.message}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Empresas</TH>
                <TH>Notas</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(clients || []).map((c) => {
                const own = (businesses || []).filter((b) => b.client_id === c.id);
                return (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD>
                      {own.map((b) => (
                        <Link key={b.id} href={`/businesses/${b.id}`} className="mr-2 text-primary hover:underline">
                          {b.official_name}
                        </Link>
                      ))}
                      {!own.length && <span className="text-muted-foreground">—</span>}
                    </TD>
                    <TD className="text-muted-foreground">{c.notes}</TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove(c.id)} aria-label="Eliminar">
                        <Trash2 />
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
