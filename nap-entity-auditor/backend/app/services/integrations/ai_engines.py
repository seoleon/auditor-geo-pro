"""Registro y análisis de pruebas en buscadores/asistentes de IA.

Las pruebas pueden registrarse manualmente (copiando consulta y respuesta) o lanzarse
contra APIs oficiales si el usuario ha configurado credenciales. Una única respuesta no
permite inferir causalidad ni el funcionamiento interno de estos sistemas.
"""
from __future__ import annotations

import re

import httpx

from app.core.config import Settings, get_settings
from app.services.comparison import NapReference
from app.services.normalize.address import compare_address, find_address_candidates, parse_address
from app.services.normalize.phone import find_phone_candidates
from app.services.normalize.text import fold
from app.services.normalize.urls import registrable_domain

URL_RE = re.compile(r"https?://[^\s)\]>\"']+")


def analyze_response(text: str, ref: NapReference, cited: list[str] | None = None) -> tuple[dict, list[str], list[str]]:
    folded = fold(text)
    mentions = {
        "name": bool(ref.name and fold(ref.name) in folded),
        "variants": [v for v in ref.approved_variants + ref.unvalidated_variants if v and fold(v) in folded],
        "official_phone": False,
        "domain": bool(ref.domain and ref.domain in text.lower()),
        "address": False,
        "city": bool(ref.city and fold(ref.city) in folded),
    }
    errors: list[str] = []
    for n, _s, _e in find_phone_candidates(text, ref.country):
        if n.e164 in ref.phones:
            mentions["official_phone"] = True
        elif n.e164 in ref.old_phones:
            errors.append(f"La respuesta da un teléfono antiguo: {n.international}")
        else:
            errors.append(f"La respuesta da un teléfono que no es el oficial: {n.international}")
    if ref.address:
        for cand, _s, _e in find_address_candidates(text):
            comp = compare_address(parse_address(cand), ref.address)
            if comp and comp.status in ("CORRECT", "EQUIVALENT_VARIANT", "INCOMPLETE"):
                mentions["address"] = True
            elif comp and comp.material_differences:
                errors.append(f"Dirección distinta de la oficial: {cand} ({'; '.join(comp.material_differences)})")
    urls = list(dict.fromkeys((cited or []) + URL_RE.findall(text)))
    for u in URL_RE.findall(text):
        dom = registrable_domain(u)
        if ref.name and fold(ref.name).replace(" ", "") in dom.replace("-", "") and ref.domain and dom != ref.domain:
            errors.append(f"Enlaza a un dominio parecido pero no oficial: {dom}")
    return mentions, urls, list(dict.fromkeys(errors))


class AIEngineError(Exception):
    pass


def run_ai_query(provider: str, query: str, settings: Settings | None = None,
                 transport: httpx.BaseTransport | None = None) -> tuple[str, str, list[str]]:
    """Lanza la consulta con la API oficial configurada. Devuelve (respuesta, modelo, fuentes citadas)."""
    s = settings or get_settings()
    client = httpx.Client(transport=transport, timeout=60.0, trust_env=True)
    if provider == "chatgpt":
        if not s.OPENAI_API_KEY:
            raise AIEngineError("OPENAI_API_KEY no configurada")
        r = client.post("https://api.openai.com/v1/chat/completions",
                        headers={"Authorization": f"Bearer {s.OPENAI_API_KEY}"},
                        json={"model": s.OPENAI_MODEL, "messages": [{"role": "user", "content": query}]})
        if r.status_code >= 400:
            raise AIEngineError(f"OpenAI: error {r.status_code}")
        d = r.json()
        return d["choices"][0]["message"]["content"], d.get("model", s.OPENAI_MODEL), []
    if provider == "perplexity":
        if not s.PERPLEXITY_API_KEY:
            raise AIEngineError("PERPLEXITY_API_KEY no configurada")
        r = client.post("https://api.perplexity.ai/chat/completions",
                        headers={"Authorization": f"Bearer {s.PERPLEXITY_API_KEY}"},
                        json={"model": s.PERPLEXITY_MODEL, "messages": [{"role": "user", "content": query}]})
        if r.status_code >= 400:
            raise AIEngineError(f"Perplexity: error {r.status_code}")
        d = r.json()
        cites = d.get("citations") or [x.get("url") for x in d.get("search_results") or [] if x.get("url")]
        return d["choices"][0]["message"]["content"], d.get("model", s.PERPLEXITY_MODEL), cites
    if provider == "gemini":
        if not s.GEMINI_API_KEY:
            raise AIEngineError("GEMINI_API_KEY no configurada")
        r = client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{s.GEMINI_MODEL}:generateContent",
                        headers={"x-goog-api-key": s.GEMINI_API_KEY},
                        json={"contents": [{"parts": [{"text": query}]}]})
        if r.status_code >= 400:
            raise AIEngineError(f"Gemini: error {r.status_code}")
        d = r.json()
        parts = ((d.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
        return "".join(p.get("text", "") for p in parts), s.GEMINI_MODEL, []
    raise AIEngineError(f"Proveedor no soportado: {provider}")


def ai_providers_status(settings: Settings | None = None) -> list[dict]:
    s = settings or get_settings()
    return [
        {"name": "chatgpt", "configured": bool(s.OPENAI_API_KEY), "model": s.OPENAI_MODEL},
        {"name": "perplexity", "configured": bool(s.PERPLEXITY_API_KEY), "model": s.PERPLEXITY_MODEL},
        {"name": "gemini", "configured": bool(s.GEMINI_API_KEY), "model": s.GEMINI_MODEL},
    ]
