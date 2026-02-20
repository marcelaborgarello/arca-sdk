import type { ArcaConfig } from './common';

/**
 * Configuración para WSAA
 */
export interface WsaaConfig extends ArcaConfig {
    /** Certificado X.509 en formato PEM */
    cert: string;
    /** Clave privada en formato PEM */
    key: string;
    /** Servicio ARCA a autenticar (ej: 'wsfe', 'wsmtxca') */
    service: string;
}

/**
 * Ticket de acceso obtenido de WSAA
 */
export interface LoginTicket {
    /** Token de autenticación */
    token: string;
    /** Firma del token */
    sign: string;
    /** Fecha de generación (ISO 8601) */
    generationTime: Date;
    /** Fecha de expiración (ISO 8601) */
    expirationTime: Date;
}

/**
 * Respuesta del servicio WSAA
 */
export interface WsaaResponse {
    /** Credenciales obtenidas */
    credentials: LoginTicket;
}
