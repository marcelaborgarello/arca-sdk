import { describe, it, expect, beforeAll } from 'vitest';
import { PadronService } from '../../src/services/padron';
import { getIntegrationConfig, padronTokenStorage } from './helpers';

/**
 * Suite de integración contra Padrón A13 en ARCA **homologación**.
 *
 * No existía hasta el 2026-10-01: es la razón por la que nadie había detectado que
 * `PADRON_A13_ENDPOINTS.homologacion` apuntaba a un dominio sin registro DNS
 * (`awshomo.arca.gob.ar`) en vez del que sigue vivo (`awshomo.afip.gov.ar`). Ver
 * `constants/endpoints.ts` y `historial.md`, entrada del 2026-10-01.
 *
 * No corre por defecto ni en CI: ver `tests/integration/README.md`. Requiere además que
 * el certificado de prueba esté autorizado en WSASS homologación para
 * `ws_sr_padron_a13` (no alcanza con tenerlo autorizado para `wsfe`).
 *
 * A13 es sólo lectura: no consume numeración de comprobantes ni tiene efecto en ARCA.
 */

const config = getIntegrationConfig();

describe.skipIf(!config)('Padrón A13 contra ARCA homologación', () => {
    let padron: PadronService;

    beforeAll(() => {
        padron = new PadronService({
            environment: 'homologacion',
            cuit: config!.cuit,
            cert: config!.cert,
            key: config!.key,
            storage: padronTokenStorage,
        });
    });

    it('getTaxpayer() devuelve los datos del propio CUIT de prueba', async () => {
        const result = await padron.getTaxpayer(config!.cuit);

        expect(result.error).toBeUndefined();
        expect(result.taxpayer).toBeDefined();
        expect(result.taxpayer?.taxId).toBe(Number(config!.cuit));
    });

    /**
     * Anexo 5.3 del *Manual Consulta a Padrón – Alcance 13 v1.4*: "El Id de la persona
     * no es valido" para una clave de más de 11 dígitos. Si esto deja de matchear
     * `PADRON_INVALID_ID`, `PADRON_MESSAGE_PATTERNS` (`constants/errors.ts`) quedó
     * desactualizado respecto de lo que ARCA devuelve de verdad.
     */
    it('un id de más de 11 dígitos da el hint de PADRON_INVALID_ID', async () => {
        const result = await padron.getTaxpayer('201111111120');

        expect(result.taxpayer).toBeUndefined();
        expect(result.error).toBeDefined();
        expect(result.hint).toBeDefined();
    });

    it('un CUIT bien formado pero inexistente no inventa un hint', async () => {
        const result = await padron.getTaxpayer('20099999999');

        expect(result.taxpayer).toBeUndefined();
        expect(result.error).toBeDefined();
        // El anexo 5.3 documenta este mensaje a propósito sin hint: ya dice todo.
    });
});
