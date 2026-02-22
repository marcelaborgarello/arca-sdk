import type { CAEResponse, Comprador } from '../types/wsfe';
import { TipoDocumento } from '../types/wsfe';

/**
 * Interfaz de los datos requeridos por ARCA para el QR
 * @see https://www.afip.gob.ar/fe/qr/especificaciones.asp
 */
interface AFIPQRData {
    ver: number;
    fecha: string;
    cuit: number;
    ptoVta: number;
    tipoCmp: number;
    nroCmp: number;
    importe: number;
    moneda: string;
    ctz: number;
    tipoDocRec: number;
    nroDocRec: number;
    tipoCodAut: string;
    codAut: number;
}

/**
 * Genera la URL completa con el código QR para un comprobante emitido.
 * Implementación robusta (Versión 11) que limpia inputs y asegura compatibilidad total con ARCA.
 * 
 * @param caeResponse Respuesta obtenida al emitir la factura (CAEResponse)
 * @param cuitEmisor Tu CUIT (con o sin guiones)
 * @param total Importe total del comprobante
 * @param comprador Datos del comprador (opcional)
 * @returns La URL lista para embeber en un generador de QR
 */
export function generarUrlQR(
    caeResponse: CAEResponse,
    cuitEmisor: string,
    total: number,
    comprador?: Comprador
): string {
    // 1. Limpieza estricta de CUIT y CAE (solo números)
    const cleanCuit = cuitEmisor.replace(/\D/g, '');
    const cleanCae = caeResponse.cae.replace(/\D/g, '');

    // 2. Formatear fecha a YYYY-MM-DD (ARCA la devuelve como YYYYMMDD)
    const fDate = caeResponse.fecha;
    const fechaFormat = fDate.length === 8
        ? `${fDate.substring(0, 4)}-${fDate.substring(4, 6)}-${fDate.substring(6, 8)}`
        : fDate;

    // 3. Determinar comprador
    const docTipo = comprador?.tipoDocumento || TipoDocumento.CONSUMIDOR_FINAL;
    const docNro = comprador?.nroDocumento ? comprador.nroDocumento.replace(/\D/g, '') : '0';

    // 4. Armar objeto JSON con ORDEN ESTRICTO de campos
    // El orden de las propiedades en JS se mantiene si se definen así (en la mayoría de los motores modernos)
    const qrObj: any = {
        ver: 1,
        fecha: fechaFormat,
        cuit: Number(cleanCuit),
        ptoVta: Number(caeResponse.puntoVenta),
        tipoCmp: Number(caeResponse.tipoComprobante),
        nroCmp: Number(caeResponse.nroComprobante),
        importe: Number(parseFloat(total.toFixed(2))),
        moneda: 'PES',
        ctz: 1
    };

    // Omitir datos del receptor si es Consumidor Final (99) y el importe es bajo (evita "datos incompletos")
    // O simplemente incluirlos si se desea, pero ARCA es más feliz con el objeto limpio si no hay receptor real.
    if (docTipo !== TipoDocumento.CONSUMIDOR_FINAL || Number(docNro) > 0) {
        qrObj.tipoDocRec = Number(docTipo);
        qrObj.nroDocRec = Number(docNro);
    }

    qrObj.tipoCodAut = 'E';
    qrObj.codAut = Number(cleanCae);

    // 5. Convertir a String -> Base64
    const jsonString = JSON.stringify(qrObj);

    // Uso robusto de Buffer para evitar problemas de btoa en Node/Edge
    let base64 = typeof Buffer !== 'undefined'
        ? Buffer.from(jsonString).toString('base64')
        : btoa(jsonString); // Fallback para navegadores

    // 6. Retornar URL lista con URL-Safe Encoding
    return `https://www.afip.gob.ar/fe/qr/?p=${encodeURIComponent(base64)}`;
}
