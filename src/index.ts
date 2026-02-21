/**
 * arca-sdk - SDK moderna para ARCA (ex-AFIP)
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
    PadronConfig,
    Persona,
    Domicilio,
    PadronResponse,
} from './types/padron';

// Tipos WSFE
export type {
    WsfeConfig,
    FacturaItem,
    Comprador,
    EmitirFacturaRequest,
    CAEResponse,
} from './types/wsfe';

// Enums WSFE
export {
    TipoComprobante,
    Concepto,
    TipoDocumento,
} from './types/wsfe';

// Errores
export {
    ArcaError,
    ArcaAuthError,
    ArcaValidationError,
} from './types/common';

// Utilidades útiles para Frontend/Impresión
export { generarUrlQR } from './utils/qr';
