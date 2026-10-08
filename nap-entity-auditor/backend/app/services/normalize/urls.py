"""Normalización de URLs y dominios para deduplicar resultados."""
from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING_PARAMS = {
    "fbclid", "gclid", "dclid", "msclkid", "yclid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src", "_ga",
    "si", "spm", "srsltid", "hl", "trk",
}
# Sufijos públicos de dos niveles más comunes (subconjunto de la Public Suffix List)
MULTI_LEVEL_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.es", "nom.es", "org.es", "gob.es", "edu.es", "com.mx", "com.ar",
    "com.br", "com.co", "com.pe", "com.au", "co.jp", "co.nz", "com.tr", "com.cn", "co.za", "com.uy", "com.ec",
    "com.ve", "gob.mx", "com.pt", "co.in", "blogspot.com",
}


def normalize_host(host: str) -> str:
    host = (host or "").strip().lower().rstrip(".")
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError:
        pass
    if host.startswith("www."):
        host = host[4:]
    if host.startswith("m.") and host.count(".") >= 2:
        host = host[2:]
    return host


def registrable_domain(url_or_host: str) -> str:
    host = url_or_host
    if "://" in url_or_host:
        host = urlsplit(url_or_host).hostname or ""
    host = normalize_host(host.split("/")[0].split(":")[0])
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    last2 = ".".join(parts[-2:])
    if last2 in MULTI_LEVEL_SUFFIXES:
        return ".".join(parts[-3:])
    return last2


def ensure_scheme(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return url
    if "://" not in url:
        url = "https://" + url.lstrip("/")
    return url


def normalize_url(url: str) -> str:
    """Clave canónica para deduplicar: sin esquema, sin www, sin fragmento ni parámetros de seguimiento."""
    url = ensure_scheme(url)
    parts = urlsplit(url)
    host = normalize_host(parts.hostname or "")
    port = parts.port
    netloc = host if not port or port in (80, 443) else f"{host}:{port}"
    path = parts.path or "/"
    while "//" in path:
        path = path.replace("//", "/")
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    for idx in ("/index.html", "/index.php", "/index.htm"):
        if path.endswith(idx):
            path = path[: -len(idx)] or "/"
    query = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=False)
        if not k.lower().startswith("utm_") and k.lower() not in TRACKING_PARAMS
    ]
    query.sort()
    return urlunsplit(("", netloc, path, urlencode(query), "")).lstrip("/")


def same_site(url: str, domain: str) -> bool:
    return registrable_domain(url) == registrable_domain(domain)
