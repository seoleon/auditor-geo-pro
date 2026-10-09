"""Esquemas Pydantic de entrada y salida con validación estricta."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.services.normalize.phone import normalize_phone
from app.services.normalize.urls import ensure_scheme

DOMAIN_RE = re.compile(r"^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def _clean_url(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    v = ensure_scheme(v)
    if not re.match(r"^https?://[^\s/$.?#][^\s]*$", v, re.I) or len(v) > 1000:
        raise ValueError("URL no válida")
    return v


def _clean_list(v: list[str] | None, max_items: int = 30, max_len: int = 200) -> list[str]:
    out = []
    for x in v or []:
        x = (x or "").strip()
        if x and x not in out:
            out.append(x[:max_len])
    return out[:max_items]


class LoginIn(BaseModel):
    # Sin validación de entregabilidad: se admiten dominios internos (p. ej. admin@empresa.local)
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+$")
    password: str = Field(min_length=1, max_length=200)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)
    organization: str = Field(min_length=2, max_length=200)


class UserCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)
    role: Literal["admin", "member"] = "member"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str | None
    role: str
    organization_id: int


class ClientIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=5000)


class ClientOut(ClientIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


class SocialProfiles(BaseModel):
    facebook: str | None = None
    instagram: str | None = None
    linkedin: str | None = None
    youtube: str | None = None
    tiktok: str | None = None
    other: list[str] = Field(default_factory=list)

    @field_validator("facebook", "instagram", "linkedin", "youtube", "tiktok")
    @classmethod
    def _url(cls, v):
        return _clean_url(v)

    @field_validator("other")
    @classmethod
    def _urls(cls, v):
        return [u for u in (_clean_url(x) for x in _clean_list(v, 20, 1000)) if u]


class BusinessIn(BaseModel):
    client_id: int | None = None
    parent_business_id: int | None = None
    official_name: str = Field(min_length=2, max_length=255)
    name_variants: list[str] = Field(default_factory=list)
    domain: str = Field(min_length=4, max_length=255)
    country: str = Field(default="ES", min_length=2, max_length=2)
    city: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=120)
    sector: str | None = Field(default=None, max_length=120)
    primary_category: str | None = Field(default=None, max_length=200)
    secondary_categories: list[str] = Field(default_factory=list)
    business_type: Literal["physical", "service_area", "online", "multi_location"] = "physical"

    nap_name: str | None = Field(default=None, max_length=255)
    address_street: str | None = Field(default=None, max_length=255)
    postal_code: str | None = Field(default=None, max_length=20)
    locality: str | None = Field(default=None, max_length=120)
    nap_province: str | None = Field(default=None, max_length=120)
    nap_country: str | None = Field(default=None, max_length=2)
    phone_primary: str | None = Field(default=None, max_length=40)
    phones_secondary: list[str] = Field(default_factory=list)
    old_phones: list[str] = Field(default_factory=list)
    email: EmailStr | None = None
    website: str | None = None
    opening_hours: str | None = Field(default=None, max_length=500)
    hide_address: bool = False
    service_area: list[str] = Field(default_factory=list)

    google_maps_url: str | None = None
    place_id: str | None = Field(default=None, max_length=255)
    gbp_url: str | None = None
    gbp_location_name: str | None = Field(default=None, max_length=255)
    social_profiles: SocialProfiles = Field(default_factory=SocialProfiles)
    sector_directories: list[str] = Field(default_factory=list)
    reference_notes: str | None = Field(default=None, max_length=5000)

    audit_frequency: Literal["none", "weekly", "monthly"] = "none"
    audit_mode_default: Literal["real", "economic", "demo"] = "real"

    @field_validator("domain")
    @classmethod
    def _domain(cls, v: str) -> str:
        v = v.strip().lower()
        v = re.sub(r"^https?://", "", v).split("/")[0].removeprefix("www.")
        if not DOMAIN_RE.match(v):
            raise ValueError("Dominio no válido (ejemplo: midominio.com)")
        return v

    @field_validator("country", "nap_country")
    @classmethod
    def _country(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("Código de país ISO de 2 letras (ES, PT, FR...)")
        return v

    @field_validator("website", "google_maps_url", "gbp_url")
    @classmethod
    def _urls(cls, v):
        return _clean_url(v)

    @field_validator("sector_directories")
    @classmethod
    def _dirs(cls, v):
        return [u for u in (_clean_url(x) for x in _clean_list(v, 30, 1000)) if u]

    @field_validator("name_variants", "secondary_categories", "service_area")
    @classmethod
    def _lists(cls, v):
        return _clean_list(v)

    @field_validator("postal_code")
    @classmethod
    def _pc(cls, v):
        return v.strip() if v else None

    @field_validator("gbp_location_name")
    @classmethod
    def _loc(cls, v):
        if v and not re.fullmatch(r"locations/\d+", v.strip()):
            raise ValueError("Formato esperado: locations/1234567890")
        return v.strip() if v else None

    @model_validator(mode="after")
    def _phones(self):
        country = self.nap_country or self.country
        if self.phone_primary and not normalize_phone(self.phone_primary, country):
            raise ValueError(f"Teléfono principal no válido para {country}: {self.phone_primary}")
        for field_name in ("phones_secondary", "old_phones"):
            vals = _clean_list(getattr(self, field_name), 10, 40)
            for p in vals:
                if not normalize_phone(p, country):
                    raise ValueError(f"Teléfono no válido: {p}")
            setattr(self, field_name, vals)
        if self.postal_code and country == "ES" and not re.fullmatch(r"\d{5}", self.postal_code):
            raise ValueError("Código postal español no válido (5 dígitos)")
        return self


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int | None
    parent_business_id: int | None
    official_name: str
    name_variants: list[str]
    approved_name_variants: list[str]
    rejected_name_variants: list[str]
    domain: str
    country: str
    city: str | None
    province: str | None
    sector: str | None
    primary_category: str | None
    secondary_categories: list[str]
    business_type: str
    nap_name: str | None
    address_street: str | None
    postal_code: str | None
    locality: str | None
    nap_province: str | None
    nap_country: str | None
    phone_primary: str | None
    phones_secondary: list[str]
    old_phones: list[str]
    email: str | None
    website: str | None
    opening_hours: str | None
    hide_address: bool
    service_area: list[str]
    google_maps_url: str | None
    place_id: str | None
    gbp_url: str | None
    gbp_location_name: str | None
    social_profiles: dict
    sector_directories: list[str]
    nap_confirmed: bool
    nap_confirmed_at: datetime | None
    reference_notes: str | None
    audit_frequency: str
    audit_mode_default: str
    next_audit_at: datetime | None
    created_at: datetime
    updated_at: datetime
    last_audit: dict | None = None


class VariantDecisionIn(BaseModel):
    variant: str = Field(min_length=1, max_length=255)
    decision: Literal["approve", "reject", "remove"]


class AuditCreateIn(BaseModel):
    mode: Literal["real", "economic", "demo"] = "real"
    max_pages: int | None = Field(default=None, ge=1, le=300)
    max_queries: int | None = Field(default=None, ge=0, le=200)


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    business_id: int
    status: str
    mode: str
    trigger: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    progress: int
    current_step: str | None
    completed_steps: list[str]
    params: dict
    summary: dict
    limitations: list[str]
    error: str | None


class AuditDetailOut(AuditOut):
    nap_snapshot: dict
    schema_report: dict
    gbp_report: dict
    social_report: dict
    entity_graph: dict
    geo_report: dict
    log: list


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    audit_id: int
    url: str
    domain: str
    source_name: str | None
    source_type: str
    is_official: bool
    title: str | None
    fetch_status: str
    fetch_detail: str | None
    http_status: int | None
    fetched_at: datetime | None
    render_method: str | None
    extracted: dict
    field_status: dict
    overall_status: str
    confidence: float
    priority: str | None
    recommended_action: str | None
    manual_status: str | None
    manual_note: str | None


class SourceDetailOut(SourceOut):
    normalized_url: str
    final_url: str | None
    canonical: str | None
    snippet: str | None
    discovered_by: list
    extraction_methods: dict
    evidence: dict
    structured_data: Any
    attribution: dict
    field_notes: dict


class SourceUpdateIn(BaseModel):
    manual_status: Literal["CORRECT", "EQUIVALENT_VARIANT", "CONFIRMED_INCONSISTENCY", "POSSIBLE_INCONSISTENCY",
                           "POSSIBLE_DUPLICATE", "INCOMPLETE", "NOT_FOUND", "UNVERIFIABLE", "MANUAL_REVIEW"] | None = None
    manual_note: str | None = Field(default=None, max_length=2000)


class DuplicateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    audit_id: int
    platform: str
    members: list
    reasons: list
    warnings: list
    status: str
    note: str | None
    priority: str
    decided_at: datetime | None


class DuplicateDecisionIn(BaseModel):
    status: Literal["pending", "confirmed", "dismissed"]
    note: str | None = Field(default=None, max_length=2000)


class ActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    audit_id: int
    source_id: int | None
    priority: str
    category: str
    certainty: str
    title: str
    detail: str | None
    url: str | None
    evidence: dict
    status: str
    first_seen_audit_id: int | None


class ActionUpdateIn(BaseModel):
    status: Literal["open", "done", "dismissed"]


class AITestIn(BaseModel):
    provider: Literal["chatgpt", "gemini", "perplexity", "otro"]
    model: str | None = Field(default=None, max_length=120)
    query: str = Field(min_length=2, max_length=4000)
    response: str = Field(min_length=1, max_length=50000)
    tested_at: datetime | None = None
    cited_sources: list[str] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=5000)


class AITestRunIn(BaseModel):
    provider: Literal["chatgpt", "gemini", "perplexity"]
    query: str = Field(min_length=2, max_length=4000)


class AITestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    business_id: int
    provider: str
    model: str | None
    query: str
    response: str
    tested_at: datetime
    origin: str
    mentions: dict
    cited_sources: list
    errors_detected: list
    notes: str | None


class Page(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
