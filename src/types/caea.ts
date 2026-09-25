import type { WsfeConfig, InvoiceType, BillingConcept, Buyer, InvoiceOptional, AssociatedInvoice, InvoiceItem, ArcaDateInput, ServiceDates, InvoiceTax } from './wsfe';

/**
 * Configuration for CaeaService (identical to WsfeConfig)
 */
export type CaeaConfig = WsfeConfig;

/**
 * Request parameter for soliciting a CAEA
 */
export interface CAEASolicitarRequest {
    /** Period in AAAAMM format (e.g. '202606') */
    period: string;
    /** Quinzena order (1 for days 1-15, 2 for days 16-end) */
    order: number;
}

/**
 * Response representing a solicited CAEA
 */
export interface CAEASolicitarResponse {
    /** The obtained CAEA code */
    caea: string;
    /** The period (AAAAMM) */
    period: number;
    /** The order of the fortnight (1 or 2) */
    order: number;
    /** Expiry date of the CAEA (YYYYMMDD) */
    expiryDate: string;
    /** Actual date of processing (YYYYMMDD) */
    actualDate: string;
    /** Reception date (YYYYMMDD) */
    receptionDate: string;
    /** Limit date for reporting invoices under this CAEA (YYYYMMDD) */
    limitDate: string;
}

/**
 * Response for querying a CAEA (same fields as CAEASolicitarResponse)
 */
export type CAEAConsultarResponse = CAEASolicitarResponse;

/**
 * Invoice emitted under contingency that needs to be reported in batch
 */
export interface CaeaInvoice {
    /** Type of invoice (e.g. InvoiceType.FACTURA_A, FACTURA_B, etc.) */
    invoiceType: InvoiceType;
    /** Concept (e.g. BillingConcept.PRODUCTS, SERVICES, etc.) */
    concept: BillingConcept;
    /** Invoice number (correlative) */
    invoiceNumber: number;
    /**
     * Fecha del comprobante (default: hoy).
     *
     * Acepta `'YYYY-MM-DD'` / `'YYYYMMDD'` (fecha literal) o un `Date`
     * (instante, se convierte al día calendario argentino).
     */
    date?: ArcaDateInput;
    /**
     * Fecha **y hora** exactas en que el comprobante se generó localmente durante
     * la contingencia. Se envía como `CbteFchHsGen` (String 14, `yyyymmddhhmmss`,
     * hora argentina UTC-3).
     *
     * Obligatorio desde el 01/08/2026 (RG 5782 — Manual del Desarrollador RG 4291 v4.6):
     * todos los puntos de venta CAEA pasan a considerarse de Contingencia.
     *
     * A diferencia de `date`, un `Date` acá se interpreta siempre como instante:
     * la hora es justamente el dato que ARCA valida. **Informalo siempre con la hora
     * real de emisión.** Si se omite, se usa la fecha de `date` con hora `000000`,
     * que cumple el formato pero no aporta la hora verdadera.
     */
    generatedAt?: ArcaDateInput;
    /** Buyer information */
    buyer?: Buyer;
    /** Items included in the invoice */
    items: InvoiceItem[];
    /** Associated invoices (required for Credit/Debit Notes) */
    associatedInvoices?: AssociatedInvoice[];
    /** Optional parameters (e.g., VatCondition RG 5616) */
    optionals?: InvoiceOptional[];
    /** Prices already include VAT (default: false) */
    includesVAT?: boolean;
    /**
     * Fechas de servicio. Obligatorias si `concept` es 2 (Servicios) o 3 (Productos
     * y Servicios).
     *
     * Disponible desde v2.0.0. Antes el campo no existía y las tres fechas se
     * emitían con la fecha del comprobante, lo que informaba mal cualquier
     * comprobante de servicios rendido por CAEA.
     */
    serviceDates?: ServiceDates;
    /**
     * Otros tributos: percepciones, impuestos internos, tasas. Suman a `ImpTrib`
     * y al importe total. No incluir acá el IVA. Disponible desde v2.0.0.
     */
    taxes?: InvoiceTax[];
    /** Moneda del comprobante (`MonId`). Default: `'PES'`. Disponible desde v2.0.0. */
    currency?: string;
    /**
     * Cotización respecto del peso (`MonCotiz`). Default: `1`.
     * Traela de `FEParamGetCotizacion`. Disponible desde v2.0.0.
     */
    exchangeRate?: number;
    /**
     * Cancelación en la misma moneda extranjera (`CanMisMonExt`).
     * Sólo con `currency` distinta de `'PES'`. Disponible desde v2.0.0.
     */
    payInSameForeignCurrency?: boolean;
}

/**
 * Response for reporting CAEA invoices
 */
export interface CAEARegInformativoResponse {
    /** The reported CAEA */
    caea: string;
    /** The status result ('A' = Approved, 'R' = Rejected) */
    result: 'A' | 'R';
    /** Point of sale */
    pointOfSale: number;
    /** Invoice type reported */
    invoiceType: number;
    /** Any observations/warnings returned by ARCA */
    observations?: string[];
}
