"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import type { AITest } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

const schema = z.object({
  provider: z.enum(["chatgpt", "gemini", "perplexity", "otro"]),
  model: z.string().max(120).optional(),
  query: z.string().min(2, "Escribe la consulta"),
  response: z.string().min(1, "Pega la respuesta obtenida"),
  cited: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function AITestsPanel({ businessId }: { businessId: number }) {
  const { data, reload } = useApi<AITest[]>(`/api/businesses/${businessId}/ai-tests`);
  const { data: providers } = useApi<{ ai: { name: string; configured: boolean; model: string }[] }>("/api/settings/providers");
  const [err, setErr] = useState<string | null>(null);
  const [runQuery, setRunQuery] = useState("");
  const [runProvider, setRunProvider] = useState("perplexity");
  const { register, handleSubmit, reset, formState } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { provider: "chatgpt" } });

  async function onSubmit(d: FormData) {
    setErr(null);
    try {
      await api(`/api/businesses/${businessId}/ai-tests`, {
        method: "POST",
        json: { provider: d.provider, model: d.model || null, query: d.query, response: d.response, notes: d.notes || null,
          cited_sources: (d.cited || "").split(/\s+/).filter((x) => x.startsWith("http")) },
      });
      reset({ provider: d.provider });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function run() {
    setErr(null);
    try {
      await api(`/api/businesses/${businessId}/ai-tests/run`, { method: "POST", json: { provider: runProvider, query: runQuery } });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function remove(id: number) {
    await api(`/api/ai-tests/${id}`, { method: "DELETE" });
    reload();
  }
  const configured = (providers?.ai || []).filter((p) => p.configured);

  return (
    <div className="space-y-4">
      <Alert>
        Registro de pruebas en buscadores y asistentes de IA. Una respuesta aislada no demuestra causalidad ni describe cómo funcionan internamente estos
        sistemas; sirve para detectar datos erróneos que conviene corregir en las fuentes.
      </Alert>
      {err && <Alert variant="danger">{err}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Registrar prueba manual</CardTitle>
          <CardDescription>Copia la consulta y la respuesta tal como las obtuviste.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Proveedor</Label>
              <Select {...register("provider")}>
                <option value="chatgpt">ChatGPT</option>
                <option value="gemini">Gemini</option>
                <option value="perplexity">Perplexity</option>
                <option value="otro">Otro</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input {...register("model")} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Consulta</Label>
              <Input {...register("query")} />
              {formState.errors.query && <p className="text-xs text-red-600">{formState.errors.query.message}</p>}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Respuesta</Label>
              <Textarea rows={5} {...register("response")} />
              {formState.errors.response && <p className="text-xs text-red-600">{formState.errors.response.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Fuentes citadas (URLs)</Label>
              <Textarea rows={5} {...register("cited")} />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={formState.isSubmitting}>
                Guardar y analizar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lanzar con API autorizada</CardTitle>
          <CardDescription>
            {configured.length
              ? `Proveedores configurados: ${configured.map((p) => `${p.name} (${p.model})`).join(", ")}`
              : "No hay APIs de IA configuradas (OPENAI_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY). Usa el registro manual."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={runProvider} onChange={(e) => setRunProvider(e.target.value)} className="max-w-[180px]">
            <option value="perplexity">Perplexity</option>
            <option value="chatgpt">ChatGPT (API)</option>
            <option value="gemini">Gemini</option>
          </Select>
          <Input value={runQuery} onChange={(e) => setRunQuery(e.target.value)} placeholder="Consulta" className="max-w-md" />
          <Button variant="outline" onClick={run} disabled={!configured.length || runQuery.length < 2}>
            Ejecutar
          </Button>
        </CardContent>
      </Card>
      {(data || []).map((t) => (
        <Card key={t.id}>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">{t.query}</CardTitle>
              <CardDescription>
                {t.provider} {t.model && `· ${t.model}`} · {fmtDate(t.tested_at)} · {t.origin === "api" ? "API" : "manual"}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(t.id)} aria-label="Eliminar">
              <Trash2 />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["name", "Nombre"],
                  ["official_phone", "Teléfono oficial"],
                  ["address", "Dirección"],
                  ["domain", "Dominio"],
                  ["city", "Ciudad"],
                ] as const
              ).map(([k, l]) => (
                <Badge key={k} variant={t.mentions[k] ? "success" : "muted"}>
                  {t.mentions[k] ? "✓" : "✗"} {l}
                </Badge>
              ))}
            </div>
            {t.errors_detected.map((e) => (
              <Alert key={e} variant="danger">
                {e}
              </Alert>
            ))}
            <details>
              <summary className="cursor-pointer text-muted-foreground">Ver respuesta y fuentes</summary>
              <p className="mt-2 whitespace-pre-wrap">{t.response}</p>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {t.cited_sources.map((u) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-primary">
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
