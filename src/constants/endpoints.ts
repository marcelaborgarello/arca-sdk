import type { Environment } from '../types/common';

/**
 * URLs de los servicios ARCA por ambiente
 */
export const WSAA_ENDPOINTS: Record<Environment, string> = {
    homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

/**
 * Obtener endpoint WSAA según ambiente
 */
export function getWsaaEndpoint(environment: Environment): string {
    return WSAA_ENDPOINTS[environment];
}
