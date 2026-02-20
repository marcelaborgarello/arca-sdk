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
}

/**
 * Error personalizado de ARCA SDK
 */
export class ArcaError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: unknown
    ) {
        super(message);
        this.name = 'ArcaError';
    }
}

/**
 * Error de autenticación WSAA
 */
export class ArcaAuthError extends ArcaError {
    constructor(message: string, details?: unknown) {
        super(message, 'AUTH_ERROR', details);
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
