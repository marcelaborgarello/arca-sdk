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
 * **Los dos ambientes se quedaron en `afip.gov.ar`, a diferencia de WSAA y WSFE.** El
 * *Manual Consulta a Padrón – Alcance 13 v1.4* (sección 2.3) documenta homologación en
 * `awshomo.afip.gov.ar` y producción en `aws.afip.gov.ar` — nunca menciona `arca.gob.ar`
 * para ninguno de los dos. WSAA y WSFE sí migraron su endpoint de producción a
 * `arca.gob.ar` (y ARCA lo anunció), pero no hay un anuncio equivalente para A13.
 *
 * **El de homologación no es `awshomo.arca.gob.ar`.** Ese dominio no tiene registro DNS
 * — verificado el 2026-10-01. El equivalente vivo es `awshomo.afip.gov.ar`, confirmado
 * respondiendo SOAP Faults reales en homologación.
 *
 * **El de producción tampoco es `aws.arca.gob.ar`** — corregido el 2026-10-02 a
 * `aws.afip.gov.ar`, que es lo que dice el manual. No eran dos hosts distintos: los dos
 * nombres resuelven hoy a la misma IP (verificado por DNS, `200.1.116.54`), así que el
 * valor viejo no estaba roto — era una migración que el SDK asumió sin que el manual de
 * A13 la confirme, de la misma familia que el bug de homologación de arriba. Si ARCA
 * alguna vez deja de servir ese alias (no tiene por qué avisar, al no ser el dominio
 * documentado), el valor viejo se habría roto en producción sin este cambio.
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
