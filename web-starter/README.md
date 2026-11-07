# Web Starter Local · webs de negocio local con IA

Starter para producir webs de negocios locales rápido y barato: **un cliente = un archivo `cliente.json`**.
Las plantillas, el SEO técnico, el schema y el QA ya están hechos; por cada cliente solo cambian los datos y los textos.

Ejemplo incluido: **portal de presupuestos de reforma de baños en León** para *rank & rent* (datos ficticios, `"demo": true`).

## Modelo: rank & rent transparente (`"modelo": "portal"`)

La web posiciona con marca propia y vende o alquila los contactos a reformistas reales. Es el modelo de Habitissimo o Cronoshare, que son quienes dominan esta SERP, pero en versión local. Reglas que el starter ya aplica:

- **No finge ser una empresa de reformas**: schema `Organization` (sin dirección física) y los servicios declaran a la web como `broker`, no como quien los presta. El QA da error si aparece `LocalBusiness`.
- **Sin ficha de Google Business falsa ni reseñas inventadas**: compite en el orgánico, no en el Map Pack. El QA da error si hay `aggregateRating` o `Review`.
- **Transparencia**: página `/como-funciona/`, aviso de intermediación en el pie y en el formulario, y consentimiento expreso para comunicar los datos al reformista (RGPD).
- **Conversión**: formulario `/presupuesto/` y teléfono. Se recomienda un número de seguimiento propio de la agencia, desviado al reformista que alquila la web: así el activo (web + número) sigue siendo vuestro.
- **Contenido que posiciona**: guías con fuentes en `src/pages/guias/*.md` (precios, permisos y ayudas). Se añade una guía nueva con solo crear un `.md`.

Para lanzar: dominio y marca en `cliente.json`, `formularioAction` (Formspree, Web3Forms o tu CRM), textos legales, `"demo": false` y deploy. Rankear con dominio nuevo lleva meses y requiere enlaces locales: prensa local, asociaciones y directorios.

## Qué genera

| Página | URL | Para qué |
|---|---|---|
| Inicio | `/` | Servicio principal + ciudad, servicios, diferenciales, zonas, FAQ |
| Servicio | `/servicios/{servicio}/` | Una por servicio, con qué incluye, duración y FAQ |
| Servicio × zona | `/{servicio}/{zona}/` | El corazón del SEO local. Solo para los servicios de `landings.servicios` |
| Zonas | `/zonas/` | Índice de zonas |
| Presupuesto | `/presupuesto/` | Formulario de captación con consentimiento RGPD |
| Guías | `/guias/` | Contenido informativo con fuentes (Markdown) |
| Cómo funciona | `/como-funciona/` | Explica el modelo de intermediación |
| Contacto | `/contacto/` | Teléfono, WhatsApp y email |
| Legal | `/aviso-legal/`, `/privacidad/` | Plantillas a completar (noindex) |

De serie: schema JSON-LD (`Organization`, `Service` con `broker`, `FAQPage`, `Article`, `BreadcrumbList`), canonical, Open Graph, `sitemap-index.xml`, `robots.txt`, HTML estático sin JavaScript, sin cookies y adaptado a móvil.

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
3. **Zonas con contenido propio.** Cada zona necesita `texto`, `consejo`, `obraTipica` y su `faq` **distintos y reales** (trabajos hechos allí, tipo de vivienda, problemas habituales). Si no, las landings son clones y Google las trata como contenido pobre. El QA lo mide.
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
