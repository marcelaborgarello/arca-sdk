# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

---

## [Sin publicar]

### 🐛 Padrón A13: el endpoint de producción no coincidía con el manual

- `PADRON_A13_ENDPOINTS.produccion` apuntaba a `aws.arca.gob.ar`. El *Manual Consulta a Padrón – Alcance 13 v1.4* (sección 2.3) documenta producción en `aws.afip.gov.ar` — a diferencia de WSAA y WSFE, A13 no migró ningún ambiente a `arca.gob.ar` según su manual.
- **No era un bug activo**: los dos hosts resuelven hoy a la misma IP (verificado por DNS), así que no hay cambio de comportamiento. Es una migración que el SDK había asumido sin que el manual de A13 la confirme — misma familia que el bug del endpoint de homologación (v3.1.0, 2026-10-01), sólo que ese sí estaba roto y este no, todavía.
- Corregido a `aws.afip.gov.ar`, coincidiendo con el manual.

### ✨ Padrón A13: nuevo método `getTaxpayerAllowInactive()` — consultar una clave INACTIVA

- Cuarto y último de los métodos del manual (sección 3.4, `getPersonaV2`). Mismo request que `getTaxpayer()` (no agrega parámetros); la diferencia es que ARCA no falla cuando la clave está INACTIVA, sino que devuelve los datos completos igual. Es el gap que `CLAUDE.md` señalaba como el más valioso de los tres métodos que faltaban: hasta ahora el SDK no podía consultar un contribuyente inactivo, que es justo el caso en que más importa mirar antes de facturarle a alguien (wsfev1 rechaza un receptor inactivo con el 10247).
- **Es un método nuevo, no una opción en `getTaxpayer()`**: la decisión se tomó explícitamente para que el nombre del método describa qué llamada de red se hace, sin filtrar `getPersonaV2` (nombre del método SOAP) a la firma pública.
- `Taxpayer` gana `inactiveRelatedKeys?: number[]` (campo `claveInactivaAsociada` del manual) — es parte del tipo `Persona` que comparten `getPersona` y `getPersonaV2`, así que también se mapea en `getTaxpayer()`, no sólo en el método nuevo.
- Se generalizó el parseo interno (antes específico de `getPersonaResponse`) para que lo comparte con `getPersonaV2Response`: la única diferencia entre los dos métodos SOAP es el nombre del elemento raíz de la respuesta.
- **Verificado contra ARCA homologación real** (2026-10-02), con un CUIT INACTIVO de verdad del dataset sintético (no un ejemplo armado a mano): `getTaxpayer()` del mismo CUIT falla con el hint de `PADRON_INACTIVE`, y `getTaxpayerAllowInactive()` devuelve los datos completos.
- Con los cuatro métodos del manual implementados (`getTaxpayer`, `dummy`, `getTaxpayerIdsByDocument`, `getTaxpayerAllowInactive`), Padrón A13 deja de estar "implementado a medias".

### ✨ Padrón A13: nuevo método `getTaxpayerIdsByDocument()` (DNI → CUITs)

- Tercero de los cuatro métodos del manual (sección 3.3, `getIdPersonaListByDocumento`). Resuelve las claves (CUIT/CUIL) asociadas a un número de documento — el caso de la RG 5866 (tope de $10.000.000 para identificar al Consumidor Final) cuando se tiene el DNI del comprador pero no la CUIT.
- Tipo nuevo `TaxpayerIdsResponse` (`taxIds?: number[]`, `error?`, `hint?`), mismo patrón que `TaxpayerResponse`: informa por valor, no lanza para faults de negocio. Un array vacío es éxito (documento sin claves asociadas), no error.
- **Verificado contra ARCA homologación real** (2026-10-02): una consulta con un DNI de prueba devolvió 25 CUITs asociados — confirma que el parseo del array (`idPersona` repetido) funciona con una respuesta real, no sólo con el ejemplo del manual.
- **Hallazgo que no está en ningún manual**: probar el método con un documento con ceros a la izquierda devuelve el fault *"El número de documento consultado es inválido."* — no es uno de los siete mensajes del anexo 5.3 (ese anexo sólo cubre `getPersona`/`getPersonaV2`, por `idPersona`). Se agregó como `PADRON_INVALID_DOCUMENT` en `getPadronHint()`/`PADRON_MESSAGE_PATTERNS`, y es el único de los faults de A13 confirmado contra ARCA real, a diferencia de los otros seis (que siguen saliendo del texto entrecomillado del manual, sin provocar).
- Queda uno de los tres métodos que faltaban: `getPersonaV2` (consultar una clave inactiva) — ver `pendientes.md`.

### ✨ Padrón A13: nuevo método `dummy()` para verificar el estado del servicio

- El manual (*Manual Consulta a Padrón – Alcance 13 v1.4*, sección 3.1) documenta cuatro métodos y el SDK sólo implementaba uno (`getPersona`, como `getTaxpayer()`). Se agregó `dummy()`, que devuelve el estado de los tres componentes que reporta ARCA (`appServer`, `authServer`, `dbServer`, cada uno `'OK' | 'ERROR'`) vía el tipo nuevo `PadronServiceStatus`.
- **Es el único de los cuatro métodos que el manual exceptúa de autenticación** (sección 2.2): `dummy()` no pasa por `WsaaService.login()`, a diferencia de `getTaxpayer()`.
- **Verificado contra ARCA homologación real** (2026-10-02): los tres componentes en `OK`.
- Quedan dos de los tres métodos que faltan del manual: `getIdPersonaListByDocumento` (DNI → CUITs) y `getPersonaV2` (consultar una clave inactiva) — ver `pendientes.md`.

### ✨ `TokenStorage.get/save` ganan un `service` opcional, para no mezclar el TA de dos servicios

- Un mismo CUIT y ambiente (`cuit:env`) puede tener TAs vigentes de más de un servicio ARCA a la vez — `wsfe` y `ws_sr_padron_a13`, por ejemplo. `TokenStorage.get/save` sólo recibían `cuit` y `env`, así que un storage compartido entre `WsfeService` y `PadronService` devolvía el TA del servicio equivocado y ARCA lo rechazaba con *"Token recibido es para el servicio [X], deberia ser para servicio [Y]"* (visto a mano el 2026-10-01).
- Se agregó un tercer parámetro `service?: string` a `get()` y un cuarto a `save()`, y `WsaaService.login()` ya los pasa (`this.config.service`) en las dos llamadas. **Es aditivo, no rompe la interfaz**: un `TokenStorage` implementado con la firma vieja sigue type-checkeando y funcionando igual que antes (JS ignora el argumento de más) — simplemente no evita la colisión hasta que se actualice para usarlo.
- `tests/integration/helpers.ts` ya namespacea sus claves por servicio y volvió a usar un solo archivo de cache: el archivo separado para Padrón A13 (`padronTokenStorage` / `.ta-cache-padron.json`) era el parche para este mismo problema y dejó de hacer falta.

### 🧹 Se sacó el chequeo de `response.errorConstancia` en Padrón A13

- `errorConstancia` no existe en A13: cero menciones en las 25 páginas del *Manual Consulta a Padrón – Alcance 13 v1.4*. Es un campo del servicio de Constancia de Inscripción. No hacía daño —era defensivo— pero nadie lo testeaba y hacía pensar que era parte de este servicio.

### 🐛 `getTaxpayer()` lanzaba `ArcaNetworkError` para los faults de negocio de A13, por leer `response.ok` antes que el body

- A13 devuelve sus siete faults del anexo 5.3 —los mismos que `getPadronHint()` reconoce desde la entrada de abajo— envueltos en **HTTP 500**, confirmado contra homologación real el 2026-10-02 (`"El Id de la persona no es valido"` y `"La Clave (CUIT/CUIL) consultada es inexistente"` llegaron los dos con ese status). `padron.ts` miraba `!response.ok` **antes** de leer el body y lanzaba un `ArcaNetworkError` genérico ahí mismo: el hint agregado ayer no llegaba a dispararse nunca contra ARCA real, sólo en los tests unitarios, que mockeaban `ok: true` sin querer.
- Se invirtió el orden, igual que ya hace `wsaa.ts`: leer siempre el body y parsearlo, sin mirar `response.ok` de antemano. Un `500` que **no** trae un sobre SOAP (el servicio genuinamente caído) sigue degradando a `PADRON_ERROR` con su hint — no se perdió ese caso, se agregó un test que lo fija.
- **Cambia comportamiento**: antes, cualquiera de los siete mensajes del anexo 5.3 hacía lanzar; ahora se devuelven como `{ error, hint }`, consistente con el resto del diseño de A13 (informa por valor, no lanza — salvo `PADRON_ERROR`).
- Con los dos fixes de hoy, `tests/integration/padron.integration.test.ts` corre en verde de punta a punta contra homologación real (antes no existía ninguna suite de integración para A13).

### 🐛 El endpoint de homologación de Padrón A13 no resolvía por DNS

- `PADRON_A13_ENDPOINTS.homologacion` (`constants/endpoints.ts`) apuntaba a `awshomo.arca.gob.ar`, un dominio **sin registro DNS**: cualquier llamada a `getTaxpayer()` en homologación terminaba en `ArcaNetworkError`, siempre. Verificado que no es un problema de red local: `arca.gob.ar`, `wsaahomo.afip.gov.ar`, `wswhomo.afip.gov.ar` y `aws.arca.gob.ar` (el endpoint de **producción** de A13) resuelven todos sin problema.
- **No es una regresión de esta versión**: el mismo dominio roto está en `arca-sdk@2.1.0`, publicado en npm. Nunca se había detectado porque no existía `tests/integration/padron.integration.test.ts` (agregado en este cambio) y porque en producción el endpoint correcto (`aws.arca.gob.ar`) sí resuelve — cualquiera que facture de verdad nunca pasa por el roto.
- El patrón correcto es el mismo que ya usan WSAA y WSFE: homologación se queda en `afip.gov.ar` y sólo producción migra a `arca.gob.ar`. El fix apunta homologación a `awshomo.afip.gov.ar`, confirmado respondiendo SOAP Faults reales.
- Se agregó `tests/unit/endpoints.test.ts` (regresión del valor) y `tests/integration/padron.integration.test.ts` (no existía ninguna suite de integración para A13).

### ✨ Padrón A13: `TaxpayerResponse` gana un `hint` para los faults que documenta el manual

- `getTaxpayer()` devolvía el `faultstring` de ARCA pelado cuando el servicio contestaba con un SOAP `Fault`, sin ninguna sugerencia de qué hacer — a diferencia de WSFE, CAEA y WSAA, que sí tienen diccionario de hints. El anexo 5.3 del *Manual Consulta a Padrón – Alcance 13 v1.4* documenta siete mensajes por su texto (A13 tampoco tiene códigos numéricos, como WSAA); seis son accionables.
- Se agregó `TaxpayerResponse.hint?: string` (campo opcional, no rompe nada) y `getPadronHint()` / `PADRON_MESSAGE_PATTERNS` en `constants/errors.ts`, calcados del `getWsaaHint()` / `WSAA_FAULT_PATTERNS` que ya existían para WSAA. El séptimo mensaje del anexo —"clave inexistente"— queda sin hint a propósito: el texto ya dice todo, ponerle uno sería repetirlo con otras palabras, el mismo motivo por el que se borró `CUIT_NOT_FOUND` en la v3.0.0.
- El más valioso de los seis es el de la clave **INACTIVA**: tiene consecuencia cruzada con wsfev1 — un receptor inactivo hace que `FECAESolicitar` rechace con el **10247**, así que saberlo acá evita quemar un número de comprobante.
- **Sin verificar contra ARCA todavía**: los seis patrones matchean el texto entrecomillado del manual, no una respuesta real — a diferencia del `ALREADY_HAS_TA` de WSAA, que sí está confirmado en homologación. Que lleguen por un SOAP `Fault` (que es donde el SDK los busca) es una suposición por simetría con WSAA, pendiente de probar.
- No se tocó `getPersona` en sí, ni se agregaron los tres métodos de A13 que todavía faltan (`dummy`, `getIdPersonaListByDocumento`, `getPersonaV2`).

### 📖 El README abría con la lista de lo que no funciona, antes de decir para qué sirve el SDK

- La sección "Qué está verificado contra ARCA y qué no" era lo segundo que veía cualquiera que abriera el README, antes del pitch, de la instalación y del Quick Start. El contenido era correcto —sigue siéndolo, no cambia ningún dato de la tabla—, pero el orden hacía que la primera impresión fuera "mirá todo lo que no se probó" en vez de "esto es serio, y esto es lo que hay que chequear antes de confiar". Se movió después del Quick Start, y se le agregó una frase que explica el porqué (el SDK habla con un ente recaudador, un comprobante mal emitido no es un bug de UI) en vez de abrir directamente con el conteo de afirmaciones falsas encontradas.

### 📖 El ejemplo de "Manejo de errores" del README enseñaba lo que el propio README declara rechazado

- El `try` de esa sección llamaba a `issueInvoiceC()` **sin `buyer`**, o sea sin `vatCondition`: exactamente el comprobante que homologación rechaza hoy con la observación **10246** y que el README, tres secciones más arriba, marca como imposible de emitir. El ejemplo va sobre cómo manejar errores, así que lo último que conviene es que la emisión que lo encabeza sea una de las que fallan por un motivo distinto del que ilustra. Ahora informa `buyer` con `vatCondition`, y el bloque importa `TaxIdType` y `VatCondition`, que usaba sin declarar.
- **`TaxIdType.NATIONAL_POLICE_ID` queda `@deprecated`**. Vale 96, igual que `DNI`, y dos miembros con el mismo valor no conviven en un enum de TypeScript: el reverse-mapping guarda el último declarado, así que `TaxIdType[96]` es `'DNI'` y este nombre **no se recupera nunca** a partir del número. Quien loguee o serialice `TaxIdType[docType]` ve `'DNI'` aunque haya pasado el otro. Encima la equivalencia no tiene fuente: la nota del miembro citaba una *"Tabla 13 del catálogo ARCA"* que no aparece en ninguno de los cuatro manuales —cero menciones en las 202 páginas del v4.8— y la fuente autoritativa de los tipos de documento es `FEParamGetTiposDoc`, en vivo con `getDocumentTypes()`. **No cambia ningún valor ni ninguna firma**: quitarlo rompe la compilación de quien lo importe, así que se elimina en la próxima major. Hay un test que fija cuál de los dos nombres gana el 96, porque reordenar los miembros parece cosmético y no lo es.

### 📖 Dos docstrings que describían un estado anterior del código

- La cabecera de `errors.ts` decía que `PADRON_ERROR` **y `CUIT_NOT_FOUND`** son los códigos internos del SDK. `CUIT_NOT_FOUND` se borró en la v3.0.0: queda uno solo.
- El docstring de alcance de `errors.test.ts` decía que está cubierto *"el texto de los códigos de IVA (10019, 10043), el de `ALREADY_HAS_TA`, los once que hasta la v3.0.0 describían otro código"* y que *"el resto del diccionario sigue sin cobertura"*. Eso describe el archivo **antes** de las tablas que se le agregaron en la v3.0.0: hoy cubre 47 de las 48 entradas —el texto en 39, el ruteo en los ocho faults de WSAA—, y hay un test al final que lo asevera. Quien leyera el encabezado para decidir si agregar cobertura concluía lo contrario de lo que pasa.

### 📖 El README no decía que el desarrollo es asistido por agentes

- Nueva sección **"Contribuciones"**: el desarrollo lo hacen agentes de IA (Claude Code y Devin) con revisión humana antes de cada merge, y eso no estaba dicho en ninguna parte salvo en el `git log`. Deja explícito cómo se firman los commits, que las afirmaciones normativas se verifican contra los manuales y que todo PR pasa el CI antes de mergearse, y que lo no verificado se marca como tal en vez de afirmarse.

### 📖 Conteo de tests del README

- La sección "Tests disponibles" pasa a **14 archivos, 266 tests** (el test nuevo del 96) y aclara lo que no decía: es lo que corre `bun run test`, y **no incluye** `tests/integration/wsfe.integration.test.ts` — `vitest.config.ts` limita la corrida a `tests/unit/**`.
- La fila de `errors.test.ts` decía que las 47 entradas cubiertas *"tienen test de su texto"*. Son 47 cubiertas, sí, pero el texto se verifica en **39**: los ocho faults de WSAA restantes se cubren por su ruteo —que el `faultstring` llegue al hint—, no por lo que dicen. El número no cambia; sí lo que se afirma de él. *(La primera versión de esta línea decía 40, y no cerraba con el 47: 39 + 8.)*

---

## [3.0.0] — 2026-09-28

> Hay **un cambio incompatible**: se eliminaron los Tique. Ver abajo. Si nunca los usaste,
> actualizar no te pide tocar nada. El resto de la versión es aditivo o corrección de bugs.
>
> **Lo más urgente sigue siendo otra cosa**: `CondicionIVAReceptorId` es obligatorio en
> producción desde el **01/12/2026** y **homologación ya lo rechaza hoy**. Si emitís sin
> `buyer.vatCondition`, ARCA no autoriza el comprobante.

### 💥 Cambio incompatible: se eliminaron los Tique (81/82/83)

Estaban `@deprecated` desde la v1.4.1. Se borran porque seguir ofreciéndolos era ofrecer algo que **no funciona**.

- **Eliminados**: `WsfeService.issueSimpleReceipt()`, `WsfeService.issueReceipt()` y los miembros `InvoiceType.TICKET_A` (81), `TICKET_B` (82) y `TICKET_C` (83).
- **Migración**: los dos métodos se reemplazan por `issueInvoiceC()`, y es de una línea porque `issueInvoiceC()` pasa a aceptar `total` (ver abajo):
  ```diff
  - const cae = await wsfe.issueSimpleReceipt({ total: 1500 });
  + const cae = await wsfe.issueInvoiceC({ total: 1500 });
  ```
  La tabla completa está en el README, sección "Migrar a la v3.0.0".
- **Por qué, con la evidencia**: los Tique son de la **RG 3561/2013** (Controladores Fiscales), un régimen distinto del de la RG 4291/wsfev1 que sigue el resto del SDK. Hay dos pruebas independientes: (1) `FECAESolicitar` con `CbteTipo=83` se rechaza con el error **11001** desde un punto de venta Web Services —el único tipo que un consumidor del SDK puede tener— verificado el 28/08/2026; y (2) **ARCA no los lista en `FEParamGetTiposCbte`**, verificado el 27/09/2026: de los quince valores que tenía `InvoiceType`, los **únicos tres** ausentes del catálogo eran exactamente 81, 82 y 83. La segunda es la más fuerte: no es que ARCA los rechace desde cierto punto de venta, es que **no existen en este webservice**.
- Los fixtures de la suite unitaria usaban `CbteTipo=83` por defecto: describían un CAE aprobado para un comprobante que ARCA nunca autoriza. Ahora usan 11 (Factura C).
- **No confundir con `issueReceiptA/B/C()`**, que emiten **Recibo** (códigos 4, 9 y 15), son comprobantes legítimos de wsfev1 y **no** se tocaron. El nombre engaña.
- Si necesitás emitir tique, no hay camino por `wsfev1`: hace falta un Controlador Fiscal homologado, o el régimen "Facturador" de la RG 5198/2022, que usa otros códigos (109, 114) y todavía no se investigó.

### ✨ `getPointsOfSale()` devuelve `[]` en vez de lanzar ante el error 602

- **Cambio de comportamiento**: Cuando el CUIT autenticado no tiene puntos de venta dados de alta o listados, ARCA responde con el error 602 (`Sin Resultados`). El método antes lanzaba un `ArcaError` que obligaba a inspeccionar el texto del mensaje para saber si no había puntos de venta o si falló la conexión. Ahora devuelve `[]`.
- Se mantiene el lanzamiento de excepción en los demás métodos de consulta donde una lista vacía sí representa una anomalía.

### 🐛 `getActivities()` devolvía siempre una lista vacía

- **Bugfix crítico**: El método consultaba el elemento XML `ActividadTipo`, pero ARCA devuelve `ActividadesTipo` (en plural). Al no encontrar la clave, el método retornaba silenciosamente `[]`. Corregido y asegurado con tests de integración que exigen que ningún catálogo de ARCA retorne listas vacías ni campos `undefined`.

### 🧹 Se quita `zod` de las dependencias

- Estaba declarada en `dependencies` y **no se usaba en ninguna línea**: cero imports en todo `src/`. Cada consumidor se la descargaba al instalar el SDK, para nada. `fast-xml-parser` y `node-forge` sí se usan y se mantienen. No hay cambio de API: `zod` nunca apareció en un tipo ni en una firma pública.

### 📖 La tabla de condición de IVA del JSDoc tenía cinco filas mal transcriptas

- **Corrección de documentación** en el JSDoc de `VatCondition`: las filas **1** (IVA Responsable Inscripto), **4** (IVA Sujeto Exento), **6** (Responsable Monotributo), **13** (Monotributista Social) y **16** (Monotributo Trab. Indep. Promovido) declaraban clases de comprobante equivocadas. Quien transcribió la tabla de la última página del manual **leyó la columna `C` como la columna `49`**.
- Lo correcto, verificado contra el manual v4.8 p. 202: la 1, 6, 13 y 16 son **A/ALEY y C**; la 4 es **B y C**. La tabla marca las celdas con una `X` y el texto extraído del PDF las devuelve sin columna, así que se reconstruyó con las **coordenadas X** de cada celda.
- Dos comprobaciones que cierran la lectura: las **once** condiciones tienen `X` en la columna `C` —en clase C no hay IVA que discriminar, así que las admite todas— y la columna **49** (Comprobante de Compra de Bienes Usados) la tiene **sólo** Consumidor Final, que es lo correcto porque ese comprobante se le emite a un particular.
- No cambia ninguna validación: `VALID_VAT_CONDITION_IDS` valida el código, no la combinación con la clase. Esa combinación la valida ARCA con el código 10243 (CAE) / 824 (CAEA).

### 🐛 El diccionario de hints describía otro código en 13 de sus 40 entradas

Es la reparación más grande de esta versión, y la que vuelve útil al resto: desde que el SDK conserva `Obs.Code` (ver más abajo), estos textos **sí le llegan al usuario en un rechazo**. Antes eran casi todos texto muerto. Verificado uno por uno contra el *Manual del Desarrollador RG 4291 v4.8* —idéntico al v4.7 en todos ellos— y contra el *WSAA Manual del Desarrollador* 20.2.19.

El patrón era siempre el mismo: **el texto describía el error que uno espera de ese número, no el que ARCA le asignó.**

- **Errores de infraestructura (p. 21)**: el **501** y el **502** son errores internos de base de datos de ARCA, y decían *"certificado expirado"* y *"el TA es inválido, hacé login de nuevo"* — mandaban a revisar el certificado por un problema del lado de ARCA. El **600** (no se corresponden token y firma) decía *"no se pudo autorizar el comprobante, revisá observations"*, que describe un rechazo, y en el 600 no hay comprobante. El **601** (la CUIT representada no está en el token) decía *"el comprobante ya fue autorizado"*: quien lo recibiera iba a buscar un problema de numeración que no existe. El **602** ahora dice lo que es.
- **Validaciones de comprobante**: el **10016** (`CbteDesde` debe ser el último autorizado + 1) decía que el CUIT receptor no existía en el padrón, que es el **10238**. El **10039** (`MonCotiz` debe ser 1 con `MonId = PES`) estaba **literalmente al revés**: ese texto es del 10038. El **10044** (`ImpOpEx` no puede ser negativo) decía que el IVA no cuadraba, que son el **10023** y el **10051**. El **10048** (`ImpTotal` es la suma de los importes) y el **10049** (fechas de servicio con Concepto 2 o 3) culpaban al punto de venta, que son el **10005** y el **11002**.
- **El 11001** arrancaba diciendo *"no es válido para este punto de venta"*, que es el significado del **11002** — y contradecía al README, que dice correctamente que el rechazo de los Tique **no** es una limitación del punto de venta.
- **Seis códigos no tenían hint y su texto estaba colgado del número equivocado**, así que al corregir los de arriba se habría perdido: **10005** y **11002** (punto de venta), **10023** y **10051** (los dos descuadres de IVA, que son distintos entre sí), y **10067** y **1425**, que eran la mitad que le faltaba a la regla del tributo ID 13.
  > Esa regla son cuatro códigos y **sólo uno rechaza, al revés de lo que uno supondría**: el excluyente es el **10067** (`ImpTrib = 0`), no el 10283 (`ImpTrib > 0`). Se determina por el encabezado de cada tabla del manual, que es lo único que las distingue — las excluyentes dicen *"Código de error"* y las no excluyentes *"Código de Observ."*.

**WSAA no tiene códigos numéricos, y el diccionario tenía cinco inventados.**

- Se **eliminan** las entradas `503`, `1000`, `1001`, `1003` y `1005`. No existen en ninguna fuente de ARCA: su manual no trae tabla de códigos, devuelve SOAP Faults y documenta **nueve** errores por su texto en el cap. 10.
- Se agregan los **ocho que faltaban**, con clave de texto, resueltos por `getWsaaHint()` contra la tabla `WSAA_FAULT_PATTERNS`. Hasta ahora el TA vigente era el único fault con hint: los otros ocho llegaban con `hint: undefined`, que es el peor momento para no decir nada.
- El regex del TA vigente dejó de estar escrito a mano dentro de `wsaa.ts` y pasó a ser una fila más de esa tabla: el patrón que encuentra un hint y el texto del hint se desincronizan si viven en archivos distintos.

**Y dos entradas muertas.** `CUIT_NOT_FOUND` se elimina: su texto repetía el mensaje de error con otras palabras en vez de agregarle una acción, no se usaba en ninguna línea, y encima el mensaje real de ARCA es otro (*"La Clave (CUIT/CUIL) consultada es inexistente"*, anexo 5.3 del manual de Padrón A13). `PADRON_ERROR` estaba escrito desde siempre y **ningún camino del código podía entregarlo**, porque `padron.ts` no llamaba a `getArcaHint()` en ninguna línea; ahora el `throw` de la respuesta sin sobre SOAP lo pasa.

**`getPointsOfSale()` era el único `throw` de `ArcaError` del SDK que no pasaba el hint.** Extraía el error de ARCA pero descartaba su código — y justo ahí los códigos que ARCA devuelve son el **10005** y el **11002**, o sea el error de configuración más común que existe.

**Ningún cambio de comportamiento y ninguna firma pública tocada**: `ARCA_ERROR_HINTS` y `getArcaHint` no se exportan desde `src/index.ts`.

### 🐛 El hint del código 10043 explicaba un error que no es

- **Bugfix**: el diccionario de hints (`getArcaHint`) tenía la explicación de *"alícuota de IVA inválida"* colgada del código **10043**, que según el Manual del Desarrollador RG 4291 v4.8 (p. 47) es una validación del campo `ImpTotConc` —importe neto no gravado— y no habla de IVA. Quien recibía un 10043 leía una respuesta sobre otro campo. El código correcto para la alícuota fuera de catálogo es el **10019** (v4.8, p. 43: *"siempre que se informe Id, debe ser un valor devuelto por el método `FEParamGetTiposIva`"*).
- El hint del **10019** nombra ahora las **seis** alícuotas vigentes —antes listaba cuatro: faltaban el 2,5% (id 9) y el 5% (id 8)— y remite a `wsfe.getVatRates()` como fuente autoritativa en lugar de la lista fija.
- El hint del **10043** pasa a describir lo que el manual dice de `ImpTotConc`, incluida la excepción de Bienes Usados (comprobante tipo 49) con emisor monotributista.

### 🐛 El SDK decía que quedarse sin ticket de acceso costaba 12 horas. Son 10 minutos.

- **Corrección de dato**: el hint `ALREADY_HAS_TA` —y otros nueve lugares del repo— afirmaban que ARCA no emite un TA nuevo *"hasta que expire el anterior (12 h)"*. Son dos números distintos: las **12 h** son la **vigencia** del ticket; el bloqueo para pedir otro es un *lapso preventivo* de **10 minutos en homologación** y **2 en producción**, según el *WSAA Manual del Desarrollador* cap. 10.6 — que aclara que *"estos valores pueden ser modificados dinámicamente y sin aviso previo"*.
- **Medido**, no sólo leído: contra homologación real el 26/09/2026, el bloqueo se levantó entre los 9m32s y los 10m32s del TA anterior. Es una sola corrida, de una noche, en homologación; el valor de producción no se midió.
- Por qué importa: quien se quedaba trabado creía haber perdido el día. La documentación de los tests de integración desalentaba correrlos por un costo que no era real.
- Corregido también en `tests/integration/README.md`, en el JSDoc de `fileTokenStorage` y en los comentarios de `wsaa.ts`. Con tests de regresión en `errors.test.ts`.

### 📖 Los JSDoc enseñaban lo que el resto de la documentación ya había corregido

- **`WsfeService`**: el `@example` de la clase —el que aparece solo al pasar el mouse, sin ir a buscarlo— mostraba una Factura B con `buyer` **sin `vatCondition`**, que es exactamente lo que homologación rechaza hoy con la observación **10246**. Ahora los dos ejemplos lo informan. (También declaraba `const cae` dos veces en el mismo bloque.)
- **`Buyer.vatCondition`**: decía sólo *"Opcional:"*. Sigue siendo opcional en el tipo para no romper la compilación de quien ya usa el SDK, pero el JSDoc ahora dice que omitirlo significa no poder facturar.
- **`IssueInvoiceRequest.optionals`**: daba como ejemplo *"Condición IVA receptor ID 1010"*, que es la forma vieja y hoy da rechazo **10242** — la misma que ya se había quitado del README.
- **`IssueOptions.optionals`**: daba como ejemplo *"RG 5762/2025, leyendas de Factura A"*, que es el mecanismo inexistente corregido en esta misma versión.

### 🐛 Los hints no llegaban cuando ARCA rechazaba un comprobante

Es el arreglo que hace que el resto del trabajo de esta versión le sirva a alguien.

- **Bugfix**: al parsear la respuesta, el SDK **descartaba `Obs.Code`** y guardaba sólo el mensaje. Como el diccionario de hints se busca por código, el hint de un rechazo se resolvía con **dos expresiones regulares sobre el texto** (los códigos 10245 y 10246). De los ~40 hints del diccionario, **sólo esos dos podían llegar por el canal de los rechazos** — que es justamente el que importa, porque es donde ARCA explica por qué no autorizó el comprobante. Cualquier otro rechazo llegaba con `hint: undefined`.
- Ahora el código se conserva y el hint se busca por código, con el reconocimiento por texto como último recurso (una observación sin código igual da la pista del 10246, que va a ser el rechazo masivo del 01/12/2026).
- **`CaeaService` no pasaba ningún hint.** Ni siquiera los dos por texto: construía el `ArcaRejectionError` sin ese argumento. Un rechazo de rendición informativa —que tiene **plazo fatal**— llegaba sin una sola pista. Ahora usa el mismo camino que `WsfeService`.
- **Aditivo**: se agrega `observationDetails?: ArcaObservation[]` a `CAEResponse`, a `CAEARegInformativoResponse` y a `ArcaRejectionError`, con `{ code, message }` por observación. `observations` **sigue siendo `string[]`** y no cambia: es el mismo dato, sólo los mensajes. Se exporta el tipo `ArcaObservation`.
- El parseo de `<Observaciones>` estaba **copiado** en `wsfe.ts` y en `caea.ts`, y las dos copias tiraban el código. Se unificó en `parseObservations()` (`utils/xml.ts`): arreglar una sola habría dejado la otra rota, que es lo que ya había pasado con `getVATCode`.

### ✨ `issueInvoiceC()` acepta `total` además de `items`

- Para una venta de mostrador que no se detalla: `issueInvoiceC({ total: 1500 })`. Los dos campos son **excluyentes** —el tipo no deja mandar ambos ni ninguno— y con `items` el total se calcula como antes. Si se omite `buyer`, se asume consumidor final sin identificar. Aditivo: no cambia ninguna firma existente.
- **De dónde viene**: es la comodidad que daba `issueSimpleReceipt({ total })`, eliminado en esta misma versión. Esa parte del método viejo **estaba bien**; lo que estaba mal era que emitía Tique C (83), un comprobante que ARCA no acepta por este webservice. Al revisar por qué existía quedó claro que **nunca fue una feature de impresión térmica ni nada parecido** —no hay una línea sobre impresión en todo el SDK— sino un atajo razonable colgado del tipo de comprobante equivocado. El atajo se conserva; la etiqueta falsa, no.
- Se valida en el mismo lugar que antes: el tope de $10.000.000 de la RG 5866/2026 sigue exigiendo identificar al comprador, también por este camino. Y llamarlo sin `items` ni `total` lanza `ArcaValidationError` **antes de tocar la red**, para que un consumidor desde JavaScript sin tipos no emita un comprobante por $0 gastando un número real.

### ✨ Comprobantes "A con leyenda Operación Sujeta a Retención" (RG 5762/2025)

- Se agregan a `InvoiceType`: **`FACTURA_A_LEYENDA`** (51), **`NOTA_DEBITO_A_LEYENDA`** (52), **`NOTA_CREDITO_A_LEYENDA`** (53) y **`RECIBO_A_LEYENDA`** (54). Aditivo: no cambia ninguna firma.
- **El SDK todavía no puede emitirlos**, y no hay helper dedicado a propósito: los métodos de emisión fijan internamente su `CbteTipo` y no existe uno genérico que reciba un `InvoiceType`. Los valores sirven hoy para `getInvoice()` y para `associatedInvoices[].type` — por ejemplo, para emitir una Nota de Crédito que anule una Factura A con leyenda. Verificados contra `FEParamGetTiposCbte` (vigentes desde el **22/05/2015**, o sea que la RG 5762 no los creó: los convirtió en el reemplazo de la clase "M"), pero **nunca se emitió uno realmente**. Un helper afirma que el camino funciona, y eso no está probado.

### 📖 El README enseñaba un mecanismo que no existe para la leyenda de la RG 5762

- **Corrección de documentación**: el README indicaba informar la leyenda de Factura A con `optionals: [{ id: 5, value: '1' }]`. Las tres partes estaban mal, verificado contra el Manual del Desarrollador v4.8 y contra el catálogo en vivo de ARCA:
  1. **La leyenda no es un opcional**, es una clase de comprobante (códigos 51 a 54). Las validaciones 10017, 10061, 10063, 10217 y 10234 la tratan como clase, y el 10061 la identifica por número.
  2. **El `id` 5 de `optionals` es otra cosa**: un código de excepción de la **RG 3668**, con valores `01` a `06` (validaciones 10086, 10088, 10089).
  3. **`value: '1'` sería inválido igual**: el 10088 exige alfanumérico de **dos** caracteres.
- La sección de `optionals` pasa a enumerar los ids reales que documenta el manual y a advertir que cada régimen tiene el suyo, con su formato propio. El ejemplo usa ahora el `id` 2 (Promoción Industrial, numérico de 8 dígitos).
- La leyenda **"PAGO EN CBU INFORMADA"** de la misma RG queda documentada como **no implementada**: no figura en ninguna de las 202 páginas del manual, y los opcionales de CBU que sí documenta (`2101`, `27`) son exclusivos de MiPyME FCE (validaciones 10214-10216).

### 🐛 Dos mensajes de error negaban alícuotas de IVA que el SDK acepta

- **Bugfix**: el JSDoc de `InvoiceItem.vatRate` y el hint del error *"falta vatRate"* nombraban cuatro alícuotas (`0, 10.5, 21, 27`). El **5%** (id 8) y el **2,5%** (id 9) están vigentes desde el 20/10/2014 y el SDK los acepta desde la v2.1.0: los textos habían quedado en la versión anterior. Quien facturaba con esas alícuotas leía —en el tooltip del editor y en el mensaje de error— que su valor no existía, exactamente el síntoma que la v2.1.0 había ido a corregir.
- Los tres mensajes que nombran alícuotas **se derivan ahora de `VAT_RATE_CODES`** en vez de tener cada uno su copia escrita a mano. Era la causa de fondo: la lista estaba repetida en siete lugares y las que se desactualizaron fueron, sin excepción, las copias manuales.
- **`CaeaService` pasa a usar la misma tabla que `WsfeService`.** Tenía su propio `getVATCode()` con un `switch` en paralelo a `VAT_RATE_CODES`. Las dos listas coincidían, pero nada lo garantizaba: una alícuota agregada en un solo lado habría hecho que el mismo comprobante se aceptara por CAE y se rechazara por CAEA. Es un método privado — no cambia ninguna firma pública.
- **Cobertura**: 14 tests nuevos. Incluyen el camino de la alícuota inválida de CAEA, que no tenía **ninguno**, y la verificación de que las seis alícuotas viajan al XML con el `<Id>` correcto.

### 🔐 Detección robusta de TA vigente en WSAA

- **Bugfix**: La detección de ticket de acceso (TA) vigente en WSAA ahora reconoce tanto `"válido"` (con tilde) como `"valido"` (sin tilde), previniendo que variaciones de ortografía en las respuestas de ARCA impidan emitir el hint correspondiente y bloqueen la autenticación.

### 📖 Documentación y ejemplos coherentes

- **README**: Se corrigió el ejemplo de `optionals` que enseñaba a enviar la condición de IVA del receptor como ID 1010 con valor `'2'` (el 2 no existe en el catálogo de ARCA y causaba rechazo 10242). Se documentó el uso del campo nativo `buyer.vatCondition`.
- Se incorporó `buyer.vatCondition` en el Quick Start y en los ejemplos de emisión (Facturas A/B/C, Nota de Crédito y QR) ya que ARCA homologación rechaza los comprobantes que no lo informan (código 10246).
- Se documentó el servicio CAEA (contingencia) con su estado actual y se agregaron las tablas de referencia para los diez métodos de catálogo `FEParamGet*`.
- Sincronización completa de la suite de tests documentada (14 archivos, 265 tests unitarios).

### ✅ Cobertura y testing

- **`test:coverage`**: Se configuró `@vitest/coverage-v8` acotando la medición a `src/` (**78.08%** de cobertura de sentencias, medida el 28/09/2026).
- **Suite unitaria de WSAA**: Nueva suite `tests/unit/wsaa.test.ts` con 23 tests que cubren exhaustivamente el ciclo de vida del ticket (memoria → storage → red), márgenes de expiración y tolerancia a fallas de persistencia.
- **El IVA discriminado corrió por primera vez contra ARCA real.** Hasta el 27/09/2026 el array `<Iva>`, `ImpIVA` y `AlicIva` nunca habían pasado por homologación: el CUIT de prueba del proyecto es monotributista y se creía que eso impedía emitir clase A. **Es falso** — delegando en WSASS a un CUIT Responsable Inscripto de prueba se emite sin cambiar una línea de código, porque el certificado identifica al *sistema cliente* y el CUIT emisor viaja aparte en `<Auth><Cuit>`. Se autorizó una Factura A con IVA discriminado. La receta quedó en `tests/integration/README.md`.
  > **Alcance declarado**: corrió **una sola alícuota, el 21%**. Las otras cinco de `VAT_RATE_CODES` (0, 2,5, 5, 10,5 y 27%) siguen sin haber pasado por ARCA — y el 5% y el 2,5% son justamente las que el SDK rechazaba por error hasta la v2.1.0.
- **Suite del diccionario de errores**: Nueva suite `tests/unit/errors.test.ts` con **84 tests**. Un hint no lo mira ni el compilador ni ningún otro test, así que puede quedar congelado —o colgado del código equivocado— sin que nada se ponga en rojo: es exactamente lo que pasó con el 10043. **Cobertura: 47 de las 48 entradas** del diccionario tienen test de su texto, contra 2 de 40 al empezar. Cada caso lleva las dos mitades —que diga lo que dice el manual y que **no** vuelva el significado viejo—, porque sin la segunda, agregar una frase correcta arriba del texto equivocado dejaría el test en verde.

---

## [2.1.0] — 2026-09-25

### 🐛 El SDK rechazaba dos alícuotas de IVA que ARCA acepta desde 2014

- **Bugfix**: `getVATCode()` sólo conocía `0`, `10.5`, `21` y `27`, y lanzaba `ArcaValidationError` para cualquier otra. ARCA acepta seis alícuotas: faltaban el **5%** (id 8) y el **2.5%** (id 9), vigentes desde el **20/10/2014**. Quien facturara con esas alícuotas no podía usar el SDK, y el mensaje de error le decía que el valor inválido era el suyo. El mapa se movió a la constante exportada `VAT_RATE_CODES`.

### ✨ Catálogos de referencia: `FEParamGet*`

Los enums de este SDK son una copia local del catálogo de ARCA: dan autocompletado y chequeo en compilación, pero **se desactualizan en silencio** — el bug de las alícuotas es prueba de eso, y estuvo doce años. Ahora se puede consultar la fuente autoritativa:

| Método | Servicio | Para qué |
|---|---|---|
| `getInvoiceTypes()` | `FEParamGetTiposCbte` | La lista real de comprobantes emitibles. Es la consulta que habría evitado el episodio del error 11001 con los Tique. |
| `getVatRates()` | `FEParamGetTiposIva` | Alícuotas vigentes |
| `getTaxTypes()` | `FEParamGetTiposTributos` | Tributos para `taxes`, incluido el 13 que exige el código 10283 |
| `getVatConditions()` | `FEParamGetCondicionIvaReceptor` | Las condiciones de IVA del receptor y la clase de comprobante en que aplican |
| `getExchangeRate()` | `FEParamGetCotizacion` | Cotización oficial — usala en vez de fijar `exchangeRate` a mano |
| `getDocumentTypes()`, `getCurrencies()`, `getOptionalTypes()`, `getConceptTypes()`, `getActivities()` | varios | Resto de los catálogos |

- **`getVatConditions()` informa la clase de comprobante** (`invoiceClass`), y es la fuente autoritativa: por eso esa relación no está hardcodeada en el SDK. La tabla del manual es una foto, y una copia escrita a mano se desactualiza en silencio.
  > **Corregido el 28/09/2026.** Esta entrada decía además que *"la lista depende del emisor: ARCA devuelve las combinaciones válidas para ese CUIT"*. **No depende del emisor**: medido contra homologación el 27/09/2026, el servicio devuelve las mismas once filas, una por una, para un CUIT monotributista y para uno Responsable Inscripto — los dos extremos. Se corrige acá además de en la versión nueva porque el `CHANGELOG` viaja dentro del paquete npm.
- La suite de integración compara los catálogos vivos contra los enums locales: si ARCA agrega un valor, los tests se ponen en rojo en vez de que el SDK lo rechace en silencio.

## [2.0.0] — 2026-09-25

> Hay **un cambio incompatible**: un rechazo de ARCA ahora lanza una excepción en vez
> de devolverse como resultado normal. Ver "💥 Cambio incompatible". El resto es
> aditivo o corrección de bugs.
>
> **Lo más urgente de esta versión** no es una feature: `CondicionIVAReceptorId` es
> obligatorio en producción desde el **01/12/2026** y **homologación ya lo rechaza hoy**.
> Si emitís sin `buyer.vatCondition`, ARCA no autoriza el comprobante.

### 💥 Cambio incompatible: un rechazo de ARCA ahora lanza `ArcaRejectionError`

- Cuando ARCA procesa la solicitud y **no autoriza** el comprobante (`Resultado = 'R'`), el SDK lanzaba… nada: devolvía un `CAEResponse` con `result: 'R'` y `cae: ''`. Quien no inspeccionara `result` creía haber facturado un comprobante que **no existe**. Ahora se lanza `ArcaRejectionError`, con los motivos en `.observations` y un `.hint` accionable cuando el motivo es reconocible.
- Alcanza a `WsfeService` (emisión) y a `CaeaService.reportCAEAPeriod()` (rendición informativa — donde el silencio es peor todavía, porque la rendición tiene plazo fatal).
- **Migración**: si ya chequeabas `result === 'R'`, ese código deja de alcanzarse y podés borrarlo; envolvé la llamada en `try/catch` de `ArcaRejectionError`. Si no lo chequeabas, no tenías que hacer nada… y ese es exactamente el problema que esto corrige.
- Un comprobante **aprobado con observaciones** sigue devolviéndose normalmente, con las observaciones en `observations`. Observación no es rechazo.

### 🐛 El XML del request no respetaba el `sequence` del XSD

- **Bugfix**: el esquema de ARCA es un `sequence`, no un `all`, y los dos constructores de XML emitían elementos fuera de orden. Venía funcionando por tolerancia del parser de ARCA, pero el **01/12/2026** `CondicionIVAReceptorId` pasa a ser obligatorio (**manual v4.8**, RG 5616) y deja de ser un campo que casi nadie envía para viajar en todos los requests — en la posición equivocada. Corregido antes de esa fecha:
  - **`FECAEDetRequest`** (`WsfeService`, manual v4.7/v4.8 pág. 26): `CondicionIVAReceptorId` estaba pegado a `DocNro` en lugar de ir después de `MonCotiz`; `ImpTrib` e `ImpIVA` estaban invertidos (el XSD define `ImpOpEx, ImpTrib, ImpIVA`); y `FchServDesde`/`FchServHasta`/`FchVtoPago` iban después de `MonId`/`MonCotiz` en vez de antes.
  - **`FECAEADetRequest`** (`CaeaService`, pág. 131-132): `CondicionIVAReceptorId` estaba pegado a `DocNro`, y `CAEA`/`CbteFchHsGen` no quedaban al final del detalle como exige el XSD.
  - Al comparar ambos: el orden de los importes **difiere legítimamente** entre uno y otro. `FECAEDetRequest` define `ImpOpEx, ImpTrib, ImpIVA`; `FECAEADetRequest` define `ImpOpEx, ImpIVA, ImpTrib`. No es una errata del manual.
- **No hay cambios en la API pública**: ninguna firma cambia y el comportamiento observable es el mismo, salvo que el XML que llega a ARCA ahora valida contra el esquema publicado.

### 🐛 Los valores de texto no se escapaban al armar el SOAP

- **Bugfix**: el request se construye con template strings y ningún valor se escapaba. Un `&`, `<` o `>` en un campo de texto generaba XML inválido y ARCA rechazaba el request completo. El caso más fácil de disparar era un `Opcional` con razón social o domicilio (`'Belgrano 123 & Cía'`). No se había manifestado porque los campos de uso habitual (CUIT, importes) son numéricos. Se agrega `escapeXml()` en `src/utils/xml.ts`, aplicado en `WsfeService`, `CaeaService` y `TaxpayerService`.

### ✅ Tests del XML que se envía

- La suite mockeaba `callArcaApi` y sólo verificaba la respuesta parseada, con lo cual un request mal formado pasaba desapercibido: los 98 tests existentes seguían en verde con el comprobante reordenado por completo. Se agrega `tests/unit/request-xml.test.ts`, que afirma el orden del `sequence` en ambos constructores y el escapado de los valores de texto.

### ✨ Otros tributos (`Tributos`) — percepciones, impuestos internos, tasas

- **Nuevo campo `taxes`** en los métodos de emisión y en `CaeaInvoice`. Hasta ahora el array `<Tributos>` del XSD no se construía nunca e `ImpTrib` estaba fijo en `0.00`: no había forma de informar una percepción de IIBB, un impuesto interno ni una tasa municipal. Los importes suman a `ImpTrib` y al total del comprobante.
- Desbloquea el código **10283** del Manual v4.7, que exige informar el tributo `ID 13 – Percepción de IVA No Categorizado` (RG 2126/2006) en comprobantes clase B con receptor No Categorizado.

### ✨ Moneda extranjera: `MonId`, `MonCotiz` y `CanMisMonExt`

- **Nuevos campos `currency`, `exchangeRate` y `payInSameForeignCurrency`**. Antes `MonId` estaba fijo en `'PES'` y `MonCotiz` en `1`: no se podía facturar en moneda extranjera. `CanMisMonExt` (campo incorporado por el Manual v4.0 / RG 5616, "cancelación en la misma moneda extranjera") no existía en el SDK; sólo se emite con moneda distinta de `'PES'`, como exige ARCA.
- Se valida localmente que con moneda extranjera la cotización sea mayor a cero (evita un request que ARCA rechazaría con el código 10039). La coincidencia exacta con la cotización oficial (código 10038) sólo la puede verificar ARCA: traela de `FEParamGetCotizacion`.

### ✨ Catálogo de `CondicionIVAReceptorId` completo y validado

- **Nuevos miembros de `VatCondition`**: `MONOTRIBUTISTA_SOCIAL` (13), `IVA_NO_ALCANZADO` (15) y `MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO` (16). Faltaban: sin el 13 no se podía facturar a un Monotributista Social.
- **Deprecados** `IVA_RESPONSABLE_NO_INSCRIPTO` (2), `IVA_NO_RESPONSABLE` (3) e `IVA_RESPONSABLE_INSCRIPTO_AGENTE_PERCEPCION` (11): **no pertenecen** al catálogo de `CondicionIVAReceptorId` y ARCA los rechaza con el código 10242. Vienen del catálogo general de condición de IVA, que es otra tabla. Siguen exportados para no romper compilación; se eliminan en la próxima major.
- Se valida el valor **antes** de salir a la red, con un mensaje que explica el catálogo en vez del error genérico de ARCA. Se exporta `VALID_VAT_CONDITION_IDS` para quien quiera validar por su cuenta.

### ✨ `TaxIdType.FCI_CNV` (31)

- Tipo de documento **31 – Fondo Común de Inversiones CNV**, incorporado por el Manual v4.5 (vigente 02/07/2026) para entidades financieras (RG 5866). El número de documento es numérico de hasta 4 dígitos (código 10271).

### 🐛 CAEA ignoraba las fechas de servicio

- **Bugfix**: `CaeaInvoice` no tenía campo `serviceDates` y la rendición informativa emitía `FchServDesde`, `FchServHasta` y `FchVtoPago` con la fecha del comprobante para las tres. Cualquier comprobante de servicios rendido por CAEA informaba mal el período. Se agrega el campo y se respeta; si se omite, se mantiene el comportamiento anterior como default.

### ✨ Tipos de emisión unificados en `IssueOptions`

- Los métodos de emisión declaraban sus parámetros inline y tipaban `date` como `Date`, de modo que **no se podía pasar la fecha-calendario literal** (`'2026-08-24'`) que la documentación recomienda, pese a que el SDK la soporta desde la v1.4.0. Ahora todos comparten `IssueOptions`, donde `date` es `ArcaDateInput`. Es un ensanchamiento de tipo: no rompe código existente.

### 🔐 Hint para el TA vigente de WSAA

- Teniendo un ticket de acceso vigente, ARCA **se niega a emitir otro** durante un lapso preventivo. Sin persistir el ticket, cualquier proceso que haga `login()` de nuevo se come el fault *"El CEE ya posee un TA valido para el acceso al WSN solicitado"*. El error ahora llega con un `hint` que explica la causa y apunta a `storage` (`TokenStorage`). `ArcaAuthError` acepta un `hint` opcional (aditivo).
  > **Corregido el 27/09/2026.** Esta entrada decía que ARCA no emite otro ticket *"mientras el anterior siga vigente (12 h)"* y que el proceso *"queda bloqueado hasta que expire"*. Es falso: las 12 h son la **vigencia** del TA, mientras que el bloqueo dura **10 minutos en homologación** y 2 en producción (*WSAA Manual del Desarrollador* cap. 10.6, que aclara que pueden cambiar sin aviso), medido contra homologación el 26/09/2026. Se corrige acá además de en la versión nueva porque el `CHANGELOG` viaja dentro del paquete npm.

### ✅ Suite de integración contra ARCA homologación

- **Nueva `tests/integration/`**, opt-in por variables de entorno y fuera del CI. Es lo único que puede ponerse en rojo por un rechazo de ARCA: el resto de la suite mockea la red. Incluye un `TokenStorage` en archivo que resuelve el problema del TA vigente. Ver `tests/integration/README.md`.
- **El CI pasa a correr `bun run test` (vitest) en vez de `bun test`**: son runners distintos y bajo el nativo de Bun los `vi.mock` se filtran entre archivos, con lo cual la suite era menos confiable de lo que aparentaba.

### 📖 Normativa verificada contra el manual oficial

- **Manual v4.7 (01/09/2026)** — ya vigente, **todavía no implementado**: comprobantes de Seguros de Caución (códigos 10273 a **10282**) y validaciones de comprobantes clase B con receptor **Sujeto No Categorizado** (10283 para CAE, 1527 para CAEA). El código 10283 exige informar el tributo `ID 13 – Percepción de IVA No Categorizado` (RG 2126/2006) en el array `Tributos` (desbloqueado con el nuevo campo `taxes`, pendiente de verificación en homologación).
- **Manual v4.8 (01/12/2026)**: `CondicionIVAReceptorId` pasa a obligatorio; los códigos 10245 (CAE) y 825 (CAEA), que hoy sólo observan, quedan en desuso y el rechazo pasa a ser 10246 / 826. Se confirma el **01/12**, no el 01/09 que indican varias fuentes secundarias.
- **Homologación ya rechaza los comprobantes sin `CondicionIVAReceptorId`** (verificado contra ARCA el 25/09/2026): la respuesta vuelve con `Resultado = 'R'`, CAE vacío y la observación del código **10246** ("es obligatorio"), no la del 10245 ("resultará obligatorio"). La fecha del 01/12/2026 es la de **producción**; homologación se adelantó para que se pueda probar. Informá siempre `buyer.vatCondition`.

## [1.4.2] — 2026-08-28

### 🐛 WSAA/WSFE no conectaban bajo Bun

- **Bugfix crítico**: `src/utils/network.ts` construye un `https.Agent` con un string de ciphers en sintaxis OpenSSL (`'DEFAULT:!DH@SECLEVEL=0'`) para evitar el error "dh key too small" contra los certificados de ARCA. La detección de runtime (`process.versions.node`) no alcanza para excluir a Bun: Bun define esa propiedad por compatibilidad, pero su TLS es BoringSSL, no OpenSSL. BoringSSL no entiende esa sintaxis de cipher list y, en vez de ignorarla, hacía fallar el socket de raíz (`FailedToOpenSocket`) antes de intentar la conexión — `wsaa.login()` y cualquier llamada a WSFE fallaban siempre bajo Bun. Se agrega detección explícita de Bun (`process.versions.bun`) para omitir ese string ahí; el resto del `https.Agent` (incluyendo el `checkServerIdentity` custom para el mismatch de certificado entre `*.arca.gob.ar` y `*.afip.gov.ar`) se mantiene igual y se verificó que sigue funcionando bajo Bun. Verificado contra ARCA homologación y producción (`FEDummy`) con Bun 1.3.14.

## [1.4.1] — 2026-08-28

### ⚠️ Deprecación de `issueSimpleReceipt()` e `issueReceipt()`

- **`issueSimpleReceipt()` e `issueReceipt()` quedan deprecados** (`@deprecated` + warning en runtime). Ambos emiten Tique C (`CbteTipo=83`), un comprobante regido por la **RG 3561/2013** (Controladores Fiscales) — una resolución distinta de la RG 4291/wsfev1 que sigue el resto del SDK. Se confirmó empíricamente contra ARCA homologación que `FECAESolicitar` con `CbteTipo=83` se rechaza con error **11001** ("no es un tipo de comprobante valido") desde un punto de venta Web Services estándar, el único tipo de punto de venta que un consumidor del SDK puede tener. Reemplazo recomendado: `issueInvoiceC()`. Ver `CLAUDE.md`, sección "Tique (81/82/83) vs. Factura", para el detalle normativo. Cambio no rompe la firma pública; los métodos siguen funcionando para quien tenga un punto de venta realmente homologado como Controlador Fiscal.
- **README**: se sacó `issueSimpleReceipt()` del Quick Start (reemplazado por `issueInvoiceC()`) y se agregó una advertencia en la tabla de "Tipos de comprobantes".

### 🐛 WSAA no autenticaba bajo Node.js ESM

- **Bugfix crítico**: `src/utils/crypto.ts` importaba `node-forge` con `import * as forge from 'node-forge'`. Bajo Node.js ESM nativo (el runtime que usa este mismo proyecto, `"type": "module"`), esa forma de import resuelve a un namespace vacío para paquetes CJS como `node-forge` — `forge.pki` quedaba `undefined` y `wsaa.login()` fallaba siempre con `ArcaAuthError: Error al firmar TRA con certificado`. Cambiado a `import forge from 'node-forge'` (default import), que sí resuelve a `module.exports` de forma confiable. Verificado contra `dist/index.js` con Node.js real y contra ARCA homologación. No afectaba a consumidores CJS (`require('arca-sdk')`), donde el bundle de tsup ya copiaba las propiedades en runtime.

---

## [1.4.0] — 2026-08-24

### 🌐 CAEA como Contingencia — `CbteFchHsGen` obligatorio (RG 5782)

- **Campo `CbteFchHsGen`**: Se incorporó el envío del campo `<ar:CbteFchHsGen>` en el detalle de `FECAEARegInformativo` (`CaeaService.reportCAEAPeriod()`). A partir de la **versión 4.6 del Manual del Desarrollador RG 4291** (vigente desde el **01/08/2026**, en cumplimiento de la **RG 5782**), todos los puntos de venta CAEA pasaron a considerarse de Contingencia y este campo es de integración obligatoria. Su ausencia puede provocar el rechazo de la rendición informativa.
- **Nueva propiedad `generatedAt`**: La interfaz `CaeaInvoice` acepta ahora `generatedAt?: Date` para informar la fecha y hora real de generación local del comprobante durante la contingencia. Si se omite, se utiliza `date` como valor por defecto.

### 🐛 Normalización de fechas a horario argentino (UTC-3)

- **Bugfix de zona horaria**: Las fechas construidas a partir de un instante (ej. `new Date()`) se calculan ahora en horario de Argentina (UTC-3) en lugar de UTC. Anteriormente se usaba `Date.toISOString()`, lo que provocaba que los comprobantes emitidos entre las **21:00 y las 00:00 hora argentina** se informaran con la **fecha del día siguiente**. Afecta a `CbteFch`, `FchServDesde`, `FchServHasta`, `FchVtoPago` y a la fecha de los comprobantes asociados (`CbtesAsoc`), tanto en `WsfeService` como en `CaeaService`.

### ✨ `ArcaDateInput`: fechas-calendario explícitas

- **Los campos de fecha aceptan ahora `Date | string`**. Un `Date` de JavaScript es un *instante*, mientras que `CbteFch` es una *fecha-calendario*; con un `Date` pelado las dos cosas son indistinguibles. Ahora se puede expresar la intención sin ambigüedad:
  - `'2026-08-24'` o `'20260824'` → fecha literal, sin conversión de zona horaria (**forma recomendada**).
  - `new Date()` → instante, se convierte al día calendario argentino.
- **Compatibilidad**: el cambio es aditivo, no requiere migrar código. Un `Date` que caiga exactamente en medianoche UTC —como `new Date('2026-08-24')`, la forma habitual de construir "un día" en JS— se sigue interpretando como fecha-calendario literal, de modo que quien ya pasaba fechas así obtiene el mismo resultado que antes.
- **Validación**: los strings con formato desconocido (`'24/08/2026'`) o fechas inexistentes (`'2026-02-30'`), y los `Date` inválidos, ahora lanzan `RangeError` en lugar de generar silenciosamente un comprobante con fecha incorrecta.
- **Nuevos helpers** exportados en `src/utils/formatArcaDate.ts`: `formatArcaDateOnly()` (`yyyymmdd`, String 8) y `formatArcaTimestamp()` (`yyyymmddhhmmss`, String 14), que unifican el criterio de zona horaria que hasta ahora solo aplicaba el TRA del WSAA.

> **Nota sobre `CbteFchHsGen`**: a diferencia de `date`, un `Date` en `generatedAt` se interpreta **siempre** como instante, porque ahí la hora es el dato que ARCA valida. Si se omite `generatedAt`, el SDK usa la fecha ya resuelta del comprobante con hora `000000`, garantizando que la parte de fecha coincida con `CbteFch`.

---

## [1.3.5] — 2026-08-03

### 🌐 Adecuación Normativa ARCA (RG 5866/2026)

- **Actualización de Referencia Normativa**: Se actualizó la referencia legal en las validaciones de `WsfeService`, unit tests y documentación de la antigua RG 5824/2026 a la **RG 5866/2026** (vigente desde el 01/07/2026), la cual abrogó y unificó el régimen de facturación electrónica de ARCA manteniendo el tope de $10.000.000 para la identificación de compradores a Consumidor Final.

---

## [1.2.1] — 2026-05-29

### 🌐 Normativas ARCA 2026 & Actualizaciones de Infraestructura

- **Migración a Dominios ARCA**: Se actualizaron todos los endpoints predeterminados SOAP del SDK (`WSAA`, `WSFE` y `Padrón A13`) reemplazando los antiguos servidores `*.afip.gov.ar` / `*.afip.gob.ar` por la infraestructura oficial y definitiva de ARCA (`*.arca.gob.ar`).
- **URL del Código QR Oficial**: Se actualizó la URL de validación del QR de comprobantes electrónicos a `https://www.arca.gob.ar/fe/qr/?p=...` según la normativa vigente en 2026.
- **Documentación de Normativas Recientes**:
  - **Identificación de Comprador (RG 5824/2026)**: Se documentó en el `README.md` el nuevo tope legal de **$10.000.000** a partir del cual es obligatorio identificar al receptor en facturas de Consumidores Finales.
  - **Facturación A con Leyenda (RG 5762/2025)**: Se documentó cómo utilizar el campo `optionals` del SDK para dar cumplimiento a la disolución de la Factura Clase "M" mediante la emisión de Facturas A tradicionales con leyendas de retención impositivas ("OPERACIÓN SUJETA A RETENCIÓN" o "PAGO EN CBU INFORMADA").

---

## [1.2.0] — 2026-03-18

### ✨ Developer Experience (DX) y Normativas 2025

- **VatCondition Enum**: Se introdujo el enumerador fuertemente tipado `VatCondition` para facilitar el envío del parámetro `<ar:CondicionIVAReceptorId>` (obligatorio para ciertas Facturas C según la RG 5616/2024 efectiva desde 2025). Ahora la interfaz `Buyer` acepta este enum en su propiedad `vatCondition`, previniendo errores por el uso de números mágicos (ej. `VatCondition.CONSUMIDOR_FINAL` en lugar de `5`).

---

## [1.1.2] — 2026-03-04

### 🐛 Fixes en Nodos para Facturas de Servicios (RG 5616)

- **Condición IVA Receptor Nativas**: Se solucionó un bug por el cual `<ar:CondicionIVAReceptorId>` no se renderizaba como nodo de primer nivel en `FECAEDetRequest`, requisito fundamental de la RG 5616 para Factura C de ciertos compradores. Ahora puede enviarse vía `buyer.vatCondition`.
- **Fechas de Servicio**: Se añadió inyección nativa de `<ar:FchServDesde>`, `<ar:FchServHasta>` y `<ar:FchVtoPago>` para cuando se facturan Conceptos `2` o `3` (Servicios o Productos + Servicios). Se puede especificar enviando el parámetro `serviceDates` en la Request.

---

## [1.1.1] — 2026-03-03

### ✨ Soporte para Opcionales y Resolución General 5616

- **Opcionales en WSFE**: Se agregó soporte completo para enviar el campo `<ar:Opcionales>` en todas las operaciones de emisión de comprobantes (Facturas A/B/C, Notas de Crédito, Notas de Débito, Recibos y Tickets).
- **Condición IVA Receptor**: Esto permite dar pleno cumplimiento a la reciente RG 5616 de AFIP, que hace obligatorio enviar la Condición frente al IVA del receptor en ciertas Facturas C, enviando el ID `1010` dentro de los opcionales.
- **Consulta de Comprobantes**: El método `WsfeService.getInvoice()` ahora retorna el array de `optionals` si el comprobante los posee.

---

## [1.1.0] — 2026-02-28

### ✨ Nuevos Comprobantes (Vouchers)

Se expandió la funcionalidad del servicio de facturación (`WsfeService`) para cubrir el espectro completo de comprobantes básicos:

- **Notas de Crédito**: Agregados métodos `issueCreditNoteA()`, `issueCreditNoteB()` y `issueCreditNoteC()`.
- **Notas de Débito**: Agregados métodos `issueDebitNoteA()`, `issueDebitNoteB()` y `issueDebitNoteC()`.
- **Recibos**: Agregados métodos `issueReceiptA()`, `issueReceiptB()` y `issueReceiptC()`.
- **Comprobantes Asociados**: El SDK ahora genera correctamente el nodo `<ar:CbtesAsoc>` de forma obligatoria para emitir NC/ND, asegurando que la operación de contingencia (anulación total o parcial de una factura) respete el estándar del ente recaudador. 

---

## [1.0.4] — 2026-02-27

### 🐛 Bugfix — Timezone Handling

- Se ajustó la generación de fechas para forzar la zona horaria UTC-3 (Argentina) independientemente de la zona horaria del servidor (ej: AWS, Vercel).
- Se restan 10 minutos al tiempo de generación en los TRA para evitar errores de desincronización con los servidores de ARCA.

---

## [1.0.1] — 2026-02-23

### 🐛 Bugfix crítico — QR URL

`generateQRUrl` usaba `encodeURIComponent` sobre el string base64, convirtiendo:
- `+` → `%2B`
- `=` → `%3D`
- `/` → `%2F`

El scanner de ARCA intenta decodificar el parámetro `?p=` como base64 puro. Al recibir `%2B` en lugar de `+`, la decodificación falla parcialmente: el CUIT y el CAE se rescatan por un camino alternativo interno, pero la fecha, punto de venta, número de comprobante e importe llegan vacíos.

**Fix:** El base64 ahora se embebe directamente sin URL-encoding, tal como especifica la [documentación oficial de ARCA](https://www.afip.gob.ar/fe/qr/especificaciones.asp).

```diff
- return `https://www.afip.gob.ar/fe/qr/?p=${encodeURIComponent(base64)}`;
+ return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
```

---

## [1.0.0] — 2026-02-23

### 🔴 Breaking Changes

Esta versión establece la API pública definitiva. **Requiere actualizar todos los imports** si venís de v0.x.

#### Métodos renombrados en WsfeService
| v0.x | v1.0.0 |
|-------|--------|
| `emitirTicketCSimple()` | `issueSimpleReceipt()` |
| `emitirTicketC()` | `issueReceipt()` |
| `emitirFacturaC()` | `issueInvoiceC()` |
| `emitirFacturaB()` | `issueInvoiceB()` |
| `emitirFacturaA()` | `issueInvoiceA()` |
| `emitirComprobante()` | *(privado — ya no accesible)* |

#### Método renombrado en PadronService
| v0.x | v1.0.0 |
|-------|--------|
| `getPersona(cuit)` | `getTaxpayer(cuit)` |

#### Configuración de WsfeService
| v0.x | v1.0.0 |
|-------|--------|
| `puntoVenta: 4` | `pointOfSale: 4` |

#### Tipos renombrados
| v0.x | v1.0.0 |
|-------|--------|
| `TipoComprobante` | `InvoiceType` |
| `TipoDocumento` | `TaxIdType` |
| `Concepto` | `BillingConcept` |
| `FacturaItem` | `InvoiceItem` |
| `Comprador` | `Buyer` |
| `EmitirFacturaRequest` | `IssueInvoiceRequest` |
| `Persona` | `Taxpayer` |
| `Domicilio` | `Address` |
| `Actividad` | `Activity` |
| `Impuesto` | `TaxRecord` |
| `PadronResponse` | `TaxpayerResponse` |
| `PadronConfig` | `TaxpayerServiceConfig` |

#### Fields renombrados en tipos
| Tipo | v0.x | v1.0.0 |
|------|-------|--------|
| `InvoiceItem` | `descripcion` | `description` |
| `InvoiceItem` | `cantidad` | `quantity` |
| `InvoiceItem` | `precioUnitario` | `unitPrice` |
| `InvoiceItem` | `alicuotaIva` | `vatRate` |
| `Buyer` | `tipoDocumento` | `docType` |
| `Buyer` | `nroDocumento` | `docNumber` |
| `CAEResponse` | `tipoComprobante` | `invoiceType` |
| `CAEResponse` | `puntoVenta` | `pointOfSale` |
| `CAEResponse` | `nroComprobante` | `invoiceNumber` |
| `CAEResponse` | `fecha` | `date` |
| `CAEResponse` | `vencimientoCae` | `caeExpiry` |
| `CAEResponse` | `resultado` | `result` |
| `CAEResponse` | `observaciones` | `observations` |
| `CAEResponse` | `iva` | `vat` |
| `CAEResponse` | `urlQr` | `qrUrl` |
| `ServiceStatus` | `AppServer` | `appServer` |
| `ServiceStatus` | `DbServer` | `dbServer` |
| `ServiceStatus` | `AuthServer` | `authServer` |
| `Taxpayer` | `idPersona` | `taxId` |
| `Taxpayer` | `tipoPersona` | `personType` |
| `Taxpayer` | `nombre` | `firstName` |
| `Taxpayer` | `apellido` | `lastName` |
| `Taxpayer` | `razonSocial` | `companyName` |
| `Taxpayer` | `estadoClave` | `status` |
| `Taxpayer` | `domicilio` | `addresses` |
| `Taxpayer` | `actividad` | `activities` |
| `Taxpayer` | `impuesto` | `taxes` |
| `Taxpayer` | `descripcionActividadPrincipal` | `mainActivity` |
| `Taxpayer` | `esInscriptoIVA` | `isVATRegistered` |
| `Taxpayer` | `esMonotributista` | `isMonotax` |
| `Taxpayer` | `esExento` | `isVATExempt` |
| `Address` | `direccion` | `street` |
| `Address` | `localidad` | `city` |
| `Address` | `codPostal` | `postalCode` |
| `Address` | `idProvincia` | `provinceId` |
| `Address` | `descripcionProvincia` | `province` |
| `Address` | `tipoDomicilio` | `type` |

#### Función renombrada en utils
| v0.x | v1.0.0 |
|-------|--------|
| `generarUrlQR()` | `generateQRUrl()` |

#### Enums — valores constantes renombrados
| Enum | v0.x | v1.0.0 |
|------|-------|--------|
| `TaxIdType` | `CONSUMIDOR_FINAL` | `FINAL_CONSUMER` |
| `TaxIdType` | `CI_EXTRANJERA` | `FOREIGN_ID` |
| `TaxIdType` | `CI_BUENOS_AIRES` | `BUENOS_AIRES_ID` |
| `TaxIdType` | `CI_POLICIA_FEDERAL` | `NATIONAL_POLICE_ID` |
| `BillingConcept` | `PRODUCTOS` | `PRODUCTS` |
| `BillingConcept` | `SERVICIOS` | `SERVICES` |
| `BillingConcept` | `PRODUCTOS_Y_SERVICIOS` | `PRODUCTS_AND_SERVICES` |

---

### ✅ Nuevas funcionalidades

- **`WsfeService.getInvoice(type, number)`**: Consulta un comprobante ya emitido (FECompConsultar).
- **`WsfeService.getPointsOfSale()`**: Lista los puntos de venta habilitados (FEParamGetPtosVenta).
- **`ArcaNetworkError`**: Ahora exportado públicamente para manejo de errores de red.
- **`InvoiceDetails`**: Nuevo tipo para la respuesta de `getInvoice()`.
- **`PointOfSale`**: Nuevo tipo para la respuesta de `getPointsOfSale()`.

### 🐛 Fixes

- `ServiceStatus` ahora tiene campos `camelCase` (`appServer`, `dbServer`, `authServer`) en lugar de `PascalCase`.
- `emitirComprobante` (ahora `issueDocument`) se volvió privado — ya no es accesible desde fuera del servicio.
- Diccionario de hints de errores (`ARCA_ERROR_HINTS`) expandido a 15+ códigos documentados.
- Eliminado `WsaaResponse` (tipo sin uso).
- Tipado explícito en `PadronService`: eliminados todos los `any` en métodos privados.

### 🧪 Tests

- Nuevo suite de tests para `WsfeService` (`wsfe.test.ts`).
- Tests existentes actualizados a la nueva API.

---

## [0.5.0] — 2026-02-22

- Agregado Padrón A13 service (`PadronService`)
- `ArcaError` con campo `hint` para guiar al desarrollador
- `checkStatus()` con default seguro en `homologacion`

## [0.4.0] — 2026-02-21

- Primera versión pública del SDK
- `WsaaService` con cache en memoria + persistencia opcional
- `WsfeService` con Ticket C, Factura A, B, C
- Generador de QR oficial de ARCA
