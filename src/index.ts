/**
 * arca-sdk — SDK moderna para ARCA (ex-AFIP)
 */

// Servicios principales
export { WsaaService } from './auth/wsaa';
export { WsfeService } from './services/wsfe';
export { PadronService } from './services/padron';

// Tipos comunes
export type {
    Environment,
    ArcaConfig,
} from './types/common';

// Tipos WSAA
export type {
    WsaaConfig,
    LoginTicket,
} from './types/wsaa';
export type { TokenStorage } from './auth/storage';

// Tipos Padrón
export type {
    TaxpayerServiceConfig,
    Taxpayer,
    Address,
    Activity,
    TaxRecord,
    TaxpayerResponse,
} from './types/padron';

// Tipos WSFE
export type {
    WsfeConfig,
    InvoiceItem,
    Buyer,
    IssueInvoiceRequest,
    CAEResponse,
    InvoiceDetails,
    PointOfSale,
    ServiceStatus,
} from './types/wsfe';

// Enums WSFE
export {
    InvoiceType,
    BillingConcept,
    TaxIdType,
} from './types/wsfe';

// Errores
export {
    ArcaError,
    ArcaAuthError,
    ArcaValidationError,
    ArcaNetworkError,
} from './types/common';

// Utilidades para Frontend/Impresión
export { generateQRUrl } from './utils/qr';
