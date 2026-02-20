import type { FacturaItem } from '../types/wsfe';

/**
 * Calcula el subtotal de items (sin IVA)
 */
export function calcularSubtotal(items: FacturaItem[], incluyeIva = false): number {
    return items.reduce((sum, item) => {
        let precioNeto = item.precioUnitario;
        if (incluyeIva && item.alicuotaIva) {
            precioNeto = item.precioUnitario / (1 + (item.alicuotaIva / 100));
        }
        return sum + (item.cantidad * precioNeto);
    }, 0);
}


/**
 * Calcula el IVA total de items
 */
export function calcularIVA(items: FacturaItem[], incluyeIva = false): number {
    return items.reduce((sum, item) => {
        const alicuota = item.alicuotaIva || 0;
        let precioNeto = item.precioUnitario;
        if (incluyeIva && alicuota) {
            precioNeto = item.precioUnitario / (1 + (alicuota / 100));
        }
        const subtotalNeto = item.cantidad * precioNeto;
        return sum + (subtotalNeto * alicuota / 100);
    }, 0);
}

/**
 * Calcula el total de la factura (subtotal + IVA)
 */
export function calcularTotal(items: FacturaItem[], incluyeIva = false): number {
    if (incluyeIva) {
        return items.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0);
    }
    const subtotal = calcularSubtotal(items, false);
    const iva = calcularIVA(items, false);
    return subtotal + iva;
}

/**
 * Redondea a 2 decimales
 */
export function redondear(valor: number): number {
    return Math.round(valor * 100) / 100;
}
