import type { ArcaConfig } from './common';
import type { LoginTicket } from './wsaa';

/**
 * Configuración para WsfeService
 */
export interface WsfeConfig extends ArcaConfig {
    /** Ticket de autenticación WSAA */
    ticket: LoginTicket;
    /** Punto de venta (1-9999) */
    pointOfSale: number;
}

/**
 * Tipo de comprobante ARCA
 */
export enum InvoiceType {
    FACTURA_A = 1,
    NOTA_DEBITO_A = 2,
    NOTA_CREDITO_A = 3,
    RECIBO_A = 4,

    FACTURA_B = 6,
    NOTA_DEBITO_B = 7,
    NOTA_CREDITO_B = 8,
    RECIBO_B = 9,

    FACTURA_C = 11,
    NOTA_DEBITO_C = 12,
    NOTA_CREDITO_C = 13,
    RECIBO_C = 15,

    TICKET_A = 81,
    TICKET_B = 82,
    TICKET_C = 83,
}

/**
 * Concepto de facturación
 */
export enum BillingConcept {
    PRODUCTS = 1,
    SERVICES = 2,
    PRODUCTS_AND_SERVICES = 3,
}

/**
 * Tipo de documento del receptor
 */
export enum TaxIdType {
    CUIT = 80,
    CUIL = 86,
    CDI = 87,
    LE = 89,
    LC = 90,
    FOREIGN_ID = 91,
    PASSPORT = 94,
    BUENOS_AIRES_ID = 95,
    /**
     * @note AFIP usa el código 96 para ambos. En la práctica, DNI es el más utilizado.
     * Fuente: Tabla 13 del catálogo ARCA — ambos valores son 96 en el catálogo oficial.
     */
    NATIONAL_POLICE_ID = 96,
    DNI = 96,
    FINAL_CONSUMER = 99,
}

/**
 * Ítem de factura
 */
export interface InvoiceItem {
    /** Descripción del producto/servicio */
    description: string;
    /** Cantidad */
    quantity: number;
    /** Precio unitario */
    unitPrice: number;
    /** Alícuota IVA % (0, 10.5, 21, 27) */
    vatRate?: number;
}

/**
 * Datos del comprador
 */
export interface Buyer {
    /** Tipo de documento */
    docType: TaxIdType;
    /** Número de documento (sin guiones) */
    docNumber: string;
}

/**
 * Comprobante asociado (Requerido al emitir Notas de Crédito/Débito)
 */
export interface AssociatedInvoice {
    /** Tipo de comprobante original (ej. FACTURA_C) */
    type: InvoiceType;
    /** Punto de venta original */
    pointOfSale: number;
    /** Número de comprobante original */
    invoiceNumber: number;
    /** CUIT emisor (requerido a veces en MiPyME, opcional para resto) */
    cuit?: string;
    /** Fecha de emisión del comprobante original */
    date?: Date;
}

/**
 * Request para emitir comprobante
 */
export interface IssueInvoiceRequest {
    /** Tipo de comprobante */
    type: InvoiceType;
    /** Concepto */
    concept: BillingConcept;
    /** Comprador (opcional para Factura C consumidor final) */
    buyer?: Buyer;
    /** Items de la factura */
    items?: InvoiceItem[];
    /** Comprobantes asociados (Obligatorio para Nota de Crédito/Débito) */
    associatedInvoices?: AssociatedInvoice[];
    /** Monto total (requerido si no hay items) */
    total?: number;
    /** Desglose de IVA (requerido para Factura A/B) */
    vatData?: {
        rate: number;
        taxBase: number;
        amount: number;
    }[];
    /** Indica si los precios unitarios YA incluyen el IVA. Defecto: false */
    includesVAT?: boolean;
    /** Fecha del comprobante (default: hoy) */
    date?: Date;
}

/**
 * Respuesta CAE (Código de Autorización Electrónico)
 */
export interface CAEResponse {
    /** Tipo de comprobante */
    invoiceType: number;
    /** Punto de venta */
    pointOfSale: number;
    /** Número de comprobante */
    invoiceNumber: number;
    /** Fecha de emisión (YYYYMMDD) */
    date: string;
    /** CAE asignado */
    cae: string;
    /** Fecha de vencimiento del CAE (YYYYMMDD) */
    caeExpiry: string;
    /** Resultado (A = Aprobado, R = Rechazado) */
    result: 'A' | 'R';
    /** Observaciones de ARCA */
    observations?: string[];
    /** Items (se retornan si fueron proveídos en el request) */
    items?: InvoiceItem[];
    /** Desglose IVA (solo para Factura A/B) */
    vat?: {
        rate: number;
        taxBase: number;
        amount: number;
    }[];
    /** URL del código QR oficial de ARCA */
    qrUrl?: string;
}

/**
 * Detalle de un comprobante consultado (FECompConsultar)
 */
export interface InvoiceDetails {
    /** Tipo de comprobante */
    invoiceType: number;
    /** Punto de venta */
    pointOfSale: number;
    /** Número de comprobante */
    invoiceNumber: number;
    /** Fecha de emisión (YYYYMMDD) */
    date: string;
    /** Concepto */
    concept: number;
    /** Tipo de documento del receptor */
    docType: number;
    /** Número de documento del receptor */
    docNumber: number;
    /** Importe total */
    total: number;
    /** Importe neto gravado */
    net: number;
    /** Importe IVA */
    vat: number;
    /** CAE */
    cae: string;
    /** Vencimiento CAE (YYYYMMDD) */
    caeExpiry: string;
    /** Resultado */
    result: 'A' | 'R';
}

/**
 * Punto de venta habilitado en ARCA
 */
export interface PointOfSale {
    /** Número de punto de venta */
    number: number;
    /** Tipo (CAI, CAE, CAEA, etc.) */
    type: string;
    /** Indica si está bloqueado */
    isBlocked: boolean;
    /** Fecha de bloqueo (si aplica) */
    blockedSince?: string;
}

/**
 * Estado de los servidores de ARCA
 */
export interface ServiceStatus {
    /** Estado del servidor de aplicaciones */
    appServer: string;
    /** Estado del servidor de base de datos */
    dbServer: string;
    /** Estado del servidor de autenticación */
    authServer: string;
}
