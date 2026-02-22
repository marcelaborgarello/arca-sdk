/**
 * Diccionario de errores comunes de ARCA/AFIP y sus soluciones (hints)
 */
export const ARCA_ERROR_HINTS: Record<string | number, string> = {
    // Generales / Auth
    501: 'Error de autenticación: El certificado puede haber expirado o la relación CUIT/Servicio no está dada de alta en la web de AFIP.',
    502: 'Error de autenticación: El ticket de acceso (TA) ya no es válido o está mal formado.',
    1000: 'El CUIT informado no es válido o no corresponde al certificado usado.',

    // WSFE (Facturación)
    10015: 'Factura B: El importe total es superior al límite para consumidores finales anónimos. Identificá al comprador.',
    10016: 'Factura C: El CUIT informado como receptor no es válido.',
    10048: 'Punto de Venta inválido: Asegurate de que el punto de venta esté dado de alta como "Factuweb" o "Webservice" en AFIP.',
    600: 'No se pudo autorizar el comprobante. Revisá las observaciones para más detalle.',

    // Padrón
    'PADRON_ERROR': 'El servicio de Padrón suele ser inestable en homologación. Reintentá en unos minutos.',
};

/**
 * Busca un hint para un código de error dado
 */
export function getArcaHint(code: string | number): string | undefined {
    return ARCA_ERROR_HINTS[code];
}
