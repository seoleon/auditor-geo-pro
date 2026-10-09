export type NapStatus =
  | "CORRECT"
  | "EQUIVALENT_VARIANT"
  | "CONFIRMED_INCONSISTENCY"
  | "POSSIBLE_INCONSISTENCY"
  | "POSSIBLE_DUPLICATE"
  | "INCOMPLETE"
  | "NOT_FOUND"
  | "UNVERIFIABLE"
  | "MANUAL_REVIEW"
  | "NOT_APPLICABLE";

export interface Client {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
}

export interface Business {
  id: number;
  client_id: number | null;
  parent_business_id: number | null;
  official_name: string;
  name_variants: string[];
  approved_name_variants: string[];
  rejected_name_variants: string[];
  domain: string;
  country: string;
  city: string | null;
  province: string | null;
  sector: string | null;
  primary_category: string | null;
  secondary_categories: string[];
  business_type: "physical" | "service_area" | "online" | "multi_location";
  nap_name: string | null;
  address_street: string | null;
  postal_code: string | null;
  locality: string | null;
  nap_province: string | null;
  nap_country: string | null;
  phone_primary: string | null;
  phones_secondary: string[];
  old_phones: string[];
  email: string | null;
  website: string | null;
  opening_hours: string | null;
  hide_address: boolean;
  service_area: string[];
  google_maps_url: string | null;
  place_id: string | null;
  gbp_url: string | null;
  gbp_location_name: string | null;
  social_profiles: { facebook?: string | null; instagram?: string | null; linkedin?: string | null; youtube?: string | null; tiktok?: string | null; other?: string[] };
  sector_directories: string[];
  nap_confirmed: boolean;
  nap_confirmed_at: string | null;
  reference_notes: string | null;
  audit_frequency: "none" | "weekly" | "monthly";
  audit_mode_default: "real" | "economic" | "demo";
  next_audit_at: string | null;
  created_at: string;
  updated_at: string;
  last_audit: { id: number; status: string; mode: string; created_at: string; progress: number; summary: Summary } | null;
}

export interface Summary {
  sources_total?: number;
  sources_fetched?: number;
  sources_unverifiable?: number;
  attributed_sources?: number;
  verified_citations?: number;
  confirmed_inconsistencies?: number;
  possible_inconsistencies?: number;
  possible_duplicate_groups?: number;
  pending_review?: number;
  nap_consistency_pct?: number | null;
  by_status?: Record<string, number>;
  by_type?: Record<string, number>;
  by_priority?: Record<string, number>;
  actions_by_priority?: Record<string, number>;
  queries?: { total: number; cached: number; errors: number };
  api_usage?: { provider: string; units: number; estimated_cost: number | null; cost_known: boolean }[];
  schema_issues?: { error: number; warning: number; info: number } | null;
  geo_signal_score?: number | null;
  compared?: boolean;
  demo?: boolean;
}

export interface Audit {
  id: number;
  business_id: number;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  mode: "real" | "economic" | "demo";
  trigger: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  progress: number;
  current_step: string | null;
  completed_steps: string[];
  params: Record<string, unknown>;
  summary: Summary;
  limitations: string[];
  error: string | null;
}

export interface SchemaIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  page_url: string;
  entity: string | null;
  evidence: string | null;
}

export interface AuditDetail extends Audit {
  nap_snapshot: Record<string, unknown>;
  schema_report: {
    pages_analyzed?: number;
    types_found?: Record<string, number>;
    entities?: { page_url: string; types: string[]; category: string; syntax: string; properties: Record<string, unknown> }[];
    issues?: SchemaIssue[];
    issue_counts?: { error: number; warning: number; info: number };
    recommendations?: string[];
    compared_with_official_nap?: boolean;
  };
  gbp_report: {
    configured?: boolean;
    source?: string;
    limitation?: string;
    error?: string;
    candidates?: { source_id: number; place_id: string; name: string }[];
    main_listing?: {
      source_id: number;
      place_id: string;
      name: string;
      address: string;
      phone: string;
      website: string;
      category: string;
      types: string[];
      hours: Record<string, string[]>;
      business_status: string;
      maps_uri: string;
      field_status: Record<string, NapStatus>;
      field_notes: Record<string, string[]>;
      category_check: { status: string; detail: string };
    } | null;
    note?: string;
    place_id_mismatch?: string;
    authorized?: boolean;
    authorized_limitation?: string;
    authorized_data?: Record<string, unknown>;
  };
  social_report: {
    profiles?: {
      url: string;
      platform: string;
      known: boolean;
      linked_from_website: boolean;
      in_same_as: boolean;
      status: string;
      fetch_status: string | null;
      nap_status: string | null;
      source_id: number | null;
      note?: string;
      status_detail?: string;
    }[];
    note?: string;
  };
  entity_graph: {
    nodes?: { id: string; type: string; label: string; official?: boolean; old?: boolean; url?: string; status?: string }[];
    edges?: { source: string; target: string; relation: string; evidence: string; source_url: string | null; status: string | null }[];
    legend?: string;
  };
  geo_report: {
    checks?: { id: string; label: string; status: "pass" | "warn" | "fail" | "unknown"; detail: string; evidence: string[] }[];
    signal_score?: number | null;
    robots_ai?: { available: boolean; bots: Record<string, boolean> };
    disclaimer?: string;
  };
  log: { t: string; msg: string }[];
}

export interface Candidate {
  value: string;
  e164?: string;
  method: string;
  score: number;
  evidence: string;
}

export interface Source {
  id: number;
  audit_id: number;
  url: string;
  domain: string;
  source_name: string | null;
  source_type: string;
  is_official: boolean;
  title: string | null;
  fetch_status: string;
  fetch_detail: string | null;
  http_status: number | null;
  fetched_at: string | null;
  render_method: string | null;
  extracted: {
    name?: string;
    address?: string;
    phone?: string;
    website?: string;
    email?: string;
    postal_code?: string;
    city?: string;
    category?: string;
    hours?: Record<string, string[]>;
    phone_candidates?: Candidate[];
    address_candidates?: Candidate[];
    name_candidates?: Candidate[];
    ambiguity?: Record<string, string>;
    demo?: boolean;
    [k: string]: unknown;
  };
  field_status: Record<string, NapStatus>;
  overall_status: NapStatus;
  confidence: number;
  priority: string | null;
  recommended_action: string | null;
  manual_status: string | null;
  manual_note: string | null;
}

export interface SourceDetail extends Source {
  normalized_url: string;
  final_url: string | null;
  canonical: string | null;
  snippet: string | null;
  discovered_by: { provider: string; kind: string; query: string | null; rank: number }[];
  extraction_methods: Record<string, string>;
  evidence: Record<string, string>;
  structured_data: { entities?: unknown[]; errors?: string[] };
  attribution: { level: string; score: number; signals: string[] };
  field_notes: Record<string, string[]>;
}

export interface DuplicateGroup {
  id: number;
  audit_id: number;
  platform: string;
  members: { source_id: number | null; url: string; name: string | null; phones: string[]; address: string | null; listing_id: string }[];
  reasons: string[];
  warnings: string[];
  status: "pending" | "confirmed" | "dismissed";
  note: string | null;
  priority: string;
  decided_at: string | null;
}

export interface Action {
  id: number;
  audit_id: number;
  source_id: number | null;
  priority: "P0" | "P1" | "P2" | "P3";
  category: string;
  certainty: "confirmed" | "hypothesis";
  title: string;
  detail: string | null;
  url: string | null;
  evidence: Record<string, unknown>;
  status: "open" | "done" | "dismissed";
  first_seen_audit_id: number | null;
}

export interface AITest {
  id: number;
  provider: string;
  model: string | null;
  query: string;
  response: string;
  tested_at: string;
  origin: string;
  mentions: { name?: boolean; variants?: string[]; official_phone?: boolean; domain?: boolean; address?: boolean; city?: boolean };
  cited_sources: string[];
  errors_detected: string[];
  notes: string | null;
}
