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
 * Una observación de ARCA, con su código.
 *
 * ARCA devuelve las validaciones por comprobante en `Observaciones`, y cada una trae
 * `Obs.Code` + `Obs.Msg`. **Hasta la v3.0.0 el SDK descartaba el código** y sólo guardaba
 * el mensaje: como el diccionario de hints se busca por código, eso significaba que casi
 * ningún hint llegaba por el canal de los rechazos, que es justamente donde más hace falta.
 * Los dos únicos casos reconocidos se detectaban por expresión regular sobre el texto.
 *
 * Disponible desde v3.0.0.
 */
export interface ArcaObservation {
    /** Código de la observación (`Obs.Code`). Ver el Manual del Desarrollador RG 4291. */
    code: number;
    /** Texto tal como lo devuelve ARCA (`Obs.Msg`). */
    message: string;
}

/**
 * ARCA procesó el comprobante y lo **rechazó** (`Resultado = 'R'`).
 *
 * No es un error de red ni de validación local: la llamada salió bien y ARCA contestó
 * que no autoriza. El comprobante **no existe** y no tiene CAE; el motivo viene en
 * `observations`, y con su código en `observationDetails`.
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
        hint?: string,
        /**
         * Los mismos motivos, con el código de cada uno.
         *
         * Es lo que hay que mirar para ramificar por código en vez de hacer regex sobre
         * el texto. `observations` se conserva —es el mismo dato, sólo los mensajes— para
         * no romper a quien ya lo usaba.
         *
         * Disponible desde v3.0.0.
         */
        public observationDetails?: ArcaObservation[]
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
