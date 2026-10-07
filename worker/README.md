# Rastreo de URLs en la versión publicada (Cloudflare Worker gratuito)

Los navegadores no permiten que una web (por ejemplo, la app en GitHub Pages) descargue páginas de otros dominios. Para analizar URLs desde la versión publicada necesitas un pequeño intermediario propio. Este Worker hace exactamente eso, con el mismo contrato que `server.mjs`.

## Despliegue en 5 minutos

1. Crea una cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Create Worker**.
2. Ponle un nombre (p. ej. `auditor-geo-proxy`), pulsa **Deploy** y después **Edit code**.
3. Sustituye el código por el contenido de `cloudflare-proxy.js` y pulsa **Deploy**.
4. (Recomendado) En **Settings → Variables**, añade `ALLOWED_ORIGIN` con la URL de tu app, p. ej. `https://seoleon.github.io`, para que solo tu app pueda usar el Worker.
5. Copia la URL del Worker (p. ej. `https://auditor-geo-proxy.tu-cuenta.workers.dev`) y ponla en `auditor.config.json` en la raíz del repositorio:

```json
{ "crawler": "https://auditor-geo-proxy.tu-cuenta.workers.dev" }
```

6. Haz commit y push. La app publicada detectará el Worker y activará el análisis de URLs.

El plan gratuito de Workers incluye 100.000 peticiones al día. El Worker no guarda nada: descarga la página, la devuelve a tu navegador y la auditoría sigue ocurriendo en local.

## Uso local (sin Worker)

```bash
npm start   # http://localhost:8080 con rastreo de URLs integrado
```
