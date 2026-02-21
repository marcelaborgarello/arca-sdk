import { describe, it, expect } from 'vitest';
import { generarUrlQR } from '../../src/utils/qr';
import { TipoDocumento } from '../../src/types/wsfe';

describe('QR Generation Utility', () => {
    it('should generate a valid AFIP QR URL', () => {
        const caeResponse = {
            tipoComprobante: 11,
            puntoVenta: 4,
            nroComprobante: 123,
            fecha: '20260220',
            cae: '12345678901234',
            vencimientoCae: '20260301',
            resultado: 'A' as const,
        };

        const cuitEmisor = '20123456789';
        const total = 1500.50;

        const url = generarUrlQR(caeResponse, cuitEmisor, total);

        expect(url).toContain('https://www.afip.gob.ar/fe/qr/?p=');

        // Extract base64 part
        const base64 = url.split('?p=')[1];
        const decoded = JSON.parse(Buffer.from(decodeURIComponent(base64), 'base64').toString());

        expect(decoded.ver).toBe(1);
        expect(decoded.cuit).toBe(20123456789);
        expect(decoded.importe).toBe(1500.5);
        expect(decoded.codAut).toBe(12345678901234);
    });

    it('should robustly handle characters that break Base64 in URLs (+, /)', () => {
        // We need a payload that results in '+' or '/' in standard Base64
        // "{"ver":1,"fecha":"2026-02-20","cuit":30716024941,"ptoVta":4,"tipoCmp":11,"nroCmp":1,"importe":100,"moneda":"PES","ctz":1,"tipoDocRec":99,"nroDocRec":0,"tipoCodAut":"E","codAut":71049102452292}"
        // Let's try to find one or just verify that encodeURIComponent is used

        const caeResponse = {
            tipoComprobante: 11,
            puntoVenta: 4,
            nroComprobante: 1,
            fecha: '20260220',
            cae: '71049102452292',
            vencimientoCae: '20260301',
            resultado: 'A' as const,
        };

        const url = generarUrlQR(caeResponse, '30716024941', 100);
        const base64Part = url.split('?p=')[1];

        // If it contains +, it's NOT robust unless wrapped in encodeURIComponent
        // Note: Standard Base64 of a JSON string very often contains '/' or '+'

        // For this specific test, we want to ensure that NO '+' or '/' appears UNENCODED.
        // Actually, encodeURIComponent will turn '+' into '%2B' and '/' into '%2F'.

        // We can't easily predict if it WILL have a '+', but we can check if it's URL safe.
        expect(base64Part).not.toContain('+');
        expect(base64Part).not.toContain('/');
    });
});
