import { describe, it, expect, beforeAll } from 'vitest';
import { VAT_RATE_CODES, VALID_VAT_CONDITION_IDS } from '../../src/types/wsfe';
import { WsaaService } from '../../src/auth/wsaa';
import { WsfeService } from '../../src/services/wsfe';
import { InvoiceType, BillingConcept, TaxIdType, VatCondition } from '../../src/types/wsfe';
import type { LoginTicket } from '../../src/types/wsaa';
import { ArcaRejectionError } from '../../src/types/common';
import { getIntegrationConfig, fileTokenStorage } from './helpers';

/**
 * Suite de integración contra ARCA **homologación**.
 *
 * Es lo único que puede ponerse en rojo por un rechazo de ARCA: el resto de la suite
 * mockea `callArcaApi` y sólo prueba que el SDK hace lo que creemos que hace, no que
 * ARCA lo acepte. El caso testigo es el error 11001 del Tique C, que apareció en una
 * corrida manual y nunca en los tests.
 *
 * No corre por defecto ni en CI: ver `tests/integration/README.md`.
 *
 * **Regla de diseño**: ningún tipo de comprobante entra al enum público ni recibe
 * helper dedicado sin una corrida verde acá. La lista autoritativa la da
 * `FEParamGetTiposCbte`.
 */

const config = getIntegrationConfig();

describe.skipIf(!config)('WSFE contra ARCA homologación', () => {
    let ticket: LoginTicket;

    beforeAll(async () => {
        const wsaa = new WsaaService({
            environment: 'homologacion',
            cuit: config!.cuit,
            cert: config!.cert,
            key: config!.key,
            service: 'wsfe',
            storage: fileTokenStorage,
        });
        ticket = await wsaa.login();
    });

    function makeService(): WsfeService {
        return new WsfeService({
            environment: 'homologacion',
            cuit: config!.cuit,
            ticket,
            pointOfSale: config!.pointOfSale,
        });
    }

    it('responde FEDummy con los tres servidores OK', async () => {
        const status = await WsfeService.checkStatus('homologacion');

        expect(status.appServer).toBe('OK');
        expect(status.dbServer).toBe('OK');
        expect(status.authServer).toBe('OK');
    });

    it('autentica y devuelve un ticket vigente', () => {
        expect(ticket.token.length).toBeGreaterThan(100);
        expect(ticket.sign.length).toBeGreaterThan(100);
        expect(ticket.expirationTime.getTime()).toBeGreaterThan(Date.now());
    });

    // El orden del `sequence` sólo se puede verificar de verdad acá: un XML fuera de
    // orden lo rechaza ARCA, no nuestros tests unitarios.
    it('emite una Factura C y obtiene CAE', async () => {
        const cae = await makeService().issueInvoiceC({
            items: [{ description: 'Producto de prueba', quantity: 1, unitPrice: 121 }],
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
                vatCondition: VatCondition.CONSUMIDOR_FINAL,
            },
        });

        expect(cae.result).toBe('A');
        expect(cae.cae).toMatch(/^\d{14}$/);
        expect(cae.qrUrl).toContain('arca.gob.ar');
    });

    // RG 5616: desde el 01/12/2026 omitir este campo rechaza (código 10246).
    it('acepta CondicionIVAReceptorId en la posición del XSD', async () => {
        const cae = await makeService().issueInvoiceC({
            items: [{ description: 'Servicio de prueba', quantity: 1, unitPrice: 100 }],
            concept: BillingConcept.SERVICES,
            serviceDates: {
                startDate: '2026-09-01',
                endDate: '2026-09-30',
                dueDate: '2026-10-10',
            },
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
                vatCondition: VatCondition.CONSUMIDOR_FINAL,
            },
        });

        expect(cae.result).toBe('A');
        expect(cae.observations ?? []).not.toContainEqual(
            expect.stringContaining('Condición Frente al IVA')
        );
    });

    it('consulta un comprobante ya emitido', async () => {
        const wsfe = makeService();
        const emitido = await wsfe.issueInvoiceC({
            items: [{ description: 'Para consultar', quantity: 1, unitPrice: 50 }],
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
                vatCondition: VatCondition.CONSUMIDOR_FINAL,
            },
        });

        const consultado = await wsfe.getInvoice(InvoiceType.FACTURA_C, emitido.invoiceNumber);

        expect(consultado.cae).toBe(emitido.cae);
        expect(consultado.invoiceNumber).toBe(emitido.invoiceNumber);
    });

    // Verificado contra homologación el 2026-09-25: ARCA **ya** rechaza (Resultado 'R',
    // código 10246) el comprobante sin CondicionIVAReceptorId. En producción eso ocurre
    // desde el 01/12/2026; homologación se adelantó para que se pueda probar.
    //
    // El test cubre además que el rechazo llegue como excepción: hasta la v1.x el SDK
    // devolvía un CAEResponse con result 'R' y cae vacío, y quien no mirara `result`
    // creía haber facturado.
    it('rechaza con ArcaRejectionError el comprobante sin condición de IVA del receptor', async () => {
        const wsfe = makeService();

        await expect(
            wsfe.issueInvoiceC({
                items: [{ description: 'Sin condición de IVA', quantity: 1, unitPrice: 50 }],
            })
        ).rejects.toThrow(ArcaRejectionError);

        try {
            await wsfe.issueInvoiceC({
                items: [{ description: 'Sin condición de IVA', quantity: 1, unitPrice: 50 }],
            });
            expect.unreachable('ARCA debería haber rechazado el comprobante');
        } catch (e) {
            const error = e as ArcaRejectionError;
            expect(error.observations.join(' ')).toMatch(/Condicion Frente al IVA/i);
            expect(error.hint).toBeDefined();
        }
    });

    // Los catálogos son la fuente autoritativa; los enums del SDK son una copia local
    // que se desactualiza. Estos tests comparan una contra otra: si ARCA agrega un
    // valor, se ponen en rojo y avisan que hay que actualizar el enum.
    describe('catálogos de referencia', () => {
        it('devuelve las alícuotas de IVA y el SDK las tiene todas', async () => {
            const rates = await makeService().getVatRates();

            expect(rates.length).toBeGreaterThanOrEqual(6);

            // El 5% (id 8) y el 2.5% (id 9) están vigentes desde el 20/10/2014 y el SDK
            // los rechazaba como inválidos hasta la v2.1.0.
            const ids = rates.map(r => r.id);
            expect(ids).toContain('8');
            expect(ids).toContain('9');

            // Toda alícuota que ARCA informa tiene que estar en el mapa local.
            const codigosLocales = Object.values(VAT_RATE_CODES).map(String);
            for (const rate of rates) {
                expect(
                    codigosLocales,
                    `ARCA informa la alícuota ${rate.id} (${rate.description}) y VAT_RATE_CODES no la tiene`
                ).toContain(rate.id);
            }
        });

        it('devuelve el tributo 13 que exige el código 10283', async () => {
            const taxes = await makeService().getTaxTypes();

            const percepcionNoCategorizado = taxes.find(t => t.id === '13');
            expect(percepcionNoCategorizado).toBeDefined();
            expect(percepcionNoCategorizado!.description).toMatch(/no Categorizado/i);
        });

        it('devuelve las condiciones de IVA y coinciden con VALID_VAT_CONDITION_IDS', async () => {
            const conditions = await makeService().getVatConditions();

            expect(conditions.length).toBeGreaterThan(0);

            for (const cond of conditions) {
                expect(
                    VALID_VAT_CONDITION_IDS.map(String),
                    `ARCA admite la condición ${cond.id} (${cond.description}) y el SDK no la lista`
                ).toContain(cond.id);
            }
        });

        it('no lista los Tique entre los tipos de comprobante habilitados', async () => {
            const types = await makeService().getInvoiceTypes();
            const ids = types.map(t => t.id);

            // Esta es la consulta que habría evitado el episodio del 11001.
            expect(ids).toContain(String(InvoiceType.FACTURA_C));
            expect(ids).not.toContain(String(InvoiceType.TICKET_C));
        });
    });

    // Confirmado el 2026-08-28: el Tique (RG 3561/2013, Controladores Fiscales) no se
    // emite por wsfev1 desde un punto de venta Web Services. Este test fija el hallazgo:
    // si alguna vez ARCA lo habilita, se pone en rojo y hay que revisar la deprecación.
    it('rechaza Tique C (CbteTipo=83) con el error 11001', async () => {
        const wsfe = makeService();

        await expect(
            wsfe.issueSimpleReceipt({ total: 100 })
        ).rejects.toThrow(/11001|tipo de comprobante/i);
    });
});
