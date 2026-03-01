/**
 * arca-sdk — SDK moderna para ARCA (ex-AFIP)
 */

export type { TokenStorage } from './auth/storage';
// Servicios principales
export { WsaaService } from './auth/wsaa';
export { PadronService } from './services/padron';
export { WsfeService } from './services/wsfe';
// Tipos comunes
export type {
    ArcaConfig,
    Environment,
} from './types/common';
// Errores
export {
    ArcaAuthError,
    ArcaError,
    ArcaNetworkError,
    ArcaValidationError,
} from './types/common';

// Tipos Padrón
export type {
    Activity,
    Address,
    Taxpayer,
    TaxpayerResponse,
    TaxpayerServiceConfig,
    TaxRecord,
} from './types/padron';
// Tipos WSAA
export type {
    LoginTicket,
    WsaaConfig,
} from './types/wsaa';
// Tipos WSFE
export type {
    Buyer,
    CAEResponse,
    InvoiceDetails,
    InvoiceItem,
    IssueInvoiceRequest,
    PointOfSale,
    ServiceStatus,
    WsfeConfig,
} from './types/wsfe';
// Enums WSFE
export {
    BillingConcept,
    InvoiceType,
    TaxIdType,
} from './types/wsfe';

// Utilidades para Frontend/Impresión
export { generateQRUrl } from './utils/qr';
