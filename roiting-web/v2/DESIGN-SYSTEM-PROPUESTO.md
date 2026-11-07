# Design system propuesto (común a las tres direcciones)

Este documento **no sustituye** a `DESIGN_SYSTEM.md` del kit. Recoge lo que comparten las tres propuestas y las desviaciones respecto al punto de partida.

## Estructura de tokens compartida
- **Color semántico**: fondo, superficie, texto, texto secundario, línea, acento de acción, acento para texto pequeño, segunda serie de datos, serie neutra.
- **Tipografía**: máximo dos familias por dirección, todas OFL vía Google Fonts. Escala fluida con `clamp()` entre 390 y 1440 px. Cuerpo ≥ 16 px en móvil.
- **Espaciado**: base 4 (4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 px). Padding de sección `clamp(72px, 9vw, 136–144px)`.
- **Contenedor**: 1240–1280 px; margen lateral `max(20px, ~4vw)`; 12 columnas con separación de 16–28 px.
- **Breakpoints**: escritorio ≥1024, tablet 600–1023, móvil <600.
- **Interacción**: foco visible en todos los controles, enlace para saltar al contenido, menú móvil con `aria-expanded` y cierre con Esc, objetivos táctiles ≥ 44 px.
- **Motion**: 150–350 ms (salvo la carga de la Figura 1 de A, 0,9 s), solo transform y opacity; todo desactivado con `prefers-reduced-motion`.
- **Datos**: cualquier cifra lleva la etiqueta «Datos ilustrativos» o «Datos de demostración».

## Desviaciones respecto a `DESIGN_SYSTEM.md`
| Punto de partida | Propuesta | Motivo |
|---|---|---|
| A: acento coral/naranja | Coral #D04A2E + coral oscuro #A3361D para texto pequeño | El coral solo cumple AA en texto grande |
| B: `--accent` #e85d3b | #E8643F | Ajuste mínimo para superar las comprobaciones de color de la skill dataviz junto a la segunda serie #20A890 |
| B: `--muted` #586d6b | Se mantiene sobre papel; sobre oscuro se usa #A9C0BC | #586d6b sobre #0b2929 no es legible |
| C: fotografías reales de sectores | Ilustración técnica SVG | No hay fotografías autorizadas |
| Contenedor 1240 px | 1240 (A, B) y 1280 (C) | C necesita más ancho para tablas técnicas |

## Pendiente de identidad oficial
Logotipo, colores corporativos y tipografías de Roiting. No se ha podido leer roiting.com desde este entorno.
