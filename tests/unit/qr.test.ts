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

    it('should clean dirty inputs (CUIT/CAE with dashes) and omit optional fields for standard consumers', () => {
        const caeResponse = {
            tipoComprobante: 11,
            puntoVenta: 4,
            nroComprobante: 38,
            fecha: '20260220',
            cae: '8608-4684-8315-69', // Dirty CAE
            vencimientoCae: '20260302',
            resultado: 'A' as const,
        };

        // Dirty CUIT
        const cuitEmisor = '27-20395373-4';
        const total = 4000.00;

        const url = generarUrlQR(caeResponse, cuitEmisor, total);
        const base64Part = url.split('?p=')[1];
        const decoded = JSON.parse(Buffer.from(decodeURIComponent(base64Part), 'base64').toString());

        // Verify cleaning
        expect(decoded.cuit).toBe(27203953734);
        expect(decoded.codAut).toBe(86084684831569);

        // Verify omission of optional fields (docTipo=99, docNro=0)
        expect(decoded.tipoDocRec).toBeUndefined();
        expect(decoded.nroDocRec).toBeUndefined();

        // Verify field order (implicit check of keys)
        const keys = Object.keys(decoded);
        expect(keys[0]).toBe('ver');
        expect(keys[1]).toBe('fecha');
        // The last keys should be tipoCodAut and codAut
        expect(keys[keys.length - 2]).toBe('tipoCodAut');
        expect(keys[keys.length - 1]).toBe('codAut');
    });

    it('should include optional fields for identified buyers (even with dirty input)', () => {
        const caeResponse = {
            tipoComprobante: 1, // Factura A
            puntoVenta: 1,
            nroComprobante: 10,
            fecha: '20260220',
            cae: '12345678901234',
            vencimientoCae: '20260302',
            resultado: 'A' as const,
        };

        const buyer = {
            tipoDocumento: TipoDocumento.CUIT,
            nroDocumento: '20-12345678-9'
        };

        const url = generarUrlQR(caeResponse, '30716024941', 50000, buyer);
        const base64Part = url.split('?p=')[1];
        const decoded = JSON.parse(Buffer.from(decodeURIComponent(base64Part), 'base64').toString());

        expect(decoded.tipoDocRec).toBe(80);
        expect(decoded.nroDocRec).toBe(20123456789);
    });
});
