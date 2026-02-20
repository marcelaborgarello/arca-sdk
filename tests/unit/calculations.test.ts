import { describe, it, expect } from 'vitest';
import {
    calcularSubtotal,
    calcularIVA,
    calcularTotal,
    redondear
} from '../../src/utils/calculations';
import type { FacturaItem } from '../../src/types/wsfe';

describe('Cálculos de Facturación', () => {
    const items: FacturaItem[] = [
        { descripcion: 'Item 1', cantidad: 2, precioUnitario: 100, alicuotaIva: 21 }, // Sub: 200, IVA: 42
        { descripcion: 'Item 2', cantidad: 1, precioUnitario: 500, alicuotaIva: 10.5 }, // Sub: 500, IVA: 52.5
        { descripcion: 'Item 3', cantidad: 10, precioUnitario: 10 }, // Sub: 100, IVA: 0
    ];

    it('debe calcular el subtotal correctamente', () => {
        expect(calcularSubtotal(items)).toBe(800);
    });

    it('debe calcular el IVA correctamente', () => {
        expect(calcularIVA(items)).toBe(94.5);
    });

    it('debe calcular el total correctamente', () => {
        expect(calcularTotal(items)).toBe(894.5);
    });

    it('debe redondear valores correctamente', () => {
        expect(redondear(894.500001)).toBe(894.5);
        expect(redondear(894.505)).toBe(894.51);
        expect(redondear(894.504)).toBe(894.5);
    });
});
