import httpx
import pytest

from app.core.ssrf import UnsafeURLError, is_public_ip, validate_url
from app.services.fetcher import SafeFetcher

PUBLIC = {"example.es": ["93.184.216.34"], "ok.es": ["93.184.216.34"], "evil.es": ["127.0.0.1"], "mixed.es": ["93.184.216.34", "10.0.0.5"],
          "redir.es": ["93.184.216.34"], "big.es": ["93.184.216.34"], "robots.es": ["93.184.216.34"], "cf.es": ["93.184.216.34"],
          "login.es": ["93.184.216.34"], "pdf.es": ["93.184.216.34"], "rebind.es": ["93.184.216.34"]}


def resolver(host, port):
    if host not in PUBLIC:
        raise OSError("NXDOMAIN")
    return PUBLIC[host]


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1",
                                "fc00::1", "fe80::1", "::ffff:127.0.0.1", "100.64.0.1", "224.0.0.1"])
def test_private_ips_are_not_public(ip):
    assert not is_public_ip(ip)


def test_public_ip():
    assert is_public_ip("93.184.216.34")
    assert is_public_ip("2606:2800:220:1:248:1893:25c8:1946")


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/", "http://localhost/admin", "http://169.254.169.254/latest/meta-data/", "http://[::1]/",
    "http://metadata.google.internal/", "file:///etc/passwd", "gopher://example.es/", "http://user:pass@example.es/",
    "http://example.es:22/", "http://2130706433/", "http://0x7f000001/", "http://evil.es/", "http://mixed.es/",
    "http://intranet.corp/", "ftp://example.es/",
])
def test_unsafe_urls_are_blocked(url):
    with pytest.raises(UnsafeURLError):
        validate_url(url, resolver)


def test_safe_url_passes():
    host, port, ips = validate_url("https://example.es/contacto", resolver)
    assert host == "example.es" and port == 443 and ips == ["93.184.216.34"]


def make_fetcher(handler, **kw):
    return SafeFetcher(resolver=resolver, transport=httpx.MockTransport(handler), per_host_delay=0, **kw)


def test_redirect_to_internal_address_is_blocked():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"})

    res = make_fetcher(handler).fetch("https://redir.es/start")
    assert res.status == "blocked_ssrf"


def test_redirect_to_dns_name_resolving_privately_is_blocked():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(301, headers={"location": "https://evil.es/"})

    assert make_fetcher(handler).fetch("https://redir.es/").status == "blocked_ssrf"


def test_safe_redirect_is_followed():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        if req.url.host == "redir.es":
            return httpx.Response(301, headers={"location": "https://ok.es/final"})
        return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, text="<html><h1>Hola</h1></html>")

    res = make_fetcher(handler).fetch("https://redir.es/")
    assert res.ok and res.final_url == "https://ok.es/final" and res.redirects == ["https://ok.es/final"]


def test_response_size_limit():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, headers={"content-type": "text/html"}, content=b"a" * 4_000_000)

    res = make_fetcher(handler).fetch("https://big.es/")
    assert res.status == "too_large"


def test_robots_txt_is_respected():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /privado/\n")
        return httpx.Response(200, headers={"content-type": "text/html"}, text="<html>ok</html>")

    f = make_fetcher(handler)
    assert f.fetch("https://robots.es/privado/ficha").status == "blocked_robots"
    assert f.fetch("https://robots.es/publico").status == "ok"


def test_robots_5xx_means_do_not_crawl():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(503)
        return httpx.Response(200, headers={"content-type": "text/html"}, text="<html>ok</html>")

    assert make_fetcher(handler).fetch("https://robots.es/x").status == "blocked_robots"


def test_captcha_and_403_are_unverifiable_not_bypassed():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        if req.url.path == "/403":
            return httpx.Response(403, text="Forbidden")
        return httpx.Response(200, headers={"content-type": "text/html"},
                              text="<html><title>Attention Required! | Cloudflare</title><div class='g-recaptcha'></div></html>")

    f = make_fetcher(handler)
    assert f.fetch("https://cf.es/403").status == "access_blocked"
    assert f.fetch("https://cf.es/page").status == "access_blocked"


def test_login_wall_redirect():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(302, headers={"location": "https://login.es/accounts/login/?next=/perfil"})

    assert make_fetcher(handler).fetch("https://login.es/perfil").status == "access_blocked"


def test_non_html_and_http_errors():
    def handler(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        if req.url.path == "/404":
            return httpx.Response(404)
        return httpx.Response(200, headers={"content-type": "application/pdf"}, content=b"%PDF")

    f = make_fetcher(handler)
    assert f.fetch("https://pdf.es/doc").status == "unsupported_content"
    assert f.fetch("https://pdf.es/404").status == "http_error"


def test_timeout_is_handled():
    def handler(req):
        raise httpx.ReadTimeout("slow", request=req)

    f = make_fetcher(handler, respect_robots=False)
    assert f.fetch("https://ok.es/").status == "timeout"


def test_google_maps_is_never_scraped():
    f = make_fetcher(lambda req: httpx.Response(200))
    assert f.fetch("https://www.google.com/maps/place/x").status == "policy_skip"
    assert f.fetch("https://maps.app.goo.gl/abc").status == "policy_skip"


def test_ip_pinning_prevents_dns_rebinding():
    seen = {}

    def handler(req):
        seen["host"] = req.url.host
        seen["host_header"] = req.headers.get("host")
        seen["sni"] = req.extensions.get("sni_hostname")
        return httpx.Response(200, headers={"content-type": "text/html"}, text="<html>ok</html>")

    f = SafeFetcher(resolver=resolver, transport=httpx.MockTransport(handler), per_host_delay=0, respect_robots=False, pin_ip=True)
    assert f.fetch("https://rebind.es/x").ok
    assert seen == {"host": "93.184.216.34", "host_header": "rebind.es", "sni": "rebind.es"}
