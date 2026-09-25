/**
 * arca-sdk — SDK moderna para ARCA (ex-AFIP)
 */

// Servicios principales
export { WsaaService } from './auth/wsaa';
export { WsfeService } from './services/wsfe';
export { PadronService } from './services/padron';
export { CaeaService } from './services/caea';

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
    InvoiceTax,
    InvoiceOptional,
    AssociatedInvoice,
    ServiceDates,
    IssueOptions,
    Buyer,
    IssueInvoiceRequest,
    CAEResponse,
    InvoiceDetails,
    PointOfSale,
    ServiceStatus,
    ArcaDateInput,
} from './types/wsfe';

// Tipos CAEA
export type {
    CaeaConfig,
    CAEASolicitarRequest,
    CAEASolicitarResponse,
    CAEAConsultarResponse,
    CaeaInvoice,
    CAEARegInformativoResponse,
} from './types/caea';

// Enums WSFE
export {
    InvoiceType,
    BillingConcept,
    TaxIdType,
    VatCondition,
    VALID_VAT_CONDITION_IDS,
} from './types/wsfe';

// Errores
export {
    ArcaError,
    ArcaAuthError,
    ArcaValidationError,
    ArcaNetworkError,
    ArcaRejectionError,
} from './types/common';

// Utilidades para Frontend/Impresión
export { generateQRUrl } from './utils/qr';
