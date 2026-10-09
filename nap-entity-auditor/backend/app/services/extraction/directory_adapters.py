"""Adaptadores de selectores para directorios compatibles.

Solo deben añadirse directorios cuyas condiciones de uso permitan la consulta
automatizada. Los selectores se declaran aquí (o en DIRECTORY_ADAPTERS_FILE en JSON)
y se aplican como cuarta prioridad de extracción, después de datos estructurados,
HTML semántico y texto visible.

Formato de cada adaptador:
    {"name": "mi-directorio", "domains": ["midirectorio.es"],
     "selectors": {"name": "h1.listing-title", "phone": ".listing-phone", "address": ".listing-address"}}
"""
from __future__ import annotations

import json
import logging
import os

from bs4 import BeautifulSoup

from app.services.normalize.text import clean_ws
from app.services.normalize.urls import registrable_domain

log = logging.getLogger(__name__)

# Adaptadores incluidos. Están pensados como plantilla: los selectores de terceros
# cambian sin aviso y deben verificarse antes de usarlos en producción.
BUILTIN_ADAPTERS: list[dict] = [
    {
        "name": "ejemplo-directorio-sectorial",
        "domains": ["directorio-ejemplo.test"],
        "selectors": {"name": ".ficha h1", "phone": ".ficha .telefono", "address": ".ficha .direccion"},
    },
]


def load_adapters() -> list[dict]:
    adapters = list(BUILTIN_ADAPTERS)
    path = os.environ.get("DIRECTORY_ADAPTERS_FILE")
    if path and os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as fh:
                extra = json.load(fh)
            if isinstance(extra, list):
                adapters.extend(a for a in extra if isinstance(a, dict) and a.get("domains") and a.get("selectors"))
        except (OSError, json.JSONDecodeError) as exc:
            log.warning("No se pudo cargar %s: %s", path, exc)
    return adapters


def run_directory_adapter(url: str, soup_html: str) -> dict | None:
    domain = registrable_domain(url)
    for adapter in load_adapters():
        if domain in {registrable_domain(d) for d in adapter["domains"]}:
            soup = BeautifulSoup(soup_html, "lxml")
            out: dict = {"adapter": adapter["name"]}
            for field_name, selector in adapter["selectors"].items():
                node = soup.select_one(selector)
                if node:
                    out[field_name] = clean_ws(node.get_text(" "))
            return out
    return None
