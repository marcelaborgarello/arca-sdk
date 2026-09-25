/**
 * Diccionario de errores comunes de ARCA/AFIP y sus soluciones.
 * Clave: código de error numérico o string retornado por ARCA.
 * Valor: sugerencia clara para el desarrollador.
 *
 * Los códigos y sus descripciones salen del Manual del Desarrollador RG 4291 —
 * Proyecto FE (`wsfev1`). Los de cuatro dígitos que empiezan en 1 y los de tres
 * dígitos corresponden a la modalidad CAEA; los de cinco dígitos, a CAE.
 */
export const ARCA_ERROR_HINTS: Record<string | number, string> = {
    // === Autenticación WSAA ===
    501: 'El certificado puede haber expirado o la relación CUIT/Servicio no está habilitada en el portal de ARCA.',
    502: 'El ticket de acceso (TA) es inválido o ya expiró. Hacé wsaa.login() nuevamente.',
    503: 'Error interno del servidor de autenticación de ARCA. Reintentá en unos minutos.',
    1000: 'El CUIT informado no es válido o no corresponde al certificado usado.',
    1001: 'El servicio solicitado no existe o el certificado no tiene autorización para usarlo.',
    1003: 'El TRA (Ticket de Requerimiento de Acceso) tiene un formato inválido.',
    1005: 'El TRA ya expiró antes de ser presentado. Verificá la hora del sistema.',
    // ARCA no emite un TA nuevo mientras el anterior siga vigente (12 h). Sin
    // persistencia, cada proceso nuevo pide uno y choca con esto.
    ALREADY_HAS_TA: 'Ya existe un TA vigente para este CUIT y servicio: ARCA no emite otro hasta que expire (12 h). ' +
        'Guardá el ticket entre ejecuciones pasando un `storage` (TokenStorage) a WsaaService, en vez de hacer login cada vez.',

    // === WSFE — Puntos de venta y configuración ===
    10048: 'El punto de venta no está dado de alta en ARCA. Dalo de alta como Webservice en el portal.',
    10049: 'El punto de venta no está activo o está bloqueado.',
    11001: 'El tipo de comprobante no es válido para este punto de venta. Pasa con los Tique (81/82/83), ' +
        'que son de Controlador Fiscal (RG 3561/2013) y no se emiten por wsfev1: usá Factura (1/6/11). ' +
        'La lista autoritativa la da FEParamGetTiposCbte.',

    // === WSFE — Comprobantes y montos ===
    10015: 'Factura B: El importe supera el límite para consumidores finales anónimos. Identificá al comprador con CUIT/DNI.',
    10016: 'El CUIT informado como receptor no es válido o no existe en el Padrón.',
    600: 'No se pudo autorizar el comprobante. Revisá el campo `observations` en la respuesta para más detalle.',
    601: 'El comprobante ya fue autorizado anteriormente. No emitas dos veces el mismo número.',
    602: 'El número de comprobante es inválido o no es el correcto según el último autorizado.',

    // === WSFE — IVA ===
    10043: 'La alícuota de IVA informada no existe o es incorrecta. Usá 3 (0%), 4 (10.5%), 5 (21%) o 6 (27%).',
    10044: 'El importe de IVA no cuadra con la base imponible × alícuota.',

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
    10272: 'Condición de IVA del receptor no permitida para la combinación informada por entidades financieras.',

    // === Manual v4.7 (01/09/2026) ===
    10251: 'Por las condiciones de la CUIT emisora no corresponde emitir este comprobante ' +
        '(restricciones de entidades financieras y seguros, RG 5866).',
    10283: 'Falta informar el tributo ID 13 – Percepción de IVA No Categorizado (RG 2126/2006) en el array ' +
        'de tributos. Aplica a comprobantes B con receptor No Categorizado (CUIT 23000000000) e ImpTrib > 0.',
    1527: 'CAEA: falta el tributo ID 13 – Percepción de IVA No Categorizado. Ver el código 10283.',

    // === Moneda extranjera (RG 5616) ===
    10038: 'La cotización no coincide con la registrada en ARCA. Si el pago es en la misma moneda extranjera ' +
        '(CanMisMonExt = S), debe coincidir exactamente con la del día hábil anterior. ' +
        'Traela con FEParamGetCotizacion en vez de fijarla a mano.',
    10039: 'Si la moneda no es PES, la cotización debe ser mayor a cero.',

    // === Padrón ===
    PADRON_ERROR: 'El servicio de Padrón suele ser inestable en homologación. Reintentá en unos minutos.',
    CUIT_NOT_FOUND: 'El CUIT consultado no existe en el Padrón de ARCA.',
};

/**
 * Busca un hint para un código de error dado.
 * Retorna undefined si no hay sugerencia conocida para ese código.
 */
export function getArcaHint(code: string | number): string | undefined {
    return ARCA_ERROR_HINTS[code];
}
