"""Integraciones oficiales de Google.

- Google Places API (New): datos PÚBLICOS de fichas. Requiere GOOGLE_PLACES_API_KEY.
- Google Business Profile (Business Information API): datos del propietario, SOLO con
  OAuth autorizado (GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN) y el
  location name configurado en la empresa. Nunca se hace scraping de Google Maps.
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import Settings, get_settings
from app.services.normalize.hours import parse_google_hours
from app.services.normalize.phone import normalize_phone

log = logging.getLogger(__name__)

PLACES_FIELDS = [
    "id", "displayName", "formattedAddress", "addressComponents", "nationalPhoneNumber", "internationalPhoneNumber",
    "websiteUri", "types", "primaryType", "primaryTypeDisplayName", "regularOpeningHours", "businessStatus", "googleMapsUri",
]


class IntegrationError(Exception):
    pass


class GooglePlacesClient:
    name = "google_places"

    def __init__(self, settings: Settings | None = None, transport: httpx.BaseTransport | None = None) -> None:
        self.settings = settings or get_settings()
        self.client = httpx.Client(transport=transport, timeout=20.0, trust_env=True)

    @property
    def configured(self) -> bool:
        return bool(self.settings.GOOGLE_PLACES_API_KEY)

    @property
    def cost_per_1000(self) -> float | None:
        return self.settings.GOOGLE_PLACES_COST_PER_1000

    def _headers(self, mask: list[str]) -> dict:
        return {"X-Goog-Api-Key": self.settings.GOOGLE_PLACES_API_KEY or "", "X-Goog-FieldMask": ",".join(mask),
                "Content-Type": "application/json"}

    def _check(self, resp: httpx.Response) -> dict:
        if resp.status_code in (401, 403):
            raise IntegrationError(f"Places API: sin permiso o clave no válida ({resp.status_code})")
        if resp.status_code == 429:
            raise IntegrationError("Places API: cuota agotada (429)")
        if resp.status_code == 404:
            raise IntegrationError("Places API: Place ID no encontrado (404)")
        if resp.status_code >= 400:
            raise IntegrationError(f"Places API: error {resp.status_code}: {resp.text[:200]}")
        return resp.json()

    def text_search(self, query: str, language: str = "es", region: str = "ES", page_size: int = 5) -> list[dict]:
        body = {"textQuery": query, "languageCode": language, "regionCode": region, "pageSize": page_size}
        resp = self.client.post("https://places.googleapis.com/v1/places:searchText", json=body,
                                headers=self._headers([f"places.{f}" for f in PLACES_FIELDS]))
        return self._check(resp).get("places") or []

    def details(self, place_id: str, language: str = "es") -> dict:
        resp = self.client.get(f"https://places.googleapis.com/v1/places/{place_id}", params={"languageCode": language},
                               headers=self._headers(PLACES_FIELDS))
        return self._check(resp)


def place_to_extracted(place: dict, country: str = "ES") -> tuple[dict, dict, dict]:
    """Convierte un lugar de Places API en (extracted, methods, evidence) compatibles con el comparador."""
    name = (place.get("displayName") or {}).get("text")
    phone_raw = place.get("internationalPhoneNumber") or place.get("nationalPhoneNumber")
    n = normalize_phone(phone_raw, country) if phone_raw else None
    comps = {c.get("types", [None])[0]: c.get("longText") for c in place.get("addressComponents") or [] if c.get("types")}
    extracted = {
        "name": name,
        "address": place.get("formattedAddress"),
        "postal_code": comps.get("postal_code"),
        "city": comps.get("locality"),
        "phone": n.international if n else phone_raw,
        "phone_e164": n.e164 if n else None,
        "phones_all": [n.e164] if n else [],
        "phone_candidates": [{"value": n.international, "e164": n.e164, "method": "api:google_places", "score": 1.0,
                              "evidence": f"Places API internationalPhoneNumber = {phone_raw}"}] if n else [],
        "address_candidates": [{"value": place.get("formattedAddress"), "method": "api:google_places", "score": 1.0,
                                "evidence": f"Places API formattedAddress = {place.get('formattedAddress')}"}] if place.get("formattedAddress") else [],
        "website": place.get("websiteUri"),
        "hours": parse_google_hours(place.get("regularOpeningHours")),
        "category": (place.get("primaryTypeDisplayName") or {}).get("text") or place.get("primaryType"),
        "types": place.get("types") or [],
        "business_status": place.get("businessStatus"),
        "place_id": place.get("id"),
        "maps_uri": place.get("googleMapsUri"),
        "links_to_official": False,
        "name_mentioned_literally": False,
    }
    methods = {k: "api:google_places" for k in ("name", "address", "phone", "website", "hours", "category") if extracted.get(k)}
    evidence = {
        "name": f"Places API displayName = {name}",
        "address": f"Places API formattedAddress = {place.get('formattedAddress')}",
        "phone": f"Places API internationalPhoneNumber = {phone_raw}",
        "website": f"Places API websiteUri = {place.get('websiteUri')}",
    }
    return extracted, methods, evidence


class GBPClient:
    """Google Business Profile — Business Information API (requiere OAuth del propietario o gestor)."""

    name = "google_business_profile"

    def __init__(self, settings: Settings | None = None, transport: httpx.BaseTransport | None = None) -> None:
        self.settings = settings or get_settings()
        self.client = httpx.Client(transport=transport, timeout=20.0, trust_env=True)

    @property
    def configured(self) -> bool:
        s = self.settings
        return bool(s.GBP_CLIENT_ID and s.GBP_CLIENT_SECRET and s.GBP_REFRESH_TOKEN)

    def _access_token(self) -> str:
        s = self.settings
        resp = self.client.post("https://oauth2.googleapis.com/token", data={
            "client_id": s.GBP_CLIENT_ID, "client_secret": s.GBP_CLIENT_SECRET,
            "refresh_token": s.GBP_REFRESH_TOKEN, "grant_type": "refresh_token"})
        if resp.status_code != 200:
            raise IntegrationError(f"OAuth de Google rechazado ({resp.status_code}); revise el refresh token y los permisos")
        return resp.json()["access_token"]

    def get_location(self, location_name: str) -> dict:
        token = self._access_token()
        mask = "name,title,phoneNumbers,storefrontAddress,websiteUri,categories,regularHours,serviceArea,openInfo,metadata"
        resp = self.client.get(f"https://mybusinessbusinessinformation.googleapis.com/v1/{location_name}",
                               params={"readMask": mask}, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code in (401, 403):
            raise IntegrationError("La cuenta autorizada no tiene permisos sobre esta ubicación de Business Profile")
        if resp.status_code >= 400:
            raise IntegrationError(f"Business Information API: error {resp.status_code}")
        return resp.json()


def gbp_location_to_extracted(loc: dict, country: str = "ES") -> tuple[dict, dict]:
    phones = loc.get("phoneNumbers") or {}
    primary = phones.get("primaryPhone")
    n = normalize_phone(primary, country) if primary else None
    addr = loc.get("storefrontAddress") or {}
    street = ", ".join(addr.get("addressLines") or [])
    raw_addr = ", ".join(x for x in [street, addr.get("postalCode"), addr.get("locality"), addr.get("administrativeArea")] if x)
    gdays = {"MONDAY": "Mo", "TUESDAY": "Tu", "WEDNESDAY": "We", "THURSDAY": "Th", "FRIDAY": "Fr", "SATURDAY": "Sa", "SUNDAY": "Su"}
    hours: dict[str, list[str]] = {}
    for p in (loc.get("regularHours") or {}).get("periods") or []:
        d = gdays.get(p.get("openDay"))
        o, c = p.get("openTime") or {}, p.get("closeTime") or {}
        if d:
            hours.setdefault(d, []).append(f"{o.get('hours', 0):02d}:{o.get('minutes', 0):02d}-{c.get('hours', 24):02d}:{c.get('minutes', 0):02d}")
    extracted = {
        "name": loc.get("title"),
        "address": raw_addr or None,
        "phone": n.international if n else primary,
        "phones_all": [n.e164] if n else [],
        "phone_candidates": [{"value": n.international, "e164": n.e164, "method": "api:gbp", "score": 1.0, "evidence": f"GBP primaryPhone = {primary}"}] if n else [],
        "address_candidates": [{"value": raw_addr, "method": "api:gbp", "score": 1.0, "evidence": f"GBP storefrontAddress = {raw_addr}"}] if raw_addr else [],
        "website": loc.get("websiteUri"),
        "hours": hours,
        "category": ((loc.get("categories") or {}).get("primaryCategory") or {}).get("displayName"),
        "open_status": (loc.get("openInfo") or {}).get("status"),
        "service_area": loc.get("serviceArea"),
        "links_to_official": False,
        "name_mentioned_literally": False,
    }
    methods = {k: "api:gbp" for k in ("name", "address", "phone", "website", "hours") if extracted.get(k)}
    return extracted, methods
