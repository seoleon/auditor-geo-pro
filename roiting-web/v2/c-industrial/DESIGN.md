# DESIGN · C Estrategia industrial

## Tokens
| Token | Valor | Uso |
|---|---|---|
| `--bg` | #F1F0EC | Fondo |
| `--white` | #FAFAF8 | Tablas, plano, secciones alternas |
| `--ink` | #111111 | Texto, bordes de 2 px, botón |
| `--steel` | #5E6266 | Texto secundario (5,39:1) |
| `--yellow` | #FFC629 | Relleno de señal con texto negro (12,01:1) |
| `--dark` | #141414 | Banda de disciplinas y CTA |

Sin radios ni sombras: bordes de 1–2 px. Titulares en Archivo al 62 % de anchura, peso 800, mayúsculas. Escala fluida hasta 168 px en el H1.

## Componentes
- **Cabecera en celdas** con navegación numerada y menú móvil amarillo a pantalla completa.
- **Plano isométrico** con llamadas 1–4, cota del ciclo de compra y cajetín (plano, objeto, escala, revisión). En móvil, las etiquetas pasan a una leyenda HTML.
- **Banda de disciplinas** en 6/3/2 columnas.
- **Tabla de especificación** (requisito / situación / con sistema), apilada en móvil.
- **Organigrama del comité de compra** con lo que necesita cada rol.
- **Catálogo de servicios** con códigos de referencia y hover amarillo.
- **Diagrama de proceso** con estaciones, entradas y salidas; lista numerada en móvil.
- **Matriz sector × canal** con columna fija y aviso de desplazamiento en móvil.
- **Orden de trabajo** (formulario en celdas).

## Breakpoints
>1100 navegación completa · 600–1023 tablet · <600 móvil.
