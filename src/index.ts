/**
 * arca-sdk - SDK moderna para ARCA (ex-AFIP)
 * 
 * @example
 * ```typescript
 * import { ArcaClient } from 'arca-sdk';
 * 
 * const arca = new ArcaClient({
 *   environment: 'homologacion',
 *   cuit: '20123456789',
 *   cert: './cert.pem',
 *   key: './key.pem',
 * });
 * 
 * // Listo. Ya está autenticado automáticamente.
 * ```
 * 
 * @packageDocumentation
 */

// Exportar cliente principal (cuando lo creemos)
// export { ArcaClient } from './client';

// Exportar servicio WSAA para uso avanzado
export { WsaaService } from './auth/wsaa';

// Exportar tipos
export type {
    Environment,
    ArcaConfig,
} from './types/common';

export type {
    WsaaConfig,
    LoginTicket,
} from './types/wsaa';

// Exportar errores para manejo
export {
    ArcaError,
    ArcaAuthError,
    ArcaValidationError,
} from './types/common';
