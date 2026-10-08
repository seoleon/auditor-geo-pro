"""Extracción de datos estructurados (JSON-LD, microdatos, Open Graph) con extruct."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

log = logging.getLogger(__name__)

ORG_TYPES = {"Organization", "Corporation", "NGO", "EducationalOrganization", "MedicalOrganization",
             "SportsOrganization", "PerformingGroup", "OnlineBusiness", "OnlineStore"}
# Subconjunto amplio de subtipos de LocalBusiness (schema.org)
LOCAL_BUSINESS_TYPES = {
    "LocalBusiness", "AnimalShelter", "ArchiveOrganization", "AutomotiveBusiness", "AutoRepair", "AutoDealer",
    "ChildCare", "Dentist", "DryCleaningOrLaundry", "EmergencyService", "EmploymentAgency", "EntertainmentBusiness",
    "FinancialService", "AccountingService", "FoodEstablishment", "Restaurant", "CafeOrCoffeeShop", "Bakery", "BarOrPub",
    "GovernmentOffice", "HealthAndBeautyBusiness", "BeautySalon", "DaySpa", "HairSalon", "HealthClub", "NailSalon",
    "TattooParlor", "HomeAndConstructionBusiness", "Electrician", "GeneralContractor", "HVACBusiness", "Locksmith",
    "MovingCompany", "Plumber", "RoofingContractor", "HousePainter", "InternetCafe", "LegalService", "Attorney", "Notary",
    "Library", "LodgingBusiness", "Hotel", "Hostel", "BedAndBreakfast", "MedicalBusiness", "MedicalClinic", "Physician",
    "Optician", "Pharmacy", "Physiotherapy", "ProfessionalService", "RadioStation", "RealEstateAgent", "RecyclingCenter",
    "SelfStorage", "ShoppingCenter", "SportsActivityLocation", "ExerciseGym", "YogaStudio" , "Store", "ClothingStore",
    "ConvenienceStore", "Florist", "FurnitureStore", "GardenStore", "HardwareStore", "JewelryStore", "PetStore",
    "ShoeStore", "SportingGoodsStore", "TelevisionStation", "TouristInformationCenter", "TravelAgency",
    "MassageTherapist", "Psychologist", "SpaOrWellness",
}
BUSINESS_TYPES = ORG_TYPES | LOCAL_BUSINESS_TYPES
OTHER_TRACKED = {"WebSite", "WebPage", "BreadcrumbList", "Service", "ContactPoint", "PostalAddress", "Place",
                 "AboutPage", "ContactPage", "Article", "NewsArticle", "BlogPosting", "FAQPage", "Person"}


def _types(entity: dict) -> list[str]:
    t = entity.get("@type") or entity.get("type") or []
    if isinstance(t, str):
        t = [t]
    out = []
    for x in t:
        if isinstance(x, str):
            out.append(re.sub(r"^https?://schema\.org/", "", x))
    return out


def _jsonld_fallback(html: str) -> list[Any]:
    """Si extruct falla, intenta leer los <script type=application/ld+json> uno a uno."""
    out: list[Any] = []
    for m in re.finditer(r'(?is)<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html):
        raw = m.group(1).strip()
        try:
            out.append(json.loads(raw))
        except json.JSONDecodeError:
            out.append({"__invalid_json__": raw[:500]})
    return out


def _microdata_to_jsonld(item: dict) -> dict:
    """Convierte la salida de microdatos de extruct a una forma tipo JSON-LD."""
    out: dict[str, Any] = {}
    t = item.get("type")
    if t:
        out["@type"] = [re.sub(r"^https?://schema\.org/", "", x) for x in (t if isinstance(t, list) else [t])]
    if item.get("id"):
        out["@id"] = item["id"]
    for k, v in (item.get("properties") or {}).items():
        if isinstance(v, dict) and "properties" in v:
            out[k] = _microdata_to_jsonld(v)
        elif isinstance(v, list):
            out[k] = [_microdata_to_jsonld(x) if isinstance(x, dict) and "properties" in x else x for x in v]
        else:
            out[k] = v
    return out


def flatten_entities(data: Any, syntax: str, out: list[dict] | None = None, depth: int = 0) -> list[dict]:
    """Recorre @graph y objetos anidados devolviendo cada entidad con @type."""
    out = out if out is not None else []
    if depth > 8:
        return out
    if isinstance(data, list):
        for x in data:
            flatten_entities(x, syntax, out, depth + 1)
    elif isinstance(data, dict):
        if "@graph" in data:
            flatten_entities(data["@graph"], syntax, out, depth + 1)
        if _types(data):
            ent = dict(data)
            ent["__syntax__"] = syntax
            ent["__nested__"] = depth > 1
            out.append(ent)
        for k, v in data.items():
            if k in ("@graph", "@context"):
                continue
            if isinstance(v, (dict, list)):
                flatten_entities(v, syntax, out, depth + 1)
    return out


def extract_structured(html: str, url: str) -> dict:
    """Devuelve {'entities': [...], 'opengraph': {...}, 'errors': [...]}."""
    errors: list[str] = []
    entities: list[dict] = []
    og: dict[str, str] = {}
    try:
        import extruct

        data = extruct.extract(html, base_url=url, syntaxes=["json-ld", "microdata", "opengraph"], uniform=False, errors="log")
        for block in data.get("json-ld", []):
            flatten_entities(block, "json-ld", entities)
        for item in data.get("microdata", []):
            flatten_entities(_microdata_to_jsonld(item), "microdata", entities)
        for item in data.get("opengraph", []):
            for k, v in item.get("properties", []):
                og.setdefault(k, v)
    except Exception as exc:  # noqa: BLE001
        log.info("extruct falló en %s: %s", url, exc)
        errors.append(f"Error al analizar datos estructurados: {type(exc).__name__}")
        for block in _jsonld_fallback(html):
            flatten_entities(block, "json-ld", entities)
    # Detecta bloques JSON-LD inválidos (extruct los omite silenciosamente)
    for block in _jsonld_fallback(html):
        if isinstance(block, dict) and "__invalid_json__" in block:
            errors.append("Bloque JSON-LD con sintaxis JSON inválida")
    for e in entities:
        e["__types__"] = _types(e)
    return {"entities": entities, "opengraph": og, "errors": errors}


def is_business_entity(entity: dict) -> bool:
    types = set(entity.get("__types__") or _types(entity))
    if types & BUSINESS_TYPES:
        return True
    # Tipos desconocidos que terminan en Business/Store/Service con datos NAP
    if any(t.endswith(("Business", "Store", "Shop", "Clinic")) for t in types) and (
        entity.get("address") or entity.get("telephone")
    ):
        return True
    return False


def first_str(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, list):
        for x in v:
            s = first_str(x)
            if s:
                return s
        return None
    if isinstance(v, dict):
        return first_str(v.get("@value") or v.get("name") or v.get("@id") or v.get("url"))
    s = str(v).strip()
    return s or None


def all_str(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        out: list[str] = []
        for x in v:
            out.extend(all_str(x))
        return out
    s = first_str(v)
    return [s] if s else []


def address_from_entity(addr: Any) -> dict | None:
    """Devuelve {'street','postal_code','locality','region','country','raw'} desde PostalAddress o texto."""
    if addr is None:
        return None
    if isinstance(addr, list):
        addr = addr[0] if addr else None
        if addr is None:
            return None
    if isinstance(addr, str):
        return {"street": addr, "postal_code": None, "locality": None, "region": None, "country": None, "raw": addr, "is_text": True}
    if isinstance(addr, dict):
        street = first_str(addr.get("streetAddress"))
        pc = first_str(addr.get("postalCode"))
        loc = first_str(addr.get("addressLocality"))
        region = first_str(addr.get("addressRegion"))
        country = first_str(addr.get("addressCountry"))
        raw = ", ".join(x for x in [street, pc, loc, region, country] if x)
        if not raw:
            return None
        return {"street": street, "postal_code": pc, "locality": loc, "region": region, "country": country, "raw": raw, "is_text": False}
    return None
