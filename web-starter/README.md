# Web Starter Local · webs de negocio local con IA

Starter para producir webs de negocios locales rápido y barato: **un cliente = un archivo `cliente.json`**.
Las plantillas, el SEO técnico, el schema y el QA ya están hechos; por cada cliente solo cambian los datos y los textos.

Ejemplo incluido: **reforma de baños en León** (datos ficticios, `"demo": true`).

## Qué genera

| Página | URL | Para qué |
|---|---|---|
| Inicio | `/` | Servicio principal + ciudad, servicios, diferenciales, zonas, FAQ |
| Servicio | `/servicios/{servicio}/` | Una por servicio, con qué incluye, duración y FAQ |
| Servicio × zona | `/{servicio}/{zona}/` | El corazón del SEO local. Solo para los servicios de `landings.servicios` |
| Zonas | `/zonas/` | Índice de zonas |
| Contacto | `/contacto/` | Teléfono, WhatsApp, email, mapa y formulario opcional |
| Legal | `/aviso-legal/`, `/privacidad/` | Plantillas a completar (noindex) |

De serie: schema JSON-LD (`LocalBusiness`/`GeneralContractor`, `Service`, `FAQPage`, `BreadcrumbList`), canonical, Open Graph, `sitemap-index.xml`, `robots.txt`, HTML estático sin JavaScript, sin cookies y adaptado a móvil.

## Arranque

```bash
npm install
npm run dev       # http://localhost:4321
npm run check     # build + QA: es la puerta antes de publicar
```

## Cliente nuevo en 6 pasos

1. **Copia la carpeta** `web-starter/` a un repo nuevo para el cliente.
2. **Rellena `cliente.json`** con el brief del cliente (NAP, horario, servicios, zonas, colores). Un agente de IA puede rellenarlo a partir del brief con este prompt:
   > Lee README.md y cliente.json. Con este brief del cliente: [pegar brief], reescribe cliente.json completo manteniendo la estructura. No inventes datos: lo que no esté en el brief márcalo con "REVISAR".
3. **Zonas con contenido propio.** Cada zona necesita `texto`, `notaLogistica`, `trabajoTipico` y su `faq` **distintos y reales** (trabajos hechos allí, tipo de vivienda, problemas habituales). Si no, las landings son clones y Google las trata como contenido pobre. El QA lo mide.
4. **Fotos reales** de trabajos del cliente en `public/fotos/` (opcional en la primera versión, pero suben mucho la conversión).
5. **`npm run check`**: tiene que acabar en `✓ Sin errores bloqueantes` y sin avisos de parecido entre landings.
6. **Publica**: pon `"demo": false`, completa los textos legales y despliega `dist/` en Vercel o Cloudflare Pages (gratis). Conecta el dominio y da de alta el sitemap en Search Console.

Opcional: auditar las URLs publicadas con el **Auditor GEO PRO** de este mismo repo.

## Qué comprueba el QA (`scripts/qa.mjs`)

- Un `<title>` y una meta description por página, **sin duplicados**.
- Un solo `<h1>`.
- Canonical presente y correcto.
- JSON-LD válido.
- Enlaces internos rotos e imágenes sin `alt`.
- **Parecido entre landings hermanas** (mismo servicio, distinta zona): avisa por encima del 60 %. Con el ejemplo actual sale ~35 %.
- Textos marcados como `REVISAR` y modo demo activo.

Si hay errores, sale con código 1: así se puede usar en CI para bloquear el deploy.

## Reglas para no meterse en líos

- **Nunca inventar reseñas, valoraciones ni trabajos.** No hay `aggregateRating` en el schema a propósito: añádelo solo con datos reales y verificables.
- Precios y plazos solo si el cliente los confirma.
- Con `"demo": true` la web lleva `noindex` y `robots.txt` lo bloquea todo: está pensado para enseñar maquetas al cliente sin que Google las indexe.
- Más zonas no es mejor: añade una zona solo si puedes escribir contenido real y distinto para ella.

## Estructura

```
cliente.json              ← lo único que se toca por cliente
src/lib/sitio.ts          ← lectura de datos, URLs y schema JSON-LD
src/layouts/Base.astro    ← <head> SEO, estilos y colores de marca
src/components/           ← secciones reutilizables (Hero, FAQ, CTA…)
src/pages/                ← plantillas de página
scripts/qa.mjs            ← QA antes de publicar
```
