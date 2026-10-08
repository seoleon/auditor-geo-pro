"""Descarga segura de páginas públicas.

- Valida cada URL y cada redirección contra SSRF (solo IPs públicas, puertos permitidos).
- Fija la IP resuelta en la conexión (anti DNS-rebinding) cuando no hay proxy de salida.
- Limita tamaño, tiempo y tipo de contenido.
- Respeta robots.txt y espacia las peticiones a un mismo host.
- Nunca intenta saltarse CAPTCHA, muros de login ni bloqueos: los clasifica como no verificables.
"""
from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx

from app.core.config import get_settings
from app.core.ssrf import Resolver, UnsafeURLError, validate_url

log = logging.getLogger(__name__)

HTML_TYPES = ("text/html", "application/xhtml+xml")

POLICY_SKIP_PATTERNS = [
    (re.compile(r"^https?://(www\.)?google\.[a-z.]+/maps", re.I), "Google Maps no se rastrea: los datos se obtienen con Google Places API"),
    (re.compile(r"^https?://maps\.google\.", re.I), "Google Maps no se rastrea: los datos se obtienen con Google Places API"),
    (re.compile(r"^https?://(maps\.app\.goo\.gl|goo\.gl/maps|g\.page|g\.co/kgs)", re.I), "Enlace de Google Maps: se consulta con Google Places API"),
    (re.compile(r"^https?://(business\.google\.com|search\.google\.com/local)", re.I), "Google Business Profile solo se consulta mediante API oficial autorizada"),
    (re.compile(r"^https?://(www\.)?google\.[a-z.]+/search", re.I), "Las páginas de resultados de Google no se rastrean"),
]

BLOCK_MARKERS = [
    "g-recaptcha", "h-captcha", "hcaptcha.com", "cf-challenge", "challenge-platform", "cf_chl_",
    "attention required! | cloudflare", "are you a robot", "px-captcha", "captcha-delivery", "datadome",
    "verifica que eres humano", "comprueba que no eres un robot", "unusual traffic",
]
LOGIN_WALL_PATH = re.compile(r"/(login|signin|sign-in|accounts/login|authwall|checkpoint|uas/login)", re.I)


@dataclass
class FetchResult:
    url: str
    status: str  # ok|http_error|blocked_robots|blocked_ssrf|timeout|network_error|too_large|unsupported_content|access_blocked|policy_skip
    final_url: str | None = None
    http_status: int | None = None
    content_type: str | None = None
    text: str = ""
    detail: str | None = None
    redirects: list[str] = field(default_factory=list)
    render_method: str = "httpx"
    elapsed_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.status == "ok"


class SafeFetcher:
    def __init__(
        self,
        resolver: Resolver | None = None,
        transport: httpx.BaseTransport | None = None,
        respect_robots: bool | None = None,
        per_host_delay: float | None = None,
        pin_ip: bool | None = None,
    ) -> None:
        s = get_settings()
        self.settings = s
        self.resolver = resolver
        self.respect_robots = s.CRAWLER_RESPECT_ROBOTS if respect_robots is None else respect_robots
        self.per_host_delay = s.CRAWLER_PER_HOST_DELAY_SECONDS if per_host_delay is None else per_host_delay
        use_proxy = s.CRAWLER_USE_ENV_PROXY
        self.pin_ip = (not use_proxy) if pin_ip is None else pin_ip
        if transport is not None:
            self.pin_ip = False if pin_ip is None else pin_ip
        self.client = httpx.Client(
            transport=transport,
            timeout=httpx.Timeout(s.CRAWLER_TIMEOUT_SECONDS, connect=min(10.0, s.CRAWLER_TIMEOUT_SECONDS)),
            follow_redirects=False,
            trust_env=use_proxy,
            headers={
                "User-Agent": s.CRAWLER_USER_AGENT,
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.6",
            },
        )
        self._robots: dict[str, RobotFileParser | None] = {}
        self._last_hit: dict[str, float] = {}
        self._lock = threading.Lock()

    def close(self) -> None:
        self.client.close()

    # ----------------------------------------------------------------- helpers
    def _throttle(self, host: str) -> None:
        if self.per_host_delay <= 0:
            return
        with self._lock:
            last = self._last_hit.get(host, 0.0)
            wait = last + self.per_host_delay - time.monotonic()
            self._last_hit[host] = max(time.monotonic(), last + self.per_host_delay)
        if wait > 0:
            time.sleep(wait)

    def _raw_get(self, url: str, max_bytes: int) -> tuple[httpx.Response, bytes, bool]:
        host, port, ips = validate_url(url, self.resolver)
        self._throttle(host)
        parts = urlsplit(url)
        request_url = url
        headers = {}
        extensions = {}
        if self.pin_ip:
            ip = ips[0]
            ip_host = f"[{ip}]" if ":" in ip else ip
            default_port = 443 if parts.scheme == "https" else 80
            netloc = ip_host if port == default_port else f"{ip_host}:{port}"
            request_url = urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))
            headers["Host"] = parts.netloc.split("@")[-1]
            if parts.scheme == "https":
                extensions["sni_hostname"] = host
        req = self.client.build_request("GET", request_url, headers=headers, extensions=extensions)
        resp = self.client.send(req, stream=True)
        try:
            chunks: list[bytes] = []
            total = 0
            truncated = False
            for chunk in resp.iter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    truncated = True
                    break
                chunks.append(chunk)
        finally:
            resp.close()
        return resp, b"".join(chunks), truncated

    # ------------------------------------------------------------------ robots
    def allowed_by_robots(self, url: str) -> tuple[bool, str | None]:
        if not self.respect_robots:
            return True, None
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._robots:
            rp: RobotFileParser | None = RobotFileParser()
            try:
                resp, body, _ = self._raw_get(origin + "/robots.txt", 500_000)
                if resp.status_code >= 500:
                    rp = None  # RFC 9309: servidor no disponible => se asume prohibido
                elif resp.status_code >= 400:
                    rp.parse([])  # sin robots.txt => permitido
                else:
                    rp.parse(body.decode("utf-8", "replace").splitlines())
            except UnsafeURLError:
                raise
            except Exception:  # noqa: BLE001 - red caída: no podemos comprobarlo
                rp = None
            self._robots[origin] = rp
        rp = self._robots[origin]
        if rp is None:
            return False, "robots.txt no disponible (error del servidor o de red): no se rastrea por prudencia"
        ua = self.settings.CRAWLER_USER_AGENT.split("/")[0]
        if not rp.can_fetch(ua, url):
            return False, "Bloqueado por robots.txt"
        return True, None

    def robots_txt(self, origin_url: str) -> str | None:
        """Devuelve el robots.txt en bruto (para el módulo GEO)."""
        parts = urlsplit(origin_url)
        try:
            resp, body, _ = self._raw_get(f"{parts.scheme}://{parts.netloc}/robots.txt", 500_000)
        except Exception:  # noqa: BLE001
            return None
        if resp.status_code != 200:
            return None
        return body.decode("utf-8", "replace")

    # ------------------------------------------------------------------- fetch
    def fetch(self, url: str) -> FetchResult:
        start = time.monotonic()
        for rx, reason in POLICY_SKIP_PATTERNS:
            if rx.search(url):
                return FetchResult(url=url, status="policy_skip", detail=reason)
        current = url
        redirects: list[str] = []
        try:
            for _ in range(self.settings.CRAWLER_MAX_REDIRECTS + 1):
                ok, why = self.allowed_by_robots(current)
                if not ok:
                    return FetchResult(url=url, final_url=current, status="blocked_robots", detail=why, redirects=redirects)
                resp, body, truncated = self._raw_get(current, self.settings.CRAWLER_MAX_BYTES)
                if resp.status_code in (301, 302, 303, 307, 308):
                    loc = resp.headers.get("location")
                    if not loc:
                        return FetchResult(url=url, status="http_error", http_status=resp.status_code, detail="Redirección sin Location")
                    nxt = urljoin(current, loc)
                    validate_url(nxt, self.resolver)  # valida el destino antes de seguirlo
                    redirects.append(nxt)
                    for rx, reason in POLICY_SKIP_PATTERNS:
                        if rx.search(nxt):
                            return FetchResult(url=url, final_url=nxt, status="policy_skip", detail=reason, redirects=redirects)
                    if LOGIN_WALL_PATH.search(urlsplit(nxt).path):
                        return FetchResult(url=url, final_url=nxt, status="access_blocked", http_status=resp.status_code,
                                           detail="Redirige a una página de inicio de sesión (no se intenta acceder)", redirects=redirects)
                    current = nxt
                    continue
                elapsed = int((time.monotonic() - start) * 1000)
                ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                charset = resp.charset_encoding or "utf-8"
                text = body.decode(charset, "replace") if body else ""
                base = FetchResult(url=url, status="ok", final_url=current, http_status=resp.status_code,
                                   content_type=ctype, redirects=redirects, elapsed_ms=elapsed)
                if truncated:
                    base.status, base.detail = "too_large", f"Respuesta mayor de {self.settings.CRAWLER_MAX_BYTES} bytes"
                    return base
                low = text[:200_000].lower()
                if resp.status_code in (401, 403, 429) or (resp.status_code == 503 and any(m in low for m in BLOCK_MARKERS)):
                    base.status = "access_blocked"
                    base.detail = f"Acceso denegado o limitado por el sitio (HTTP {resp.status_code}); no se intenta eludir"
                    return base
                if resp.status_code >= 400:
                    base.status, base.detail = "http_error", f"HTTP {resp.status_code}"
                    return base
                if ctype and ctype not in HTML_TYPES:
                    base.status, base.detail = "unsupported_content", f"Tipo de contenido no HTML: {ctype}"
                    return base
                if any(m in low for m in BLOCK_MARKERS) and len(re.sub(r"<[^>]+>", " ", low)) < 20_000:
                    base.status, base.detail = "access_blocked", "La página muestra un CAPTCHA o desafío anti-bot; no se intenta eludir"
                    return base
                base.text = text
                if self.settings.PLAYWRIGHT_ENABLED and looks_js_rendered(text):
                    rendered = render_with_playwright(current, self.resolver)
                    if rendered:
                        base.text, base.render_method = rendered, "playwright"
                return base
            return FetchResult(url=url, status="http_error", detail="Demasiadas redirecciones", redirects=redirects)
        except UnsafeURLError as exc:
            return FetchResult(url=url, final_url=current, status="blocked_ssrf", detail=str(exc), redirects=redirects)
        except httpx.TimeoutException:
            return FetchResult(url=url, final_url=current, status="timeout", detail="Tiempo de espera agotado", redirects=redirects)
        except httpx.HTTPError as exc:
            return FetchResult(url=url, final_url=current, status="network_error", detail=type(exc).__name__ + ": " + str(exc)[:200], redirects=redirects)


def looks_js_rendered(html: str) -> bool:
    body_text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    body_text = re.sub(r"<[^>]+>", " ", body_text)
    visible = re.sub(r"\s+", " ", body_text).strip()
    scripts = len(re.findall(r"<script", html, re.I))
    return len(visible) < 300 and scripts >= 3 or "enable javascript" in html.lower() or 'id="__next"></div>' in html


def render_with_playwright(url: str, resolver: Resolver | None = None) -> str | None:
    """Renderizado de respaldo. Cada subpetición se valida contra SSRF; se bloquean imágenes y medios."""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception:  # noqa: BLE001
        log.info("Playwright no disponible")
        return None
    s = get_settings()

    def guard(route):  # pragma: no cover - requiere navegador
        req = route.request
        if req.resource_type in ("image", "media", "font"):
            return route.abort()
        try:
            validate_url(req.url, resolver)
        except UnsafeURLError:
            return route.abort()
        return route.continue_()

    try:  # pragma: no cover - requiere navegador
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(user_agent=s.CRAWLER_USER_AGENT, java_script_enabled=True)
            page = ctx.new_page()
            page.route("**/*", guard)
            page.goto(url, timeout=int(s.CRAWLER_TIMEOUT_SECONDS * 1000), wait_until="networkidle")
            html = page.content()
            browser.close()
            return html[: s.CRAWLER_MAX_BYTES]
    except Exception as exc:  # noqa: BLE001
        log.warning("Fallo al renderizar con Playwright: %s", exc)
        return None
