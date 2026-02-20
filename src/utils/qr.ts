import type { CAEResponse, Comprador } from '../types/wsfe';
import { TipoDocumento } from '../types/wsfe';

/**
 * Interfaz de los datos requeridos por AFIP para el QR
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
 * Genera la URL completa con el código QR para un comprobante emitido
 * 
 * @param caeResponse Respuesta obtenida al emitir la factura (CAEResponse)
 * @param cuitEmisor Tu CUIT (11 dígitos, sin guiones)
 * @param total Importe total del comprobante
 * @param comprador Datos del comprador (opcional, si no se pasa asume Consumidor Final)
 * @returns La URL lista para embeber en un generador de QR
 */
export function generarUrlQR(
    caeResponse: CAEResponse,
    cuitEmisor: string,
    total: number,
    comprador?: Comprador
): string {
    // 1. Formatear fecha a YYYY-MM-DD (AFIP la devuelve como YYYYMMDD)
    const fDate = caeResponse.fecha;
    const fechaFormat = fDate.length === 8
        ? `${fDate.substring(0, 4)}-${fDate.substring(4, 6)}-${fDate.substring(6, 8)}`
        : fDate;

    // 2. Determinar comprador
    const docTipo = comprador?.tipoDocumento || TipoDocumento.CONSUMIDOR_FINAL;
    const docNro = comprador?.nroDocumento ? parseInt(comprador.nroDocumento, 10) : 0;

    // 3. Armar objeto JSON
    const qrData: AFIPQRData = {
        ver: 1, // Versión estándar exigida por AFIP
        fecha: fechaFormat,
        cuit: parseInt(cuitEmisor, 10),
        ptoVta: caeResponse.puntoVenta,
        tipoCmp: caeResponse.tipoComprobante,
        nroCmp: caeResponse.nroComprobante,
        importe: parseFloat(total.toFixed(2)),
        moneda: 'PES', // Por defecto PES (Pesos Argentinos)
        ctz: 1, // Cotización (siempre 1 para PES)
        tipoDocRec: docTipo,
        nroDocRec: docNro,
        tipoCodAut: 'E', // 'E' para comprobantes electrónicos
        codAut: parseInt(caeResponse.cae, 10)
    };

    // 4. Convertir a String -> Base64
    const jsonString = JSON.stringify(qrData);

    // Uso robusto de Buffer para evitar problemas de btoa en Node/Edge
    let base64 = typeof Buffer !== 'undefined'
        ? Buffer.from(jsonString).toString('base64')
        : btoa(jsonString); // Fallback para navegadores

    // 5. Retornar URL lista
    return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}
