import type { Environment } from '../types/common';

/**
 * URLs de los servicios ARCA por ambiente
 */
export const WSAA_ENDPOINTS: Record<Environment, string> = {
    homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    produccion: 'https://wsaa.arca.gob.ar/ws/services/LoginCms',
};

/**
 * URLs del servicio WSFE por ambiente
 */
export const WSFE_ENDPOINTS: Record<Environment, string> = {
    homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    produccion: 'https://servicios1.arca.gob.ar/wsfev1/service.asmx',
};

/**
 * URLs del servicio Padron A13 por ambiente
 *
 * **El de homologación no es `awshomo.arca.gob.ar`.** Ese dominio no tiene registro DNS
 * — verificado el 2026-10-01 contra `arca.gob.ar`, `wsaahomo.afip.gov.ar` y
 * `wswhomo.afip.gov.ar`, que sí resuelven. WSAA y WSFE se quedaron en `afip.gov.ar` para
 * homologación y sólo migraron producción a `arca.gob.ar`; A13 migró los dos a la vez, y
 * el de homologación quedó con un nombre que ARCA nunca dio de alta. El equivalente vivo
 * es `awshomo.afip.gov.ar` — mismo host que usaba el SDK antes de la migración de
 * dominios, confirmado respondiendo SOAP Faults reales en homologación.
 *
 * Nunca se había detectado porque no existía `tests/integration/padron.integration.test.ts`
 * (agregado en el mismo cambio) y porque en producción `aws.arca.gob.ar` sí resuelve, así
 * que cualquier consumidor que facture de verdad nunca pega contra el endpoint roto.
 */
export const PADRON_A13_ENDPOINTS: Record<Environment, string> = {
    homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
    produccion: 'https://aws.arca.gob.ar/sr-padron/webservices/personaServiceA13',
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
