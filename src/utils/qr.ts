import type { Buyer, CAEResponse } from '../types/wsfe';
import { TaxIdType } from '../types/wsfe';

/**
 * Datos requeridos por ARCA para el QR (estructura oficial)
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
    tipoDocRec?: number;
    nroDocRec?: number;
    tipoCodAut: string;
    codAut: number;
}

/**
 * Genera la URL completa con el código QR para un comprobante emitido.
 * Implementa la versión oficial con orden estricto de campos según spec de ARCA.
 *
 * @param caeResponse Respuesta obtenida al emitir la factura (CAEResponse)
 * @param issuerCUIT CUIT del emisor (con o sin guiones)
 * @param total Importe total del comprobante
 * @param buyer Datos del comprador (opcional)
 * @returns URL lista para embeber en un generador de QR
 */
export function generateQRUrl(
    caeResponse: CAEResponse,
    issuerCUIT: string,
    total: number,
    buyer?: Buyer,
): string {
    // Clean CUIT and CAE (digits only)
    const cleanCUIT = issuerCUIT.replace(/\D/g, '');
    const cleanCAE = caeResponse.cae.replace(/\D/g, '');

    // Format date to YYYY-MM-DD (ARCA returns YYYYMMDD as string or number)
    const rawDate = String(caeResponse.date); // Ensure string — fast-xml-parser may return number
    const formattedDate =
        rawDate.length === 8
            ? `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`
            : rawDate;

    // Buyer document info
    const docType = buyer?.docType || TaxIdType.FINAL_CONSUMER;
    const docNumber = buyer?.docNumber ? buyer.docNumber.replace(/\D/g, '') : '0';

    // Build QR object with STRICT field order (required by ARCA spec)
    const qrData: any = {
        ver: 1,
        fecha: formattedDate,
        cuit: Number(cleanCUIT),
        ptoVta: Number(caeResponse.pointOfSale),
        tipoCmp: Number(caeResponse.invoiceType),
        nroCmp: Number(caeResponse.invoiceNumber),
        importe: Number(parseFloat(total.toFixed(2))),
        moneda: 'PES',
        ctz: 1,
    };

    // Omit buyer fields for anonymous final consumers
    if (docType !== TaxIdType.FINAL_CONSUMER || Number(docNumber) > 0) {
        qrData.tipoDocRec = Number(docType);
        qrData.nroDocRec = Number(docNumber);
    }

    qrData.tipoCodAut = 'E';
    qrData.codAut = Number(cleanCAE);

    // IMPORTANT: ARCA's scanner decodes raw base64, NOT URL-encoded base64.
    // Using encodeURIComponent here converts + to %2B and = to %3D, which
    // breaks ARCA's QR scanner. The raw base64 string must be used as-is.
    const jsonString = JSON.stringify(qrData);
    const base64 =
        typeof Buffer !== 'undefined'
            ? Buffer.from(jsonString).toString('base64')
            : btoa(jsonString);

    return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}
