"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui";
import { api, ApiError, useApi } from "@/lib/api";
import { BUSINESS_TYPE_LABELS } from "@/lib/labels";
import type { Business, Client } from "@/lib/types";

const optUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => !v || /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]+$/i.test(v), "URL no válida")
  .optional();
const phoneRe = /^[+()\d\s.-]{6,25}$/;

const schema = z
  .object({
    client_id: z.string().optional(),
    official_name: z.string().trim().min(2, "Obligatorio").max(255),
    name_variants: z.string().optional(),
    domain: z.string().trim().min(4, "Obligatorio").regex(/^(https?:\/\/)?(www\.)?[a-z0-9.-]+\.[a-z]{2,}\/?$/i, "Dominio no válido (midominio.com)"),
    country: z.string().trim().length(2, "Código ISO de 2 letras"),
    city: z.string().optional(),
    province: z.string().optional(),
    sector: z.string().optional(),
    primary_category: z.string().optional(),
    secondary_categories: z.string().optional(),
    business_type: z.enum(["physical", "service_area", "online", "multi_location"]),
    nap_name: z.string().optional(),
    address_street: z.string().optional(),
    postal_code: z.string().optional(),
    locality: z.string().optional(),
    nap_province: z.string().optional(),
    phone_primary: z.string().trim().refine((v) => !v || phoneRe.test(v), "Teléfono no válido").optional(),
    phones_secondary: z.string().optional(),
    old_phones: z.string().optional(),
    email: z.string().trim().refine((v) => !v || z.string().email().safeParse(v).success, "Correo no válido").optional(),
    website: optUrl,
    opening_hours: z.string().max(500).optional(),
    hide_address: z.boolean(),
    service_area: z.string().optional(),
    google_maps_url: optUrl,
    place_id: z.string().optional(),
    gbp_url: optUrl,
    gbp_location_name: z.string().trim().refine((v) => !v || /^locations\/\d+$/.test(v), "Formato: locations/1234567890").optional(),
    facebook: optUrl,
    instagram: optUrl,
    linkedin: optUrl,
    youtube: optUrl,
    tiktok: optUrl,
    other_profiles: z.string().optional(),
    sector_directories: z.string().optional(),
    reference_notes: z.string().max(5000).optional(),
    audit_frequency: z.enum(["none", "weekly", "monthly"]),
    audit_mode_default: z.enum(["real", "economic", "demo"]),
  })
  .refine((d) => !(d.country.toUpperCase() === "ES" && d.postal_code && !/^\d{5}$/.test(d.postal_code)), {
    path: ["postal_code"],
    message: "Código postal español de 5 dígitos",
  });

type FormData = z.infer<typeof schema>;

const list = (s?: string) =>
  (s || "")
    .split(/[\n,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
const nul = (s?: string) => (s && s.trim() ? s.trim() : null);

function toDefaults(b?: Business): FormData {
  return {
    client_id: b?.client_id ? String(b.client_id) : "",
    official_name: b?.official_name || "",
    name_variants: (b?.name_variants || []).join("\n"),
    domain: b?.domain || "",
    country: b?.country || "ES",
    city: b?.city || "",
    province: b?.province || "",
    sector: b?.sector || "",
    primary_category: b?.primary_category || "",
    secondary_categories: (b?.secondary_categories || []).join(", "),
    business_type: b?.business_type || "physical",
    nap_name: b?.nap_name || "",
    address_street: b?.address_street || "",
    postal_code: b?.postal_code || "",
    locality: b?.locality || "",
    nap_province: b?.nap_province || "",
    phone_primary: b?.phone_primary || "",
    phones_secondary: (b?.phones_secondary || []).join(", "),
    old_phones: (b?.old_phones || []).join(", "),
    email: b?.email || "",
    website: b?.website || "",
    opening_hours: b?.opening_hours || "",
    hide_address: b?.hide_address || false,
    service_area: (b?.service_area || []).join(", "),
    google_maps_url: b?.google_maps_url || "",
    place_id: b?.place_id || "",
    gbp_url: b?.gbp_url || "",
    gbp_location_name: b?.gbp_location_name || "",
    facebook: b?.social_profiles?.facebook || "",
    instagram: b?.social_profiles?.instagram || "",
    linkedin: b?.social_profiles?.linkedin || "",
    youtube: b?.social_profiles?.youtube || "",
    tiktok: b?.social_profiles?.tiktok || "",
    other_profiles: (b?.social_profiles?.other || []).join("\n"),
    sector_directories: (b?.sector_directories || []).join("\n"),
    reference_notes: b?.reference_notes || "",
    audit_frequency: b?.audit_frequency || "none",
    audit_mode_default: b?.audit_mode_default || "real",
  };
}

function toPayload(d: FormData) {
  return {
    client_id: d.client_id ? Number(d.client_id) : null,
    official_name: d.official_name,
    name_variants: list(d.name_variants),
    domain: d.domain,
    country: d.country.toUpperCase(),
    city: nul(d.city),
    province: nul(d.province),
    sector: nul(d.sector),
    primary_category: nul(d.primary_category),
    secondary_categories: list(d.secondary_categories),
    business_type: d.business_type,
    nap_name: nul(d.nap_name),
    address_street: nul(d.address_street),
    postal_code: nul(d.postal_code),
    locality: nul(d.locality),
    nap_province: nul(d.nap_province),
    nap_country: d.country.toUpperCase(),
    phone_primary: nul(d.phone_primary),
    phones_secondary: list(d.phones_secondary),
    old_phones: list(d.old_phones),
    email: nul(d.email),
    website: nul(d.website),
    opening_hours: nul(d.opening_hours),
    hide_address: d.hide_address,
    service_area: list(d.service_area),
    google_maps_url: nul(d.google_maps_url),
    place_id: nul(d.place_id),
    gbp_url: nul(d.gbp_url),
    gbp_location_name: nul(d.gbp_location_name),
    social_profiles: {
      facebook: nul(d.facebook),
      instagram: nul(d.instagram),
      linkedin: nul(d.linkedin),
      youtube: nul(d.youtube),
      tiktok: nul(d.tiktok),
      other: list(d.other_profiles),
    },
    sector_directories: list(d.sector_directories),
    reference_notes: nul(d.reference_notes),
    audit_frequency: d.audit_frequency,
    audit_mode_default: d.audit_mode_default,
  };
}

function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function BusinessForm({ business }: { business?: Business }) {
  const router = useRouter();
  const { data: clients } = useApi<Client[]>("/api/clients");
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState, setError } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: toDefaults(business) });
  const e = formState.errors;
  const type = watch("business_type");

  async function onSubmit(d: FormData) {
    setServerError(null);
    try {
      const saved = await api<Business>(business ? `/api/businesses/${business.id}` : "/api/businesses", {
        method: business ? "PUT" : "POST",
        json: toPayload(d),
      });
      router.push(`/businesses/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message + (err.fields.length ? ": " + err.fields.map((f) => `${f.field || "datos"} — ${f.message}`).join("; ") : ""));
        err.fields.forEach((f) => f.field && f.field in d && setError(f.field as keyof FormData, { message: f.message }));
      } else setServerError(String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {business?.nap_confirmed && (
        <Alert variant="warning">Si modificas datos NAP, el NAP oficial dejará de estar confirmado y tendrás que confirmarlo de nuevo.</Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Nombre oficial del negocio *" error={e.official_name?.message}>
            <Input {...register("official_name")} />
          </Field>
          <Field label="Dominio principal *" error={e.domain?.message} hint="Ej.: sadhanacenter.com">
            <Input {...register("domain")} />
          </Field>
          <Field label="Cliente">
            <Select {...register("client_id")}>
              <option value="">— Sin cliente —</option>
              {(clients || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Variantes comerciales conocidas" hint="Una por línea. No se aprueban automáticamente." className="md:col-span-1">
            <Textarea rows={3} {...register("name_variants")} />
          </Field>
          <Field label="País (ISO)" error={e.country?.message}>
            <Input maxLength={2} {...register("country")} />
          </Field>
          <Field label="Tipo de empresa">
            <Select {...register("business_type")}>
              {Object.entries(BUSINESS_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ciudad">
            <Input {...register("city")} />
          </Field>
          <Field label="Provincia">
            <Input {...register("province")} />
          </Field>
          <Field label="Sector">
            <Input {...register("sector")} />
          </Field>
          <Field label="Categoría principal">
            <Input {...register("primary_category")} />
          </Field>
          <Field label="Categorías secundarias" hint="Separadas por comas" className="md:col-span-2">
            <Input {...register("secondary_categories")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos NAP oficiales</CardTitle>
          <CardDescription>
            Serán la referencia de la comparación solo después de que los confirmes en la ficha de la empresa.
            {type === "service_area" && " Para negocios con área de servicio puedes ocultar la dirección: se avisará si aparece publicada."}
            {type === "online" && " En negocios online la dirección no se compara."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Nombre comercial oficial">
            <Input {...register("nap_name")} placeholder="Si se deja vacío se usa el nombre oficial" />
          </Field>
          <Field label="Dirección" className="md:col-span-2" hint="Calle, número, piso y puerta">
            <Input {...register("address_street")} />
          </Field>
          <Field label="Código postal" error={e.postal_code?.message}>
            <Input {...register("postal_code")} />
          </Field>
          <Field label="Localidad">
            <Input {...register("locality")} />
          </Field>
          <Field label="Provincia">
            <Input {...register("nap_province")} />
          </Field>
          <Field label="Teléfono principal" error={e.phone_primary?.message}>
            <Input {...register("phone_primary")} />
          </Field>
          <Field label="Teléfonos secundarios" hint="Separados por comas">
            <Input {...register("phones_secondary")} />
          </Field>
          <Field label="Teléfonos antiguos" hint="Ayudan a detectar datos desactualizados">
            <Input {...register("old_phones")} />
          </Field>
          <Field label="Correo corporativo" error={e.email?.message}>
            <Input type="email" {...register("email")} />
          </Field>
          <Field label="Web oficial" error={e.website?.message}>
            <Input {...register("website")} placeholder="https://" />
          </Field>
          <Field label="Horario" hint="Ej.: Mo-Fr 10:00-20:00; Sa 10:00-14:00">
            <Input {...register("opening_hours")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("hide_address")} /> Ocultar la dirección al público (área de servicio)
          </label>
          <Field label="Área de servicio" hint="Localidades separadas por comas" className="md:col-span-2">
            <Input {...register("service_area")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Otros datos y perfiles</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="URL de Google Maps" error={e.google_maps_url?.message}>
            <Input {...register("google_maps_url")} />
          </Field>
          <Field label="Place ID">
            <Input {...register("place_id")} />
          </Field>
          <Field label="URL de Google Business Profile" error={e.gbp_url?.message}>
            <Input {...register("gbp_url")} />
          </Field>
          <Field label="Ubicación GBP (API autorizada)" error={e.gbp_location_name?.message} hint="locations/… — solo con OAuth configurado">
            <Input {...register("gbp_location_name")} />
          </Field>
          {(["facebook", "instagram", "linkedin", "youtube", "tiktok"] as const).map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)} error={e[k]?.message}>
              <Input {...register(k)} placeholder="https://" />
            </Field>
          ))}
          <Field label="Otros perfiles" hint="Una URL por línea">
            <Textarea rows={2} {...register("other_profiles")} />
          </Field>
          <Field label="Directorios sectoriales conocidos" hint="URLs de fichas, una por línea" className="md:col-span-2">
            <Textarea rows={2} {...register("sector_directories")} />
          </Field>
          <Field label="Notas de referencia" className="md:col-span-3">
            <Textarea rows={2} {...register("reference_notes")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auditorías periódicas</CardTitle>
          <CardDescription>Solo se ejecutan si el NAP oficial está confirmado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Frecuencia">
            <Select {...register("audit_frequency")}>
              <option value="none">Solo bajo demanda</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
            </Select>
          </Field>
          <Field label="Modo por defecto">
            <Select {...register("audit_mode_default")}>
              <option value="real">Real</option>
              <option value="economic">Económico</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {serverError && <Alert variant="danger">{serverError}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Guardando…" : business ? "Guardar cambios" : "Crear empresa"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
