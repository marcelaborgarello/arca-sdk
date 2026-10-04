import { describe, it, expect } from 'vitest';
import { PADRON_A13_ENDPOINTS, WSAA_ENDPOINTS, WSFE_ENDPOINTS } from '../../src/constants/endpoints';

/**
 * Regresión del 2026-10-01: `PADRON_A13_ENDPOINTS.homologacion` apuntaba a
 * `awshomo.arca.gob.ar`, un dominio **sin registro DNS**. El servicio seguía vivo en
 * `awshomo.afip.gov.ar`.
 *
 * Nadie lo había detectado porque no existía este test ni
 * `tests/integration/padron.integration.test.ts` (agregado en el mismo cambio), y porque
 * en producción el host viejo (`aws.arca.gob.ar`) resolvía igual — cualquiera que
 * facturara de verdad nunca pegaba contra el endpoint roto.
 *
 * **A diferencia de WSAA y WSFE, A13 no migró ningún ambiente a `arca.gob.ar`.** El manual
 * (sección 2.3) documenta los dos en `afip.gov.ar` — corregido el 2026-10-02: producción
 * decía `aws.arca.gob.ar`, que resolvía (misma IP que `aws.afip.gov.ar`, verificado por
 * DNS) pero no es el host que el manual de A13 documenta. No era un bug activo, pero sí
 * una migración sin fuente — ver `constants/endpoints.ts`.
 */
describe('PADRON_A13_ENDPOINTS', () => {
    it('homologación usa el dominio afip.gov.ar, no el de arca.gob.ar que no resuelve', () => {
        expect(PADRON_A13_ENDPOINTS.homologacion).toBe(
            'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13'
        );
    });

    it('producción también está en afip.gov.ar, como documenta el manual de A13', () => {
        expect(PADRON_A13_ENDPOINTS.produccion).toBe(
            'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13'
        );
    });

    it('homologación de WSAA y WSFE siguen en afip.gov.ar, como A13', () => {
        // Mismo patrón los tres: homologación se quedó en el dominio viejo, sólo
        // producción migró a arca.gob.ar. Si esto deja de ser cierto para alguno,
        // conviene revisarlo con cuidado antes de "corregirlo" a arca.gob.ar.
        expect(WSAA_ENDPOINTS.homologacion).toContain('afip.gov.ar');
        expect(WSFE_ENDPOINTS.homologacion).toContain('afip.gov.ar');
    });
});
