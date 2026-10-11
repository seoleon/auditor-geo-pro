# Rocky Adventures: El Reino de las Huellas

Videojuego 3D de aventuras y plataformas en tercera persona que se juega en el navegador.
El protagonista es **Rocky**, un bulldog francés atigrado, que recorre tres mundos conectados
por un mapa: **El Parque Encantado**, **La Ciudad de los Perros** y **La Playa del Tesoro**.

Todo el contenido es original y se genera por código: el modelo 3D de Rocky, sus animaciones,
los escenarios, las texturas, la música y los efectos de sonido. No se descarga ningún recurso
externo en tiempo de ejecución.

---

## Cómo ejecutarlo

Requisitos: [Node.js](https://nodejs.org) 20 o superior y un navegador moderno con WebGL 2
(Chrome, Edge, Firefox o Safari recientes).

```bash
cd rocky-adventures
npm install
npm run dev
```

Abre la dirección que muestra la consola (normalmente <http://localhost:5173>).

Versión optimizada para publicar:

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

La carpeta `dist/` es estática: se puede subir a cualquier hosting (GitHub Pages, Netlify…).

### Pruebas

```bash
npm test             # pruebas unitarias (guardado, malla de Rocky, coherencia de niveles)
npm run dev &        # en otra terminal
npm run test:e2e     # prueba de punta a punta del Parque en Chromium (Playwright)
```

La prueba E2E usa `?lowfx` (renderizado mínimo) porque se ejecuta con WebGL por software.

---

## Controles

| Teclado / ratón | Mando | Acción |
|---|---|---|
| W A S D | stick izquierdo | mover a Rocky |
| ratón (clic para capturarlo) | stick derecho | cámara |
| rueda | LB / LT | zoom |
| ESPACIO (mantener = más alto) | A | saltar |
| SHIFT (mantener = acelera) | RB / RT | correr |
| E | X | interactuar, excavar, leer carteles |
| F | B | ladrar |
| C | Y | agacharse y olfatear |
| ESC | Start | pausa |

---

## Funcionalidades implementadas

**Rocky**
- Modelo 3D continuo esculpido por campos de distancia (ver «Limitaciones»), con esqueleto de
  22 huesos, pesos de skinning automáticos, ojos con córnea brillante e iris, párpados, lengua,
  collar de cuero y Collar Legendario.
- Material de pelo corto atigrado procedural: rayas oscuras irregulares sobre marrón cálido,
  máscara negra en el hocico, mancha blanca en el pecho, trufa de cuero, uñas, interior rosado
  de las orejas, brillo aterciopelado («sheen»), microrrelieve y capas de pelo en el contorno.
- Animación procedural con transiciones suaves: caminar, trotar, galopar (sincronizado con la
  velocidad real), acelerar, frenar/derrapar, saltar, caer, aterrizar con amortiguación, orejas
  con física de muelle, giro de cabeza hacia objetos cercanos, olfatear, sentarse, tumbarse a
  dormir, sacudirse al salir del agua, ladrar, jadear con la lengua fuera, celebrar y parpadear.

**Jugabilidad**
- Controlador cinemático de Rapier: colisiones reales, escalones, pendientes, plataformas móviles.
- Aceleración/desaceleración, esprint progresivo, derrape, salto de altura variable, *coyote time*,
  búfer de salto y asistencia en bordes.
- Huesos dorados, galletas especiales (conchas en la playa), secretos, checkpoints, vidas,
  cajas rompibles (ladrando o saltando encima), enemigos originales (Erizos Castaño, Escobots,
  Cangrejos Gruñones) que se derrotan saltando encima y se aturden ladrando.
- Olfato (C): partículas doradas señalan la pista más cercana y revelan premios enterrados que
  se excavan con E.
- Misiones secundarias con recompensa en cada mundo (9 en total) y pequeños puzles.

**Mundos**
- *El Parque Encantado* (el más trabajado): lago con isla y puente roto, nenúfar móvil, túnel
  de piedra, casa del árbol con plataformas en espiral y pasarela, jardín secreto con puzle de
  campanas, parque infantil con pelota física y portería, claro secreto tras un tronco hueco,
  terrazas de piedra con plataforma móvil, colina elevada con la Puerta de las Huellas.
  Tres rutas a la meta (oeste, centro y este).
- *La Ciudad de los Perros*: manzanas con edificios de fachadas por pisos, tiendas con toldos
  saltables, coches, marquesina, bocas de riego interactivas, quiosco, andamios, ruta por las
  azoteas hasta una torre, callejón secreto, parque canino y vecinos bulldog animados.
- *La Playa del Tesoro*: mar con oleaje, muelle con barcas, islotes con puentes y balsas,
  faro con rampa en espiral, barco naufragado explorable, castillo de arena, palmeras,
  acantilados y la cueva del cofre con el Collar Legendario.

**Presentación**
- Cielo físico con ciclo lento de luz (amanecer/tarde/atardecer según el mundo), sombras suaves
  que siguen a Rocky, mapa de entorno generado del cielo, niebla atmosférica, nubes, hierba
  instanciada con viento que se aparta al paso de Rocky, árboles procedurales, flores,
  mariposas, motas de luz, agua con profundidad y espuma, partículas (polvo, salpicaduras,
  destellos, confeti), posprocesado (bloom, viñeta, AO en calidad alta, SMAA).
- Cámara en tercera persona con colisión, zoom, encuadre dinámico al correr y ajuste en saltos.
- Audio 100 % sintetizado: ladridos, pasos por superficie, saltos, premios, ambiente (pájaros,
  viento, agua, olas, gaviotas, tráfico) y una pieza musical distinta por mundo. Volumen y
  silencio independientes para música y efectos.
- Interfaz: menú principal sobre la escena 3D, mapa de mundos, controles, opciones (calidad
  BAJO/MEDIO/ALTO, volúmenes, sensibilidad, invertir eje, FPS), HUD con huesos, galletas,
  vidas, objetivo, barra de progreso, misiones, indicaciones contextuales, avisos, pausa,
  victoria y pantalla de derrota.
- Guardado automático en `localStorage` con versión de esquema, validación, migración y copia
  de seguridad para recuperarse de datos corruptos.
- Rendimiento: instancing, LOD de la hierba por distancia, *frustum culling*, resolución
  adaptable según los FPS, generación de Rocky en un Web Worker y carga diferida de cada mundo.

---

## Recursos gráficos y licencias

No se usa ningún recurso de terceros: modelo, texturas, música y sonidos se generan por código
en este repositorio. Bibliotecas empleadas (todas de código abierto):

| Biblioteca | Uso | Licencia |
|---|---|---|
| three.js | motor 3D | MIT |
| React, React DOM | interfaz | MIT |
| @react-three/fiber, drei, postprocessing, rapier | integración React/Three, utilidades, efectos, físicas | MIT |
| postprocessing | efectos de pantalla | Zlib |
| @dimforge/rapier3d-compat | motor de físicas | Apache-2.0 |
| zustand | estado del juego | MIT |
| @fontsource/fredoka, @fontsource/baloo-2 | tipografías | SIL Open Font License 1.1 |

> El entorno de desarrollo no tenía acceso a Poly Haven ni a otros repositorios de modelos,
> así que todas las texturas son procedurales (generadas en `src/worlds/common/textures.ts`).

---

## Limitaciones conocidas

- **Rocky no es un escaneo fotorrealista.** Es un modelo continuo y orgánico (no está hecho de
  piezas sueltas) esculpido con funciones de distancia y convertido a malla, con pelo atigrado
  procedural. Tiene proporciones y rasgos de bulldog francés, pero no alcanza el detalle de un
  modelo profesional esculpido a mano o escaneado (pliegues finos de la piel, pelo individual,
  textura fotográfica). Ver abajo cómo sustituirlo.
- Las animaciones son procedurales (no capturadas): naturales y con transiciones suaves, pero
  no tienen la riqueza de una captura de movimiento real.
- No hay reflejos planares reales en el agua: refleja el cielo mediante el mapa de entorno.
- La Ciudad y la Playa son completas y jugables pero más pequeñas que el Parque.
- Mando: probado con la asignación estándar de la Gamepad API; mandos con asignación no
  estándar pueden necesitar ajustes.
- Las pruebas automáticas se ejecutaron con WebGL por software (muy lento); el rendimiento en
  una GPU real debe comprobarse en tu equipo (calidad MEDIO recomendada).

---

## Cómo cambiar el modelo por uno fiel a las fotos de tu Rocky

### Opción A — Ajustar el modelo procedural (rápido)

1. **Colores del pelaje**: edita `ROCKY_COAT` en `src/shaders/furMaterial.ts`
   (`base` = color claro, `stripe` = rayas, `brindle` = cantidad de rayas 0–1,
   `whiteAmount` = mancha del pecho, `mask` = hocico).
2. **Proporciones**: cada parte del cuerpo es una primitiva en
   `src/characters/rocky/anatomy.ts` (cráneo, mejillas, hocico, orejas, patas…) con su centro y
   radios en metros. Por ejemplo, para orejas más grandes cambia `radii` de `ear()`; para un
   hocico más chato, reduce la `z` de `muzzle` y `nose`.
3. Revisa el resultado con el visor: `http://localhost:5173/?viewer=rocky&cam=front`
   (`cam` = front | side | three | head | back; `anim` = walk | run | sit | sleep | sniff |
   jump | shake | celebrate | bark | pant).

### Opción B — Usar un modelo 3D profesional (máxima fidelidad)

1. Consigue un modelo de bulldog francés en **GLB/glTF** con esqueleto: encargándolo a un artista
   con tus fotos de referencia, con fotogrametría (p. ej. Polycam o RealityScan con una serie de
   fotos de Rocky quieto) o con un modelo de licencia libre (CC0/CC-BY) que luego se texturiza
   con sus fotos en Blender.
2. Reproyecta o pinta la textura en Blender usando las fotos de Rocky como referencia.
3. Exporta como `public/models/rocky.glb`.
4. Sustituye el contenido de `RockyModel` (`src/characters/rocky/RockyModel.tsx`) por la carga
   del GLB con `useGLTF('./models/rocky.glb')` de drei. Si el GLB incluye animaciones
   (idle, walk, run, jump…), reprodúcelas con `useAnimations` según `handle.input`
   (velocidad, `grounded`, `crouching`…); si no las incluye, nombra los huesos del modelo como
   los de `anatomy.ts` (`pelvis`, `spine`, `chest`, `neck`, `head`, `jaw`, `earL`…) y el
   animador procedural actual los moverá sin más cambios.
5. Ajusta `ROCKY_SCALE` en `src/characters/Player.tsx` para que mida ~0,9 m en el juego.

---

## Estructura

```
src/
  animations/   animador procedural de Rocky
  audio/        motor de audio sintetizado y música
  characters/   Rocky (escultura SDF, malla, skinning, modelo), jugador, perros NPC
  components/   lienzo 3D, cámara, partículas
  gameplay/     coleccionables, olfato, mecánicas, enemigos, tipos de nivel
  physics/      (el controlador cinemático vive en characters/Player.tsx)
  shaders/      material de pelo, ruido GLSL
  stores/       estado global (Zustand) y estado de sesión del nivel
  systems/      entrada, guardado, eventos, estado compartido, puente de depuración
  ui/           menús, HUD, iconos y estilos
  utils/        aleatoriedad determinista, banderas de URL
  worlds/       parque, ciudad, playa y piezas comunes (terreno, agua, hierba, vegetación…)
public/         favicon (modelos, texturas, sonidos y música se generan por código)
tests/          pruebas unitarias y E2E
```
