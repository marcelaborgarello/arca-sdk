import { describe, it, expect, beforeAll } from 'vitest';
import { VAT_RATE_CODES, VALID_VAT_CONDITION_IDS } from '../../src/types/wsfe';
import { WsaaService } from '../../src/auth/wsaa';
import { WsfeService } from '../../src/services/wsfe';
import { InvoiceType, BillingConcept, TaxIdType, VatCondition } from '../../src/types/wsfe';
import type { CatalogEntry } from '../../src/types/wsfe';
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
        return makeServiceAs(config!.cuit);
    }

    /**
     * El proyecto es monotributista y no puede emitir clase A/B con su propio CUIT.
     * El certificado identifica al **sistema cliente**, no al contribuyente — el CUIT
     * emisor viaja aparte en `<Auth><Cuit>` — así que alcanza con reusar el mismo
     * `ticket` y cambiar el `cuit` del `WsfeService`. Ver `tests/integration/README.md`,
     * sección "Probar comprobantes clase A siendo monotributista".
     */
    function makeServiceAs(cuit: string): WsfeService {
        return new WsfeService({
            environment: 'homologacion',
            cuit,
            ticket,
            pointOfSale: config!.pointOfSale,
        });
    }

    /** CUIT de prueba RI, delegado en WSASS. Ver el README de esta carpeta. */
    const CUIT_CLASE_A = '30000000007';

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
        /**
         * Los diez métodos que devuelven una lista, con la cantidad de entradas vista
         * contra homologación el 2026-09-25 como referencia (no se asertan: si ARCA
         * agrega o da de baja un valor, eso no es una falla del SDK).
         *
         * La tabla está para que agregar un catálogo nuevo sin test sea imposible de
         * pasar por alto: el método entra acá o no entra a la API pública.
         */
        const CATALOGOS: Array<{
            nombre: string;
            traer: (w: WsfeService) => Promise<CatalogEntry[]>;
            vistos: number;
        }> = [
            // 36 el 2026-09-27; la nota anterior decía 48 y no se sabe de dónde salía.
            { nombre: 'getInvoiceTypes', traer: w => w.getInvoiceTypes(), vistos: 36 },
            { nombre: 'getVatRates', traer: w => w.getVatRates(), vistos: 6 },
            { nombre: 'getTaxTypes', traer: w => w.getTaxTypes(), vistos: 11 },
            { nombre: 'getDocumentTypes', traer: w => w.getDocumentTypes(), vistos: 36 },
            { nombre: 'getCurrencies', traer: w => w.getCurrencies(), vistos: 49 },
            { nombre: 'getOptionalTypes', traer: w => w.getOptionalTypes(), vistos: 25 },
            { nombre: 'getConceptTypes', traer: w => w.getConceptTypes(), vistos: 3 },
            { nombre: 'getVatConditions', traer: w => w.getVatConditions(), vistos: 11 },
            { nombre: 'getActivities', traer: w => w.getActivities(), vistos: 1 },
        ];

        /**
         * **Ningún catálogo devuelve una lista vacía.**
         *
         * Es el test que faltaba. `getActivities()` devolvió `[]` desde la v2.1.0
         * porque buscaba el elemento `ActividadTipo` y ARCA manda `ActividadesTipo`:
         * `toArray()` traduce el `undefined` de una clave inexistente a lista vacía,
         * así que un nombre mal escrito es indistinguible de "ARCA no tiene datos".
         * Se agregaron once métodos y se testearon cuatro; seis andaban por casualidad.
         *
         * Se asertan también `id` y `description` no vacíos porque el mapeo usa
         * `String(e.Id)`: con el elemento bien y los campos internos mal, la lista
         * viene con el largo correcto y cada entrada dice el string `'undefined'`.
         */
        it.each(CATALOGOS)('$nombre devuelve entradas con id y descripción', async ({ nombre, traer }) => {
            const entradas = await traer(makeService());

            expect(
                entradas.length,
                `${nombre} devolvió una lista vacía. Casi siempre significa que el nombre ` +
                'del elemento XML no coincide con el que manda ARCA, no que ARCA no tenga datos: ' +
                'mirá el XML crudo de la respuesta antes de asumir que el catálogo está vacío.'
            ).toBeGreaterThan(0);

            for (const entrada of entradas) {
                expect(
                    entrada.id,
                    `${nombre} devolvió una entrada sin Id (${JSON.stringify(entrada)})`
                ).toMatch(/^\S+$/);
                expect(entrada.id, `${nombre}: el campo Id no se mapeó`).not.toBe('undefined');
                expect(
                    entrada.description,
                    `${nombre}: el campo Desc no se mapeó (${JSON.stringify(entrada)})`
                ).not.toBe('undefined');
                expect(entrada.description.length).toBeGreaterThan(0);
            }
        });

        // Regresión del bug de la v2.1.0: este método devolvía `[]` y era el único roto
        // de los once. Verificado contra homologación mirando el XML crudo, que trae
        // <ActividadesTipo><Id>181200</Id><Orden>1</Orden><Desc>SERVICIOS...</Desc>.
        it('getActivities devuelve la actividad del emisor con código numérico', async () => {
            const actividades = await makeService().getActivities();

            expect(actividades.length).toBeGreaterThan(0);
            for (const act of actividades) {
                expect(act.id).toMatch(/^\d+$/);
            }
        });

        // No entra en la regla de "ninguna lista vacía": el CUIT de homologación no
        // lista puntos de venta y sin embargo emite en el PV 1, así que `[]` es una
        // respuesta legítima. ARCA la informa como error 602 ("Sin Resultados") y el
        // SDK la traduce a lista vacía: este test verifica que no lance.
        it('getPointsOfSale resuelve y devuelve entradas con forma válida', async () => {
            const puntos = await makeService().getPointsOfSale();

            expect(Array.isArray(puntos)).toBe(true);
            for (const pv of puntos) {
                expect(pv.number).toBeGreaterThan(0);
                expect(typeof pv.isBlocked).toBe('boolean');
            }
        });

        // `Number(undefined)` es NaN y `String(undefined)` es 'undefined': sin asertar
        // el tipo, un cambio en los nombres de campo pasa como cotización válida.
        it('getExchangeRate devuelve una cotización numérica y una fecha yyyymmdd', async () => {
            const cotizacion = await makeService().getExchangeRate('DOL');

            expect(cotizacion.currency).toBe('DOL');
            expect(Number.isFinite(cotizacion.rate)).toBe(true);
            expect(cotizacion.rate).toBeGreaterThan(0);
            expect(cotizacion.date).toMatch(/^\d{8}$/);
        });

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

        /**
         * Los Tique **no están** en el catálogo de ARCA. Es la razón por la que la v3.0.0
         * eliminó `TICKET_A/B/C` del enum y los dos métodos que los emitían.
         *
         * Los códigos van como literales a propósito: el enum ya no los tiene, y el punto
         * del test es que **sigan sin aparecer**. Si ARCA algún día los habilitara por
         * wsfev1, esto se pone en rojo y hay que revisar la decisión de haberlos borrado.
         */
        it('no lista ninguno de los tres Tique entre los tipos de comprobante', async () => {
            const types = await makeService().getInvoiceTypes();
            const ids = types.map(t => t.id);

            // Esta es la consulta que habría evitado el episodio del 11001.
            expect(ids).toContain(String(InvoiceType.FACTURA_C));

            // Verificado el 2026-09-27: de los quince valores que tenía InvoiceType, los
            // únicos tres ausentes del catálogo eran exactamente los Tique. Es la segunda
            // prueba del hallazgo, independiente del rechazo 11001: no es que ARCA los
            // rechace desde este punto de venta, es que no existen en wsfev1.
            for (const tique of ['81', '82', '83']) {
                expect(
                    ids,
                    `ARCA ahora lista el Tique ${tique}. La v3.0.0 los borró del SDK porque ` +
                    'no existían en wsfev1: si reaparecieron, hay que revisar esa decisión.'
                ).not.toContain(tique);
            }
        });

        /**
         * Los cuatro comprobantes "A con leyenda" de la RG 5762/2025.
         *
         * Hasta el 2026-09-27 el README enseñaba a informar la leyenda por `optionals`
         * con el `id` 5, que es un código de excepción de la RG 3668 y no tiene nada que
         * ver. La leyenda es una **clase de comprobante**, y este test lo fija contra la
         * fuente autoritativa en vez de contra el PDF.
         *
         * No hay test de emisión todavía: nunca se emitió un 51. **Sí se puede** —desde el
         * 2026-09-27 se sabe que delegando en WSASS a un CUIT Responsable Inscripto de
         * prueba se emite clase A sin cambiar código (ver el README de esta carpeta)— así
         * que es trabajo pendiente, no un bloqueo. Por eso tampoco hay helper dedicado.
         */
        it('lista los cuatro comprobantes A con leyenda (RG 5762)', async () => {
            const types = await makeService().getInvoiceTypes();
            const porId = new Map(types.map(t => [t.id, t]));

            const conLeyenda = [
                InvoiceType.FACTURA_A_LEYENDA,
                InvoiceType.NOTA_DEBITO_A_LEYENDA,
                InvoiceType.NOTA_CREDITO_A_LEYENDA,
                InvoiceType.RECIBO_A_LEYENDA,
            ];

            for (const tipo of conLeyenda) {
                const entrada = porId.get(String(tipo));
                expect(entrada, `ARCA no lista el tipo ${tipo} en FEParamGetTiposCbte`).toBeDefined();
                expect(entrada!.description).toMatch(/leyenda/i);
                expect(entrada!.description).toMatch(/retenci[oó]n/i);
            }
        });
    });

    /**
     * Factura A con IVA discriminado, las seis alícuotas de `VAT_RATE_CODES`.
     *
     * El 21% corrió a mano el 2026-09-27 (CAE 86390929393429, ver `historial.md`). Las
     * otras cinco **nunca pasaron por ARCA real** — el 5% (id 8) y el 2,5% (id 9) son
     * justamente las que el SDK rechazaba por error hasta la v2.1.0, así que ese bug
     * seguía sin verificar del lado de ARCA para las dos alícuotas que lo motivaron.
     */
    describe('Factura A con IVA discriminado (CUIT de prueba delegado)', () => {
        it.each(Object.keys(VAT_RATE_CODES).map(Number))(
            'emite con %s%% de IVA y ARCA lo autoriza',
            async (rate) => {
                const cae = await makeServiceAs(CUIT_CLASE_A).issueInvoiceA({
                    items: [{ description: 'Servicio de prueba', quantity: 1, unitPrice: 1000, vatRate: rate }],
                    buyer: {
                        docType: TaxIdType.CUIT,
                        docNumber: '20111111112',
                        vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO,
                    },
                });

                expect(cae.result).toBe('A');
                expect(cae.cae).toMatch(/^\d{14}$/);
                expect(cae.vat?.[0].rate).toBe(rate);
            }
        );
    });

    /**
     * NC/ND de verdad, asociadas a una Factura C recién emitida — no a un número
     * inventado. Hoy la suite sólo prueba NC/ND contra `callArcaApi` mockeado.
     */
    describe('Notas de Crédito y Débito C — ciclo completo contra una Factura C real', () => {
        it('emite una Nota de Crédito C asociada a una Factura C real', async () => {
            const wsfe = makeService();
            const factura = await wsfe.issueInvoiceC({
                items: [{ description: 'Para anular con NC', quantity: 1, unitPrice: 500 }],
                buyer: {
                    docType: TaxIdType.FINAL_CONSUMER,
                    docNumber: '0',
                    vatCondition: VatCondition.CONSUMIDOR_FINAL,
                },
            });

            const notaCredito = await wsfe.issueCreditNoteC({
                items: [{ description: 'Anulación total', quantity: 1, unitPrice: 500 }],
                buyer: {
                    docType: TaxIdType.FINAL_CONSUMER,
                    docNumber: '0',
                    vatCondition: VatCondition.CONSUMIDOR_FINAL,
                },
                associatedInvoices: [{
                    type: InvoiceType.FACTURA_C,
                    pointOfSale: config!.pointOfSale,
                    invoiceNumber: factura.invoiceNumber,
                }],
            });

            expect(notaCredito.result).toBe('A');
            expect(notaCredito.cae).toMatch(/^\d{14}$/);
            expect(notaCredito.invoiceType).toBe(InvoiceType.NOTA_CREDITO_C);
        });

        it('emite una Nota de Débito C asociada a una Factura C real', async () => {
            const wsfe = makeService();
            const factura = await wsfe.issueInvoiceC({
                items: [{ description: 'Para debitar con ND', quantity: 1, unitPrice: 300 }],
                buyer: {
                    docType: TaxIdType.FINAL_CONSUMER,
                    docNumber: '0',
                    vatCondition: VatCondition.CONSUMIDOR_FINAL,
                },
            });

            const notaDebito = await wsfe.issueDebitNoteC({
                items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 50 }],
                buyer: {
                    docType: TaxIdType.FINAL_CONSUMER,
                    docNumber: '0',
                    vatCondition: VatCondition.CONSUMIDOR_FINAL,
                },
                associatedInvoices: [{
                    type: InvoiceType.FACTURA_C,
                    pointOfSale: config!.pointOfSale,
                    invoiceNumber: factura.invoiceNumber,
                }],
            });

            expect(notaDebito.result).toBe('A');
            expect(notaDebito.cae).toMatch(/^\d{14}$/);
            expect(notaDebito.invoiceType).toBe(InvoiceType.NOTA_DEBITO_C);
        });
    });

    /**
     * NC/ND clase A y B, con el CUIT delegado — igual que Factura A/B, exigen IVA
     * discriminado. Cada una emite primero la Factura real que van a asociar, en vez
     * de referenciar un número inventado.
     */
    describe('Notas de Crédito y Débito A/B — ciclo completo contra una Factura A/B real', () => {
        const buyerRI = {
            docType: TaxIdType.CUIT,
            docNumber: '20111111112',
            vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO,
        };

        it('emite una Nota de Crédito A asociada a una Factura A real', async () => {
            const wsfe = makeServiceAs(CUIT_CLASE_A);
            const factura = await wsfe.issueInvoiceA({
                items: [{ description: 'Para anular con NC', quantity: 1, unitPrice: 1000, vatRate: 21 }],
                buyer: buyerRI,
            });

            const notaCredito = await wsfe.issueCreditNoteA({
                items: [{ description: 'Anulación total', quantity: 1, unitPrice: 1000, vatRate: 21 }],
                buyer: buyerRI,
                associatedInvoices: [{
                    type: InvoiceType.FACTURA_A,
                    pointOfSale: config!.pointOfSale,
                    invoiceNumber: factura.invoiceNumber,
                }],
            });

            expect(notaCredito.result).toBe('A');
            expect(notaCredito.cae).toMatch(/^\d{14}$/);
            expect(notaCredito.invoiceType).toBe(InvoiceType.NOTA_CREDITO_A);
        });

        it('emite una Nota de Débito A asociada a una Factura A real', async () => {
            const wsfe = makeServiceAs(CUIT_CLASE_A);
            const factura = await wsfe.issueInvoiceA({
                items: [{ description: 'Para debitar con ND', quantity: 1, unitPrice: 1000, vatRate: 21 }],
                buyer: buyerRI,
            });

            const notaDebito = await wsfe.issueDebitNoteA({
                items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 100, vatRate: 21 }],
                buyer: buyerRI,
                associatedInvoices: [{
                    type: InvoiceType.FACTURA_A,
                    pointOfSale: config!.pointOfSale,
                    invoiceNumber: factura.invoiceNumber,
                }],
            });

            expect(notaDebito.result).toBe('A');
            expect(notaDebito.cae).toMatch(/^\d{14}$/);
            expect(notaDebito.invoiceType).toBe(InvoiceType.NOTA_DEBITO_A);
        });

        it('emite una Nota de Crédito B asociada a una Factura B real', async () => {
            const wsfe = makeServiceAs(CUIT_CLASE_A);
            const factura = await wsfe.issueInvoiceB({
                items: [{ description: 'Para anular con NC', quantity: 1, unitPrice: 1000, vatRate: 21 }],
                buyer: { ...buyerRI, vatCondition: VatCondition.CONSUMIDOR_FINAL },
            });

            const notaCredito = await wsfe.issueCreditNoteB({
                items: [{ description: 'Anulación total', quantity: 1, unitPrice: 1000, vatRate: 21 }],
                buyer: { ...buyerRI, vatCondition: VatCondition.CONSUMIDOR_FINAL },
                associatedInvoices: [{
                    type: InvoiceType.FACTURA_B,
                    pointOfSale: config!.pointOfSale,
                    invoiceNumber: factura.invoiceNumber,
                }],
            });

            expect(notaCredito.result).toBe('A');
            expect(notaCredito.cae).toMatch(/^\d{14}$/);
            expect(notaCredito.invoiceType).toBe(InvoiceType.NOTA_CREDITO_B);
        });

        it('emite una Nota de Débito B asociada a una Factura B real', async () => {
            const wsfe = makeServiceAs(CUIT_CLASE_A);
            const factura = await wsfe.issueInvoiceB({
                items: [{ description: 'Para debitar con ND', quantity: 1, unitPrice: 1000, vatRate: 21 }],
                buyer: { ...buyerRI, vatCondition: VatCondition.CONSUMIDOR_FINAL },
            });

            const notaDebito = await wsfe.issueDebitNoteB({
                items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 100, vatRate: 21 }],
                buyer: { ...buyerRI, vatCondition: VatCondition.CONSUMIDOR_FINAL },
                associatedInvoices: [{
                    type: InvoiceType.FACTURA_B,
                    pointOfSale: config!.pointOfSale,
                    invoiceNumber: factura.invoiceNumber,
                }],
            });

            expect(notaDebito.result).toBe('A');
            expect(notaDebito.cae).toMatch(/^\d{14}$/);
            expect(notaDebito.invoiceType).toBe(InvoiceType.NOTA_DEBITO_B);
        });
    });

    /**
     * Tributos (`taxes`) end-to-end, con la combinación exacta que exige el código
     * 10283 (Manual v4.7): Factura B, receptor Sujeto No Categorizado (`DocTipo` 80,
     * `DocNro` 23000000000), tributo ID 13. La infraestructura (`taxes`) existía desde
     * la v2.0.0 pero nunca se probó contra ARCA real — y de paso cierra el pendiente
     * normativo "Clase B con receptor Sujeto No Categorizado" de `pendientes.md`.
     */
    describe('Tributos (taxes) end-to-end', () => {
        it('emite una Factura B a Sujeto No Categorizado con el tributo 13 y ARCA la autoriza', async () => {
            const cae = await makeServiceAs(CUIT_CLASE_A).issueInvoiceB({
                items: [{ description: 'Producto con percepción', quantity: 1, unitPrice: 1000, vatRate: 21 }],
                buyer: {
                    docType: TaxIdType.CUIT,
                    docNumber: '23000000000',
                    vatCondition: VatCondition.SUJETO_NO_CATEGORIZADO,
                },
                taxes: [{
                    id: 13,
                    description: 'Percepción de IVA No Categorizado',
                    taxBase: 1000,
                    rate: 10.5,
                    amount: 105,
                }],
            });

            expect(cae.result).toBe('A');
            expect(cae.cae).toMatch(/^\d{14}$/);
        });
    });

    /**
     * Moneda extranjera end-to-end, con la cotización real que da `getExchangeRate`.
     * El array `<Tributos>` y la moneda extranjera se agregaron en v2.0.0 y nunca
     * habían corrido juntos contra ARCA.
     */
    describe('Moneda extranjera end-to-end', () => {
        it('emite una Factura C en dólares con la cotización real de ARCA', async () => {
            const wsfe = makeService();
            const cotizacion = await wsfe.getExchangeRate('DOL');

            const cae = await wsfe.issueInvoiceC({
                items: [{ description: 'Servicio en dólares', quantity: 1, unitPrice: 10 }],
                buyer: {
                    docType: TaxIdType.FINAL_CONSUMER,
                    docNumber: '0',
                    vatCondition: VatCondition.CONSUMIDOR_FINAL,
                },
                currency: 'DOL',
                exchangeRate: cotizacion.rate,
            });

            expect(cae.result).toBe('A');
            expect(cae.cae).toMatch(/^\d{14}$/);
        });
    });

    /**
     * Recibos A/B/C (códigos 4, 9, 15) — **nunca habían corrido contra ARCA**, a pesar
     * de tener test unitario desde antes de hoy. Están en el catálogo (verificado el
     * 2026-09-27: `Recibos A`, `Recibos B`, `Recibo C` entre los 36 tipos), así que no
     * es el caso del Tique — pero un catálogo que lista el tipo no garantiza que ESTE
     * punto de venta lo acepte, que es justo lo que pasó con el 11001. Recibo A/B usan
     * el CUIT delegado porque, como Factura A/B, exigen discriminar IVA.
     */
    describe('Recibos A/B/C end-to-end', () => {
        it('emite un Recibo A con IVA discriminado y ARCA lo autoriza', async () => {
            const cae = await makeServiceAs(CUIT_CLASE_A).issueReceiptA({
                items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 10000, vatRate: 21 }],
                buyer: {
                    docType: TaxIdType.CUIT,
                    docNumber: '20111111112',
                    vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO,
                },
            });

            expect(cae.result).toBe('A');
            expect(cae.cae).toMatch(/^\d{14}$/);
            expect(cae.invoiceType).toBe(InvoiceType.RECIBO_A);
        });

        it('emite un Recibo B con IVA discriminado y ARCA lo autoriza', async () => {
            const cae = await makeServiceAs(CUIT_CLASE_A).issueReceiptB({
                items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 10000, vatRate: 21 }],
                buyer: {
                    docType: TaxIdType.CUIT,
                    docNumber: '20111111112',
                    vatCondition: VatCondition.CONSUMIDOR_FINAL,
                },
            });

            expect(cae.result).toBe('A');
            expect(cae.cae).toMatch(/^\d{14}$/);
            expect(cae.invoiceType).toBe(InvoiceType.RECIBO_B);
        });

        it('emite un Recibo C y ARCA lo autoriza', async () => {
            const cae = await makeService().issueReceiptC({
                items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 10000 }],
                buyer: {
                    docType: TaxIdType.FINAL_CONSUMER,
                    docNumber: '0',
                    vatCondition: VatCondition.CONSUMIDOR_FINAL,
                },
            });

            expect(cae.result).toBe('A');
            expect(cae.cae).toMatch(/^\d{14}$/);
            expect(cae.invoiceType).toBe(InvoiceType.RECIBO_C);
        });
    });

    // El test 'rechaza Tique C (CbteTipo=83) con el error 11001' se borró en la v3.0.0
    // junto con `issueSimpleReceipt()`: ya no hay forma pública de pedirle al SDK que
    // emita un 83, que es precisamente el objetivo de haberlo eliminado.
    //
    // El hallazgo no se perdió: lo cubre 'no lista ninguno de los tres Tique entre los
    // tipos de comprobante', más arriba, que es una prueba más fuerte. Ese test consulta
    // el catálogo autoritativo en vez de gastar un intento de emisión, y se pone en rojo
    // si ARCA alguna vez los habilita.
});
