/**
 * Diccionario de errores comunes de ARCA/AFIP y sus soluciones.
 * Clave: código de error numérico o string retornado por ARCA.
 * Valor: sugerencia clara para el desarrollador.
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

    // === WSFE — Puntos de venta y configuración ===
    10048: 'El punto de venta no está dado de alta en ARCA. Dalo de alta como Webservice en el portal.',
    10049: 'El punto de venta no está activo o está bloqueado.',

    // === WSFE — Comprobantes y montos ===
    10015: 'Factura B: El importe supera el límite para consumidores finales anónimos. Identificá al comprador con CUIT/DNI.',
    10016: 'El CUIT informado como receptor no es válido o no existe en el Padrón.',
    600: 'No se pudo autorizar el comprobante. Revisá el campo `observations` en la respuesta para más detalle.',
    601: 'El comprobante ya fue autorizado anteriormente. No emitas dos veces el mismo número.',
    602: 'El número de comprobante es inválido o no es el correcto según el último autorizado.',

    // === WSFE — IVA ===
    10043: 'La alícuota de IVA informada no existe o es incorrecta. Usá 3 (0%), 4 (10.5%), 5 (21%) o 6 (27%).',
    10044: 'El importe de IVA no cuadra con la base imponible × alícuota.',

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
