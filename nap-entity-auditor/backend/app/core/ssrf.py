"""Protección contra SSRF para todas las peticiones salientes a URLs no confiables."""
from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable
from urllib.parse import urlsplit

from app.core.config import get_settings


class UnsafeURLError(ValueError):
    """La URL apunta a un destino no permitido (red interna, esquema o puerto prohibido...)."""


Resolver = Callable[[str, int], list[str]]

BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain", "metadata.google.internal", "metadata", "instance-data"}
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp")


def system_resolver(host: str, port: int) -> list[str]:
    infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    return sorted({info[4][0] for info in infos})


def is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    if isinstance(addr, ipaddress.IPv6Address) and addr.sixtofour:
        return is_public_ip(str(addr.sixtofour))
    return bool(
        addr.is_global
        and not addr.is_private
        and not addr.is_loopback
        and not addr.is_link_local
        and not addr.is_multicast
        and not addr.is_reserved
        and not addr.is_unspecified
    )


def validate_url(url: str, resolver: Resolver | None = None) -> tuple[str, int, list[str]]:
    """Valida esquema, credenciales, puerto y que TODAS las IPs resueltas sean públicas.

    Devuelve (host, puerto, ips). Lanza UnsafeURLError si algo no es seguro.
    """
    settings = get_settings()
    resolver = resolver or system_resolver
    if not url or len(url) > 2048:
        raise UnsafeURLError("URL vacía o demasiado larga")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise UnsafeURLError(f"Esquema no permitido: {parts.scheme or '(ninguno)'}")
    if parts.username or parts.password or "@" in parts.netloc:
        raise UnsafeURLError("No se permiten credenciales en la URL")
    host = (parts.hostname or "").strip().lower().rstrip(".")
    if not host:
        raise UnsafeURLError("URL sin host")
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError as exc:
        raise UnsafeURLError("Puerto inválido") from exc
    if port not in settings.allowed_ports:
        raise UnsafeURLError(f"Puerto no permitido: {port}")
    if host in BLOCKED_HOSTNAMES or host.endswith(BLOCKED_SUFFIXES):
        raise UnsafeURLError(f"Host interno no permitido: {host}")

    try:
        literal = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        literal = None
    if literal is not None:
        if not is_public_ip(str(literal)):
            raise UnsafeURLError(f"IP no pública: {host}")
        return host, port, [str(literal)]

    # Formas numéricas ofuscadas (decimal, octal, hex) que algunos resolvers aceptan
    if host.replace(".", "").isdigit() or host.startswith("0x"):
        raise UnsafeURLError(f"Host numérico no estándar: {host}")

    try:
        ips = resolver(host, port)
    except (socket.gaierror, UnicodeError, OSError) as exc:
        raise UnsafeURLError(f"No se pudo resolver {host}") from exc
    if not ips:
        raise UnsafeURLError(f"{host} no tiene direcciones")
    bad = [ip for ip in ips if not is_public_ip(ip)]
    if bad:
        raise UnsafeURLError(f"{host} resuelve a IP no pública ({', '.join(bad)})")
    return host, port, ips
