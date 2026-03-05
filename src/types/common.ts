/**
 * Tipos comunes compartidos en toda la SDK
 */

/**
 * Ambiente de ejecución ARCA
 */
export type Environment = 'homologacion' | 'produccion';

/**
 * Servicio a ejecutar
 */
export type ServiceName = 'wsfe' | 'ws_sr_padron_a13';

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
        public hint?: string,
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
/**
 * Error de comunicación/red
 */
export class ArcaNetworkError extends ArcaError {
    constructor(message: string, details?: unknown) {
        super(message, 'NETWORK_ERROR', details);
        this.name = 'ArcaNetworkError';
    }
}

/**
 * Parámetros para generar un CSR (Certificate Signing Request)
 */
export interface GenerateCSRParams {
    /** Nombre de la organización (campo O del subject) */
    organization: string;
    /** Common Name (campo CN del subject) */
    commonName: string;
    /** CUIT del contribuyente (11 dígitos sin guiones) */
    cuit: string;
}

/**
 * Resultado de la generación de CSR
 */
export interface GenerateCSRResult {
    /** CSR en formato PEM */
    csr: string;
    /** Clave privada RSA en formato PEM */
    privateKey: string;
}
