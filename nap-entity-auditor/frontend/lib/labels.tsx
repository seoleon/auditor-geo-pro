import { Badge } from "@/components/ui";

export const STATUS_LABELS: Record<string, string> = {
  CORRECT: "Correcto",
  EQUIVALENT_VARIANT: "Variante equivalente",
  CONFIRMED_INCONSISTENCY: "Inconsistencia confirmada",
  POSSIBLE_INCONSISTENCY: "Posible inconsistencia",
  POSSIBLE_DUPLICATE: "Posible duplicado",
  INCOMPLETE: "Datos incompletos",
  NOT_FOUND: "No encontrado",
  UNVERIFIABLE: "No verificable",
  MANUAL_REVIEW: "Revisión manual",
  NOT_APPLICABLE: "No aplica",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "violet" | "muted" | "secondary"> = {
  CORRECT: "success",
  EQUIVALENT_VARIANT: "info",
  CONFIRMED_INCONSISTENCY: "danger",
  POSSIBLE_INCONSISTENCY: "warning",
  POSSIBLE_DUPLICATE: "violet",
  INCOMPLETE: "secondary",
  NOT_FOUND: "muted",
  UNVERIFIABLE: "muted",
  MANUAL_REVIEW: "warning",
  NOT_APPLICABLE: "muted",
};

export const STATUS_COLORS: Record<string, string> = {
  CORRECT: "#059669",
  EQUIVALENT_VARIANT: "#0284c7",
  CONFIRMED_INCONSISTENCY: "#dc2626",
  POSSIBLE_INCONSISTENCY: "#d97706",
  POSSIBLE_DUPLICATE: "#7c3aed",
  INCOMPLETE: "#64748b",
  NOT_FOUND: "#94a3b8",
  UNVERIFIABLE: "#cbd5e1",
  MANUAL_REVIEW: "#f59e0b",
  NOT_APPLICABLE: "#e2e8f0",
};

export const TYPE_LABELS: Record<string, string> = {
  business_citation: "Citación empresarial",
  social_profile: "Perfil social",
  local_directory: "Directorio local",
  sector_directory: "Directorio sectorial",
  maps: "Mapas",
  editorial: "Mención editorial",
  official: "Web oficial",
  irrelevant: "Potencialmente irrelevante",
};

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  physical: "Establecimiento físico",
  service_area: "Negocio con área de servicio",
  online: "Negocio online",
  multi_location: "Empresa con varias ubicaciones",
};

export const MODE_LABELS: Record<string, string> = { real: "Real", economic: "Económico", demo: "Demo (simulado)" };

export const AUDIT_STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  running: "En curso",
  completed: "Completada",
  partial: "Parcial",
  failed: "Fallida",
};

export const FETCH_LABELS: Record<string, string> = {
  ok: "Consultada",
  api: "API oficial",
  pending: "Pendiente",
  not_fetched: "No consultada (límite)",
  http_error: "Error HTTP",
  blocked_robots: "Bloqueada por robots.txt",
  blocked_ssrf: "Bloqueada por seguridad",
  timeout: "Tiempo agotado",
  network_error: "Error de red",
  too_large: "Demasiado grande",
  unsupported_content: "No es HTML",
  access_blocked: "Acceso bloqueado / CAPTCHA",
  policy_skip: "No se rastrea (política)",
};

export const FIELD_LABELS: Record<string, string> = { name: "Nombre", address: "Dirección", phone: "Teléfono", website: "Web", hours: "Horario" };

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={STATUS_VARIANT[status] || "secondary"}>{STATUS_LABELS[status] || status}</Badge>;
}

export function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return <span className="text-muted-foreground">—</span>;
  const v = { P0: "danger", P1: "warning", P2: "info", P3: "muted" }[priority] as "danger" | "warning" | "info" | "muted";
  return <Badge variant={v}>{priority}</Badge>;
}

export function AuditStatusBadge({ status }: { status: string }) {
  const v = ({ completed: "success", partial: "warning", failed: "danger", running: "info", queued: "secondary" } as const)[status] || "secondary";
  return <Badge variant={v}>{AUDIT_STATUS_LABELS[status] || status}</Badge>;
}
