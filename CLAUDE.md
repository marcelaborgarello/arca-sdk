# arca-sdk

SDK de TypeScript para los web services de ARCA (ex-AFIP): WSAA (autenticación),
WSFE (facturación electrónica), Padrón A13 y CAEA (contingencia).

- Autora: Marcela Borgarello
- Repo: https://github.com/marcelaborgarello/arca-sdk · npm: `arca-sdk` · Licencia MIT

## Esto es una librería open source, no una app

Es la restricción de diseño más importante del proyecto y la que más fácil se olvida.

- **La vara de corrección es la spec de ARCA, no ningún consumidor en particular.**
  Que la autora no use una feature (CAEA, comprobantes de servicios, MiPyME) no la
  vuelve menos importante: alguien la usa. No validar decisiones contra un solo caso de uso.
- **Pensar en todos los usos plausibles**, no en el más obvio. Un SaaS multi-tenant
  factura a cualquier hora del día; un script de backoffice corre a las 3 AM en un
  servidor en UTC; alguien va a pasar un string donde esperabas un `Date`.
- **Los cambios de API son públicos.** Romper una firma obliga a migrar a terceros.
  Preferir cambios aditivos; si hay que romper, es major y va documentado.
- Hay PRs y contribuciones externas. El código lo lee gente que no tiene el contexto
  de la conversación en la que se escribió: los comentarios explican el *porqué*
  normativo, no el *qué* del código.

## Comandos

Runtime y package manager: **Bun** (hay `bun.lock`).

```bash
bun install
bun run lint             # tsc --noEmit
bun run test             # vitest run — tests unitarios
bun run test:integration # vitest run contra ARCA homologación (opt-in, ver abajo)
bun run build            # tsup (ESM + CJS + .d.ts)
```

El CI (`.github/workflows/ci.yml`) corre lint → build → test en cada PR contra `main`.
Un PR no se acepta con el check en rojo.

> **Es `bun run test`, no `bun test`.** El segundo usa el runner nativo de Bun, donde
> los `vi.mock` se filtran entre archivos: la suite queda menos aislada de lo que
> parece. El runner oficial del proyecto es **vitest**, y el CI usa `bun run test`
> desde 2026-09-25 justamente para que local y CI corran lo mismo.

## Normativa ARCA

El SDK sigue el **Manual del Desarrollador RG 4291 – Proyecto FE (`wsfev1`)**, que ARCA
versiona aparte de las resoluciones generales. El historial de cambios del PDF es la
fuente autoritativa para cambios técnicos: los medios y las consultoras suelen errarle
a las fechas de vigencia.

**Manual vigente (v4.8)**:
<https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf>

> **ARCA publica el manual en varias URLs, y no siempre tienen la misma versión.**
> Al 25/09/2026:
>
> | URL | Versión |
> |---|---|
> | `arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf` | **v4.8** ← usar esta |
> | `afip.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf` | v4.8 (mismo archivo, dominio viejo) |
> | `arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf` | v4.7 |
>
> Encima, la página índice (`/fe/ayuda/webservice.asp`) anunciaba "V. 4.7" cuando la
> v4.8 ya estaba publicada. Bajá las dos y compará la portada, que trae número de
> versión y fecha de revisión. Quedarse con la primera que aparece en el buscador es
> cómo se pierde un cambio de vigencia.

Ya contemplado (no reportar como novedad):

- **RG 5866/2026** (01/07/2026): unificó y abrogó el régimen de factura electrónica.
  Tope de $10.000.000 para identificar al comprador Consumidor Final.
- **RG 5762/2025**: disolución de la Factura clase "M". Se emiten Facturas A con leyenda
  ("OPERACIÓN SUJETA A RETENCIÓN" / "PAGO EN CBU INFORMADA") vía el campo `optionals`.
- **RG 5616/2024**: `CondicionIVAReceptorId`. Pasa a ser **obligatorio el 01/12/2026**
  (manual v4.8) — no el 01/09, como afirman varias fuentes secundarias.
- **RG 5782** (manual v4.6, 01/08/2026): todos los puntos de venta CAEA pasan a
  Contingencia y `CbteFchHsGen` es obligatorio.
- Migración de endpoints `*.afip.gob.ar` → `*.arca.gob.ar` y QR en
  `https://www.arca.gob.ar/fe/qr/?p=...`.

**Vigente y todavía NO implementado** (verificado contra el PDF el 25/09/2026):

- **Manual v4.7 (01/09/2026)**: comprobantes de **Seguros de Caución** — códigos de
  validación 10273 a **10282** (son diez, no nueve), más la modificación del 10054.
  En la misma versión entran las validaciones de **comprobantes clase B con receptor
  Sujeto No Categorizado** (10283 para CAE, 1527 para CAEA; modifica 10067 y 1425).
  El 10283 exige informar el tributo `ID 13 – Percepción de IVA No Categorizado`
  (RG 2126/2006) en el array `Tributos` — que el SDK **no construye**: `ImpTrib` está
  fijo en `0.00` en los dos builders.
- **Manual v4.8 (01/12/2026)**: `CondicionIVAReceptorId` pasa a obligatorio y los
  códigos 10245 (CAE) y 825 (CAEA) — los que sólo *observan* — quedan en desuso.
  A partir de esa fecha el rechazo es 10246 / 826.

  > **Homologación ya lo rechaza** (verificado el 25/09/2026). Un `FECAESolicitar`
  > sin `CondicionIVAReceptorId` vuelve con `Resultado = 'R'`, CAE vacío y la
  > observación del **10246**, no la del 10245. O sea: la fecha del 01/12/2026 es la
  > de *producción*; homologación se adelantó para que se pueda probar. Emitir sin
  > ese campo ya es imposible ahí, y el SDK lo informa siempre que pueda.
- Tipo de documento receptor `31 - FCI CNV` (v4.5, 02/07/2026) todavía no está en el
  enum `TaxIdType`. Con `DocTipo=31` el número de documento es numérico de hasta
  4 dígitos (código 10271).

### `VatCondition` no es el catálogo de `CondicionIVAReceptorId`

Son **dos tablas distintas** y el SDK hoy usa un solo enum para las dos. El catálogo
que valida ARCA en ese campo —el que devuelve `FEParamGetCondicionIvaReceptor`— es:
1, 4, 5, 6, 7, 8, 9, 10, **13** (Monotributista Social), **15** (IVA No Alcanzado) y
**16** (Monotributo Trabajador Independiente Promovido).

No es correlativo: **2, 3 y 11 no existen ahí**. Mandarlos da rechazo 10242. Y cada
código aplica sólo a ciertas clases de comprobante (10243 rechaza la combinación
inválida; ej. Consumidor Final no va en Factura A).

### Tique (81/82/83) vs. Factura: dos regímenes distintos, no dos formatos de lo mismo

`InvoiceType.TICKET_A/B/C` (81/82/83) no son "una Factura con otro nombre" —
son la clase de comprobante "Tique", regida por la **RG 3561/2013
(Controladores Fiscales)**, una resolución aparte de la RG 4291/wsfev1 que
sigue el resto del SDK. El puente entre ambos regímenes es la **RG 4290/2018**:
sus Arts. 6-7 dan a los sujetos alcanzados por RG 3561 la opción "y/o" entre
Controlador Fiscal y comprobantes electrónicos — pero la tabla de tipos de
comprobante del Art. 3° de esa misma RG (texto vigente, incorpora
modificaciones hasta RG 5764/2025) sigue marcando los códigos 081-120 con
"(*) Solo emitidos con Controladores Fiscales". Esa opción "y/o" es para
Factura/NC/ND, no para Tique.

> **Revisado contra la RG 5893/2026** (BO 31/08/2026, vigencia 01/11/2026), que
> **reescribió los Arts. 6° y 7° de la RG 4290** y derogó el Cap. B del Título II.
> La conclusión no cambia:
>
> - La opción sigue existiendo — el Art. 7° nuevo dice textual que los sujetos
>   *"podrán optar por una de las DOS (2) modalidades […] o ambas en forma conjunta"*.
> - **El Art. 3° no fue tocado**, y es el que sostiene el argumento: la tabla que marca
>   los códigos 081-120 como exclusivos de Controlador Fiscal.
>
> Lo que sí cambió es *a quiénes* alcanza (ahora nombra explícitamente a responsables
> inscriptos, exentos, no alcanzados en IVA y monotributistas) y agrega tres casos que
> **no pueden optar** y deben emitir sólo electrónico: MiPyMEs con Factura de Crédito
> Electrónica, los no alcanzados por IVA, y los del Anexo II de la RG 4291.
>
> La misma RG incorpora un párrafo al Art. 11 de la RG 4291: a los monotributistas sin
> punto de venta, ARCA les habilita uno automático — pero asociado a **"Comprobantes en
> línea"**, no a Web Services. Un punto de venta así **no sirve para este SDK**
> (daría error 10048); hace falta dar de alta uno de tipo Web Services.
> *Esto último es una inferencia a partir del texto, no está afirmado en la RG.*

**Confirmado empíricamente contra ARCA homologación (2026-08-28)**:
`FECAESolicitar` con `CbteTipo=83` se rechaza con error ARCA **11001**
("no es un tipo de comprobante valido. Ver metodo FEParamGetTiposCbte") desde
un punto de venta Web Services estándar — el único tipo de punto de venta que
un consumidor del SDK puede tener. La misma llamada con `CbteTipo=11`
(Factura C) se acepta sin problema. O sea: `issueSimpleReceipt()` e
`issueReceipt()` (`src/services/wsfe.ts`), que hardcodean `TICKET_C`, no
funcionan contra ARCA real para prácticamente nadie que use el SDK. No es un
problema de elegibilidad por actividad económica (la duda original) — el tipo
de comprobante en sí está fuera del alcance de un punto de venta que no sea
Controlador Fiscal.

Existe un régimen distinto y posterior para tique 100% electrónico sin
hardware — **RG 5198/2022** ("Facturador", régimen especial de emisión
electrónica de comprobantes originales) — pero usa otros códigos (109
"Tique C", 114 "Tique Nota de Crédito C"), no 81/82/83, y no se investigó si
es alcanzable vía un webservice de integración general o solo vía la app
propia de ARCA.

**Resuelto a medias (v1.4.1)**: `issueSimpleReceipt()` e `issueReceipt()` quedaron
marcados `@deprecated` y emiten un warning en runtime fuera de producción. Siguen
funcionando igual que antes — la deprecación avisa, no cambia el comportamiento.

Lo que **no** está decidido es el destino final: eliminarlos en el próximo major o
cambiarlos para que emitan Factura C. Hacerlos emitir un comprobante distinto del que
dice el nombre es peor que borrarlos, pero borrarlos rompe a terceros. Es un cambio
de API pública: no se resuelve sin discutirlo primero.

## Fechas: instante vs. fecha-calendario

La trampa más grande del proyecto, y la causa de un bug real.

ARCA opera **siempre** en horario de Argentina (UTC-3, sin DST). Un `Date` de JS es un
*instante*; `CbteFch` es una *fecha-calendario*. Con un `Date` pelado las dos cosas son
indistinguibles, y elegir mal desplaza el comprobante un día.

Los campos de fecha usan `ArcaDateInput = Date | string` (`src/utils/formatArcaDate.ts`):

- `'2026-08-24'` / `'20260824'` → fecha literal, sin conversión. Forma recomendada.
- `new Date()` → instante, se convierte al día calendario argentino.
- Un `Date` en medianoche UTC exacta se trata como fecha-calendario (es como se
  construye "un día" en JS: `new Date('2026-08-24')`).
- `generatedAt` (→ `CbteFchHsGen`) es la excepción: un `Date` ahí es **siempre** un
  instante, porque la hora es justamente el dato que ARCA valida.

**Nunca uses `toISOString()` para armar una fecha de comprobante.** Usá
`formatArcaDateOnly()` (`yyyymmdd`) o `formatArcaTimestamp()` (`yyyymmddhhmmss`).

Nota: `CbteFch` y `CbteFchHsGen` **pueden** diferir legítimamente — para concepto 1 la
fecha del comprobante admite ±5 días respecto de la de generación. No agregar una
validación de igualdad estricta entre ambos.

## Estructura

```
src/
  auth/       wsaa.ts (login), ticket.ts, storage.ts
  services/   wsfe.ts (facturación), caea.ts (contingencia), padron.ts
  types/      un archivo por servicio + common.ts
  utils/      formatArcaDate, crypto, xml, qr, network, calculations
  constants/  endpoints.ts, errors.ts (hints por código de error de ARCA)
```

El XML SOAP se arma con template strings, no con un serializador. **El orden de los
elementos importa**: el esquema es un `sequence` y `FECAEADetRequest` extiende
`FEDetRequest` agregando `CAEA` y `CbteFchHsGen` al final, en ese orden.

La contracara de armar XML a mano: **hoy ningún valor se escapa**. Un `&`, `<` o `>`
en un campo de texto genera XML inválido — el más fácil de disparar es un `Opcional`
con razón social o domicilio (`'Belgrano 123 & Cía'`). Los campos numéricos (CUIT,
importes) no corren riesgo, por eso no explotó todavía. Si tocás un builder, no
agregues interpolaciones de texto libre sin escapar.

**Deuda conocida — el orden está desviado del XSD en los dos builders**, no sólo en
CAEA (verificado contra el manual el 25/09/2026):

- `buildCAERequest()` (`src/services/wsfe.ts`): `CondicionIVAReceptorId` va pegado a
  `DocNro` en vez de después de `MonCotiz`; `ImpTrib` e `ImpIVA` están invertidos; y
  las `FchServ*` van después de `MonId/MonCotiz` en vez de antes.
- `FECAEADetRequest` (`src/services/caea.ts`): `CondicionIVAReceptorId` pegado a
  `DocNro`, las `FchServ*` después de `CbteFchHsGen`, y `CAEA`/`CbteFchHsGen` **no
  están al final** (el XSD los pone después de `PeriodoAsoc`).

Funciona hoy, así que ARCA está siendo tolerante. El riesgo real llega el **01/12/2026**:
ese día `CondicionIVAReceptorId` se vuelve obligatorio y pasa de ser un campo que casi
nadie manda a ir en todos los requests, en la posición equivocada.

**Trampa al unificar los dos builders**: el orden de los importes es legítimamente
distinto entre uno y otro. `FECAEDetRequest` define `ImpOpEx, ImpTrib, ImpIVA`;
`FECAEADetRequest` define `ImpOpEx, ImpIVA, ImpTrib`. No es una errata del PDF.

**Resuelto (v1.4.2)**: bajo Bun, el `https.Agent` de `src/utils/network.ts` fallaba con
`FailedToOpenSocket` porque `process.versions.node` también existe bajo Bun (por
compatibilidad) y el string de ciphers en sintaxis OpenSSL (`'DEFAULT:!DH@SECLEVEL=0'`)
no lo entiende BoringSSL, el TLS de Bun. Se agregó detección explícita de
`process.versions.bun` para omitirlo ahí. Ver `getArcaOpenSslCiphers()` en ese archivo.

## Convenciones

- **Commits**: conventional commits en minúscula, con scope.
  `fix(wsfe): ...`, `feat(caea): ...`, `chore: ...`
- **Ramas**: `feat/`, `fix/`, `chore/`, `cleanup/`. PR contra `main`.
- **Versionado**: semver. Campo opcional nuevo = minor; cambio de firma = major.
  El `CHANGELOG.md` está en español, agrupado por tipo de cambio y con la RG o versión
  del manual que motiva cada entrada.
- **Comentarios y docs en español** (rioplatense); identificadores y API en inglés.
- Los tests referencian la normativa que cubren
  (ej. `// RG 5782 — Manual del Desarrollador RG 4291 v4.6`).
- **Publicar en npm**: ver `RELEASING.md`. Tiene el checklist y la traducción de los
  errores de npm, que son engañosos (un `E404` en el publish es casi siempre un problema
  de credenciales, no un paquete inexistente).

## Rechazo ≠ error

ARCA distingue dos cosas que es fácil confundir:

- **`Errors`** en la respuesta: la llamada no se pudo procesar (auth, parámetros).
- **`Resultado = 'R'`**: la llamada se procesó bien y ARCA **no autorizó**. No hay CAE
  y el comprobante no existe; el motivo viene en `Observaciones`.

Lo segundo llega como `ArcaRejectionError`, con las observaciones en `.observations`.
Hasta la v1.x se devolvía un `CAEResponse` con `result: 'R'` y `cae: ''`, así que quien
no mirara `result` creía haber facturado — pérdida silenciosa de datos. **No volver a
ese comportamiento**: si un rechazo no puede distinguirse de un éxito sin inspeccionar
un campo, alguien lo va a ignorar.

Ojo con las *observaciones sin rechazo*: un comprobante puede salir `'A'` **con**
observaciones. Eso no es un error y no debe lanzar; viaja en `observations`.

## Tests de integración

`tests/integration/` pega contra ARCA homologación de verdad. Es lo único que puede
ponerse rojo por un rechazo de ARCA — el resto de la suite mockea `callArcaApi` y sólo
prueba que el SDK hace lo que creemos, no que ARCA lo acepte.

Es opt-in por variables de entorno y no corre en CI. Ver `tests/integration/README.md`.

Dos cosas que muerden:

- **ARCA no emite un TA nuevo mientras el anterior siga vigente** (12 h). Sin persistir
  el ticket, la segunda corrida se come *"El CEE ya posee un TA valido"* y queda
  bloqueada hasta que expire. Por eso los tests usan un `TokenStorage` en archivo, que
  es además lo que necesita cualquier consumidor en producción.
- La numeración es correlativa y real: no correr dos suites en paralelo contra el mismo
  punto de venta.

**Regla de diseño**: ningún tipo de comprobante entra al enum público ni recibe helper
dedicado sin una corrida verde ahí. La lista autoritativa la da `FEParamGetTiposCbte`.

## Al tocar código

- Correr `bun run lint` y `bun run test` siempre. Ojo: es `bun run test` (vitest run),
  **no** `bun test` — son runners distintos y bajo el nativo de Bun los `vi.mock` se
  filtran entre archivos. El CI usa `bun run test`.
- Agregar tests de regresión con los casos
  borde de zona horaria: medianoche, 21:00-00:00 ART, fecha-calendario vs. instante.
- Si tocás un builder de XML, agregá la aserción de orden en
  `tests/unit/request-xml.test.ts`. El helper `expectSequence()` ya está: el resto de
  la suite no puede ver un `sequence` roto.
- No modificar la normativa implementada sin verificar contra el PDF oficial del manual.
  Las fuentes secundarias se equivocan seguido.

## Nota sobre el repo

No hay `.gitattributes` y los archivos están en CRLF en disco pero LF en el índice, así
que `git status` marca como modificados archivos que nadie tocó. Para ver el diff real:

```bash
git diff --ignore-cr-at-eol
```

Se arregla con `.gitattributes` (`* text=auto eol=lf`) + `git add --renormalize .`, pero
eso genera un commit que toca todo el árbol: va solo, nunca mezclado con otro cambio.
