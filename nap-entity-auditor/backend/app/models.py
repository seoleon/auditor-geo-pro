"""Modelo de datos. Toda entidad de negocio lleva organization_id para aislar clientes."""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class BusinessType(str, enum.Enum):
    physical = "physical"  # Establecimiento físico
    service_area = "service_area"  # Negocio con área de servicio
    online = "online"  # Negocio online
    multi_location = "multi_location"  # Empresa con varias ubicaciones


class NapStatus(str, enum.Enum):
    CORRECT = "CORRECT"
    EQUIVALENT_VARIANT = "EQUIVALENT_VARIANT"
    CONFIRMED_INCONSISTENCY = "CONFIRMED_INCONSISTENCY"
    POSSIBLE_INCONSISTENCY = "POSSIBLE_INCONSISTENCY"
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE"
    INCOMPLETE = "INCOMPLETE"
    NOT_FOUND = "NOT_FOUND"
    UNVERIFIABLE = "UNVERIFIABLE"
    MANUAL_REVIEW = "MANUAL_REVIEW"
    NOT_APPLICABLE = "NOT_APPLICABLE"


STATUS_LABELS_ES = {
    "CORRECT": "CORRECTO",
    "EQUIVALENT_VARIANT": "VARIANTE EQUIVALENTE",
    "CONFIRMED_INCONSISTENCY": "INCONSISTENCIA CONFIRMADA",
    "POSSIBLE_INCONSISTENCY": "POSIBLE INCONSISTENCIA",
    "POSSIBLE_DUPLICATE": "POSIBLE DUPLICADO",
    "INCOMPLETE": "DATOS INCOMPLETOS",
    "NOT_FOUND": "NO ENCONTRADO",
    "UNVERIFIABLE": "NO VERIFICABLE",
    "MANUAL_REVIEW": "REVISIÓN MANUAL",
    "NOT_APPLICABLE": "NO APLICA",
}


class SourceType(str, enum.Enum):
    business_citation = "business_citation"
    social_profile = "social_profile"
    local_directory = "local_directory"
    sector_directory = "sector_directory"
    maps = "maps"
    editorial = "editorial"
    official = "official"
    irrelevant = "irrelevant"


SOURCE_TYPE_LABELS_ES = {
    "business_citation": "Citación empresarial",
    "social_profile": "Perfil social",
    "local_directory": "Directorio local",
    "sector_directory": "Directorio sectorial",
    "maps": "Página de mapas",
    "editorial": "Artículo o mención editorial",
    "official": "Web oficial",
    "irrelevant": "Potencialmente irrelevante",
}


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="admin")  # admin | member
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    organization: Mapped[Organization] = relationship()


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Business(Base):
    __tablename__ = "businesses"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)
    parent_business_id: Mapped[int | None] = mapped_column(ForeignKey("businesses.id", ondelete="SET NULL"))

    # Datos generales
    official_name: Mapped[str] = mapped_column(String(255))
    name_variants: Mapped[list] = mapped_column(JSON, default=list)  # variantes comerciales conocidas (sin validar)
    approved_name_variants: Mapped[list] = mapped_column(JSON, default=list)  # validadas por el usuario
    rejected_name_variants: Mapped[list] = mapped_column(JSON, default=list)  # nombres antiguos/erróneos
    domain: Mapped[str] = mapped_column(String(255))
    country: Mapped[str] = mapped_column(String(2), default="ES")
    city: Mapped[str | None] = mapped_column(String(120))
    province: Mapped[str | None] = mapped_column(String(120))
    sector: Mapped[str | None] = mapped_column(String(120))
    primary_category: Mapped[str | None] = mapped_column(String(200))
    secondary_categories: Mapped[list] = mapped_column(JSON, default=list)
    business_type: Mapped[str] = mapped_column(String(30), default=BusinessType.physical.value)

    # NAP oficial
    nap_name: Mapped[str | None] = mapped_column(String(255))
    address_street: Mapped[str | None] = mapped_column(String(255))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    locality: Mapped[str | None] = mapped_column(String(120))
    nap_province: Mapped[str | None] = mapped_column(String(120))
    nap_country: Mapped[str | None] = mapped_column(String(2))
    phone_primary: Mapped[str | None] = mapped_column(String(40))
    phones_secondary: Mapped[list] = mapped_column(JSON, default=list)
    old_phones: Mapped[list] = mapped_column(JSON, default=list)  # teléfonos antiguos conocidos
    email: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(500))
    opening_hours: Mapped[str | None] = mapped_column(String(500))  # "Mo-Fr 10:00-20:00; Sa 10:00-14:00"
    hide_address: Mapped[bool] = mapped_column(Boolean, default=False)
    service_area: Mapped[list] = mapped_column(JSON, default=list)

    # Otros datos
    google_maps_url: Mapped[str | None] = mapped_column(String(1000))
    place_id: Mapped[str | None] = mapped_column(String(255))
    gbp_url: Mapped[str | None] = mapped_column(String(1000))
    gbp_location_name: Mapped[str | None] = mapped_column(String(255))  # "locations/123" (API GBP)
    social_profiles: Mapped[dict] = mapped_column(JSON, default=dict)  # {facebook, instagram, linkedin, youtube, tiktok, other: []}
    sector_directories: Mapped[list] = mapped_column(JSON, default=list)  # URLs de directorios sectoriales conocidos

    # Confirmación del NAP oficial
    nap_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    nap_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    nap_confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reference_notes: Mapped[str | None] = mapped_column(Text)

    # Auditorías periódicas
    audit_frequency: Mapped[str] = mapped_column(String(20), default="none")  # none | weekly | monthly
    audit_mode_default: Mapped[str] = mapped_column(String(20), default="real")
    next_audit_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class BusinessChange(Base):
    """Historial de modificaciones de los datos oficiales."""

    __tablename__ = "business_changes"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    field: Mapped[str] = mapped_column(String(80))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Audit(Base):
    __tablename__ = "audits"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|running|completed|partial|failed
    mode: Mapped[str] = mapped_column(String(20), default="real")  # demo|real|economic
    trigger: Mapped[str] = mapped_column(String(20), default="manual")  # manual|weekly|monthly|resume
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    current_step: Mapped[str | None] = mapped_column(String(80))
    completed_steps: Mapped[list] = mapped_column(JSON, default=list)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    nap_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    schema_report: Mapped[dict] = mapped_column(JSON, default=dict)
    gbp_report: Mapped[dict] = mapped_column(JSON, default=dict)
    social_report: Mapped[dict] = mapped_column(JSON, default=dict)
    entity_graph: Mapped[dict] = mapped_column(JSON, default=dict)
    geo_report: Mapped[dict] = mapped_column(JSON, default=dict)
    limitations: Mapped[list] = mapped_column(JSON, default=list)
    log: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text)

    sources: Mapped[list["Source"]] = relationship(back_populates="audit", cascade="all, delete-orphan")


class SearchQuery(Base):
    __tablename__ = "search_queries"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(40))
    query: Mapped[str] = mapped_column(String(500))
    kind: Mapped[str] = mapped_column(String(40))
    page: Mapped[int] = mapped_column(Integer, default=1)
    results_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="ok")  # ok|error|cached|skipped_budget
    cached: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Source(Base):
    __tablename__ = "sources"
    __table_args__ = (UniqueConstraint("audit_id", "normalized_url", name="uq_source_audit_url"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(2000))
    normalized_url: Mapped[str] = mapped_column(String(2000))
    domain: Mapped[str] = mapped_column(String(255), index=True)
    source_name: Mapped[str | None] = mapped_column(String(255))
    source_type: Mapped[str] = mapped_column(String(30), default=SourceType.business_citation.value)
    discovered_by: Mapped[list] = mapped_column(JSON, default=list)  # [{provider, query, rank, kind}]
    title: Mapped[str | None] = mapped_column(String(1000))
    snippet: Mapped[str | None] = mapped_column(Text)
    priority_score: Mapped[float] = mapped_column(Float, default=0)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)

    fetch_status: Mapped[str] = mapped_column(String(30), default="pending")
    fetch_detail: Mapped[str | None] = mapped_column(Text)
    http_status: Mapped[int | None] = mapped_column(Integer)
    final_url: Mapped[str | None] = mapped_column(String(2000))
    canonical: Mapped[str | None] = mapped_column(String(2000))
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)
    render_method: Mapped[str | None] = mapped_column(String(20))

    extracted: Mapped[dict] = mapped_column(JSON, default=dict)
    extraction_methods: Mapped[dict] = mapped_column(JSON, default=dict)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    structured_data: Mapped[list] = mapped_column(JSON, default=list)
    attribution: Mapped[dict] = mapped_column(JSON, default=dict)

    field_status: Mapped[dict] = mapped_column(JSON, default=dict)
    field_notes: Mapped[dict] = mapped_column(JSON, default=dict)
    overall_status: Mapped[str] = mapped_column(String(30), default=NapStatus.UNVERIFIABLE.value)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    priority: Mapped[str | None] = mapped_column(String(4))
    recommended_action: Mapped[str | None] = mapped_column(Text)
    manual_status: Mapped[str | None] = mapped_column(String(30))  # override manual del analista
    manual_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    audit: Mapped[Audit] = relationship(back_populates="sources")


class DuplicateGroup(Base):
    __tablename__ = "duplicate_groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    platform: Mapped[str] = mapped_column(String(255))
    members: Mapped[list] = mapped_column(JSON, default=list)  # [{source_id, url, name, phone, address, listing_id}]
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|confirmed|dismissed
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)
    note: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(4), default="P1")


class Action(Base):
    __tablename__ = "actions"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("sources.id", ondelete="SET NULL"))
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    priority: Mapped[str] = mapped_column(String(4))
    category: Mapped[str] = mapped_column(String(40))  # nap|duplicate|schema|gbp|social|geo
    certainty: Mapped[str] = mapped_column(String(20), default="confirmed")  # confirmed|hypothesis
    title: Mapped[str] = mapped_column(String(500))
    detail: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(2000))
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open|done|dismissed
    first_seen_audit_id: Mapped[int | None] = mapped_column(Integer)


class AITest(Base):
    __tablename__ = "ai_tests"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(40))  # chatgpt|gemini|perplexity|otro
    model: Mapped[str | None] = mapped_column(String(120))
    query: Mapped[str] = mapped_column(Text)
    response: Mapped[str] = mapped_column(Text)
    tested_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    origin: Mapped[str] = mapped_column(String(20), default="manual")  # manual|api
    mentions: Mapped[dict] = mapped_column(JSON, default=dict)
    cited_sources: Mapped[list] = mapped_column(JSON, default=list)
    errors_detected: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class ApiUsage(Base):
    __tablename__ = "api_usage"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    audit_id: Mapped[int | None] = mapped_column(ForeignKey("audits.id", ondelete="SET NULL"), index=True)
    provider: Mapped[str] = mapped_column(String(40), index=True)
    units: Mapped[int] = mapped_column(Integer, default=1)
    estimated_cost: Mapped[float | None] = mapped_column(Float)
    cost_known: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class CacheEntry(Base):
    __tablename__ = "cache_entries"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    namespace: Mapped[str] = mapped_column(String(40), index=True)
    value: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
