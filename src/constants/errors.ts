/**
 * Diccionario de errores comunes de ARCA/AFIP y sus soluciones.
 * Clave: código de error numérico, o de texto cuando ARCA no da número.
 * Valor: sugerencia clara para el desarrollador.
 *
 * **De dónde sale cada uno, porque no es una sola fuente.** Hasta la v3.0.0 esta cabecera
 * afirmaba que todos los códigos salían del Manual del Desarrollador RG 4291, y era falso:
 *
 * - Los de **wsfev1** —la mayoría— salen de ese manual (v4.8). La convención de numeración
 *   es: cinco dígitos para la modalidad CAE, y tres dígitos o cuatro empezando en 1 para
 *   CAEA. **Con una excepción que la regla vieja no mencionaba**: el 501, 502, 600, 601 y
 *   602 son de tres dígitos y **no son CAEA** — son la tabla de errores internos de
 *   infraestructura de la p. 21, y llegan en cualquier método.
 * - Los de **WSAA** no tienen número. Su manual (publicación 20.2.19) no trae tabla de
 *   códigos: devuelve SOAP Faults y documenta nueve errores por su texto en el cap. 10. Por
 *   eso tienen clave de texto y se resuelven con {@link getWsaaHint}.
 * - `PADRON_ERROR` no es un código de ARCA: es el único código interno de este SDK que
 *   queda en la tabla — el otro, `CUIT_NOT_FOUND`, se borró en la v3.0.0.
 *
 * Los hints se buscan por código —{@link getArcaHint}— y, en un rechazo, con
 * {@link getHintForObservations}. Si tocás un texto de acá, el test que lo cubre está en
 * `tests/unit/errors.test.ts`: es a propósito, porque un hint no lo mira ni el compilador
 * ni ningún otro test, y así es como trece de ellos quedaron describiendo otro código.
 */
export const ARCA_ERROR_HINTS: Record<string | number, string> = {
    // === Errores de infraestructura de wsfev1 (manual v4.8, p. 21) ===
    //
    // Los cinco llegan por `Errors`, no por `Observaciones`: son de la tabla "errores
    // internos de infraestructura", no de las validaciones por comprobante.
    //
    // **No son de WSAA**, aunque el 501 y el 502 estuvieron hasta la v3.0.0 bajo un título
    // que decía "Autenticación WSAA" y con el texto de otro error. Confundirlos manda a
    // revisar el certificado cuando el problema es de ARCA, y es un rato perdido.
    501: 'Error interno de base de datos de ARCA. No es un problema de tus datos ni del certificado: ' +
        'reintentá en unos minutos.',
    502: 'Error interno de base de datos de ARCA — Autorizador CAE / Régimen CAEA, transacción activa. ' +
        'Es del lado de ARCA: reintentá en unos minutos.',
    // El error que aparece al delegar un CUIT en WSASS y reusar un TA cacheado: el TA trae
    // congelada la lista de relaciones del momento en que se emitió, así que una delegación
    // nueva no viaja en un token viejo.
    //
    // **Sí está documentado**, y no en el manual donde uno lo busca: está en el de Padrón
    // A13, en la descripción de `cuitRepresentada` de sus tres métodos — "debe coincidir con
    // alguna de las CUITS listadas en la sección relations del token enviado". No está en el
    // de wsfev1 ni en el de WSAA.
    600: 'No se corresponden token y firma, o el usuario no está autorizado a realizar esta operación. ' +
        'Si acabás de crear una delegación en WSASS, el TA cacheado no la conoce: borralo y pedí uno nuevo.',
    601: 'La CUIT representada no está incluida en el token. Pedí un TA nuevo para el CUIT que viaja ' +
        'en <Auth><Cuit> (en el SDK, `config.cuit`).',
    602: 'No existen datos en nuestros registros. Según el método puede ser simplemente "sin resultados": ' +
        'en FEParamGetPtosVenta el SDK lo traduce a lista vacía en vez de lanzar.',

    // === Autenticación WSAA ===
    //
    // **Acá no hay códigos numéricos, y hasta la v3.0.0 el SDK tenía cinco inventados**
    // (503, 1000, 1001, 1003 y 1005). El WSAA Manual del Desarrollador (publicación
    // 20.2.19) no trae ninguna tabla de códigos: WSAA devuelve SOAP Faults con
    // `faultcode`/`faultstring`, y documenta nueve errores **por su texto** en el cap. 10.
    // Los únicos códigos que existen son strings, y sólo para uno de los nueve
    // (`cms.sign.invalid`, `cms.bad`, `cms.bad.base64`).
    //
    // Por eso estas nueve entradas tienen clave de texto y se resuelven con
    // `getWsaaHint()`, que matchea el `faultstring`. El orden sigue al del manual.
    //
    // El 501 y el 502 **no están acá**: son de la tabla de infraestructura de wsfev1
    // (p. 21), arriba. Estuvieron bajo este título hasta la v3.0.0, y con el texto de
    // otro error.

    // Cap. 10.2. La causa más común no es la que uno piensa: no es un certificado roto,
    // es el ambiente cruzado.
    CERT_NOT_TRUSTED: 'El certificado no fue emitido por la Autoridad Certificante de ARCA. Antes de sospechar ' +
        'del certificado, revisá el ambiente: la causa más común es usar uno de producción contra homologación ' +
        'o al revés. Cada ambiente acepta sólo el suyo (manual de WSAA, cap. 10.2).',
    // Cap. 10.3. Ojo con el 10.4, que empieza igual y significa otra cosa.
    COMPUTER_NOT_AUTHORIZED: 'El certificado es de un ambiente y estás pegándole al otro. Verificá que ' +
        '`environment` y el PEM con el que firmás sean los dos de homologación, o los dos de producción ' +
        '(manual de WSAA, cap. 10.3).',
    // Cap. 10.4. Es el error del alta que falta, no del certificado.
    SERVICE_NOT_AUTHORIZED: 'El certificado todavía no está autorizado para ese servicio, o el `service` del TRA ' +
        'no es el id que espera ARCA. En homologación la autorización se da en WSASS; en producción se llama ' +
        '"delegación" y va por Administrador de Relaciones. Revisá también que `service` sea exactamente el id ' +
        'del servicio, por ejemplo `wsfe` (manual de WSAA, cap. 10.4).',
    // Cap. 10.5. El SDK ya sigue la recomendación de ARCA: `buildTRA()` no informa ni
    // `source` ni `destination`. Si este error aparece usando el SDK, el TRA lo armó
    // otra cosa.
    INVALID_SOURCE_DN: 'El DN del `source` del TRA es inválido. La solución que recomienda ARCA es no informar ' +
        '`source` ni `destination`: son opcionales, y omitirlos evita que el TRA se rompa el día que ARCA cambie ' +
        'los DN de sus certificados. El TRA que arma este SDK no los informa, así que si ves este error el TRA ' +
        'viene de otro lado (manual de WSAA, cap. 10.5).',
    // Cap. 10.6. Dos números distintos que es fácil confundir, y el SDK los confundió hasta la
    // v3.0.0: el TA *vale* 12 h, pero el bloqueo para pedir otro dura mucho menos.
    // Manual de WSAA cap. 10.6: el "lapso preventivo" es de 10 minutos en testing y 2 en
    // producción, y avisa que puede cambiar sin previo aviso. Medido en homologación el
    // 2026-09-26: se liberó entre los 9m32s y los 10m32s.
    ALREADY_HAS_TA: 'Ya existe un TA vigente para este CUIT y servicio y ARCA no emite otro por unos minutos ' +
        '(el manual de WSAA indica 10 en homologación y 2 en producción, y aclara que puede cambiar sin aviso). ' +
        'No son las 12 h que dura el ticket: eso es su vigencia, no el bloqueo. ' +
        'Guardá el ticket entre ejecuciones pasando un `storage` (TokenStorage) a WsaaService, en vez de hacer login cada vez.',
    // Cap. 10.7. Casi siempre es el reloj, no el código.
    TRA_EXPIRED: 'El `expirationTime` del TRA es anterior a la hora actual. Casi siempre es el reloj del equipo: ' +
        'sincronizalo por NTP (ARCA sugiere `time.afip.gov.ar`) y verificá que la zona horaria sea GMT-3 ' +
        '(manual de WSAA, cap. 10.7).',
    // Cap. 10.8. Es el único de los nueve que ARCA identifica también con códigos, y son
    // strings: cms.sign.invalid, cms.bad y cms.bad.base64.
    INVALID_SIGNATURE: 'La firma CMS es inválida o el algoritmo no está soportado (`cms.sign.invalid`, `cms.bad`, ' +
        '`cms.bad.base64`). Las causas que documenta ARCA: certificado inválido o expirado, un parámetro mal ' +
        'pasado (el servicio o el tiempo de vida), o el ambiente equivocado — certificado de producción contra ' +
        'homologación, o al revés (manual de WSAA, cap. 10.8).',
    // Cap. 10.9. El margen de 10 minutos hacia atrás que aplica `buildTRA()` es
    // exactamente la recomendación de este punto del manual.
    INVALID_GENERATION_TIME: 'El `generationTime` del TRA está en el futuro o tiene más de 24 h de antigüedad. ' +
        'Sincronizá el reloj por NTP y revisá que la zona horaria sea GMT-3. ARCA recomienda además restarle ' +
        'unos minutos al generarlo, para absorber desfasajes — es lo que hace este SDK (manual de WSAA, cap. 10.9).',
    // Cap. 10.10.
    TRA_SCHEMA_ERROR: 'ARCA no pudo validar el TRA contra su schema. Los motivos que documenta: mayúsculas y ' +
        'minúsculas del XML (son sensibles), formato de fecha incorrecto, una fecha imposible, un id de servicio ' +
        'de más de 35 caracteres, o el mensaje firmado mal generado (manual de WSAA, cap. 10.10).',

    // === WSFE — Tipo de comprobante y punto de venta ===
    //
    // El 11001 es del tipo de comprobante y el 11002 del punto de venta. Hasta la v3.0.0
    // este hint arrancaba diciendo "no es válido para este punto de venta", que es el
    // significado del 11002: mandaba a revisar el alta del punto de venta cuando el
    // problema es que el comprobante no existe en este web service. El manual (v4.8,
    // p. 128) es explícito: "debe de ser algunos de los habilitados en este WS".
    11001: 'El tipo de comprobante no está habilitado en este web service. Consultá la lista real con ' +
        'FEParamGetTiposCbte. Pasa con los Tique (81/82/83), que son de Controlador Fiscal ' +
        '(RG 3561/2013) y no se emiten por wsfev1: usá Factura (1/6/11). Si el problema fuera del ' +
        'punto de venta, el código sería el 11002.',
    // Los dos códigos del punto de venta. Hasta la v3.0.0 ninguno tenía hint: el texto que
    // los describe estaba escrito, pero colgado del 10048 y del 10049, que son de importes
    // y de fechas de servicio.
    //
    // RECE = Régimen de Emisión de Comprobantes Electrónicos, el tipo "Webservices" del
    // portal. Un punto de venta de "Comprobantes en línea" no sirve para este SDK.
    10005: 'El punto de venta no está dado de alta, o no es del tipo RECE (el "Webservices" del portal de ' +
        'ARCA). Dalo de alta ahí. Ojo: que getPointsOfSale() devuelva lista vacía NO significa que falte el ' +
        'alta — en homologación devuelve [] para CUITs que facturan sin problema, así que no lo uses como ' +
        'diagnóstico.',
    11002: 'El punto de venta no está habilitado en este web service. Consultalo con FEParamGetPtosVenta. ' +
        'Si el que no está habilitado es el tipo de comprobante, el código es el 11001.',

    // === WSFE — Numeración y fechas ===
    10016: 'El número de comprobante <CbteDesde> debe ser el último autorizado + 1 para ese punto de venta ' +
        'y tipo de comprobante: consultalo con FECompUltimoAutorizado. La misma validación cubre <CbteFch>, ' +
        'que admite N±5 días para Concepto 1 y N±10 para Concepto 2 y 3, siendo N la fecha de envío.',
    10049: 'Con Concepto 2 (servicios) o 3 (productos y servicios), las fechas de servicio son obligatorias: ' +
        'informá FchServDesde, FchServHasta y FchVtoPago en formato yyyymmdd (en el SDK, `serviceDates`).',

    // === WSFE — Importes ===
    // Hoy ambos builders mandan ImpTotConc fijo en 0.00, así que el SDK no puede provocarlo.
    // Queda escrito para el día que se soporte el neto no gravado.
    10043: 'El campo ImpTotConc ("importe neto no gravado") no puede ser menor a cero, y en los ' +
        'comprobantes clase C debe ser igual a cero. Excepción: en Bienes Usados (tipo 49) con ' +
        'emisor monotributista, ImpTotConc lleva el subtotal de la operación.',
    10044: 'El campo ImpOpEx ("importe exento") no puede ser menor a cero, y en los comprobantes clase C ' +
        'debe ser igual a cero.',
    10048: 'El importe total no cuadra: ImpTotal debe ser igual a ImpTotConc + ImpNeto + ImpOpEx + ImpTrib + ' +
        'ImpIVA, y en los comprobantes clase C a ImpNeto + ImpTrib. El margen que acepta ARCA es 0,01% ' +
        'relativo o 0,01 absoluto.',

    // === WSFE — Identificación del comprador ===
    10015: 'Factura B: El importe supera el límite para consumidores finales anónimos. Identificá al comprador con CUIT/DNI.',

    // === WSFE — IVA ===
    // El código de la alícuota inválida es el 10019, no el 10043: hasta la v3.0.0 este hint
    // estuvo colgado del 10043, que es una validación de importes y no habla de IVA.
    // La lista de abajo tiene que seguir a VAT_RATE_CODES — lo exige tests/unit/errors.test.ts.
    10019: 'La alícuota de IVA informada no está en el catálogo de ARCA. Los códigos vigentes son ' +
        '3 (0%), 9 (2.5%), 8 (5%), 4 (10.5%), 5 (21%) y 6 (27%). La lista autoritativa la da ' +
        'FEParamGetTiposIva: consultala con wsfe.getVatRates(). No aplica a comprobantes clase C.',
    // Los dos descuadres de IVA. Hasta la v3.0.0 tampoco tenían hint: el texto del
    // descuadre estaba colgado del 10044, que es el importe exento.
    //
    // Son distintos y conviene no confundirlos: el 10023 compara la **suma** del array
    // contra ImpIVA; el 10051 compara **cada** alícuota contra su base.
    10023: 'La suma de los importes del array de IVA no coincide con ImpIVA. El margen que acepta ARCA es ' +
        '0,01% relativo o 0,01 absoluto por alícuota informada. No aplica a comprobantes clase C.',
    10051: 'Los importes informados en cada alícuota no se corresponden con la alícuota elegida. Margen: ' +
        '0,01% relativo o 0,01 absoluto. No se valida en los tipos 2, 3, 7, 8, 52 y 53, ni en comprobantes ' +
        'clase C.',

    // === RG 5616 — Condición frente al IVA del receptor ===
    // Obligatorio desde el 01/12/2026 (Manual v4.8). 10245/825 quedan en desuso ese día.
    10242: 'La condición de IVA del receptor no es un valor permitido. El catálogo NO es correlativo: ' +
        'los códigos 2, 3 y 11 no existen. Válidos: 1, 4, 5, 6, 7, 8, 9, 10, 13, 15 y 16 ' +
        '(consultalos con FEParamGetCondicionIvaReceptor).',
    10243: 'La condición de IVA del receptor no aplica a la clase de comprobante. Ej.: Consumidor Final (5) ' +
        'va en B y C, no en A; Responsable Inscripto (1) va en A, no en B.',
    10245: 'Falta la condición de IVA del receptor (RG 5616). Hoy sólo observa, pero desde el 01/12/2026 ' +
        'rechaza: informá `buyer.vatCondition` ahora para no cortar la emisión ese día.',
    10246: 'La condición de IVA del receptor es obligatoria (RG 5616, vigente desde el 01/12/2026). ' +
        'Informá `buyer.vatCondition` con un valor del catálogo de FEParamGetCondicionIvaReceptor.',
    823: 'CAEA: la condición de IVA del receptor no es un valor permitido. Ver el código 10242.',
    824: 'CAEA: la condición de IVA del receptor no aplica a la clase de comprobante. Ver el código 10243.',
    825: 'CAEA: falta la condición de IVA del receptor (RG 5616). Desde el 01/12/2026 pasa a rechazar.',
    826: 'CAEA: la condición de IVA del receptor es obligatoria (RG 5616, desde el 01/12/2026).',

    // === Receptor ===
    10238: 'La CUIT receptora no existe.',
    10247: 'La CUIT receptora está inactiva o es inválida. Es excluyente salvo en Notas de Crédito.',
    10248: 'La CUIT receptora está limitada por haber sido caracterizada como sujeto no confiable en ' +
        'materia de Seguridad Social. Es excluyente salvo en Notas de Crédito.',
    10249: 'El documento del receptor corresponde a un sujeto fallecido, sin sucesión indivisa registrada.',
    10271: 'Si el tipo de documento es 31 (Fondo Común de Inversiones CNV), el número debe ser numérico de hasta 4 dígitos.',
    // El manual (p. 72) nombra el valor exacto, y el hint no lo decía: mandaba a adivinar
    // cuál de los once códigos del catálogo era el correcto.
    10272: 'Para entidades financieras, si el tipo de documento es 31 (FCI CNV), la condición de IVA del ' +
        'receptor debe ser 15 (IVA No Alcanzado).',

    // === Manual v4.7 (01/09/2026) ===
    // La fila del 10251 (p. 71) documenta un solo caso: las entidades financieras no pueden
    // emitir MiPyMEs (FCE). La RG 5866 no está en esa fila pero sí en el historial del
    // manual —entrada v4.4, "Entidades Financieras y Seguros, en cumplimiento con la
    // RG 5866… se agregó el código de validación 10251"—, así que la atribución es correcta
    // y lo que faltaba era el caso concreto.
    10251: 'Por las condiciones de la CUIT emisora no corresponde emitir este comprobante. El caso que ' +
        'documenta el manual: las entidades financieras no pueden emitir comprobantes MiPyMEs (FCE). ' +
        'Los códigos de esta familia salen de la RG 5866 (entidades financieras y seguros).',

    // La regla del tributo ID 13 son **cuatro** códigos, y sólo uno rechaza. Verificado por
    // el encabezado de cada tabla del manual, que es lo que las distingue: las excluyentes
    // dicen "Código de error" y las no excluyentes "Código de Observ.".
    //
    // | Código | Modalidad                   | Tabla         | Condición    |
    // |--------|-----------------------------|---------------|--------------|
    // | 10067  | CAE, FECAESolicitar         | excluyente    | ImpTrib = 0  |
    // | 10283  | CAE, FECAESolicitar         | no excluyente | ImpTrib > 0  |
    // | 1527   | CAEA, FECAEASolicitar       | no excluyente | ImpTrib > 0  |
    // | 1425   | CAEA, FECAEARegInformativo  | no excluyente | ImpTrib = 0  |
    //
    // Es al revés de lo que uno supondría: el que rechaza es el de ImpTrib = 0 (no mandaste
    // ningún tributo), no el de ImpTrib > 0 (mandaste tributos pero te falta el 13).
    10067: 'Falta informar el tributo ID 13 – Percepción de IVA No Categorizado (RG 2126/2006). Aplica ' +
        'cuando el comprobante es B (6, 7 u 8), el receptor es el CUIT 23000000000 (No Categorizado), ' +
        'ImpNeto + ImpIVA es mayor a 0 y no mandaste ningún tributo (ImpTrib = 0): informá el ID 13 en ' +
        '`taxes` con un importe mayor a 0. Es excluyente, o sea que ARCA rechaza el comprobante.',
    10283: 'Falta informar el tributo ID 13 – Percepción de IVA No Categorizado (RG 2126/2006) en el array ' +
        'de tributos. Aplica a comprobantes B con receptor No Categorizado (CUIT 23000000000) e ImpTrib > 0. ' +
        'Es una observación, no un rechazo: el que rechaza es el 10067, cuando ImpTrib = 0.',
    1527: 'CAEA: falta el tributo ID 13 – Percepción de IVA No Categorizado, con ImpTrib > 0. Es una ' +
        'observación, no un rechazo. Ver el código 10283.',
    1425: 'CAEA: falta el tributo ID 13 – Percepción de IVA No Categorizado en la rendición informativa, ' +
        'con ImpTrib = 0. Es una observación, no un rechazo. Ver el código 10067, que es el equivalente ' +
        'excluyente de la modalidad CAE.',

    // === Moneda extranjera (RG 5616) ===
    10038: 'La cotización no coincide con la registrada en ARCA. Si el pago es en la misma moneda extranjera ' +
        '(CanMisMonExt = S), debe coincidir exactamente con la del día hábil anterior. ' +
        'Traela con FEParamGetCotizacion en vez de fijarla a mano.',
    // Está al revés de lo que parece, y hasta la v3.0.0 el hint decía la vuelta equivocada:
    // el 10039 es la validación de PES, no la de la moneda extranjera. La cotización mayor a
    // cero para moneda extranjera es parte del 10038.
    10039: 'Cuando MonId es PES, el campo MonCotiz es obligatorio y debe ser igual a 1.',

    // === Padrón ===
    //
    // Código interno del SDK, no de ARCA: lo usa el `throw` de `padron.ts` cuando la
    // respuesta no trae un sobre SOAP. El hint dice qué hacer —reintentar— y eso no está en
    // el mensaje de error, que es la razón por la que vale la pena que exista.
    //
    // **Acá había un `CUIT_NOT_FOUND` y se borró en la v3.0.0.** Su texto era *"El CUIT
    // consultado no existe en el Padrón de ARCA"*, o sea el mensaje de error otra vez con
    // otras palabras: un hint existe para agregar la acción que el mensaje no trae. Además
    // no se usaba en ninguna línea del SDK y el mensaje real de ARCA es otro — el anexo 5.3
    // del *Manual Consulta a Padrón – Alcance 13 v1.4* dice *"La Clave (CUIT/CUIL)
    // consultada es inexistente"*.
    //
    // Ese anexo documenta **siete** mensajes y el SDK no reconoce ninguno. Cuatro sí son
    // accionables (token/sign inválido, la CUIT fuera de las relaciones del token, la clave
    // INACTIVA y el id de más de 11 dígitos). Hacerlos llegar pide un canal que hoy no
    // existe: `getTaxpayer()` devuelve los errores por valor y `TaxpayerResponse` no tiene
    // dónde poner un hint. Es un bloque de trabajo propio, no una entrada más de esta tabla.
    PADRON_ERROR: 'El servicio de Padrón suele ser inestable en homologación. Reintentá en unos minutos.',
};

/**
 * Busca un hint para un código de error dado.
 * Retorna undefined si no hay sugerencia conocida para ese código.
 */
export function getArcaHint(code: string | number): string | undefined {
    return ARCA_ERROR_HINTS[code];
}

/**
 * Los nueve faults de WSAA que documenta el cap. 10 de su manual, con el patrón que los
 * reconoce en el `faultstring`.
 *
 * **Por texto porque no hay otra forma**: WSAA no devuelve códigos numéricos. Hasta la
 * v3.0.0 el diccionario tenía cinco códigos inventados (503, 1000, 1001, 1003, 1005) que
 * no existen en ningún manual, y un solo fault reconocido de verdad —el del TA vigente—
 * con su regex escrita a mano dentro de `wsaa.ts`. Ese regex es ahora una fila de esta
 * tabla.
 *
 * **Qué tan firme es cada patrón**: el del TA vigente es el único **verificado contra
 * ARCA real** (2026-09-26, homologación). Los otros ocho salen del texto entrecomillado
 * del manual, que es lo mejor que hay sin provocar cada error a propósito. Por eso los
 * patrones apuntan a la parte más distintiva y corta de cada mensaje, y toleran las dos
 * grafías donde hay acento: ARCA escribe "valido" sin tilde en el único que pudimos leer,
 * y es prosa de un mensaje de error — puede cambiar en cualquier deploy.
 *
 * Si ninguno matchea, el hint queda `undefined`. Degrada, no rompe.
 *
 * El orden importa: el 10.3 y el 10.4 arrancan igual ("Computador no autorizado a acceder
 * a…") y significan cosas distintas. Se distinguen por la cola —"a los servicios de AFIP"
 * contra "al servicio"— y hay un test que exige que cada uno resuelva al suyo.
 *
 * Disponible desde v3.0.0.
 */
export const WSAA_FAULT_PATTERNS: ReadonlyArray<{ pattern: RegExp; key: string }> = [
    { pattern: /AC de confianza/i, key: 'CERT_NOT_TRUSTED' },                        // 10.2
    { pattern: /no autorizado a acceder a los servicios/i, key: 'COMPUTER_NOT_AUTHORIZED' }, // 10.3
    { pattern: /no autorizado a acceder al servicio/i, key: 'SERVICE_NOT_AUTHORIZED' },      // 10.4
    { pattern: /DN del source/i, key: 'INVALID_SOURCE_DN' },                         // 10.5
    { pattern: /ya posee un TA v[aá]lido/i, key: 'ALREADY_HAS_TA' },                 // 10.6
    { pattern: /tiempo de expiraci[óo]n es inferior/i, key: 'TRA_EXPIRED' },         // 10.7
    { pattern: /cms\.sign\.invalid|cms\.bad|firma inv[áa]lida/i, key: 'INVALID_SIGNATURE' }, // 10.8
    { pattern: /generationTime en el futuro|m[áa]s de 24 horas/i, key: 'INVALID_GENERATION_TIME' }, // 10.9
    { pattern: /interpretar el XML/i, key: 'TRA_SCHEMA_ERROR' },                     // 10.10
];

/**
 * Busca el hint de un fault de WSAA a partir de su `faultstring`.
 *
 * @param faultString - El `faultstring` del SOAP Fault, tal como lo devuelve WSAA.
 * @returns El hint del primer patrón que matchee, o `undefined` si no se reconoce
 *   ninguno — que es un estado normal, no un error: el manual documenta nueve casos y
 *   ARCA puede devolver otros.
 *
 * Disponible desde v3.0.0.
 */
export function getWsaaHint(faultString: string | undefined | null): string | undefined {
    if (!faultString) return undefined;

    for (const { pattern, key } of WSAA_FAULT_PATTERNS) {
        if (pattern.test(faultString)) return getArcaHint(key);
    }

    return undefined;
}

/**
 * Busca un hint para un rechazo, a partir de las observaciones que devolvió ARCA.
 *
 * **Por código, que es lo que corresponde.** Hasta la v3.0.0 el SDK descartaba `Obs.Code`
 * al parsear y esta búsqueda se hacía con dos expresiones regulares sobre el texto: de los
 * ~40 hints del diccionario, sólo dos podían llegar por el canal de los rechazos. Y es el
 * canal que más importa, porque es donde ARCA explica por qué no autorizó el comprobante.
 *
 * Se devuelve el hint de la **primera** observación que tenga uno. ARCA puede mandar
 * varias y no todas son accionables.
 *
 * @param observations - Observaciones con código, de `parseObservations()`.
 * @param fallbackText - Texto libre para el último recurso. Si ninguna observación trae un
 *   código conocido —o ARCA no mandó código— se reconocen por texto los dos casos de la
 *   RG 5616, que son los más frecuentes y los que motivaron el parche original.
 *
 * Disponible desde v3.0.0.
 */
export function getHintForObservations(
    observations: ReadonlyArray<{ code: number; message: string }>,
    fallbackText?: string
): string | undefined {
    for (const obs of observations) {
        if (!Number.isNaN(obs.code)) {
            const hint = getArcaHint(obs.code);
            if (hint) return hint;
        }
    }

    // Último recurso por texto. Se conserva porque una observación sin código —o con un
    // código que el diccionario todavía no tiene— igual debería dar la pista del 10246,
    // que va a ser el rechazo masivo del 01/12/2026.
    const texto = fallbackText ?? observations.map(o => o.message).join(' ');

    if (/Condicion Frente al IVA del receptor es obligatorio/i.test(texto)) {
        return getArcaHint(10246);
    }
    if (/Condicion Frente al IVA del receptor/i.test(texto)) {
        return getArcaHint(10245);
    }

    return undefined;
}
