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
 * Actividad económica según AFIP
 */
export interface Actividad {
    idActividad: number;
    descripcion: string;
    orden: number;
    periodo: number;
}

/**
 * Impuesto registrado en AFIP
 */
export interface Impuesto {
    idImpuesto: number;
    descripcion: string;
    periodo: number;
}

/**
 * Representa una persona (física o jurídica) obtenida del Padrón A13
 */
export interface Persona {
    idPersona: number;
    tipoPersona: 'FISICA' | 'JURIDICA';
    nombre?: string;
    apellido?: string;
    razonSocial?: string;
    estadoClave: string;
    domicilio: Domicilio[];
    actividad?: Actividad[];
    impuesto?: Impuesto[];
    descripcionActividadPrincipal?: string;
    esInscriptoIVA: boolean;
    esMonotributista: boolean;
    esExento: boolean;
}

/**
 * Domicilio registrado en ARCA
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
