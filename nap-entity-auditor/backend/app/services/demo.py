"""MODO DEMO: proveedor de búsqueda y descargador SIMULADOS.

Todas las páginas se generan a partir del NAP registrado con alteraciones deliberadas
para mostrar cada tipo de hallazgo. Los dominios usan el TLD reservado `.invalid`
y todas las páginas llevan la marca «DATOS SIMULADOS». Nada de esto es información real.
"""
from __future__ import annotations

import json
import re

from app.services.discovery.providers import SearchProvider, SearchResponse, SearchResult
from app.services.fetcher import FetchResult
from app.services.normalize.phone import normalize_phone
from app.services.normalize.text import fold
from app.services.normalize.urls import ensure_scheme, registrable_domain

DEMO_MARK = "DATOS SIMULADOS — MODO DEMO"


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-") or "negocio"


def _alt_phone(official: str | None, country: str) -> str:
    n = normalize_phone(official, country) if official else None
    for cand in ("961 234 567", "960 111 222", "963 456 789"):
        c = normalize_phone(cand, "ES")
        if not n or (c and c.e164 != n.e164):
            return cand
    return "960 111 222"


def _page(title: str, body: str, jsonld: dict | None = None) -> str:
    ld = f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    return (f"<!doctype html><html lang='es'><head><meta charset='utf-8'><title>{title}</title>{ld}</head>"
            f"<body><!-- {DEMO_MARK} --><p class='demo'>{DEMO_MARK}</p>{body}</body></html>")


class DemoWorld:
    def __init__(self, snap: dict) -> None:
        self.snap = snap
        country = snap.get("nap_country") or snap.get("country") or "ES"
        self.name = snap.get("nap_name") or snap.get("official_name") or "Negocio demo"
        self.slug = _slug(self.name)
        self.phone = snap.get("phone_primary") or "612 345 678"
        self.alt_phone = _alt_phone(self.phone, country)
        self.street = snap.get("address_street") or ""
        self.pc = snap.get("postal_code") or ""
        self.city = snap.get("locality") or snap.get("city") or "Valencia"
        self.website = ensure_scheme(snap.get("website") or snap.get("domain") or "https://example.invalid")
        self.domain = registrable_domain(self.website)
        self.pages: dict[str, str] = {}
        self._build()

    def _addr_line(self, street: str | None = None, pc: str | None = None) -> str:
        parts = [street if street is not None else self.street, (pc if pc is not None else self.pc) + " " + self.city]
        return ", ".join(p.strip() for p in parts if p and p.strip())

    def _ld(self, name=None, phone=None, street=None, pc=None, url=None) -> dict:
        d = {"@context": "https://schema.org", "@type": "LocalBusiness", "name": name or self.name,
             "telephone": phone or self.phone, "url": url or self.website}
        if self.street:
            d["address"] = {"@type": "PostalAddress", "streetAddress": street if street is not None else self.street,
                            "postalCode": pc if pc is not None else self.pc, "addressLocality": self.city, "addressCountry": "ES"}
        return d

    def _build(self) -> None:
        s, n = self.slug, self.name
        abbrev = re.sub(r"(?i)^calle( de)?\s+", "C/ ", self.street) if self.street else ""
        abbrev = re.sub(r"(?i)^avenida( de)?\s+", "Avda. ", abbrev)
        wrong_number = re.sub(r"\d+", lambda m: str(int(m.group(0)) + 2), self.street, count=1) if self.street else ""
        self.results = [
            (f"https://guia-local-demo.invalid/ficha/{s}-12345", f"{n} - Guía Local", "Ficha con datos completos"),
            (f"https://directorio-empresas-demo.invalid/empresa/{s}", f"{n} en {self.city}", "Teléfono antiguo"),
            (f"https://guia-local-demo.invalid/ficha/{s}-67890", f"{n} - Guía Local", "Ficha repetida"),
            (f"https://mapas-locales-demo.invalid/place/{s}", f"{n}", "Dirección abreviada"),
            (f"https://bienestar-directorio-demo.invalid/centro/{s}", f"{n} Massage Center", "Variante de nombre"),
            (f"https://noticias-locales-demo.invalid/noticias/2025/{s}-abre-sus-puertas", f"Nuevo centro en {self.city}", "Mención"),
            ("https://otra-empresa-demo.invalid/", "Otra empresa sin relación", "Resultado irrelevante"),
            (f"https://bloqueado-demo.invalid/ficha/{s}", f"{n}", "Página con bloqueo anti-bot"),
        ]
        guide_body = (f"<h1>{n}</h1><div class='ficha'><p>{self._addr_line()}</p>"
                      f"<p>Teléfono: <a href='tel:{self.phone}'>{self.phone}</a></p><a href='{self.website}'>Web</a></div>")
        self.pages[f"https://guia-local-demo.invalid/ficha/{s}-12345"] = _page(f"{n} - Guía Local", guide_body, self._ld())
        self.pages[f"https://directorio-empresas-demo.invalid/empresa/{s}"] = _page(
            f"{n} en {self.city}",
            f"<h1>{n}</h1><p>{self._addr_line()}</p><p>Tel: <a href='tel:{self.alt_phone}'>{self.alt_phone}</a></p>",
            self._ld(phone=self.alt_phone, url=None))
        self.pages[f"https://guia-local-demo.invalid/ficha/{s}-67890"] = _page(
            f"{n} - Guía Local",
            f"<h1>{n}</h1><p>{self._addr_line(abbrev)}</p><p>Teléfono: <a href='tel:{self.phone}'>{self.phone}</a></p>",
            self._ld(street=abbrev))
        self.pages[f"https://mapas-locales-demo.invalid/place/{s}"] = _page(
            n, f"<h1>{n}</h1><address>{self._addr_line(abbrev)}</address><a href='tel:{self.phone}'>{self.phone}</a>"
               f"<a href='{self.website}'>{self.domain}</a>")
        self.pages[f"https://bienestar-directorio-demo.invalid/centro/{s}"] = _page(
            f"{n} Massage Center | Bienestar", f"<h1>{n} Massage Center</h1><p>Centro de masajes en {self.city}.</p>"
                                               f"<p>{self._addr_line(wrong_number) if wrong_number else ''}</p>")
        self.pages[f"https://noticias-locales-demo.invalid/noticias/2025/{s}-abre-sus-puertas"] = _page(
            f"Nuevo centro en {self.city}",
            f"<article><h1>Nuevo centro de bienestar en {self.city}</h1><p>El centro {n} ha inaugurado su nuevo espacio. "
            f"Más información en <a href='{self.website}'>{self.domain}</a>.</p></article>",
            {"@context": "https://schema.org", "@type": "NewsArticle", "headline": f"Nuevo centro en {self.city}"})
        self.pages["https://otra-empresa-demo.invalid/"] = _page(
            "Talleres Pérez", "<h1>Talleres Pérez</h1><p>Avenida del Puerto 100, 46023 Valencia. Tel 963 999 888</p>")
        # Web oficial simulada: portada correcta y página de contacto con un teléfono contradictorio
        home = self.website.rstrip("/") + "/"
        contact = home + "contacto"
        self.pages[home] = _page(
            n, f"<h1>{n}</h1><nav><a href='{contact}'>Contacto</a></nav><footer><p>{self._addr_line()}</p>"
               f"<a href='tel:{self.phone}'>{self.phone}</a></footer>", self._ld())
        self.pages[contact] = _page(
            f"Contacto - {n}", f"<h1>Contacto</h1><p>Llámanos: <a href='tel:{self.alt_phone}'>{self.alt_phone}</a></p>"
                               f"<address>{self._addr_line()}</address>")

    def places(self) -> list[dict]:
        n = normalize_phone(self.phone, "ES")
        base = {
            "id": "DEMO_PLACE_ID_1", "displayName": {"text": self.name},
            "formattedAddress": self._addr_line() + ", España" if self.street else f"{self.city}, España",
            "internationalPhoneNumber": n.international if n else self.phone, "websiteUri": self.website,
            "primaryType": "massage", "primaryTypeDisplayName": {"text": "Centro de masajes (demo)"},
            "businessStatus": "OPERATIONAL", "googleMapsUri": "https://google-maps-demo.invalid/?cid=1",
        }
        dup = dict(base, id="DEMO_PLACE_ID_2", googleMapsUri="https://google-maps-demo.invalid/?cid=2",
                   formattedAddress=base["formattedAddress"])
        return [base, dup]


class DemoSearchProvider(SearchProvider):
    name = "demo"
    cost_per_1000 = 0.0

    def __init__(self, world: DemoWorld) -> None:
        self.world = world

    @property
    def configured(self) -> bool:
        return True

    def _search(self, query, page, count, country, lang):
        if page > 1:
            return SearchResponse(self.name, query, page, [], False, 0)
        res = [SearchResult(u, t, sn, i + 1) for i, (u, t, sn) in enumerate(self.world.results)]
        return SearchResponse(self.name, query, page, res, False, 0)


class DemoFetcher:
    def __init__(self, world: DemoWorld) -> None:
        self.world = world

    def fetch(self, url: str) -> FetchResult:
        if "bloqueado-demo.invalid" in url:
            return FetchResult(url=url, status="access_blocked", http_status=403,
                               detail=f"Acceso denegado (simulado). {DEMO_MARK}", render_method="demo")
        key = url if url in self.world.pages else url.rstrip("/") + "/" if url.rstrip("/") + "/" in self.world.pages else url.rstrip("/")
        html = self.world.pages.get(key)
        if html is None:
            return FetchResult(url=url, status="policy_skip", detail=f"URL no simulada en modo demo. {DEMO_MARK}", render_method="demo")
        return FetchResult(url=url, status="ok", final_url=url, http_status=200, content_type="text/html", text=html,
                           detail=DEMO_MARK, render_method="demo")

    def robots_txt(self, origin: str) -> str | None:
        return "User-agent: *\nAllow: /\n\nUser-agent: CCBot\nDisallow: /\n"

    def close(self) -> None:
        pass
