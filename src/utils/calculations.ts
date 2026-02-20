import type { FacturaItem } from '../types/wsfe';

/**
 * Calcula el subtotal de items (sin IVA)
 */
export function calcularSubtotal(items: FacturaItem[]): number {
    return items.reduce((sum, item) => {
        return sum + (item.cantidad * item.precioUnitario);
    }, 0);
}

/**
 * Calcula el IVA total de items
 */
export function calcularIVA(items: FacturaItem[]): number {
    return items.reduce((sum, item) => {
        const subtotal = item.cantidad * item.precioUnitario;
        const alicuota = item.alicuotaIva || 0;
        return sum + (subtotal * alicuota / 100);
    }, 0);
}

/**
 * Calcula el total de la factura (subtotal + IVA)
 */
export function calcularTotal(items: FacturaItem[]): number {
    const subtotal = calcularSubtotal(items);
    const iva = calcularIVA(items);
    return subtotal + iva;
}

/**
 * Redondea a 2 decimales
 */
export function redondear(valor: number): number {
    return Math.round(valor * 100) / 100;
}
