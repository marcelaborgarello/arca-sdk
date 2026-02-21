import type { Environment } from '../types/common';

/**
 * URLs de los servicios ARCA por ambiente
 */
export const WSAA_ENDPOINTS: Record<Environment, string> = {
    homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

/**
 * URLs del servicio WSFE por ambiente
 */
export const WSFE_ENDPOINTS: Record<Environment, string> = {
    homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

/**
 * URLs del servicio Padron A13 por ambiente
 */
export const PADRON_A13_ENDPOINTS: Record<Environment, string> = {
    homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
    produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13',
};

/**
 * Obtener endpoint WSAA según ambiente
 */
export function getWsaaEndpoint(environment: Environment): string {
    return WSAA_ENDPOINTS[environment];
}

/**
 * Obtener endpoint WSFE según ambiente
 */
export function getWsfeEndpoint(environment: Environment): string {
    return WSFE_ENDPOINTS[environment];
}

/**
 * Obtener endpoint Padron A13 según ambiente
 */
export function getPadronEndpoint(environment: Environment): string {
    return PADRON_A13_ENDPOINTS[environment];
}
