# Revisión de mockups · ronda 1

**Fecha:** 2026-11-07 · **Herramienta:** Playwright (Chromium) local en Node; no hay Playwright MCP ni Impeccable instalados. La crítica es una revisión propia con checklist (jerarquía, equilibrio, contraste, legibilidad, patrones genéricos, móvil), no la skill Impeccable.

**Viewports:** 1440×900, 768×1024 y 390×844 (página completa). Capturas en `capturas/antes/` y `capturas/despues/`.

## Comprobaciones automáticas (después de corregir)
| Comprobación | A | B | C |
|---|---|---|---|
| Desbordamiento horizontal (1440/768/390) | Ninguno | Ninguno | Ninguno |
| Errores de consola o de red | 0 | 0 | 0 |
| H1 único | Sí | Sí | Sí |
| Menú móvil: abre con Enter, cierra con Esc | Sí | Sí | Sí |
| Enlace «Saltar al contenido» visible con Tab | Sí | Sí | Sí |
| Estilos `:focus-visible` | Sí | Sí | Sí |
| Formulario de demostración sin envío real | Sí | Sí | Sí |
| Contraste WCAG de pares de texto clave | AA (coral solo en texto grande, 3,96:1) | AA | AA |

Contraste calculado con la fórmula WCAG 2.x sobre los tokens. Paletas de gráficos validadas con `validate_palette.js` (skill dataviz).

## Fallos encontrados y estado
| # | Dir. | Viewport | Fallo | Evidencia | Estado |
|---|---|---|---|---|---|
| 1 | A | todos | La letra capitular partía el nombre «Roiting» en «R / oiting» | antes/a-editorial-1440 | Corregido: capitular eliminada |
| 2 | A | 1440 | La etiqueta «20 contactos» de Referencias quedaba recortada al pie del sankey | antes/a-editorial-1440 | Corregido: margen vertical en el viewBox |
| 3 | A | 390 | Sankey con ancho mínimo de 640 px: texto a ~7 px y scroll lateral | antes/a-editorial-390 | Corregido: se redibuja al ancho real con texto a 12,5 px |
| 4 | A | 768 | «Automatización y CRM» chocaba con la descripción en el índice | antes/a-editorial-768 | Corregido: maquetación de 2 columnas en tablet |
| 5 | A | 390 | Notas al margen pegadas a la Figura 2 | antes/a-editorial-390 | Corregido: separación entre filas |
| 6 | B | 1440 | H1 en cinco líneas que empujaba el panel | antes/b-data-1440 | Corregido: escala del hero reducida |
| 7 | B | 390 | Matriz escalada al 55 %: etiquetas a ~6 px | antes/b-data-390 | Corregido: se redibuja al ancho real, texto a 12 px |
| 8 | B | todos | Puntos de la matriz encima de las etiquetas de cuadrante y solo 5 cuentas «Priorizar» | antes/b-data-1440 | Corregido: posiciones fijas que dejan libres las etiquetas |
| 9 | B | 1440 | Etiquetas de cuadrante de ancho distinto que desalineaban los títulos | antes/b-data-1440 | Corregido: columna fija de 96 px |
| 10 | B | 1440 | Tarjetas de registro a alturas distintas | antes/b-data-1440 | Corregido: anclaje al pie |
| 11 | B | 1440 | Cuadro de mando con hueco vacío bajo dos tarjetas | antes/b-data-1440 | Corregido: dos indicadores más (MQL→SQL, coste por oportunidad) |
| 12 | C | 1440 | La retícula de fondo no coincidía con las columnas reales | antes/c-industrial-1440 | Corregido: retícula generada con el mismo grid del contenido |
| 13 | C | 1440 | «OPERACIONES» tocaba el borde de su caja | antes/c-industrial-1440 | Corregido: tamaño fluido y anchura 62 % |
| 14 | C | 390 | Etiquetas del plano a ~5 px | antes/c-industrial-390 | Corregido: leyenda HTML 1–4 bajo el plano |
| 15 | C | 390 | Tabla de especificación con scroll lateral | antes/c-industrial-390 | Corregido: filas apiladas con etiquetas |
| 16 | C | 390 | Matriz de sectores: se perdía la columna del sector al desplazar | antes/c-industrial-390 | Corregido: primera columna fija + aviso |
| 17 | A/B/C | 390/768 | La etiqueta flotante «Prototipo» tapaba contenido | antes/*-390 | Corregido: solo visible en escritorio |

## Pendiente (no corregido)
- La matriz de sectores de C sigue necesitando desplazamiento lateral en móvil (con columna fija).
- No se ha pasado Lighthouse ni medido rendimiento; son prototipos con Google Fonts externas.
- Teclado probado solo en menú, enlace de salto y formularios; no se ha recorrido cada página entera con Tab.
- La revisión no sustituye la validación humana. No se declara aprobado ningún mockup.
