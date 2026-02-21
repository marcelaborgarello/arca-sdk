import type { ArcaConfig } from './common';
import type { TokenStorage } from '../auth/storage';

/**
 * Configuración para PadronService
 */
export interface PadronConfig extends ArcaConfig {
    /** CUIT del emisor (quien consulta) */
    cuit: string;
    /** Certificado X.509 en formato PEM */
    cert: string;
    /** Clave privada en formato PEM */
    key: string;
    /** Adaptador opcional para persistencia de tokens */
    storage?: TokenStorage;
}

/**
 * Representa una persona (física o jurídica) obtenida del Padrón A13
 */
export interface Persona {
    idPersona: number;
    tipoPersona: string; // FISICA o JURIDICA
    nombre?: string;
    apellido?: string;
    razonSocial?: string;
    estadoClave: string; // ACTIVO, etc
    domicilio: Domicilio[];
    descripcionActividadPrincipal?: string;
    monotributo?: {
        actividad?: string[];
        categoria?: string;
        impuestos?: number[];
    };
    regimenGeneral?: {
        impuestos?: number[];
        actividades?: string[];
    };
    esInscriptoIVA: boolean;
    esMonotributista: boolean;
    esExento: boolean;
}

/**
 * Domicilio registrado en AFIP
 */
export interface Domicilio {
    direccion: string;
    localidad?: string;
    codPostal?: string;
    idProvincia: number;
    descripcionProvincia: string;
    tipoDomicilio: string; // FISCAL, LEGAL, etc
}

/**
 * Respuesta del servicio de Padrón
 */
export interface PadronResponse {
    persona?: Persona;
    error?: string;
}
