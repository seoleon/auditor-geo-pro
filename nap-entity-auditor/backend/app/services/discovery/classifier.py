"""Clasificación de fuentes por tipo y cálculo de relevancia."""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from app.services.normalize.urls import registrable_domain

SOCIAL_DOMAINS = {"facebook.com", "instagram.com", "linkedin.com", "youtube.com", "tiktok.com", "twitter.com", "x.com",
                  "pinterest.com", "pinterest.es", "threads.net", "youtu.be"}
MAPS_PATTERNS = [
    re.compile(r"^https?://(www\.)?google\.[a-z.]+/maps", re.I),
    re.compile(r"^https?://maps\.google\.", re.I),
    re.compile(r"^https?://(maps\.app\.goo\.gl|goo\.gl/maps|g\.page)", re.I),
    re.compile(r"^https?://maps\.apple\.com", re.I),
    re.compile(r"^https?://(www\.)?bing\.com/maps", re.I),
    re.compile(r"^https?://(www\.)?waze\.com", re.I),
    re.compile(r"^https?://(wego\.)?here\.com", re.I),
    re.compile(r"^https?://(www\.)?openstreetmap\.org", re.I),
    re.compile(r"^https?://(business\.google\.com|search\.google\.com/local)", re.I),
]
LOCAL_DIRECTORIES = {
    "paginasamarillas.es": "Páginas Amarillas", "qdq.com": "QDQ", "cylex.es": "Cylex", "infoisinfo.es": "Infoisinfo",
    "hotfrog.es": "Hotfrog", "yelp.es": "Yelp", "yelp.com": "Yelp", "tripadvisor.es": "Tripadvisor",
    "tripadvisor.com": "Tripadvisor", "foursquare.com": "Foursquare", "11870.com": "11870", "europages.es": "Europages",
    "empresite.eleconomista.es": "Empresite", "eleconomista.es": "El Economista Empresas", "einforma.com": "eInforma",
    "axesor.es": "Axesor", "infoempresa.com": "Infoempresa", "guiaempresas.universia.es": "Guía Empresas Universia",
    "universia.es": "Universia", "iberinform.es": "Iberinform", "libreempresa.com": "LibreEmpresa",
    "cronoshare.com": "Cronoshare", "misterwhat.es": "MisterWhat", "tuugo.es": "Tuugo", "nexdu.es": "Nexdu",
    "brownbook.net": "Brownbook", "spain.kompass.com": "Kompass", "kompass.com": "Kompass", "infobel.com": "Infobel",
    "salir.com": "Salir", "vulka.es": "Vulka", "pymes.org": "Pymes.org", "opendi.es": "Opendi", "bizneo.com": "Bizneo",
    "goolzoom.com": "Goolzoom", "abctelefonos.com": "ABC Teléfonos", "guiadeempresas.es": "Guía de empresas",
    "yellowpages.com": "Yellow Pages", "trustpilot.com": "Trustpilot", "es.trustpilot.com": "Trustpilot",
}
SECTOR_DIRECTORIES = {
    "treatwell.es": "Treatwell", "booksy.com": "Booksy", "fresha.com": "Fresha", "doctoralia.es": "Doctoralia",
    "topdoctors.es": "Top Doctors", "habitissimo.es": "Habitissimo", "eltenedor.es": "TheFork", "thefork.es": "TheFork",
    "masajistas.org": "Masajistas", "yogaespana.com": "Yoga España", "bodas.net": "Bodas.net", "idealista.com": "Idealista",
    "fotocasa.es": "Fotocasa", "zankyou.es": "Zankyou", "abogados365.com": "Abogados365", "starofservice.es": "StarOfService",
    "groupon.es": "Groupon", "spafinder.com": "Spafinder", "buscoyoga.com": "BuscoYoga", "psicologos.es": "Psicólogos",
    "fisioterapia-online.com": "Fisioterapia Online", "clinicas.org": "Clínicas", "booking.com": "Booking",
    "uala.es": "Uala", "beautylicious.es": "Beautylicious", "wellnessliving.com": "WellnessLiving",
}
EDITORIAL_HINTS = re.compile(r"/(noticias?|news|blog|articulo|article|revista|magazine|actualidad|opinion|reportaje)/", re.I)
NEWS_DOMAINS = {"levante-emv.com", "lasprovincias.es", "elpais.com", "elmundo.es", "abc.es", "20minutos.es",
                "eldiario.es", "valenciaplaza.com", "lavanguardia.com", "elconfidencial.com", "europapress.es",
                "cadenaser.com", "rtve.es", "elperiodic.com", "valencianews.es", "infobae.com"}

TYPE_RELEVANCE = {
    "official": 1.0, "maps": 1.0, "local_directory": 0.8, "sector_directory": 0.75, "social_profile": 0.7,
    "business_citation": 0.6, "editorial": 0.4, "irrelevant": 0.1,
}


def classify_url(url: str, official_domain: str | None, sector_extra: list[str] | None = None) -> tuple[str, str | None]:
    """Clasificación previa (solo por URL). Devuelve (tipo, nombre de la fuente)."""
    dom = registrable_domain(url)
    host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    if official_domain and dom == registrable_domain(official_domain):
        return "official", "Web oficial"
    for rx in MAPS_PATTERNS:
        if rx.search(url):
            return "maps", "Mapas"
    if dom in SOCIAL_DOMAINS:
        return "social_profile", dom.split(".")[0].capitalize()
    extra = {registrable_domain(x) for x in (sector_extra or [])}
    for table, kind in ((SECTOR_DIRECTORIES, "sector_directory"), (LOCAL_DIRECTORIES, "local_directory")):
        if host in table:
            return kind, table[host]
        if dom in table:
            return kind, table[dom]
    if dom in extra:
        return "sector_directory", dom
    if dom in NEWS_DOMAINS or EDITORIAL_HINTS.search(urlsplit(url).path + "/"):
        return "editorial", host or dom
    return "business_citation", host or dom


def refine_type(pre_type: str, extracted: dict, attribution_level: str) -> str:
    """Ajuste tras la extracción: artículos, citaciones y resultados irrelevantes."""
    if pre_type in ("official", "maps", "social_profile", "local_directory", "sector_directory"):
        if attribution_level == "none" and pre_type not in ("official",):
            return "irrelevant" if pre_type in ("local_directory", "sector_directory") and not extracted.get("name_mentioned_literally") else pre_type
        return pre_type
    if attribution_level == "none":
        return "irrelevant"
    if extracted.get("is_article"):
        return "editorial"
    if pre_type == "editorial":
        return "editorial"
    if extracted.get("has_business_schema") or extracted.get("phone") or extracted.get("address"):
        return "business_citation"
    return "editorial" if extracted.get("name_mentioned_literally") else "irrelevant"


def priority_score(source_type: str, rank: int, hits: int) -> float:
    base = TYPE_RELEVANCE.get(source_type, 0.5)
    rank_bonus = max(0.0, (20 - min(rank, 20)) / 20) * 0.3
    return round(base + rank_bonus + min(hits, 5) * 0.08, 3)
