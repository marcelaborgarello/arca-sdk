import type { WsfeConfig, InvoiceType, BillingConcept, Buyer, InvoiceOptional, AssociatedInvoice, InvoiceItem } from './wsfe';

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
    /** Date of the invoice (default: today) */
    date?: Date;
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
