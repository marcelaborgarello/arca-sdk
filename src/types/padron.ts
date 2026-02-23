import type { ArcaConfig } from './common';
import type { TokenStorage } from '../auth/storage';

/**
 * Configuración para PadronService
 */
export interface TaxpayerServiceConfig extends ArcaConfig {
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
export interface Activity {
    id: number;
    description: string;
    order: number;
    period: number;
}

/**
 * Impuesto registrado en AFIP
 */
export interface TaxRecord {
    id: number;
    description: string;
    period: number;
}

/**
 * Domicilio registrado en AFIP
 */
export interface Address {
    street: string;
    city?: string;
    postalCode?: string;
    provinceId: number;
    province: string;
    /** Tipo: FISCAL, LEGAL, etc. */
    type: string;
}

/**
 * Persona (física o jurídica) obtenida del Padrón A13
 */
export interface Taxpayer {
    taxId: number;
    personType: 'FISICA' | 'JURIDICA';
    /** Nombre (persona física) */
    firstName?: string;
    /** Apellido (persona física) */
    lastName?: string;
    /** Razón social (persona jurídica) */
    companyName?: string;
    /** Estado de la clave fiscal */
    status: string;
    addresses: Address[];
    activities?: Activity[];
    taxes?: TaxRecord[];
    mainActivity?: string;
    /** ¿Está inscripto en IVA? */
    isVATRegistered: boolean;
    /** ¿Es monotributista? */
    isMonotax: boolean;
    /** ¿Es exento de IVA? */
    isVATExempt: boolean;
}

/**
 * Respuesta del servicio de Padrón
 */
export interface TaxpayerResponse {
    taxpayer?: Taxpayer;
    error?: string;
}
