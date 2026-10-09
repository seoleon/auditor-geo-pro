"use client";

import type { Core, ElementDefinition } from "cytoscape";
import { useEffect, useRef, useState } from "react";

import type { AuditDetail } from "@/lib/types";

const NODE_COLORS: Record<string, string> = {
  business: "#1e3a8a",
  domain: "#2a78d6",
  phone: "#0f766e",
  address: "#7c3aed",
  profile: "#db2777",
  citation: "#475569",
  mention: "#a16207",
  page: "#64748b",
};
const NODE_LABELS: Record<string, string> = {
  business: "Negocio",
  domain: "Dominio",
  phone: "Teléfono",
  address: "Dirección",
  profile: "Perfil",
  citation: "Citación",
  mention: "Mención",
  page: "Página oficial",
};
const REL_LABELS: Record<string, string> = {
  tiene_web: "Tiene web",
  tiene_telefono: "Tiene teléfono",
  esta_ubicado_en: "Está ubicado en",
  aparece_mencionado_en: "Aparece mencionado en",
  dispone_de_perfil: "Dispone de perfil",
  comparte_datos_con: "Comparte datos con",
  muestra_telefono: "Muestra teléfono (distinto)",
  muestra_direccion: "Muestra dirección (distinta)",
  enlaza_a: "Enlaza a",
  contiene: "Contiene",
};

type Sel = { kind: "node" | "edge"; data: Record<string, unknown> } | null;

export function EntityGraph({ graph }: { graph: AuditDetail["entity_graph"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [sel, setSel] = useState<Sel>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (cancelled || !ref.current) return;
      const els: ElementDefinition[] = [
        ...(graph.nodes || []).map((n) => ({ data: { ...n, color: NODE_COLORS[n.type] || "#64748b", short: n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label } })),
        ...(graph.edges || []).map((e, i) => ({
          data: { id: `e${i}`, ...e, label: REL_LABELS[e.relation] || e.relation, color: e.status === "discrepancia" ? "#dc2626" : "#94a3b8" },
        })),
      ];
      cyRef.current?.destroy();
      const cy = cytoscape({
        container: ref.current,
        elements: els,
        // Anillos concéntricos: negocio en el centro, datos (dominio, teléfonos, direcciones) y después fuentes
        layout: {
          name: "concentric",
          animate: false,
          minNodeSpacing: 34,
          concentric: (n: { data: (k: string) => string }) => ({ business: 3, domain: 2, phone: 2, address: 2 } as Record<string, number>)[n.data("type")] || 1,
          levelWidth: () => 1,
        },
        style: [
          {
            selector: "node",
            style: {
              "background-color": "data(color)",
              label: "data(short)",
              "font-size": 9,
              "text-wrap": "ellipsis",
              "text-max-width": "120px",
              color: "#0f172a",
              "text-valign": "bottom",
              "text-margin-y": 4,
              width: 22,
              height: 22,
              "border-width": 2,
              "border-color": "#ffffff",
            },
          },
          { selector: "node[type = 'business']", style: { width: 40, height: 40, "font-size": 12, "font-weight": "bold" } },
          { selector: "node[?old]", style: { "border-color": "#dc2626", "border-width": 3 } },
          {
            selector: "edge",
            style: { width: 2, "line-color": "data(color)", "target-arrow-color": "data(color)", "target-arrow-shape": "triangle", "curve-style": "bezier" },
          },
          { selector: ":selected", style: { "overlay-opacity": 0.15, "overlay-color": "#2a78d6" } },
        ],
      });
      cy.on("tap", "node", (ev) => setSel({ kind: "node", data: ev.target.data() }));
      cy.on("tap", "edge", (ev) => setSel({ kind: "edge", data: ev.target.data() }));
      cyRef.current = cy;
    })();
    return () => {
      cancelled = true;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [graph]);

  if (!graph.nodes?.length) return <p className="text-sm text-muted-foreground">El grafo requiere un NAP confirmado y fuentes atribuidas.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div ref={ref} className="h-[520px] w-full rounded-lg border bg-white" aria-label="Grafo de entidad interactivo" />
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {Object.entries(NODE_LABELS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-xs">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: NODE_COLORS[k] }} /> {v}
            </span>
          ))}
          <span className="flex items-center gap-1 text-xs">
            <span className="inline-block h-0.5 w-4 bg-red-600" /> Discrepancia
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{graph.legend} Pulsa un nodo o una relación para ver su evidencia.</p>
        {sel?.kind === "node" && (
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{NODE_LABELS[String(sel.data.type)]}</div>
            <div className="font-medium break-words">{String(sel.data.label)}</div>
            {Boolean(sel.data.official) && <div className="text-xs text-emerald-700">Dato oficial</div>}
            {typeof sel.data.url === "string" && (
              <a className="break-all text-xs text-primary" href={sel.data.url} target="_blank" rel="noopener noreferrer nofollow">
                {sel.data.url}
              </a>
            )}
          </div>
        )}
        {sel?.kind === "edge" && (
          <div className="rounded-lg border p-3">
            <div className="font-medium">{String(sel.data.label)}</div>
            <div className="mt-1 rounded bg-muted p-2 font-mono text-[11px] break-words">{String(sel.data.evidence)}</div>
            {typeof sel.data.source_url === "string" && (
              <a className="break-all text-xs text-primary" href={sel.data.source_url} target="_blank" rel="noopener noreferrer nofollow">
                {sel.data.source_url}
              </a>
            )}
          </div>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer">Vista de tabla ({graph.edges?.length} relaciones)</summary>
          <ul className="mt-2 space-y-1">
            {(graph.edges || []).map((e, i) => (
              <li key={i}>
                {(graph.nodes || []).find((n) => n.id === e.source)?.label} → {REL_LABELS[e.relation] || e.relation} →{" "}
                {(graph.nodes || []).find((n) => n.id === e.target)?.label}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
