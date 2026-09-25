/**
 * Tipos comunes compartidos en toda la SDK
 */

/**
 * Ambiente de ejecución ARCA
 */
export type Environment = 'homologacion' | 'produccion';

/**
 * Configuración base para servicios ARCA
 */
export interface ArcaConfig {
    /** Ambiente (homologación o producción) */
    environment: Environment;
    /** CUIT del contribuyente (11 dígitos sin guiones) */
    cuit: string;
    /** Tiempo de espera para peticiones (ms). Defecto: 15000 */
    timeout?: number;
}

/**
 * Error personalizado de ARCA SDK
 */
export class ArcaError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: unknown,
        public hint?: string
    ) {
        super(message);
        this.name = 'ArcaError';
    }
}

/**
 * Error de autenticación WSAA
 */
export class ArcaAuthError extends ArcaError {
    constructor(message: string, details?: unknown, hint?: string) {
        super(message, 'AUTH_ERROR', details, hint);
        this.name = 'ArcaAuthError';
    }
}

/**
 * Error de validación de input
 */
export class ArcaValidationError extends ArcaError {
    constructor(message: string, details?: unknown) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ArcaValidationError';
    }
}
/**
 * ARCA procesó el comprobante y lo **rechazó** (`Resultado = 'R'`).
 *
 * No es un error de red ni de validación local: la llamada salió bien y ARCA contestó
 * que no autoriza. El comprobante **no existe** y no tiene CAE; el motivo viene en
 * `observations`.
 *
 * @remarks Hasta la v1.x el SDK devolvía un `CAEResponse` con `result: 'R'` y `cae: ''`
 * en vez de lanzar, así que quien no chequeara `result` creía haber facturado. Se
 * cambió porque devolver un comprobante inexistente como si fuera válido es una
 * pérdida silenciosa de datos.
 *
 * Disponible desde v2.0.0.
 */
export class ArcaRejectionError extends ArcaError {
    constructor(
        message: string,
        /** Motivos del rechazo, tal como los devuelve ARCA en `Observaciones`. */
        public observations: string[],
        details?: unknown,
        hint?: string
    ) {
        super(message, 'REJECTED', details, hint);
        this.name = 'ArcaRejectionError';
    }
}

/**
 * Error de comunicación/red
 */
export class ArcaNetworkError extends ArcaError {
    constructor(message: string, details?: unknown) {
        super(message, 'NETWORK_ERROR', details);
        this.name = 'ArcaNetworkError';
    }
}
