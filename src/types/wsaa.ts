import type { TokenStorage } from '../auth/storage';
import type { ArcaConfig } from './common';

/**
 * Configuración para WsaaService
 */
export interface WsaaConfig extends ArcaConfig {
    /** Certificado X.509 en formato PEM */
    cert: string;
    /** Clave privada en formato PEM */
    key: string;
    /** Servicio ARCA a autenticar (ej: 'wsfe', 'wsmtxca') */
    service: string;
    /** Adaptador opcional para persistencia de tokens */
    storage?: TokenStorage;
}

/**
 * Ticket de acceso obtenido de WSAA
 */
export interface LoginTicket {
    /** Token de autenticación */
    token: string;
    /** Firma del token */
    sign: string;
    /** Fecha de generación */
    generationTime: Date;
    /** Fecha de expiración */
    expirationTime: Date;
}
