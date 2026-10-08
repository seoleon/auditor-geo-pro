"""Extracción NAP de una página con prioridades y resolución de ambigüedades.

Prioridad: 1) datos estructurados, 2) HTML semántico (tel:, mailto:, <address>, h-card,
Open Graph business), 3) texto visible, 4) selectores de directorios compatibles.
Cada valor guarda método y fragmento de evidencia. Un número no se atribuye al negocio
solo por aparecer en la página: se puntúa por contexto y se marca la ambigüedad.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag

from app.services.extraction.directory_adapters import run_directory_adapter
from app.services.extraction.structured import (
    BUSINESS_TYPES,
    address_from_entity,
    all_str,
    extract_structured,
    first_str,
    is_business_entity,
)
from app.services.normalize.address import POSTAL_CODE_RE, find_address_candidates, parse_address
from app.services.normalize.hours import parse_opening_hours_spec
from app.services.normalize.names import name_similarity
from app.services.normalize.phone import find_phone_candidates, normalize_phone
from app.services.normalize.text import clean_ws, fold, snippet_around
from app.services.normalize.urls import registrable_domain

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_LABEL_RE = re.compile(r"(?i)(tel[eé]fono|tel\.?|tlf\.?|tfno\.?|m[oó]vil|ll[aá]ma(?:nos)?|whats ?app|phone|contacto|call)\s*[:.]?\s*$")
FAX_LABEL_RE = re.compile(r"(?i)fax\s*[:.]?\s*$")
SOCIAL_HOSTS = {
    "facebook.com": "facebook", "instagram.com": "instagram", "linkedin.com": "linkedin", "youtube.com": "youtube",
    "tiktok.com": "tiktok", "twitter.com": "x", "x.com": "x", "pinterest.com": "pinterest", "pinterest.es": "pinterest",
    "threads.net": "threads",
}
SHARE_PATH_RE = re.compile(r"(?i)/(sharer|share|intent|dialog|plugins|hashtag|watch\?|embed|p/|reel/|status/)")


@dataclass
class Candidate:
    value: str
    key: str  # forma normalizada para agrupar
    method: str
    score: float
    evidence: str


@dataclass
class Extraction:
    fields: dict = field(default_factory=dict)
    methods: dict = field(default_factory=dict)
    evidence: dict = field(default_factory=dict)
    ambiguity: dict = field(default_factory=dict)
    phone_candidates: list[dict] = field(default_factory=list)
    address_candidates: list[dict] = field(default_factory=list)
    name_candidates: list[dict] = field(default_factory=list)
    structured_entities: list[dict] = field(default_factory=list)
    structured_errors: list[str] = field(default_factory=list)
    opengraph: dict = field(default_factory=dict)
    links: list[str] = field(default_factory=list)
    social_links: dict = field(default_factory=dict)
    internal_links: list[str] = field(default_factory=list)
    page_types: list[str] = field(default_factory=list)
    text_sample: str = ""

    def as_extracted(self) -> dict:
        d = dict(self.fields)
        d["phone_candidates"] = self.phone_candidates[:15]
        d["address_candidates"] = self.address_candidates[:10]
        d["name_candidates"] = self.name_candidates[:10]
        d["ambiguity"] = self.ambiguity
        d["social_links"] = self.social_links
        d["page_types"] = self.page_types
        return d


def _visible_text(soup: BeautifulSoup) -> str:
    for t in soup(["script", "style", "noscript", "template", "svg"]):
        t.decompose()
    return clean_ws(soup.get_text(" "))


def _name_positions(text: str, names: list[str]) -> list[int]:
    folded = fold(text)
    pos: list[int] = []
    for n in names:
        fn = fold(n)
        if len(fn) < 3:
            continue
        for m in re.finditer(re.escape(fn), folded):
            pos.append(m.start())
    return pos


def _proximity_bonus(position: int, name_positions: list[int], window: int = 250, max_bonus: float = 0.18) -> float:
    """Bonificación por cercanía al nombre del negocio. Los datos que aparecen DESPUÉS del nombre
    (mismo bloque de ficha) pesan más que los que aparecen antes (suelen ser de la ficha anterior)."""
    best = 0.0
    for p in name_positions:
        d = position - p if position >= p else (p - position) * 2.5
        best = max(best, max_bonus * max(0.0, 1 - d / window))
    return best


def _business_block(soup: BeautifulSoup, names: list[str], country: str) -> tuple[set[str], str]:
    """Localiza el bloque DOM más pequeño que contiene el nombre del negocio y algún teléfono
    (ficha dentro de un listado). Devuelve los teléfonos de ese bloque y su texto plegado."""
    folded_names = [fold(n) for n in names if len(fold(n)) >= 3]
    if not folded_names:
        return set(), ""
    phones: set[str] = set()
    texts: list[str] = []
    for node in soup.find_all(string=True):
        if not any(fn in fold(str(node)) for fn in folded_names):
            continue
        el = node.parent
        for _ in range(5):
            if el is None or el.name in ("body", "html", "[document]"):
                break
            found = find_phone_candidates(el.get_text(" "), country)
            if found:
                # Con muchos teléfonos el bloque es el listado completo y no una ficha: se descarta
                if len(found) <= 3:
                    phones.update(n.e164 for n, _, _ in found)
                    texts.append(fold(el.get_text(" ")))
                break
            el = el.parent
    return phones, " ".join(texts)


def _social_platform(href: str) -> str | None:
    try:
        host = (urlsplit(href).hostname or "").lower()
    except ValueError:
        return None
    host = host[4:] if host.startswith("www.") else host
    for h, platform in SOCIAL_HOSTS.items():
        if host == h or host.endswith("." + h):
            return platform
    return None


def _pick(cands: list[Candidate]) -> tuple[Candidate | None, bool, list[Candidate]]:
    """Agrupa por clave, devuelve el mejor, si es ambiguo y la lista agregada."""
    best_by_key: dict[str, Candidate] = {}
    for c in cands:
        cur = best_by_key.get(c.key)
        if cur is None or c.score > cur.score:
            best_by_key[c.key] = Candidate(c.value, c.key, c.method, c.score, c.evidence)
    ranked = sorted(best_by_key.values(), key=lambda c: -c.score)
    if not ranked:
        return None, False, []
    best = ranked[0]
    ambiguous = len(ranked) > 1 and best.score < 0.9 and ranked[1].score >= best.score - 0.1
    return best, ambiguous, ranked


def extract_nap(html: str, url: str, reference_names: list[str] | None = None, country: str = "ES",
                official_domain: str | None = None) -> Extraction:
    ex = Extraction()
    reference_names = [n for n in (reference_names or []) if n]
    sd = extract_structured(html, url)
    entities = sd["entities"]
    ex.structured_entities = entities
    ex.structured_errors = sd["errors"]
    ex.opengraph = sd["opengraph"]
    ex.page_types = sorted({t for e in entities for t in e.get("__types__", [])})

    soup = BeautifulSoup(html, "lxml")
    title = clean_ws(soup.title.get_text()) if soup.title else None
    canonical_tag = soup.find("link", rel=lambda v: v and "canonical" in (v if isinstance(v, list) else [v]))
    canonical = urljoin(url, canonical_tag["href"]) if isinstance(canonical_tag, Tag) and canonical_tag.get("href") else None
    h1 = soup.find("h1")
    h1_text = clean_ws(h1.get_text(" ")) if h1 else None
    meta = {m.get("property") or m.get("name"): m.get("content") for m in soup.find_all("meta") if m.get("content")}

    # --- Enlaces (antes de eliminar nodos) ---
    links: list[str] = []
    tel_links: list[tuple[str, str]] = []
    mail_links: list[str] = []
    page_host = registrable_domain(url)
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.lower().startswith("tel:"):
            ctx_node = a.find_parent(["address", "footer", "li", "p", "div"]) or a
            tel_links.append((href[4:], clean_ws(ctx_node.get_text(" "))[:300]))
            continue
        if href.lower().startswith("mailto:"):
            mail_links.append(href[7:].split("?")[0])
            continue
        absu = urljoin(url, href)
        if absu.startswith(("http://", "https://")):
            links.append(absu)
            platform = _social_platform(absu)
            if platform and not SHARE_PATH_RE.search(urlsplit(absu).path + ("?" + urlsplit(absu).query if urlsplit(absu).query else "")):
                path = urlsplit(absu).path.strip("/")
                if path:
                    ex.social_links.setdefault(platform, [])
                    if absu not in ex.social_links[platform]:
                        ex.social_links[platform].append(absu)
            elif registrable_domain(absu) == page_host:
                ex.internal_links.append(absu.split("#")[0])
    ex.links = links

    address_tags = [clean_ws(t.get_text(" ")) for t in soup.find_all("address")]
    hcards = soup.select(".h-card, .vcard")
    text = _visible_text(soup)
    ex.text_sample = text[:3000]
    name_pos = _name_positions(text, reference_names)

    # --- Entidad principal en datos estructurados ---
    # Todas las entidades que describen al negocio (mismo nombre) se tratan como principales;
    # una entidad anidada o con un nombre claramente distinto (p. ej. el editor de un artículo) no lo es.
    biz = [e for e in entities if is_business_entity(e)]
    primaries: list[dict] = []
    if biz:
        def sim(e: dict) -> float:
            return max((name_similarity(first_str(e.get("name")), n) for n in reference_names), default=0)

        if reference_names:
            primaries = [e for e in biz if sim(e) >= 70]
            if not primaries and len(biz) == 1 and not biz[0].get("__nested__") and (not biz[0].get("name") or sim(biz[0]) >= 50):
                primaries = biz[:1]
        elif len({fold(first_str(e.get("name")) or "") for e in biz}) == 1:
            primaries = [e for e in biz if not e.get("__nested__")] or biz[:1]
        if len({fold(first_str(e.get("name")) or "") for e in biz}) > 1:
            ex.ambiguity["structured_entities"] = f"{len(biz)} entidades de negocio en los datos estructurados"
    primary_ids = {id(e) for e in primaries}
    block_phones, block_text = _business_block(soup, reference_names, country)

    phones: list[Candidate] = []
    addrs: list[Candidate] = []
    names: list[Candidate] = []

    def add_phone(raw: str, method: str, score: float, evidence: str) -> None:
        n = normalize_phone(raw, country)
        if n:
            phones.append(Candidate(n.international, n.e164, method, score, evidence))

    def add_address(street, pc, loc, region, ctry, method, score, evidence) -> None:
        pa = parse_address(street, pc, loc, region, ctry)
        if pa.is_empty():
            return
        key = "|".join([pa.street_name or "", pa.number or "", pa.postal_code or "", pa.locality or ""])
        addrs.append(Candidate(pa.raw, key, method, score, evidence))

    # 1) Datos estructurados
    for e in biz:
        is_primary = id(e) in primary_ids
        base = 0.95 if is_primary else 0.55
        ename = first_str(e.get("name"))
        syntax = e.get("__syntax__", "json-ld")
        ev_prefix = f"{syntax} {','.join(e.get('__types__', []))}"
        if ename:
            names.append(Candidate(ename, fold(ename), f"structured:{syntax}", base, f"{ev_prefix}: name = {ename}"))
        for tel in all_str(e.get("telephone")):
            add_phone(tel, f"structured:{syntax}", base, f"{ev_prefix}: telephone = {tel}")
        cps = e.get("contactPoint")
        for cp in cps if isinstance(cps, list) else [cps]:
            if isinstance(cp, dict):
                for tel in all_str(cp.get("telephone")):
                    add_phone(tel, f"structured:{syntax}", base - 0.05, f"{ev_prefix} contactPoint: telephone = {tel}")
        ad = address_from_entity(e.get("address"))
        if ad:
            add_address(ad["street"], ad["postal_code"], ad["locality"], ad["region"], ad["country"],
                        f"structured:{syntax}", base, f"{ev_prefix}: address = {ad['raw']}")
        if is_primary:
            email = first_str(e.get("email"))
            if email:
                ex.fields["email"] = email.replace("mailto:", "")
                ex.methods["email"] = f"structured:{syntax}"
            web = first_str(e.get("url"))
            if web:
                ex.fields["website"] = urljoin(url, web)
                ex.methods["website"] = f"structured:{syntax}"
                ex.evidence["website"] = f"{ev_prefix}: url = {web}"
            hours, herr = parse_opening_hours_spec(e.get("openingHoursSpecification") or e.get("openingHours"))
            if hours:
                ex.fields["hours"] = hours
                ex.methods["hours"] = f"structured:{syntax}"
                ex.evidence["hours"] = f"{ev_prefix}: openingHours"
            types = [t for t in e.get("__types__", []) if t not in ("LocalBusiness", "Organization")]
            if types:
                ex.fields["category"] = ", ".join(types)
                ex.methods["category"] = f"structured:{syntax}"
            same_as = all_str(e.get("sameAs"))
            if same_as:
                ex.fields["same_as"] = same_as

    # 2) HTML semántico
    for card in hcards:
        fn = card.select_one(".p-name, .fn, .org, .p-org")
        if fn:
            v = clean_ws(fn.get_text(" "))
            names.append(Candidate(v, fold(v), "semantic:h-card", 0.85, f"h-card: {v}"))
        tel = card.select_one(".p-tel, .tel")
        if tel:
            v = clean_ws(tel.get_text(" "))
            add_phone(v, "semantic:h-card", 0.85, f"h-card tel: {v}")
        adr = card.select_one(".p-adr, .adr, .h-adr")
        if adr:
            v = clean_ws(adr.get_text(" "))
            add_address(v, None, None, None, None, "semantic:h-card", 0.85, f"h-card adr: {v}")
    og_street = meta.get("business:contact_data:street_address")
    if og_street:
        add_address(og_street, meta.get("business:contact_data:postal_code"), meta.get("business:contact_data:locality"),
                    meta.get("business:contact_data:region"), meta.get("business:contact_data:country_name"),
                    "semantic:og-business", 0.85, f"og business:contact_data: {og_street}")
    if meta.get("business:contact_data:phone_number"):
        add_phone(meta["business:contact_data:phone_number"], "semantic:og-business", 0.85,
                  f"og business:contact_data:phone_number = {meta['business:contact_data:phone_number']}")
    for raw, ctx in tel_links:
        score = 0.78
        if reference_names and any(fold(n) in fold(ctx) for n in reference_names):
            score += 0.1
        if re.search(r"(?i)fax", ctx[:40]):
            continue
        add_phone(raw, "semantic:tel-link", score, f"enlace tel: {raw} — contexto: {ctx[:160]}")
    for at in address_tags:
        for cand, _s, _e in find_address_candidates(at) or [(at, 0, len(at))]:
            if POSTAL_CODE_RE.search(cand) or len(cand) < 120:
                add_address(cand, None, None, None, None, "semantic:address-tag", 0.75, f"<address>: {at[:200]}")
    for m in mail_links:
        if "email" not in ex.fields and EMAIL_RE.fullmatch(m.strip()):
            ex.fields["email"] = m.strip()
            ex.methods["email"] = "semantic:mailto"

    # 3) Texto visible
    for n, s, e in find_phone_candidates(text, country):
        before = text[max(0, s - 30) : s]
        if FAX_LABEL_RE.search(before):
            continue
        score = 0.62 if PHONE_LABEL_RE.search(before) else 0.4
        if block_phones:
            score += 0.2 if n.e164 in block_phones else 0.0
        else:
            score += _proximity_bonus(s, name_pos)
        phones.append(Candidate(n.international, n.e164, "text", score, snippet_around(text, s, e)))
    for cand, s, e in find_address_candidates(text):
        in_block = bool(block_text) and fold(cand)[:25] in block_text
        score = 0.6 + (0.18 if in_block else 0.0 if block_text else _proximity_bonus(s, name_pos))
        add_address(cand, None, None, None, None, "text", score, snippet_around(text, s, e))
    if "email" not in ex.fields:
        m = EMAIL_RE.search(text)
        if m and not m.group(0).lower().endswith((".png", ".jpg", ".webp")):
            ex.fields["email"] = m.group(0)
            ex.methods["email"] = "text"

    # Nombres desde HTML
    if h1_text and len(h1_text) <= 120:
        names.append(Candidate(h1_text, fold(h1_text), "semantic:h1", 0.6, f"<h1>: {h1_text}"))
    og_site = ex.opengraph.get("og:site_name") or meta.get("og:site_name")
    if og_site:
        names.append(Candidate(og_site, fold(og_site), "semantic:og:site_name", 0.55, f"og:site_name = {og_site}"))
    og_title = ex.opengraph.get("og:title") or meta.get("og:title")
    if og_title and len(og_title) <= 120:
        names.append(Candidate(og_title, fold(og_title), "semantic:og:title", 0.45, f"og:title = {og_title}"))
    if title:
        names.append(Candidate(title, fold(title), "semantic:title", 0.35, f"<title>: {title}"))
    for ref in reference_names:
        pos = _name_positions(text, [ref])
        if pos:
            # Nombre literal en el texto: confirma la mención pero no sustituye al nombre declarado por la fuente
            names.append(Candidate(ref, fold(ref), "text:literal-mention", 0.5, snippet_around(text, pos[0], pos[0] + len(ref))))

    # 4) Selectores de directorios compatibles
    adapter = run_directory_adapter(url, soup_html=html)
    if adapter:
        if adapter.get("name"):
            names.append(Candidate(adapter["name"], fold(adapter["name"]), f"directory:{adapter['adapter']}", 0.9, f"selector: {adapter['name']}"))
        if adapter.get("phone"):
            add_phone(adapter["phone"], f"directory:{adapter['adapter']}", 0.9, f"selector: {adapter['phone']}")
        if adapter.get("address"):
            add_address(adapter["address"], None, None, None, None, f"directory:{adapter['adapter']}", 0.9, f"selector: {adapter['address']}")

    # --- Resolución ---
    best_phone, phone_amb, phone_ranked = _pick(phones)
    best_addr, addr_amb, addr_ranked = _pick(addrs)
    best_name, _, name_ranked = _pick(names)
    ex.phone_candidates = [{"value": c.value, "e164": c.key, "method": c.method, "score": round(c.score, 2), "evidence": c.evidence[:300]} for c in phone_ranked]
    ex.address_candidates = [{"value": c.value, "method": c.method, "score": round(c.score, 2), "evidence": c.evidence[:300]} for c in addr_ranked]
    ex.name_candidates = [{"value": c.value, "method": c.method, "score": round(c.score, 2), "evidence": c.evidence[:300]} for c in name_ranked]

    if best_name:
        # El nombre "declarado": se prefiere el de mayor rango de método, no el más parecido al oficial
        declared = [c for c in name_ranked if not c.method.startswith("text:")]
        chosen = declared[0] if declared else best_name
        ex.fields["name"] = _clean_title(chosen.value, reference_names) if chosen.method == "semantic:title" else chosen.value
        ex.methods["name"] = chosen.method
        ex.evidence["name"] = chosen.evidence[:300]
    ex.fields["name_mentioned_literally"] = any(c.method == "text:literal-mention" for c in name_ranked)
    if best_phone:
        ex.fields["phone"] = best_phone.value
        ex.fields["phone_e164"] = best_phone.key
        ex.methods["phone"] = best_phone.method
        ex.evidence["phone"] = best_phone.evidence[:300]
        if phone_amb:
            ex.ambiguity["phone"] = "Varios teléfonos con puntuación similar; no se puede atribuir uno con seguridad"
    ex.fields["phones_all"] = [c.key for c in phone_ranked]
    if best_addr:
        pa = parse_address(best_addr.value)
        ex.fields["address"] = best_addr.value
        ex.fields["postal_code"] = pa.postal_code
        ex.fields["city"] = pa.locality
        ex.methods["address"] = best_addr.method
        ex.evidence["address"] = best_addr.evidence[:300]
        if addr_amb:
            ex.ambiguity["address"] = "Varias direcciones con puntuación similar"
    ex.fields["canonical"] = canonical
    ex.fields["title"] = title
    ex.fields["social_links"] = ex.social_links
    if official_domain:
        od = registrable_domain(official_domain)
        ex.fields["links_to_official"] = any(registrable_domain(link) == od for link in links) or (
            bool(ex.fields.get("website")) and registrable_domain(ex.fields["website"]) == od
        )
        if "website" not in ex.fields:
            for link in links:
                if registrable_domain(link) == od and registrable_domain(url) != od:
                    ex.fields["website"] = link
                    ex.methods["website"] = "semantic:link"
                    ex.evidence["website"] = f"Enlace a {link}"
                    break
    ex.fields["is_article"] = bool(set(ex.page_types) & {"Article", "NewsArticle", "BlogPosting"}) or (
        meta.get("og:type") == "article" or ex.opengraph.get("og:type") == "article"
    )
    ex.fields["business_entities_count"] = len(biz)
    ex.fields["has_business_schema"] = bool(set(ex.page_types) & BUSINESS_TYPES)
    return ex


def _clean_title(title: str, refs: list[str]) -> str:
    parts = re.split(r"\s[|\-–—·:]\s", title)
    if refs:
        best = max(parts, key=lambda p: max(name_similarity(p, r) for r in refs))
        return best.strip()
    return parts[0].strip()
