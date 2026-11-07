# DESIGN · A Editorial ejecutivo

## Tokens
| Token | Valor | Uso |
|---|---|---|
| `--ivory` | #F5F1E8 | Fondo principal |
| `--paper` | #FBF9F4 | Secciones de figura |
| `--ink` | #17181C | Texto, reglas, botón primario |
| `--muted` | #5D5F66 | Texto secundario (5,66:1 sobre marfil) |
| `--coral` | #D04A2E | Acento: titulares cursivos y gráficos. Solo texto grande (3,96:1) |
| `--coral-ink` | #A3361D | Acento en texto pequeño (6,00:1) |
| `--blue` | #1F6FA0 | Segunda serie de gráficos (validada con coral) |
| `--stone` | #C9C0AF | Serie neutra |
| `--night` | #17181C | Bloques oscuros (GEO, CTA) |

Tipografía: escala fluida de 7 pasos (`--t-cap` 13 px … `--t-hero` 48–124 px). Espaciado base 4: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128. Contenedor 1240 px, margen lateral `max(20px, 4vw)`.

## Componentes
- **Cabecera de periódico**: franja superior informativa + barra con marca, navegación y CTA; menú móvil a pantalla completa con Esc y foco gestionado.
- **Figura**: regla superior de 2 px, número de figura, título, gráfico, pie con lectura y etiqueta «Datos ilustrativos».
- **Embudo editorial** (Figura 1) y **mapa de demanda** tipo sankey (Figura 2) generado a escala desde datos.
- **Índice de servicios**: filas de tabla de contenidos con hover que desplaza la fila.
- **Bloque oscuro GEO** con simulación de respuesta de IA etiquetada.
- **Método en 4 columnas** con barra de 12 semanas.
- **Roles** (dirección, marketing, ventas) con cita y lista.
- **Formulario memorándum**: filas etiqueta + campo, foco con subrayado coral.
- **Pie colofón** con marca a gran tamaño.

## Breakpoints
≥1024 escritorio (12 col) · 600–1023 tablet · <600 móvil.
