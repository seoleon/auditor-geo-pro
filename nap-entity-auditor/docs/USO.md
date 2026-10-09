# Manual de uso

## 1. Clientes y empresas

- **Clientes**: agrupan empresas o proyectos. Cada organización (agencia) solo ve sus propios clientes, empresas y auditorías.
- **Alta de empresa** (*Empresas → Nueva empresa*): datos generales, NAP oficial, perfiles y frecuencia de auditoría.
  - *Tipo de empresa* adapta las comprobaciones:
    - **Establecimiento físico**: se exige dirección completa para confirmar el NAP.
    - **Área de servicio**: puede marcarse «ocultar dirección»; si una fuente la publica, se avisa como posible inconsistencia.
    - **Online**: la dirección no se compara.
    - **Varias ubicaciones**: da de alta cada ubicación como empresa (campo *empresa matriz* vía API) para auditarlas por separado.
  - *Teléfonos antiguos*: permiten detectar fuentes desactualizadas (se marcan como inconsistencia confirmada).
  - *Horario*: formato `Mo-Fr 10:00-20:00; Sa 10:00-14:00` (también `L-V`).

## 2. Confirmar el NAP oficial

Los datos introducidos **no se usan como referencia hasta pulsar «Confirmar NAP oficial»** en la ficha. Cualquier cambio posterior en un campo NAP anula la confirmación y queda registrado en *Historial de cambios*.

Si aún no conoces el NAP correcto, puedes lanzar una auditoría sin confirmar: descubre y extrae fuentes, y la ficha mostrará **Datos detectados en Internet** (con frecuencia y fuentes) para ayudarte a validarlos con el negocio. Esos datos nunca se asumen correctos.

### Variantes de nombre

Las variantes conocidas quedan *pendientes*. En la ficha puedes **aprobarlas** (contarán como *variante equivalente*) o **rechazarlas** (contarán como *inconsistencia*). Un nombre parecido no registrado (p. ej. «Sadhana Massage Center» frente a «Sadhana Center») siempre queda en **revisión manual**. Formas jurídicas distintas (S.L./S.A.) nunca se equiparan automáticamente.

## 3. Auditorías

Pestaña *Auditorías e informes* → elegir modo → **Ejecutar auditoría**.

| Modo | Qué hace |
|---|---|
| **Real** | Proveedores configurados y páginas públicas accesibles. |
| **Económico** | Menos consultas (`ECONOMIC_MAX_QUERIES`) y páginas (`ECONOMIC_MAX_PAGES`), caché larga y **reutiliza** extracciones recientes de auditorías anteriores. |
| **Demo** | Datos **simulados** (dominios `*.invalid`), marcados en pantalla, CSV, Excel y PDF. Sirve para conocer la herramienta. |

Pasos de una auditoría: web oficial (portada + páginas de contacto/aviso legal/servicios) → búsqueda web → URLs aportadas → Google Places → Business Profile autorizado → extracción NAP → comparación → duplicados → datos estructurados → perfiles sociales → grafo → señales GEO → acciones. El progreso se ve en tiempo real; si algo falla la auditoría queda **parcial** con la limitación explicada y puede **reanudarse**.

### Estados de cada fuente

Se evalúan por separado nombre, dirección, teléfono, web y horario; el estado global resume los campos.

| Estado | Significado |
|---|---|
| Correcto | Coincide con el NAP oficial (diferencias de mayúsculas, tildes o espacios no cuentan). |
| Variante equivalente | Mismo dato con otro formato (C/ ↔ Calle, Avda. ↔ Avenida, Carrer ↔ Calle) o variante de nombre aprobada. |
| Inconsistencia confirmada | Dato distinto en una fuente **atribuida con evidencias** y extraído por un método fiable. |
| Posible inconsistencia | Diferencia con atribución o extracción insuficientes: **hipótesis**. |
| Posible duplicado | Forma parte de un grupo de fichas que podrían ser el mismo negocio. |
| Datos incompletos | Falta algún dato (p. ej. la planta o el código postal). |
| No encontrado | La página no muestra datos NAP atribuibles. |
| No verificable | No se pudo consultar (robots.txt, CAPTCHA, inicio de sesión, error, límite de páginas). |
| Revisión manual | Ambigüedad (varios teléfonos, nombre parecido, página sin atribuir). |

**Atribución**: una página se atribuye al negocio por coincidencias independientes (teléfono oficial o antiguo, enlace al dominio oficial, dirección, nombre, URL aportada por el usuario). Sin atribución no se habla de discrepancias: la fuente queda en revisión manual y su tipo pasa a «potencialmente irrelevante».

**Confianza** (0–100): puntuación interna basada en la atribución y la calidad del método de extracción (datos estructurados/API > HTML semántico > texto). No es un factor de Google.

### Prioridades

| Prioridad | Casos |
|---|---|
| **P0 crítica** | Teléfono o dirección incorrectos en la web oficial o en la ficha principal de Google; datos contradictorios en el schema oficial; ficha cerrada. |
| **P1 alta** | Inconsistencias confirmadas en mapas, directorios y perfiles; duplicados en plataformas relevantes. |
| **P2 media** | Variantes de nombre por validar; datos incompletos o posibles inconsistencias en directorios; errores de schema no críticos. |
| **P3 baja** | Diferencias de formato; oportunidades opcionales (completar datos, señales GEO). |

Una diferencia puramente tipográfica nunca es P0.

### Pestañas de la auditoría

- **Resumen**: indicadores, gráficos de estados y prioridades, consumo de APIs y limitaciones.
- **Citaciones**: tabla con fuente, URL, tipo, nombre/dirección/teléfono detectados, estado, confianza, fecha, prioridad y acción, con filtros, búsqueda, ordenación y paginación. **Evidencias** abre el detalle: dato, método, fragmento de evidencia, motivo, candidatos, señales de atribución, origen del descubrimiento y la **revisión manual** (cambiar el estado y anotar).
- **Acciones**: plan priorizado, separando *confirmadas* e *hipótesis*; puedes marcarlas como hechas o descartadas (los descartes se recuerdan en auditorías siguientes).
- **Duplicados**: grupos con motivos y advertencias; **confirmar** o **descartar** (la decisión se conserva). Nunca solicites eliminar una ficha sin comprobar que no es otra ubicación real.
- **Datos estructurados**: entidades detectadas, incidencias (error/aviso/info) y recomendaciones. Las propiedades opcionales ausentes son recomendaciones.
- **Perfiles sociales**: perfiles registrados, enlazados desde la web y declarados en `sameAs`; perfiles no registrados encontrados.
- **Google**: ficha pública (Places API) comparada campo a campo, estado de funcionamiento, Place ID, categoría y, si hay OAuth, los datos de Business Profile.
- **Grafo de entidad**: negocio, dominio, teléfonos, direcciones, perfiles, citaciones y menciones. Cada relación muestra su evidencia; las relaciones rojas son discrepancias.
- **GEO e IA**: señales observables (claridad de identidad, consistencia, schema, fuentes independientes, perfiles, servicios/ubicación, enlaces entre perfiles) y acceso de rastreadores de IA según robots.txt. No es una medición de posicionamiento en IA.
- **Consultas y registro**: cada consulta de búsqueda con proveedor, página y estado; registro de ejecución.

## 4. Informes

Botones **CSV**, **XLSX** y **PDF** en la auditoría o en la lista de auditorías.

- **CSV** (`;`, UTF-8): todas las fuentes con datos extraídos, estados por campo, evidencias y origen.
- **Excel**: Resumen ejecutivo · NAP oficial · Citaciones encontradas · Inconsistencias · Posibles duplicados · Datos estructurados · Perfiles sociales · Acciones recomendadas · Fuentes no verificables.
- **PDF**: portada, resumen ejecutivo, gráficos, metodología, resultados, **hallazgos confirmados** y **hipótesis** en secciones separadas, plan de corrección y limitaciones.

## 5. Seguimiento en el tiempo

- **Periódicas**: frecuencia semanal o mensual en la ficha (solo con NAP confirmado).
- **Comparar auditorías**: en la ficha, elige dos auditorías → citaciones nuevas, *no observadas en esta ejecución* (nunca se afirma que hayan desaparecido de Internet), datos modificados, cambios de estado, discrepancias resueltas, nuevas incidencias y las que persisten.
- **Panel**: totales de la última auditoría de cada empresa y evolución histórica.

## 6. Pruebas en buscadores de IA

Ficha → *Pruebas en IA*: registra manualmente consulta, proveedor, modelo, respuesta y fuentes citadas, o lánzala con una API configurada (OpenAI, Perplexity, Gemini). Se detecta si la respuesta menciona el nombre, teléfono oficial, dirección, dominio y ciudad, y se señalan teléfonos antiguos o distintos, direcciones distintas y dominios parecidos no oficiales. Una respuesta aislada no demuestra causalidad.

## Caso Sadhana Center

1. `python -m app.cli seed-sadhana --email …` (o alta manual con dominio `sadhanacenter.com`, país ES, ciudad Valencia).
2. Configura al menos un proveedor de búsqueda y, si es posible, `GOOGLE_PLACES_API_KEY` ([APIS.md](APIS.md)).
3. Lanza una auditoría **real** sin confirmar el NAP: descubrimiento, auditoría del sitio oficial y datos estructurados.
4. Revisa *Datos detectados en Internet* y valida con el negocio el nombre comercial, la dirección exacta (portal, planta, puerta) y el teléfono. Registra variantes y teléfonos antiguos conocidos.
5. Completa el NAP en *Editar* y pulsa **Confirmar NAP oficial**.
6. Lanza una nueva auditoría real: comparación NAP, duplicados, identidad digital, informe y plan de correcciones.
7. Añade directorios sectoriales (p. ej. fichas de masajes/bienestar) en *Directorios sectoriales conocidos* o mediante adaptadores (ver [APIS.md](APIS.md#directorios-sectoriales)), siempre que sus condiciones permitan la consulta automatizada.
8. Activa la auditoría mensual para el seguimiento.
