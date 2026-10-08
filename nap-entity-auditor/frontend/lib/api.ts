"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Cliente de la API. Las peticiones van a /api/* (mismo origen) y Next las reenvía al backend.
 *  La sesión viaja en una cookie httpOnly; la cabecera X-Requested-With protege frente a CSRF. */
export class ApiError extends Error {
  status: number;
  fields: { field: string; message: string }[];
  constructor(status: number, message: string, fields: { field: string; message: string }[] = []) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = options;
  const res = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: {
      "X-Requested-With": "nap-auditor",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    window.location.href = "/login";
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    let fields: { field: string; message: string }[] = [];
    try {
      const data = await res.json();
      msg = typeof data.detail === "string" ? data.detail : msg;
      fields = data.errors || [];
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(res.status, msg, fields);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (mounted.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  return { data, error, loading, reload, setData };
}
