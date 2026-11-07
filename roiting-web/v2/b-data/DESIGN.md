# DESIGN · B Data / premium tech

## Tokens
| Token | Valor | Uso |
|---|---|---|
| `--deep` | #0B2929 | Fondo oscuro principal |
| `--ink` | #123C3B | Paneles, texto sobre papel |
| `--paper` | #F7F3ED | Secciones claras |
| `--on-deep` / `--on-deep-2` | #F2EFE8 / #A9C0BC | Texto sobre oscuro (8,03:1 el secundario) |
| `--muted` | #586D6B | Texto secundario sobre papel (4,98:1) |
| `--accent` | #E8643F | Acción y dato clave (4,64:1 sobre #0B2929) |
| `--accent-ink` | #B2431F | Terracota para texto sobre blanco |
| `--teal` | #20A890 | Segunda serie de datos |

Radios 10 / 18 px; botones en píldora. Escala fluida de 8 pasos. Contenedor 1240 px.

## Componentes
- **Cabecera translúcida** con hoja de menú móvil en rejilla de accesos.
- **App de demanda**: cuentas con intención (score + medidor), línea de oportunidades, siguiente acción.
- **Registro que se transforma**: 4 estaciones con tarjeta mono que añade campos resaltados.
- **Matriz encaje × intención**: dispersión SVG redibujada al ancho real (texto siempre a 12 px), cuadrante prioritario resaltado, leyenda HTML.
- **Configurador de módulos**: casillas accesibles que encienden capas sobre la base «Medición hasta la oportunidad».
- **Registro de versiones** como método (v0.1 → v1.x).
- **Cuadro de mando**: tarjeta grande de barras + 4 tarjetas de indicador.
- **Formulario** con control segmentado de ciclo de venta.

## Breakpoints
≥1024 escritorio · 600–1023 tablet · <600 móvil (480 para el formulario).
