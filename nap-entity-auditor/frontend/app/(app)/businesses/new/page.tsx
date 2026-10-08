"use client";

import { BusinessForm } from "@/components/app/business-form";
import { PageHeader } from "@/components/app/common";

export default function NewBusinessPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Alta de empresa" description="Datos oficiales del negocio. Deberás confirmar el NAP antes de usarlo como referencia." />
      <BusinessForm />
    </div>
  );
}
