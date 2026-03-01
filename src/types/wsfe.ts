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
    FACTURA_B = 6,
    FACTURA_C = 11,
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
 * Condición de IVA del Receptor
 * Acorde AFIP/ARCA RG 5616.
 */
export enum TaxCondition {
    /** 1 - Registered Taxpayer (Responsable Inscripto) */
    REGISTERED_TAXPAYER = 1,

    /** 4 - Exempt (IVA Exento) */
    EXEMPT = 4,

    /** 5 - Final Consumer (Consumidor Final) */
    FINAL_CONSUMER = 5,

    /** 6 - Simple Taxpayer / Monotax (Monotributista) */
    MONOTAX_PAYER = 6,

    /** 8 - Foreign Supplier (Proveedor del Exterior) */
    FOREIGN_SUPPLIER = 8,

    /** 9 - Foreign Client (Cliente del Exterior) */
    FOREIGN_CLIENT = 9,

    /** 10 - VAT Not Applicable (IVA No Alcanzado) */
    VAT_NOT_APPLICABLE = 10,

    /** 13 - Social Monotax (Monotributista Social) */
    SOCIAL_MONOTAX = 13,
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
    /** Condicion del iva del comprador */
    taxCondition: TaxCondition;
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
