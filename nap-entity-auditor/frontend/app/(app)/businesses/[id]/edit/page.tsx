"use client";

import { useParams } from "next/navigation";

import { BusinessForm } from "@/components/app/business-form";
import { PageHeader } from "@/components/app/common";
import { Alert } from "@/components/ui";
import { useApi } from "@/lib/api";
import type { Business } from "@/lib/types";

export default function EditBusinessPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<Business>(`/api/businesses/${id}`);
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  return (
    <div className="space-y-6">
      <PageHeader title={`Editar: ${data.official_name}`} />
      <BusinessForm business={data} />
    </div>
  );
}
