import { describe, it, expect } from 'vitest';
import {
    calculateSubtotal,
    calculateVAT,
    calculateTotal,
    round,
} from '../../src/utils/calculations';
import type { InvoiceItem } from '../../src/types/wsfe';

describe('Invoice Calculations', () => {
    const items: InvoiceItem[] = [
        { description: 'Item 1', quantity: 2, unitPrice: 100, vatRate: 21 }, // Net: 200, VAT: 42
        { description: 'Item 2', quantity: 1, unitPrice: 500, vatRate: 10.5 }, // Net: 500, VAT: 52.5
        { description: 'Item 3', quantity: 10, unitPrice: 10 }, // Net: 100, VAT: 0
    ];

    it('debe calcular el subtotal correctamente', () => {
        expect(calculateSubtotal(items)).toBe(800);
    });

    it('debe calcular el IVA correctamente', () => {
        expect(calculateVAT(items)).toBe(94.5);
    });

    it('debe calcular el total correctamente', () => {
        expect(calculateTotal(items)).toBe(894.5);
    });

    it('debe redondear valores correctamente', () => {
        expect(round(894.500001)).toBe(894.5);
        expect(round(894.505)).toBe(894.51);
        expect(round(894.504)).toBe(894.5);
    });

    it('debe calcular correctamente cuando includesVAT es true', () => {
        const itemsVATInc: InvoiceItem[] = [
            { description: 'Item 1', quantity: 1, unitPrice: 121, vatRate: 21 }, // Net: 100, VAT: 21
            { description: 'Item 2', quantity: 2, unitPrice: 110.5, vatRate: 10.5 }, // Net: 200, VAT: 21
        ];

        expect(calculateSubtotal(itemsVATInc, true)).toBe(300);
        expect(calculateVAT(itemsVATInc, true)).toBe(42);
        expect(calculateTotal(itemsVATInc, true)).toBe(342);
    });
});
