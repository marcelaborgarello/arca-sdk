import { describe, it, expect } from 'vitest';
import { generateQRUrl } from '../../src/utils/qr';
import { TaxIdType } from '../../src/types/wsfe';
import type { CAEResponse } from '../../src/types/wsfe';

describe('QR Generation Utility', () => {
    it('should generate a valid AFIP QR URL', () => {
        const caeResponse: Partial<CAEResponse> = {
            invoiceType: 11,
            pointOfSale: 4,
            invoiceNumber: 123,
            date: '20260220',
            cae: '12345678901234',
            caeExpiry: '20260301',
            result: 'A',
        };

        const url = generateQRUrl(caeResponse as CAEResponse, '20123456789', 1500.50);

        expect(url).toContain('https://www.afip.gob.ar/fe/qr/?p=');

        // Extract base64 part
        const base64 = url.split('?p=')[1];
        // Raw base64 must NOT be URL-encoded (ARCA scanner reads it directly)
        expect(base64).not.toContain('%2B');
        expect(base64).not.toContain('%3D');
        const decoded = JSON.parse(Buffer.from(base64, 'base64').toString());

        expect(decoded.ver).toBe(1);
        expect(decoded.cuit).toBe(20123456789);
        expect(decoded.importe).toBe(1500.5);
        expect(decoded.codAut).toBe(12345678901234);
    });

    it('should clean dirty inputs (CUIT/CAE with dashes) and omit optional fields for anonymous consumers', () => {
        const caeResponse: Partial<CAEResponse> = {
            invoiceType: 11,
            pointOfSale: 4,
            invoiceNumber: 38,
            date: '20260220',
            cae: '8608-4684-8315-69', // Dirty CAE
            caeExpiry: '20260302',
            result: 'A',
        };

        const url = generateQRUrl(caeResponse as CAEResponse, '27-20395373-4', 4000.00);
        const base64Part = url.split('?p=')[1];
        const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString());

        // Verify cleaning
        expect(decoded.cuit).toBe(27203953734);
        expect(decoded.codAut).toBe(86084684831569);

        // Verify omission of optional fields (anonymous consumer)
        expect(decoded.tipoDocRec).toBeUndefined();
        expect(decoded.nroDocRec).toBeUndefined();

        // Verify field order
        const keys = Object.keys(decoded);
        expect(keys[0]).toBe('ver');
        expect(keys[1]).toBe('fecha');
        expect(keys[keys.length - 2]).toBe('tipoCodAut');
        expect(keys[keys.length - 1]).toBe('codAut');
    });

    it('should include buyer fields for identified buyers', () => {
        const caeResponse: Partial<CAEResponse> = {
            invoiceType: 1, // Factura A
            pointOfSale: 1,
            invoiceNumber: 10,
            date: '20260220',
            cae: '12345678901234',
            caeExpiry: '20260302',
            result: 'A',
        };

        const buyer = {
            docType: TaxIdType.CUIT,
            docNumber: '20-12345678-9',
        };

        const url = generateQRUrl(caeResponse as CAEResponse, '30716024941', 50000, buyer);
        const base64Part = url.split('?p=')[1];
        const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString());

        expect(decoded.tipoDocRec).toBe(80);
        expect(decoded.nroDocRec).toBe(20123456789);
    });
});
