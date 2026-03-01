import type { InvoiceItem } from '../types/wsfe';

/**
 * Calcula el subtotal de items (sin IVA)
 */
export function calculateSubtotal(items: InvoiceItem[], includesVAT = false): number {
    return items.reduce((sum, item) => {
        let netPrice = item.unitPrice;
        if (includesVAT && item.vatRate) {
            netPrice = item.unitPrice / (1 + item.vatRate / 100);
        }
        return sum + item.quantity * netPrice;
    }, 0);
}

/**
 * Calcula el IVA total de items
 */
export function calculateVAT(items: InvoiceItem[], includesVAT = false): number {
    return items.reduce((sum, item) => {
        const rate = item.vatRate || 0;
        let netPrice = item.unitPrice;
        if (includesVAT && rate) {
            netPrice = item.unitPrice / (1 + rate / 100);
        }
        const netSubtotal = item.quantity * netPrice;
        return sum + (netSubtotal * rate) / 100;
    }, 0);
}

/**
 * Calcula el total de la factura (subtotal + IVA)
 */
export function calculateTotal(items: InvoiceItem[], includesVAT = false): number {
    if (includesVAT) {
        return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    }
    const subtotal = calculateSubtotal(items, false);
    const vat = calculateVAT(items, false);
    return subtotal + vat;
}

/**
 * Redondea a 2 decimales
 */
export function round(value: number): number {
    return Math.round(value * 100) / 100;
}
