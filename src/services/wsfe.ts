import { getWsfeEndpoint } from '../constants/endpoints';
import { ArcaError, ArcaValidationError, ArcaRejectionError } from '../types/common';
import type {
    WsfeConfig,
    IssueInvoiceRequest,
    AssociatedInvoice,
    CAEResponse,
    InvoiceItem,
    Buyer,
    ServiceStatus,
    InvoiceDetails,
    PointOfSale,
    InvoiceOptional,
    ServiceDates,
    ArcaDateInput,
    InvoiceTax,
    IssueOptions,
    CatalogEntry,
    VatConditionEntry,
    CurrencyRate,
} from '../types/wsfe';
import {
    InvoiceType,
    BillingConcept,
    TaxIdType,
    VALID_VAT_CONDITION_IDS,
    VAT_RATE_CODES,
} from '../types/wsfe';
import {
    calculateSubtotal,
    calculateVAT,
    calculateTotal,
    round,
} from '../utils/calculations';
import { formatArcaDateOnly } from '../utils/formatArcaDate';
import { parseXml, escapeXml } from '../utils/xml';
import { callArcaApi } from '../utils/network';
import { generateQRUrl } from '../utils/qr';
import { getArcaHint } from '../constants/errors';

/**
 * Servicio de Facturación Electrónica WSFE v1
 *
 * @example
 * ```typescript
 * const wsfe = new WsfeService({
 *   environment: 'homologacion',
 *   cuit: '20123456789',
 *   ticket: await wsaa.login(),
 *   pointOfSale: 4,
 * });
 *
 * // Factura C rápida (consumidor final)
 * const cae = await wsfe.issueInvoiceC({ items: [{ description: 'Producto', quantity: 1, unitPrice: 1500 }] });
 * console.log('CAE:', cae.cae);
 * console.log('QR:', cae.qrUrl);
 *
 * // Factura A/B con IVA discriminado
 * const cae = await wsfe.issueInvoiceB({
 *   items: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, vatRate: 21 }],
 *   buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
 * });
 * ```
 */
export class WsfeService {
    private config: WsfeConfig;

    constructor(config: WsfeConfig) {
        this.validateConfig(config);
        this.config = config;
    }

    private validateConfig(config: WsfeConfig): void {
        if (!config.ticket || !config.ticket.token) {
            throw new ArcaValidationError(
                'Ticket WSAA requerido. Ejecutá wsaa.login() primero.',
                { hint: 'El ticket se obtiene del servicio WsaaService' }
            );
        }

        if (!config.pointOfSale || config.pointOfSale < 1 || config.pointOfSale > 9999) {
            throw new ArcaValidationError(
                'Punto de venta inválido: debe ser un número entre 1 y 9999',
                { pointOfSale: config.pointOfSale }
            );
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Estado de los servidores
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Verifica el estado de los servidores de ARCA (FEDummy).
     * No requiere autenticación. Útil para health checks.
     *
     * @param environment Ambiente a consultar (default: 'homologacion')
     */
    static async checkStatus(environment: 'homologacion' | 'produccion' = 'homologacion'): Promise<ServiceStatus> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FEDummy/>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getWsfeEndpoint(environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FEDummy',
            },
            body: soapRequest,
            timeout: 10000,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al consultar estado: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FEDummyResponse?.FEDummyResult;

        if (!data) {
            throw new ArcaError('Respuesta FEDummy inválida', 'PARSE_ERROR', { xml: responseXml });
        }

        return {
            appServer: data.AppServer,
            dbServer: data.DbServer,
            authServer: data.AuthServer,
        };
    }

    /**
     * Verifica el estado de los servidores de ARCA.
     * Versión de instancia — usa el ambiente configurado.
     */
    async checkStatus(): Promise<ServiceStatus> {
        return WsfeService.checkStatus(this.config.environment);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Emisión de comprobantes
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Emite un Ticket C simple (solo monto total, sin detalle de items).
     *
     * @deprecated El comprobante "Tique" (81/82/83) está regido por la RG 3561/2013
     * (Controladores Fiscales), no por la RG 4291/wsfev1 que sigue el resto de este SDK.
     * `FECAESolicitar` con `CbteTipo=83` rechaza con error ARCA 11001 desde un punto de
     * venta Web Services estándar — el único tipo de punto de venta que un consumidor de
     * este SDK puede tener. Para el caso general (consumidor final, sin Controlador
     * Fiscal) usá {@link issueInvoiceC}.
     */
    async issueSimpleReceipt(params: {
        total: number;
        concept?: BillingConcept;
        date?: Date;
        optionals?: InvoiceOptional[];
        serviceDates?: ServiceDates;
    }): Promise<CAEResponse> {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                '[arca-sdk WARNING] issueSimpleReceipt() está deprecado: emite Tique C ' +
                '(CbteTipo=83), un comprobante regido por la RG 3561/2013 (Controladores ' +
                'Fiscales) que ARCA rechaza (error 11001) desde un punto de venta Web ' +
                'Services estándar. Usá issueInvoiceC() para el caso general.'
            );
        }
        return this.issueDocument({
            type: InvoiceType.TICKET_C,
            concept: params.concept || BillingConcept.PRODUCTS,
            total: params.total,
            date: params.date,
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
            },
            optionals: params.optionals,
            serviceDates: params.serviceDates,
        });
    }

    /**
     * Emite un Ticket C con detalle de items.
     * Los items se guardan en la respuesta pero no se envían a ARCA.
     *
     * @deprecated El comprobante "Tique" (81/82/83) está regido por la RG 3561/2013
     * (Controladores Fiscales), no por la RG 4291/wsfev1 que sigue el resto de este SDK.
     * `FECAESolicitar` con `CbteTipo=83` rechaza con error ARCA 11001 desde un punto de
     * venta Web Services estándar — el único tipo de punto de venta que un consumidor de
     * este SDK puede tener. Para el caso general (consumidor final, sin Controlador
     * Fiscal) usá {@link issueInvoiceC}.
     */
    async issueReceipt(params: {
        items: InvoiceItem[];
        concept?: BillingConcept;
        date?: Date;
        optionals?: InvoiceOptional[];
        serviceDates?: ServiceDates;
    }): Promise<CAEResponse> {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                '[arca-sdk WARNING] issueReceipt() está deprecado: emite Tique C ' +
                '(CbteTipo=83), un comprobante regido por la RG 3561/2013 (Controladores ' +
                'Fiscales) que ARCA rechaza (error 11001) desde un punto de venta Web ' +
                'Services estándar. Usá issueInvoiceC() para el caso general.'
            );
        }
        const total = round(calculateTotal(params.items));

        const cae = await this.issueDocument({
            type: InvoiceType.TICKET_C,
            concept: params.concept || BillingConcept.PRODUCTS,
            total,
            date: params.date,
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
            },
            optionals: params.optionals,
            serviceDates: params.serviceDates,
        });

        return { ...cae, items: params.items };
    }

    /**
     * Emite una Factura A (Responsable Inscripto a Responsable Inscripto, con IVA discriminado).
     * REQUIERE `vatRate` en todos los items.
     */
    async issueInvoiceA(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        includesVAT?: boolean;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.FACTURA_A, params);
    }

    /**
     * Emite una Factura B (con IVA discriminado).
     * REQUIERE `vatRate` en todos los items.
     */
    async issueInvoiceB(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        includesVAT?: boolean;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.FACTURA_B, params);
    }

    /**
     * Emite una Factura C (consumidor final, sin discriminación de IVA).
     */
    async issueInvoiceC(params: {
        items: InvoiceItem[];
        buyer?: Buyer;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithoutVAT(InvoiceType.FACTURA_C, params);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Recibos
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Emite un Recibo A (con IVA discriminado).
     */
    async issueReceiptA(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        includesVAT?: boolean;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.RECIBO_A, params);
    }

    /**
     * Emite un Recibo B (con IVA discriminado).
     */
    async issueReceiptB(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        includesVAT?: boolean;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.RECIBO_B, params);
    }

    /**
     * Emite un Recibo C (sin discriminación de IVA).
     */
    async issueReceiptC(params: {
        items: InvoiceItem[];
        buyer?: Buyer;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithoutVAT(InvoiceType.RECIBO_C, params);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Notas de Crédito
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Emite una Nota de Crédito A.
     * REQUIERE especificar la Factura A original en `associatedInvoices`.
     */
    async issueCreditNoteA(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        associatedInvoices: AssociatedInvoice[];
        includesVAT?: boolean;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.NOTA_CREDITO_A, params);
    }

    /**
     * Emite una Nota de Crédito B.
     * REQUIERE especificar la Factura B original en `associatedInvoices`.
     */
    async issueCreditNoteB(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        associatedInvoices: AssociatedInvoice[];
        includesVAT?: boolean;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.NOTA_CREDITO_B, params);
    }

    /**
     * Emite una Nota de Crédito C.
     * REQUIERE especificar la Factura C original en `associatedInvoices`.
     */
    async issueCreditNoteC(params: {
        items: InvoiceItem[];
        associatedInvoices: AssociatedInvoice[];
        buyer?: Buyer;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithoutVAT(InvoiceType.NOTA_CREDITO_C, params);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Notas de Débito
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Emite una Nota de Débito A.
     * REQUIERE especificar la Factura A original en `associatedInvoices`.
     */
    async issueDebitNoteA(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        associatedInvoices: AssociatedInvoice[];
        includesVAT?: boolean;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.NOTA_DEBITO_A, params);
    }

    /**
     * Emite una Nota de Débito B.
     * REQUIERE especificar la Factura B original en `associatedInvoices`.
     */
    async issueDebitNoteB(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        associatedInvoices: AssociatedInvoice[];
        includesVAT?: boolean;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.NOTA_DEBITO_B, params);
    }

    /**
     * Emite una Nota de Débito C.
     * REQUIERE especificar la Factura C original en `associatedInvoices`.
     */
    async issueDebitNoteC(params: {
        items: InvoiceItem[];
        associatedInvoices: AssociatedInvoice[];
        buyer?: Buyer;
    } & IssueOptions): Promise<CAEResponse> {
        return this.issueInvoiceWithoutVAT(InvoiceType.NOTA_DEBITO_C, params);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Consultas
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Consulta un comprobante ya emitido (FECompConsultar).
     *
     * @param type Tipo de comprobante
     * @param invoiceNumber Número de comprobante
     */
    async getInvoice(type: InvoiceType, invoiceNumber: number): Promise<InvoiceDetails> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompConsultar>
      <ar:Auth>
        <ar:Token>${escapeXml(this.config.ticket.token)}</ar:Token>
        <ar:Sign>${escapeXml(this.config.ticket.sign)}</ar:Sign>
        <ar:Cuit>${escapeXml(this.config.cuit)}</ar:Cuit>
      </ar:Auth>
      <ar:FeCompConsReq>
        <ar:CbteTipo>${type}</ar:CbteTipo>
        <ar:CbteNro>${invoiceNumber}</ar:CbteNro>
        <ar:PtoVta>${this.config.pointOfSale}</ar:PtoVta>
      </ar:FeCompConsReq>
    </ar:FECompConsultar>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getWsfeEndpoint(this.config.environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompConsultar',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al consultar comprobante: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FECompConsultarResponse?.FECompConsultarResult;

        if (!data) {
            throw new ArcaError('Respuesta FECompConsultar inválida', 'PARSE_ERROR', { xml: responseXml });
        }

        if (data.Errors) {
            const error = Array.isArray(data.Errors.Err) ? data.Errors.Err[0] : data.Errors.Err;
            const code = error?.Code || 'UNKNOWN';
            throw new ArcaError(
                `Error ARCA: ${error?.Msg || 'Error desconocido'}`,
                'ARCA_ERROR',
                data.Errors,
                getArcaHint(code)
            );
        }

        const det = data.ResultGet;

        let optionals;
        if (det.Opcionales && det.Opcionales.Opcional) {
            const optList = Array.isArray(det.Opcionales.Opcional) ? det.Opcionales.Opcional : [det.Opcionales.Opcional];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            optionals = optList.map((o: any) => ({ id: String(o.Id), value: String(o.Valor) }));
        }

        return {
            invoiceType: Number(det.CbteTipo),
            pointOfSale: Number(det.PtoVta),
            invoiceNumber: Number(det.CbteDesde),
            date: String(det.CbteFch),
            concept: Number(det.Concepto),
            docType: Number(det.DocTipo),
            docNumber: Number(det.DocNro),
            total: Number(det.ImpTotal),
            net: Number(det.ImpNeto),
            vat: Number(det.ImpIVA),
            cae: String(det.CodAutorizacion),
            caeExpiry: String(det.FchVto),
            result: det.Resultado as 'A' | 'R',
            optionals,
        };
    }

    /**
     * Lista los puntos de venta habilitados para el CUIT autenticado (FEParamGetPtosVenta).
     */
    async getPointsOfSale(): Promise<PointOfSale[]> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FEParamGetPtosVenta>
      <ar:Auth>
        <ar:Token>${escapeXml(this.config.ticket.token)}</ar:Token>
        <ar:Sign>${escapeXml(this.config.ticket.sign)}</ar:Sign>
        <ar:Cuit>${escapeXml(this.config.cuit)}</ar:Cuit>
      </ar:Auth>
    </ar:FEParamGetPtosVenta>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getWsfeEndpoint(this.config.environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FEParamGetPtosVenta',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al consultar puntos de venta: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FEParamGetPtosVentaResponse?.FEParamGetPtosVentaResult;

        if (!data) {
            throw new ArcaError('Respuesta FEParamGetPtosVenta inválida', 'PARSE_ERROR', { xml: responseXml });
        }

        if (data.Errors) {
            const error = Array.isArray(data.Errors.Err) ? data.Errors.Err[0] : data.Errors.Err;
            throw new ArcaError(`Error ARCA: ${error?.Msg || 'Error desconocido'}`, 'ARCA_ERROR', data.Errors);
        }

        const raw = data.ResultGet?.PtoVenta;
        if (!raw) return [];

        const list = Array.isArray(raw) ? raw : [raw];
        return list.map((pv: Record<string, unknown>) => ({
            number: Number(pv.Nro),
            type: String(pv.EmisionTipo),
            isBlocked: pv.Bloqueado === 'S',
            blockedSince: pv.FchBaja ? String(pv.FchBaja) : undefined,
        }));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Catálogos de referencia (FEParamGet*)
    //
    // Son la fuente autoritativa. Los enums del SDK son una copia local que da
    // autocompletado y chequeo en compilación, pero se desactualiza: hasta la v2.1.0
    // el SDK rechazaba las alícuotas de 5% y 2.5% como inválidas, vigentes en ARCA
    // desde 2014. Ante la duda, preguntale al servicio.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Tipos de comprobante habilitados (`FEParamGetTiposCbte`).
     *
     * Es la lista autoritativa: si un tipo no está acá, `FECAESolicitar` lo rechaza con
     * el código 11001. Es lo que hay que mirar antes de asumir que un comprobante se
     * puede emitir por este web service — los Tique (81/82/83), por ejemplo, no están.
     */
    async getInvoiceTypes(): Promise<CatalogEntry[]> {
        return this.getCatalog('FEParamGetTiposCbte', 'CbteTipo');
    }

    /**
     * Alícuotas de IVA vigentes (`FEParamGetTiposIva`).
     *
     * El `Id` es lo que viaja en `<AlicIva><Id>`; la descripción es el porcentaje.
     */
    async getVatRates(): Promise<CatalogEntry[]> {
        return this.getCatalog('FEParamGetTiposIva', 'IvaTipo');
    }

    /**
     * Tipos de tributo para el array `taxes` (`FEParamGetTiposTributos`).
     *
     * Incluye el **13 – Percepción de IVA a no Categorizado**, que el código 10283
     * (manual v4.7) exige en comprobantes clase B con receptor No Categorizado.
     */
    async getTaxTypes(): Promise<CatalogEntry[]> {
        return this.getCatalog('FEParamGetTiposTributos', 'TributoTipo');
    }

    /**
     * Tipos de documento del receptor (`FEParamGetTiposDoc`).
     */
    async getDocumentTypes(): Promise<CatalogEntry[]> {
        return this.getCatalog('FEParamGetTiposDoc', 'DocTipo');
    }

    /**
     * Monedas admitidas (`FEParamGetTiposMonedas`).
     */
    async getCurrencies(): Promise<CatalogEntry[]> {
        return this.getCatalog('FEParamGetTiposMonedas', 'Moneda');
    }

    /**
     * Tipos de dato opcional (`FEParamGetTiposOpcional`).
     *
     * Son los identificadores que van en `optionals` — por ejemplo las leyendas de
     * Factura A de la RG 5762/2025.
     */
    async getOptionalTypes(): Promise<CatalogEntry[]> {
        return this.getCatalog('FEParamGetTiposOpcional', 'OpcionalTipo');
    }

    /**
     * Conceptos de facturación (`FEParamGetTiposConcepto`).
     */
    async getConceptTypes(): Promise<CatalogEntry[]> {
        return this.getCatalog('FEParamGetTiposConcepto', 'ConceptoTipo');
    }

    /**
     * Condiciones de IVA del receptor admitidas (`FEParamGetCondicionIvaReceptor`).
     *
     * **La lista depende del emisor autenticado**: ARCA devuelve las combinaciones
     * válidas para ese CUIT, y las clases de comprobante que informa no coinciden
     * necesariamente con la tabla del manual. Por eso el SDK no las hardcodea.
     */
    async getVatConditions(): Promise<VatConditionEntry[]> {
        const raw = await this.callParamMethod('FEParamGetCondicionIvaReceptor');
        const list = this.toArray(raw?.CondicionIvaReceptor);

        return list.map((e: Record<string, unknown>) => ({
            id: String(e.Id),
            description: String(e.Desc),
            invoiceClass: e.Cmp_Clase !== undefined ? String(e.Cmp_Clase) : undefined,
        }));
    }

    /**
     * Cotización oficial de una moneda (`FEParamGetCotizacion`).
     *
     * **Usala en vez de fijar `exchangeRate` a mano.** Si el comprobante se cancela en
     * la misma moneda extranjera, ARCA exige que la cotización coincida *exactamente*
     * con la del día hábil anterior, y rechaza con el código 10038 si no.
     *
     * @param currency Código de moneda (ej. `'DOL'`). Ver {@link getCurrencies}.
     * @param date Fecha de la cotización a consultar. Opcional (agregada en el manual
     *   v4.0); si se omite, ARCA devuelve la vigente.
     */
    async getExchangeRate(currency: string, date?: ArcaDateInput): Promise<CurrencyRate> {
        const extra = `<ar:MonId>${escapeXml(currency)}</ar:MonId>` +
            (date ? `\n      <ar:FchCotiz>${formatArcaDateOnly(date)}</ar:FchCotiz>` : '');

        const raw = await this.callParamMethod('FEParamGetCotizacion', extra);

        return {
            currency,
            rate: Number(raw?.MonCotiz),
            date: String(raw?.FchCotiz),
        };
    }

    /**
     * Actividades vigentes del emisor (`FEParamGetActividades`).
     */
    async getActivities(): Promise<CatalogEntry[]> {
        return this.getCatalog('FEParamGetActividades', 'ActividadTipo');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Métodos internos
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /** Normaliza a array: ARCA devuelve un objeto pelado cuando hay un solo elemento. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private toArray(value: any): any[] {
        if (value === undefined || value === null) return [];
        return Array.isArray(value) ? value : [value];
    }

    /**
     * Ejecuta un método `FEParamGet*` y devuelve su `ResultGet`.
     *
     * Todos comparten la misma forma: `Auth` y, a lo sumo, un par de campos extra.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async callParamMethod(method: string, extraFields = ''): Promise<any> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:${method}>
      <ar:Auth>
        <ar:Token>${escapeXml(this.config.ticket.token)}</ar:Token>
        <ar:Sign>${escapeXml(this.config.ticket.sign)}</ar:Sign>
        <ar:Cuit>${escapeXml(this.config.cuit)}</ar:Cuit>
      </ar:Auth>${extraFields ? `\n      ${extraFields}` : ''}
    </ar:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;

        const response = await callArcaApi(getWsfeEndpoint(this.config.environment), {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': `http://ar.gov.afip.dif.FEV1/${method}`,
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al consultar ${method}: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const data = parseXml(responseXml)?.Envelope?.Body?.[`${method}Response`]?.[`${method}Result`];

        if (!data) {
            throw new ArcaError(`Respuesta ${method} inválida`, 'PARSE_ERROR', { xml: responseXml });
        }

        if (data.Errors) {
            const error = Array.isArray(data.Errors.Err) ? data.Errors.Err[0] : data.Errors.Err;
            const code = error?.Code || 'UNKNOWN';
            throw new ArcaError(
                `Error ARCA: ${error?.Msg || 'Error desconocido'}`,
                'ARCA_ERROR',
                data.Errors,
                getArcaHint(code)
            );
        }

        return data.ResultGet;
    }

    /** Mapea un catálogo con la forma habitual `{ Id, Desc, FchDesde, FchHasta }`. */
    private async getCatalog(method: string, itemKey: string): Promise<CatalogEntry[]> {
        const raw = await this.callParamMethod(method);

        return this.toArray(raw?.[itemKey]).map((e: Record<string, unknown>) => ({
            id: String(e.Id),
            description: String(e.Desc),
            validFrom: e.FchDesde !== undefined ? String(e.FchDesde) : undefined,
            // ARCA manda el string 'NULL' cuando no hay fecha de baja.
            validTo: e.FchHasta !== undefined && String(e.FchHasta) !== 'NULL'
                ? String(e.FchHasta)
                : undefined,
        }));
    }

    /**
     * Helper para emitir comprobantes tipo A/B que requieren IVA
     */
    private async issueInvoiceWithVAT(
        type: InvoiceType,
        params: {
            items: InvoiceItem[];
            buyer: Buyer;
            associatedInvoices?: AssociatedInvoice[];
            includesVAT?: boolean;
        } & IssueOptions
    ): Promise<CAEResponse> {
        this.validateItemsWithVAT(params.items);
        this.validateAssociatedInvoices(type, params.associatedInvoices);

        const includesVAT = params.includesVAT || false;
        const vatData = this.calculateVATByRate(params.items, includesVAT);

        return this.issueDocument({
            ...params,
            type,
            concept: params.concept || BillingConcept.PRODUCTS,
            vatData,
            includesVAT,
        });
    }

    /**
     * Helper para emitir comprobantes tipo C que no discriminan IVA
     */
    private async issueInvoiceWithoutVAT(
        type: InvoiceType,
        params: {
            items: InvoiceItem[];
            associatedInvoices?: AssociatedInvoice[];
            buyer?: Buyer;
        } & IssueOptions
    ): Promise<CAEResponse> {
        this.validateAssociatedInvoices(type, params.associatedInvoices);
        const total = round(calculateTotal(params.items));

        return this.issueDocument({
            ...params,
            type,
            concept: params.concept || BillingConcept.PRODUCTS,
            total,
            buyer: params.buyer || {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
            },
        });
    }

    /**
     * Validación obligatoria para NC/ND
     */
    private validateAssociatedInvoices(type: InvoiceType, associatedInvoices?: AssociatedInvoice[]): void {
        const needsAssociation = [
            InvoiceType.NOTA_CREDITO_A, InvoiceType.NOTA_DEBITO_A,
            InvoiceType.NOTA_CREDITO_B, InvoiceType.NOTA_DEBITO_B,
            InvoiceType.NOTA_CREDITO_C, InvoiceType.NOTA_DEBITO_C
        ].includes(type);

        if (needsAssociation && (!associatedInvoices || associatedInvoices.length === 0)) {
            throw new ArcaValidationError(
                'Las Notas de Crédito y Débito requieren al menos un comprobante asociado.',
                { hint: 'Debes enviar el arreglo `associatedInvoices` con la factura original a la cual haces referencia' }
            );
        }
    }

    /**
     * Método genérico interno para emitir cualquier tipo de comprobante.
     */
    private async issueDocument(request: IssueInvoiceRequest): Promise<CAEResponse> {
        // 1. Calculate totals
        let total = request.total || 0;
        let net = total;
        let vat = 0;

        if (request.items && request.items.length > 0) {
            const includesVAT = request.includesVAT || false;
            net = round(calculateSubtotal(request.items, includesVAT));
            vat = round(calculateVAT(request.items, includesVAT));
            total = round(calculateTotal(request.items, includesVAT));
        }

        // Otros tributos: van aparte del IVA y suman al total (ImpTotal = ImpNeto +
        // ImpTotConc + ImpOpEx + ImpTrib + ImpIVA).
        const taxTotal = round(
            (request.taxes ?? []).reduce((acc, tax) => acc + tax.amount, 0)
        );
        total = round(total + taxTotal);

        if (total <= 0) {
            throw new ArcaValidationError('El monto total debe ser mayor a 0');
        }

        const currency = request.currency ?? 'PES';
        const exchangeRate = request.exchangeRate ?? 1;
        this.validateCurrency(currency, exchangeRate);

        // 2. Pre-flight validations
        this.validateBuyer(request.buyer, total);
        this.validateVatCondition(request.buyer);

        // 3. Get next invoice number
        const invoiceNumber = await this.getNextInvoiceNumber(request.type);

        // 4. Build SOAP request
        const soapRequest = this.buildCAERequest({
            type: request.type,
            pointOfSale: this.config.pointOfSale,
            invoiceNumber,
            concept: request.concept,
            date: request.date || new Date(),
            buyer: request.buyer,
            associatedInvoices: request.associatedInvoices,
            serviceDates: request.serviceDates,
            net,
            vat,
            total,
            taxTotal,
            currency,
            exchangeRate,
            payInSameForeignCurrency: request.payInSameForeignCurrency,
            vatData: request.vatData,
            taxes: request.taxes,
            optionals: request.optionals,
        });

        // 4. Send to ARCA
        const endpoint = getWsfeEndpoint(this.config.environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(
                `Error HTTP al comunicarse con WSFE: ${response.status}`,
                'HTTP_ERROR',
                { status: response.status }
            );
        }

        const responseXml = await response.text();

        // 5. Parse CAE response
        const result = await this.parseCAEResponse(responseXml);

        // 6. Generate QR URL
        const qrUrl = generateQRUrl(result, this.config.cuit, total, request.buyer);

        return {
            ...result,
            items: request.items,
            vat: request.vatData,
            qrUrl,
        };
    }

    /**
     * Obtiene el próximo número de comprobante disponible (FECompUltimoAutorizado + 1)
     */
    private async getNextInvoiceNumber(type: InvoiceType): Promise<number> {
        const soapRequest = this.buildLastInvoiceRequest(type);
        const endpoint = getWsfeEndpoint(this.config.environment);

        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al consultar último comprobante: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FECompUltimoAutorizadoResponse?.FECompUltimoAutorizadoResult;

        if (data?.Errors) {
            const error = Array.isArray(data.Errors.Err) ? data.Errors.Err[0] : data.Errors.Err;
            const code = error?.Code || 'UNKNOWN';
            throw new ArcaError(
                `Error ARCA: ${error?.Msg || 'Error desconocido'}`,
                'ARCA_ERROR',
                data.Errors,
                getArcaHint(code)
            );
        }

        const lastNumber = data?.CbteNro;
        return typeof lastNumber === 'number' ? lastNumber + 1 : 1;
    }

    /**
     * Valida que todos los items tengan alícuota IVA definida
     */
    private validateItemsWithVAT(items: InvoiceItem[]): void {
        const missingVAT = items.filter(item =>
            item.vatRate === undefined || item.vatRate === null
        );

        if (missingVAT.length > 0) {
            throw new ArcaValidationError(
                'Esta operación requiere `vatRate` en todos los items',
                {
                    itemsMissingVAT: missingVAT.map(i => i.description),
                    hint: 'Agregá vatRate a cada item (21, 10.5, 27, o 0)'
                }
            );
        }
    }

    /**
     * Valida la coherencia entre moneda y cotización.
     *
     * Con moneda extranjera ARCA exige una cotización mayor a cero (código 10039) y
     * que coincida con la registrada en sus bases (10038). Lo segundo no se puede
     * verificar localmente; lo primero sí, y evita un request perdido.
     */
    private validateCurrency(currency: string, exchangeRate: number): void {
        if (currency !== 'PES' && (!exchangeRate || exchangeRate <= 0)) {
            throw new ArcaValidationError(
                `Con moneda ${currency} hay que informar una cotización mayor a cero.`,
                {
                    currency,
                    exchangeRate,
                    hint: 'Traé la cotización oficial con FEParamGetCotizacion. Si el pago es en la ' +
                        'misma moneda extranjera, ARCA exige que coincida exactamente con la del ' +
                        'día hábil anterior (código 10038).',
                }
            );
        }
    }

    /**
     * Valida que la condición de IVA del receptor exista en el catálogo de ARCA.
     *
     * El catálogo de `CondicionIVAReceptorId` no es correlativo: los códigos 2, 3 y 11
     * no pertenecen a él y ARCA los rechaza con el código 10242. Avisar acá ahorra un
     * request y da un mensaje entendible en vez del error genérico de ARCA.
     *
     * No se valida la combinación con la clase de comprobante (código 10243): eso
     * depende de la clase y del régimen del emisor, y ARCA es la autoridad.
     */
    private validateVatCondition(buyer: Buyer | undefined): void {
        if (buyer?.vatCondition === undefined) return;

        if (!VALID_VAT_CONDITION_IDS.includes(buyer.vatCondition)) {
            throw new ArcaValidationError(
                `Condición de IVA del receptor inválida: ${buyer.vatCondition}. ` +
                `ARCA la rechaza con el código 10242.`,
                {
                    received: buyer.vatCondition,
                    validValues: VALID_VAT_CONDITION_IDS,
                    hint: 'El catálogo de CondicionIVAReceptorId no es correlativo: los ' +
                        'códigos 2, 3 y 11 no existen. Consultalo con FEParamGetCondicionIvaReceptor.',
                }
            );
        }
    }

    /**
     * Valida obligatoriamente al comprador cuando el monto es mayor o igual a $10.000.000 para consumidor final
     */
    private validateBuyer(buyer: Buyer | undefined, total: number): void {
        const isFinalConsumer = !buyer || 
            buyer.docType === TaxIdType.FINAL_CONSUMER || 
            buyer.docNumber === '0' || 
            buyer.docNumber === '';

        if (total >= 10000000 && isFinalConsumer) {
            const errorMessage = 'Para importes mayores o iguales a $10.000.000 es obligatorio identificar al comprador (RG 5866/2026).';
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`[arca-sdk WARNING] ${errorMessage}`);
            }
            throw new ArcaValidationError(errorMessage, {
                total,
                buyer,
                hint: 'Actualizá el objeto buyer con un tipo de documento válido (DNI, CUIT, CUIL) y su número correspondiente.'
            });
        }
    }

    /**
     * Calcula el IVA agrupado por alícuota (requerido por ARCA para Factura A/B)
     */
    private calculateVATByRate(items: InvoiceItem[], includesVAT = false): {
        rate: number;
        taxBase: number;
        amount: number;
    }[] {
        const byRate = new Map<number, { base: number; amount: number }>();

        items.forEach(item => {
            const rate = item.vatRate || 0;
            let netPrice = item.unitPrice;

            if (includesVAT && rate) {
                netPrice = item.unitPrice / (1 + (rate / 100));
            }

            const base = item.quantity * netPrice;
            const amount = base * rate / 100;

            const current = byRate.get(rate) || { base: 0, amount: 0 };
            byRate.set(rate, {
                base: current.base + base,
                amount: current.amount + amount,
            });
        });

        return Array.from(byRate.entries()).map(([rate, values]) => ({
            rate,
            taxBase: round(values.base),
            amount: round(values.amount),
        }));
    }

    /**
     * Mapea alícuota % al código interno de ARCA.
     *
     * El catálogo autoritativo lo devuelve {@link WsfeService.getVatRates}
     * (`FEParamGetTiposIva`); este mapa es una copia local para poder validar sin una
     * llamada de red. Si ARCA agrega una alícuota, acá hay que sumarla — y el síntoma
     * de haberlo olvidado es que el SDK rechaza como inválida una alícuota que ARCA
     * acepta.
     *
     * @remarks Pasó exactamente eso: hasta la v2.1.0 faltaban el **5%** y el **2.5%**,
     * vigentes desde el 20/10/2014.
     */
    private getVATCode(percentage: number): number {
        const code = VAT_RATE_CODES[percentage];
        if (code === undefined) {
            throw new ArcaValidationError(
                `Alícuota IVA inválida: ${percentage}%`,
                {
                    validRates: Object.keys(VAT_RATE_CODES).map(Number),
                    hint: 'Alícuotas vigentes: 0, 2.5, 5, 10.5, 21 y 27. Si ARCA agregó una ' +
                        'nueva, consultala con wsfe.getVatRates() y abrí un issue.',
                }
            );
        }

        return code;
    }

    private buildCAERequest(params: {
        type: InvoiceType;
        pointOfSale: number;
        invoiceNumber: number;
        concept: BillingConcept;
        date: ArcaDateInput;
        buyer?: IssueInvoiceRequest['buyer'];
        associatedInvoices?: AssociatedInvoice[];
        net: number;
        vat: number;
        total: number;
        taxTotal: number;
        currency: string;
        exchangeRate: number;
        payInSameForeignCurrency?: boolean;
        vatData?: IssueInvoiceRequest['vatData'];
        taxes?: InvoiceTax[];
        optionals?: InvoiceOptional[];
        serviceDates?: ServiceDates;
    }): string {
        const dateStr = formatArcaDateOnly(params.date);

        // CanMisMonExt sólo viaja con moneda extranjera: con PES el campo no debe
        // informarse, o informarse con 'N'. Va entre MonCotiz y CondicionIVAReceptorId.
        const canMisMonExtXml = params.currency !== 'PES' && params.payInSameForeignCurrency !== undefined
            ? `\n            <ar:CanMisMonExt>${params.payInSameForeignCurrency ? 'S' : 'N'}</ar:CanMisMonExt>`
            : '';

        let vatXml = '';
        if (params.vatData && params.vatData.length > 0) {
            vatXml = '<ar:Iva>';
            params.vatData.forEach(entry => {
                vatXml += `
        <ar:AlicIva>
          <ar:Id>${this.getVATCode(entry.rate)}</ar:Id>
          <ar:BaseImp>${entry.taxBase.toFixed(2)}</ar:BaseImp>
          <ar:Importe>${entry.amount.toFixed(2)}</ar:Importe>
        </ar:AlicIva>`;
            });
            vatXml += '\n      </ar:Iva>';
        }

        let asocXml = '';
        if (params.associatedInvoices && params.associatedInvoices.length > 0) {
            asocXml = '<ar:CbtesAsoc>';
            params.associatedInvoices.forEach(asoc => {
                asocXml += `
        <ar:CbteAsoc>
          <ar:Tipo>${asoc.type}</ar:Tipo>
          <ar:PtoVta>${asoc.pointOfSale}</ar:PtoVta>
          <ar:Nro>${asoc.invoiceNumber}</ar:Nro>
          ${asoc.cuit ? `<ar:Cuit>${escapeXml(asoc.cuit)}</ar:Cuit>` : ''}
          ${asoc.date ? `<ar:CbteFch>${formatArcaDateOnly(asoc.date)}</ar:CbteFch>` : ''}
        </ar:CbteAsoc>`;
            });
            asocXml += '\n      </ar:CbtesAsoc>';
        }

        // <Tributos> va entre <CbtesAsoc> e <Iva> en el sequence del XSD.
        let tribXml = '';
        if (params.taxes && params.taxes.length > 0) {
            tribXml = '<ar:Tributos>';
            params.taxes.forEach(tax => {
                tribXml += `
        <ar:Tributo>
          <ar:Id>${tax.id}</ar:Id>${tax.description ? `
          <ar:Desc>${escapeXml(tax.description)}</ar:Desc>` : ''}
          <ar:BaseImp>${tax.taxBase.toFixed(2)}</ar:BaseImp>
          <ar:Alic>${tax.rate.toFixed(2)}</ar:Alic>
          <ar:Importe>${tax.amount.toFixed(2)}</ar:Importe>
        </ar:Tributo>`;
            });
            tribXml += '\n      </ar:Tributos>';
        }

        let optXml = '';
        if (params.optionals && params.optionals.length > 0) {
            optXml = '<ar:Opcionales>';
            params.optionals.forEach(opt => {
                optXml += `
        <ar:Opcional>
          <ar:Id>${escapeXml(opt.id)}</ar:Id>
          <ar:Valor>${escapeXml(opt.value)}</ar:Valor>
        </ar:Opcional>`;
            });
            optXml += '\n      </ar:Opcionales>';
        }

        // RG 5616: condición de IVA del receptor (ej. 5 Consumidor Final, 6 Responsable
        // Monotributo). El catálogo válido lo da FEParamGetCondicionIvaReceptor y NO es
        // correlativo: 2, 3 y 11 no existen ahí (rechazo 10242).
        //
        // Va acá y no junto a DocNro: en el `sequence` del XSD el elemento cae después
        // de MonCotiz/CanMisMonExt y antes de CbtesAsoc. Pasa a ser obligatorio el
        // 01/12/2026 (manual v4.8), con lo cual la posición deja de ser un detalle.
        const condicionIVAReceptorXml = params.buyer?.vatCondition !== undefined
            ? `\n            <ar:CondicionIVAReceptorId>${params.buyer.vatCondition}</ar:CondicionIVAReceptorId>`
            : '';

        // Fechas de servicio (Obligatorio si concept es 2 (Servicios) o 3 (Productos y Servicios))
        let fechasServicioXml = '';
        if (params.concept === BillingConcept.SERVICES || params.concept === BillingConcept.PRODUCTS_AND_SERVICES) {
            const defaultDateStr = formatArcaDateOnly(params.date);
            const startDateStr = params.serviceDates?.startDate ? formatArcaDateOnly(params.serviceDates.startDate) : defaultDateStr;
            const endDateStr = params.serviceDates?.endDate ? formatArcaDateOnly(params.serviceDates.endDate) : defaultDateStr;
            const dueDateStr = params.serviceDates?.dueDate ? formatArcaDateOnly(params.serviceDates.dueDate) : defaultDateStr;

            fechasServicioXml = `
            <ar:FchServDesde>${startDateStr}</ar:FchServDesde>
            <ar:FchServHasta>${endDateStr}</ar:FchServHasta>
            <ar:FchVtoPago>${dueDateStr}</ar:FchVtoPago>`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${escapeXml(this.config.ticket.token)}</ar:Token>
        <ar:Sign>${escapeXml(this.config.ticket.sign)}</ar:Sign>
        <ar:Cuit>${escapeXml(this.config.cuit)}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${params.pointOfSale}</ar:PtoVta>
          <ar:CbteTipo>${params.type}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${params.concept}</ar:Concepto>
            <ar:DocTipo>${params.buyer?.docType || 99}</ar:DocTipo>
            <ar:DocNro>${escapeXml(params.buyer?.docNumber) || 0}</ar:DocNro>
            <ar:CbteDesde>${params.invoiceNumber}</ar:CbteDesde>
            <ar:CbteHasta>${params.invoiceNumber}</ar:CbteHasta>
            <ar:CbteFch>${dateStr}</ar:CbteFch>
            <ar:ImpTotal>${params.total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${params.net.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpTrib>${params.taxTotal.toFixed(2)}</ar:ImpTrib>
            <ar:ImpIVA>${params.vat.toFixed(2)}</ar:ImpIVA>${fechasServicioXml}
            <ar:MonId>${escapeXml(params.currency)}</ar:MonId>
            <ar:MonCotiz>${params.exchangeRate}</ar:MonCotiz>${canMisMonExtXml}${condicionIVAReceptorXml}
            ${asocXml}
            ${tribXml}
            ${vatXml}
            ${optXml}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;
    }

    private buildLastInvoiceRequest(type: InvoiceType): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${escapeXml(this.config.ticket.token)}</ar:Token>
        <ar:Sign>${escapeXml(this.config.ticket.sign)}</ar:Sign>
        <ar:Cuit>${escapeXml(this.config.cuit)}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${this.config.pointOfSale}</ar:PtoVta>
      <ar:CbteTipo>${type}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`;
    }

    private async parseCAEResponse(xml: string): Promise<CAEResponse> {
        const result = parseXml(xml);
        const data = result?.Envelope?.Body?.FECAESolicitarResponse?.FECAESolicitarResult;

        if (!data) {
            throw new ArcaError('Respuesta WSFE inválida: estructura no reconocida', 'PARSE_ERROR', { xml });
        }

        if (data.Errors) {
            const error = Array.isArray(data.Errors.Err) ? data.Errors.Err[0] : data.Errors.Err;
            const code = error?.Code || 'UNKNOWN';
            throw new ArcaError(
                `Error ARCA: ${error?.Msg || 'Error desconocido'}`,
                'ARCA_ERROR',
                data.Errors,
                getArcaHint(code)
            );
        }

        const cab = data.FeCabResp;
        const det = Array.isArray(data.FeDetResp.FECAEDetResponse)
            ? data.FeDetResp.FECAEDetResponse[0]
            : data.FeDetResp.FECAEDetResponse;

        if (!det) {
            throw new ArcaError('Respuesta WSFE incompleta: falta detalle del comprobante', 'PARSE_ERROR');
        }

        const observations: string[] = [];
        if (det.Observaciones) {
            const obsArray = Array.isArray(det.Observaciones.Obs)
                ? det.Observaciones.Obs
                : [det.Observaciones.Obs];
            obsArray.forEach((o: { Msg: string }) => observations.push(o.Msg));
        }

        // ARCA procesó la solicitud y no autorizó el comprobante: no hay CAE y el
        // comprobante no existe. Devolverlo como si fuera un resultado válido hace que
        // quien no mire `result` crea que facturó — es pérdida silenciosa de datos.
        if (det.Resultado === 'R') {
            const motivo = observations[0] ?? 'ARCA no informó el motivo.';
            throw new ArcaRejectionError(
                `ARCA rechazó el comprobante: ${motivo}`,
                observations,
                {
                    invoiceType: Number(cab.CbteTipo),
                    pointOfSale: Number(cab.PtoVta),
                    invoiceNumber: Number(det.CbteDesde),
                    result: det.Resultado,
                },
                this.hintForObservations(observations)
            );
        }

        return {
            invoiceType: Number(cab.CbteTipo),
            pointOfSale: Number(cab.PtoVta),
            invoiceNumber: Number(det.CbteDesde),
            date: String(det.CbteFch),
            cae: String(det.CAE),
            caeExpiry: String(det.CAEFchVto),
            result: det.Resultado,
            observations: observations.length > 0 ? observations : undefined,
        };
    }

    /**
     * Busca un hint para el motivo de rechazo.
     *
     * Las observaciones llegan con su código en `Obs.Code`, pero el parseo actual sólo
     * conserva el mensaje, así que se reconocen por texto los casos más frecuentes.
     */
    private hintForObservations(observations: string[]): string | undefined {
        const texto = observations.join(' ');

        if (/Condicion Frente al IVA del receptor es obligatorio/i.test(texto)) {
            return getArcaHint(10246);
        }
        if (/Condicion Frente al IVA del receptor/i.test(texto)) {
            return getArcaHint(10245);
        }
        return undefined;
    }
}
