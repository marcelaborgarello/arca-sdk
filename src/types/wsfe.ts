import type { ArcaConfig } from './common';
import type { LoginTicket } from './wsaa';

/**
 * Configuración para WSFE
 */
export interface WsfeConfig extends ArcaConfig {
    /** Ticket de autenticación WSAA */
    ticket: LoginTicket;
    /** Punto de venta (4 dígitos) */
    puntoVenta: number;
}

/**
 * Tipo de comprobante
 */
export enum TipoComprobante {
    FACTURA_A = 1,
    FACTURA_B = 6,
    FACTURA_C = 11,
    TICKET_A = 81,
    TICKET_B = 82,
    TICKET_C = 83,
}

/**
 * Concepto de facturación
 */
export enum Concepto {
    PRODUCTOS = 1,      // Productos
    SERVICIOS = 2,      // Servicios
    PRODUCTOS_Y_SERVICIOS = 3,  // Mixto
}

/**
 * Tipo de documento del cliente
 */
export enum TipoDocumento {
    CUIT = 80,
    CUIL = 86,
    CDI = 87,
    LE = 89,
    LC = 90,
    CI_EXTRANJERA = 91,
    PASAPORTE = 94,
    CI_BUENOS_AIRES = 95,
    CI_POLICIA_FEDERAL = 96,
    DNI = 96,
    CONSUMIDOR_FINAL = 99,  // Sin documento
}

/**
 * Item de factura
 */
export interface FacturaItem {
    /** Descripción del producto/servicio */
    descripcion: string;
    /** Cantidad */
    cantidad: number;
    /** Precio unitario */
    precioUnitario: number;
    /** IVA % (0, 10.5, 21, 27) */
    alicuotaIva?: number;
}

/**
 * Datos del comprador
 */
export interface Comprador {
    /** Tipo de documento */
    tipoDocumento: TipoDocumento;
    /** Número de documento (sin guiones) */
    nroDocumento: string;
}

/**
 * Request para emitir factura
 */
export interface EmitirFacturaRequest {
    /** Tipo de comprobante */
    tipo: TipoComprobante;
    /** Concepto */
    concepto: Concepto;
    /** Comprador (opcional para Factura C consumidor final) */
    comprador?: Comprador;
    /** Items de la factura (calculan el total si se proveen) */
    items?: FacturaItem[];
    /** Monto total (requerido si no hay items) */
    total?: number;
    /** Desglose de IVA (requerido para Factura B/A) */
    ivaData?: {
        alicuota: number;
        baseImponible: number;
        importe: number;
    }[];
    /** Indica si los preciosUnitarios de los items YA incluyen el IVA (Precio Final). Defecto: false */
    incluyeIva?: boolean;
    /** Fecha del comprobante (default: hoy) */
    fecha?: Date;
}

/**
 * Respuesta CAE (Código de Autorización Electrónico)
 */
export interface CAEResponse {
    /** Tipo de comprobante */
    tipoComprobante: number;
    /** Punto de venta */
    puntoVenta: number;
    /** Número de comprobante */
    nroComprobante: number;
    /** Fecha de emisión */
    fecha: string;
    /** CAE asignado */
    cae: string;
    /** Fecha de vencimiento del CAE */
    vencimientoCae: string;
    /** Resultado (A = Aprobado, R = Rechazado) */
    resultado: 'A' | 'R';
    /** Observaciones de ARCA (si hay) */
    observaciones?: string[];
    /** Items (se retornan si fueron proveídos en el request) */
    items?: FacturaItem[];
    /** Desglose IVA (solo para Factura B/A) */
    iva?: {
        alicuota: number;
        baseImponible: number;
        importe: number;
    }[];
}
