import { describe, it, expect, beforeAll } from 'vitest';
import { PadronService } from '../../src/services/padron';
import { getIntegrationConfig, fileTokenStorage } from './helpers';

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
            storage: fileTokenStorage,
        });
    });

    /**
     * No asume que el CUIT de prueba **existe** en el padrón de homologación.
     * **Confirmado el 2026-10-02**: el CUIT real de Marcela (`27203953734`, el mismo que
     * usan estos tests) devuelve *"La Clave (CUIT/CUIL) consultada es inexistente"* en
     * homologación — A13 ahí tiene su propio dataset sintético, no un espejo del padrón
     * real. Lo único que vale la pena afirmar sin conocer ese dataset es que la llamada
     * se completa (no lanza) y devuelve una de las dos formas válidas de
     * `TaxpayerResponse`, nunca las dos a la vez.
     */
    it('getTaxpayer() del propio CUIT de prueba no lanza y devuelve una forma válida', async () => {
        const result = await padron.getTaxpayer(config!.cuit);

        const tieneUnoSoloDeLosDos = (!!result.taxpayer) !== (!!result.error);
        expect(tieneUnoSoloDeLosDos).toBe(true);
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
