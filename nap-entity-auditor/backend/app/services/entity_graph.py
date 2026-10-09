"""Grafo de entidad: cada arista va acompañada de su evidencia."""
from __future__ import annotations

from app.services.comparison import NapReference
from app.services.normalize.address import parse_address
from app.services.normalize.phone import normalize_phone
from app.services.normalize.text import fold
from app.services.normalize.urls import registrable_domain

NODE_TYPE_BY_SOURCE = {
    "social_profile": "profile", "maps": "profile", "local_directory": "citation", "sector_directory": "citation",
    "business_citation": "citation", "editorial": "mention", "official": "domain",
}


def build_graph(ref: NapReference | None, business_name: str, domain: str, sources: list[dict]) -> dict:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def node(nid: str, ntype: str, label: str, **extra) -> str:
        if nid not in nodes:
            nodes[nid] = {"id": nid, "type": ntype, "label": label, **extra}
        return nid

    def edge(a: str, b: str, rel: str, evidence: str, source_url: str | None = None, status: str | None = None) -> None:
        edges.append({"source": a, "target": b, "relation": rel, "evidence": evidence[:300], "source_url": source_url,
                      "status": status})

    biz = node("business", "business", business_name, official=True)
    dom = registrable_domain(domain) if domain else None
    if dom:
        node(f"domain:{dom}", "domain", dom, official=True)
        edge(biz, f"domain:{dom}", "tiene_web", "Dato oficial confirmado por el usuario")
    if ref:
        for p in sorted(ref.phones):
            n = normalize_phone(p, ref.country)
            node(f"phone:{p}", "phone", n.international if n else p, official=True)
            edge(biz, f"phone:{p}", "tiene_telefono", "Dato oficial confirmado por el usuario")
        if ref.address and not ref.hide_address:
            akey = f"address:{ref.address.postal_code}|{ref.address.street_name}|{ref.address.number}"
            node(akey, "address", ref.address.raw, official=True)
            edge(biz, akey, "esta_ubicado_en", "Dato oficial confirmado por el usuario")

    for s in sources:
        level = (s.get("attribution") or {}).get("level")
        if s.get("source_type") == "irrelevant" or level in (None, "none", "unknown"):
            continue
        ex = s.get("extracted") or {}
        ntype = NODE_TYPE_BY_SOURCE.get(s.get("source_type"), "citation")
        if s.get("is_official"):
            sid = f"page:{s['id']}"
            node(sid, "page", s.get("title") or s["url"], url=s["url"], status=s.get("overall_status"))
            if dom:
                edge(f"domain:{dom}", sid, "contiene", "Página del dominio oficial", s["url"])
        else:
            sid = f"src:{s['id']}"
            node(sid, ntype, s.get("source_name") or registrable_domain(s["url"]), url=s["url"], status=s.get("overall_status"),
                 source_type=s.get("source_type"))
            rel = {"profile": "dispone_de_perfil", "mention": "aparece_mencionado_en"}.get(ntype, "aparece_mencionado_en")
            edge(biz, sid, rel, "; ".join((s.get("attribution") or {}).get("signals") or []) or "Atribuida por coincidencia de datos",
                 s["url"], s.get("overall_status"))
        # Datos que comparte la fuente
        ev = s.get("evidence") or {}
        for e164 in (ex.get("phones_all") or [])[:3]:
            cand = next((c for c in ex.get("phone_candidates") or [] if c.get("e164") == e164), None)
            if not cand or cand.get("score", 0) < 0.6:
                continue
            official = bool(ref and e164 in ref.phones)
            n = normalize_phone(e164, ref.country if ref else "ES")
            pid = node(f"phone:{e164}", "phone", n.international if n else e164, official=official,
                       old=bool(ref and e164 in ref.old_phones))
            edge(sid, pid, "comparte_datos_con" if official else "muestra_telefono", cand.get("evidence") or "", s["url"],
                 None if official else "discrepancia")
        if ex.get("address"):
            pa = parse_address(ex["address"])
            akey = f"address:{pa.postal_code}|{pa.street_name}|{pa.number}"
            official = bool(ref and ref.address and akey == f"address:{ref.address.postal_code}|{ref.address.street_name}|{ref.address.number}")
            node(akey, "address", ex["address"], official=official)
            edge(sid, akey, "comparte_datos_con" if official else "muestra_direccion", ev.get("address") or ex["address"], s["url"],
                 None if official else "discrepancia")
        website = ex.get("website")
        if website and not s.get("is_official"):
            wd = registrable_domain(website)
            wid = node(f"domain:{wd}", "domain", wd, official=wd == dom)
            edge(sid, wid, "enlaza_a", ev.get("website") or f"Enlace a {website}", s["url"], None if wd == dom else "discrepancia")
    # nodos aislados fuera
    used = {e["source"] for e in edges} | {e["target"] for e in edges} | {biz}
    out_nodes = [n for k, n in nodes.items() if k in used]
    return {"nodes": out_nodes, "edges": edges,
            "legend": "Cada relación muestra la evidencia que la respalda; las fuentes sin atribución suficiente no se incluyen.",
            "business_key": fold(business_name)}
