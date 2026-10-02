import { describe, it, expect } from 'vitest';
import { PADRON_A13_ENDPOINTS, WSAA_ENDPOINTS, WSFE_ENDPOINTS } from '../../src/constants/endpoints';

/**
 * Regresión del 2026-10-01: `PADRON_A13_ENDPOINTS.homologacion` apuntaba a
 * `awshomo.arca.gob.ar`, un dominio **sin registro DNS**. El servicio seguía vivo en
 * `awshomo.afip.gov.ar` — mismo patrón que WSAA y WSFE, que para homologación se
 * quedaron en `afip.gov.ar` y sólo migraron producción a `arca.gob.ar`.
 *
 * Nadie lo había detectado porque no existía este test ni
 * `tests/integration/padron.integration.test.ts` (agregado en el mismo cambio), y porque
 * en producción `aws.arca.gob.ar` sí resuelve — cualquiera que facturara de verdad nunca
 * pegaba contra el endpoint roto.
 */
describe('PADRON_A13_ENDPOINTS', () => {
    it('homologación usa el dominio afip.gov.ar, no el de arca.gob.ar que no resuelve', () => {
        expect(PADRON_A13_ENDPOINTS.homologacion).toBe(
            'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13'
        );
    });

    it('producción sigue en arca.gob.ar — eso nunca estuvo roto', () => {
        expect(PADRON_A13_ENDPOINTS.produccion).toBe(
            'https://aws.arca.gob.ar/sr-padron/webservices/personaServiceA13'
        );
    });

    it('homologación de WSAA y WSFE siguen en afip.gov.ar, como A13 ahora', () => {
        // Mismo patrón los tres: homologación se quedó en el dominio viejo, sólo
        // producción migró a arca.gob.ar. Si esto deja de ser cierto para alguno,
        // conviene revisarlo con cuidado antes de "corregirlo" a arca.gob.ar.
        expect(WSAA_ENDPOINTS.homologacion).toContain('afip.gov.ar');
        expect(WSFE_ENDPOINTS.homologacion).toContain('afip.gov.ar');
    });
});
