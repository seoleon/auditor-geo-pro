export class ErrorHttp extends Error {
  constructor(status, cuerpo, url) {
    super(`HTTP ${status} en ${new URL(url).host}: ${String(cuerpo).slice(0, 300)}`);
    this.status = status;
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function esReintentable(err) {
  if (err instanceof ErrorHttp) return err.status === 408 || err.status === 429 || err.status >= 500;
  return err?.name === 'TimeoutError' || err?.name === 'AbortError' || err instanceof TypeError;
}

/** Ejecuta `fn` con reintentos y espera exponencial (1s, 2s, 4s…) en errores transitorios. */
export async function conReintentos(fn, { reintentos = 3, base = 1000 } = {}) {
  for (let intento = 0; ; intento++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status;
      const transitorio = esReintentable(err) || status === 429 || status >= 500;
      if (!transitorio || intento >= reintentos) throw err;
      await esperar(base * 2 ** intento + Math.random() * 250);
    }
  }
}

/** POST JSON con timeout. Lanza ErrorHttp si la respuesta no es 2xx. */
export async function postJson(url, cuerpo, { headers = {}, fetchImpl = fetch, timeoutMs = 180_000 } = {}) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const texto = await res.text();
  if (!res.ok) throw new ErrorHttp(res.status, texto, url);
  return JSON.parse(texto);
}
