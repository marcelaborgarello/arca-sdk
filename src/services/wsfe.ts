import { getWsfeEndpoint } from '../constants/endpoints';
import { ArcaError, ArcaValidationError } from '../types/common';
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
} from '../types/wsfe';
import {
    InvoiceType,
    BillingConcept,
    TaxIdType,
} from '../types/wsfe';
import {
    calculateSubtotal,
    calculateVAT,
    calculateTotal,
    round,
} from '../utils/calculations';
import { parseXml } from '../utils/xml';
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
 * // Ticket C rápido
 * const cae = await wsfe.issueSimpleReceipt({ total: 1500 });
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
     * Ideal para registros mínimos, como una app móvil de punto de venta.
     */
    async issueSimpleReceipt(params: {
        total: number;
        concept?: BillingConcept;
        date?: Date;
    }): Promise<CAEResponse> {
        return this.issueDocument({
            type: InvoiceType.TICKET_C,
            concept: params.concept || BillingConcept.PRODUCTS,
            total: params.total,
            date: params.date,
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
            },
        });
    }

    /**
     * Emite un Ticket C con detalle de items.
     * Los items se guardan en la respuesta pero no se envían a ARCA.
     */
    async issueReceipt(params: {
        items: InvoiceItem[];
        concept?: BillingConcept;
        date?: Date;
    }): Promise<CAEResponse> {
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
        concept?: BillingConcept;
        date?: Date;
        includesVAT?: boolean;
    }): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.FACTURA_A, params);
    }

    /**
     * Emite una Factura B (con IVA discriminado).
     * REQUIERE `vatRate` en todos los items.
     */
    async issueInvoiceB(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        concept?: BillingConcept;
        date?: Date;
        includesVAT?: boolean;
    }): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.FACTURA_B, params);
    }

    /**
     * Emite una Factura C (consumidor final, sin discriminación de IVA).
     */
    async issueInvoiceC(params: {
        items: InvoiceItem[];
        concept?: BillingConcept;
        date?: Date;
        buyer?: Buyer;
    }): Promise<CAEResponse> {
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
        concept?: BillingConcept;
        date?: Date;
        includesVAT?: boolean;
    }): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.RECIBO_A, params);
    }

    /**
     * Emite un Recibo B (con IVA discriminado).
     */
    async issueReceiptB(params: {
        items: InvoiceItem[];
        buyer: Buyer;
        concept?: BillingConcept;
        date?: Date;
        includesVAT?: boolean;
    }): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.RECIBO_B, params);
    }

    /**
     * Emite un Recibo C (sin discriminación de IVA).
     */
    async issueReceiptC(params: {
        items: InvoiceItem[];
        concept?: BillingConcept;
        date?: Date;
        buyer?: Buyer;
    }): Promise<CAEResponse> {
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
        concept?: BillingConcept;
        date?: Date;
        includesVAT?: boolean;
    }): Promise<CAEResponse> {
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
        concept?: BillingConcept;
        date?: Date;
        includesVAT?: boolean;
    }): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.NOTA_CREDITO_B, params);
    }

    /**
     * Emite una Nota de Crédito C.
     * REQUIERE especificar la Factura C original en `associatedInvoices`.
     */
    async issueCreditNoteC(params: {
        items: InvoiceItem[];
        associatedInvoices: AssociatedInvoice[];
        concept?: BillingConcept;
        date?: Date;
        buyer?: Buyer;
    }): Promise<CAEResponse> {
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
        concept?: BillingConcept;
        date?: Date;
        includesVAT?: boolean;
    }): Promise<CAEResponse> {
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
        concept?: BillingConcept;
        date?: Date;
        includesVAT?: boolean;
    }): Promise<CAEResponse> {
        return this.issueInvoiceWithVAT(InvoiceType.NOTA_DEBITO_B, params);
    }

    /**
     * Emite una Nota de Débito C.
     * REQUIERE especificar la Factura C original en `associatedInvoices`.
     */
    async issueDebitNoteC(params: {
        items: InvoiceItem[];
        associatedInvoices: AssociatedInvoice[];
        concept?: BillingConcept;
        date?: Date;
        buyer?: Buyer;
    }): Promise<CAEResponse> {
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
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
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
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
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
    // Métodos internos
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Helper para emitir comprobantes tipo A/B que requieren IVA
     */
    private async issueInvoiceWithVAT(
        type: InvoiceType,
        params: {
            items: InvoiceItem[];
            buyer: Buyer;
            associatedInvoices?: AssociatedInvoice[];
            concept?: BillingConcept;
            date?: Date;
            includesVAT?: boolean;
        }
    ): Promise<CAEResponse> {
        this.validateItemsWithVAT(params.items);
        this.validateAssociatedInvoices(type, params.associatedInvoices);

        const includesVAT = params.includesVAT || false;
        const vatData = this.calculateVATByRate(params.items, includesVAT);

        return this.issueDocument({
            type,
            concept: params.concept || BillingConcept.PRODUCTS,
            items: params.items,
            buyer: params.buyer,
            associatedInvoices: params.associatedInvoices,
            date: params.date,
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
            concept?: BillingConcept;
            date?: Date;
            buyer?: Buyer;
        }
    ): Promise<CAEResponse> {
        this.validateAssociatedInvoices(type, params.associatedInvoices);
        const total = round(calculateTotal(params.items));

        return this.issueDocument({
            type,
            concept: params.concept || BillingConcept.PRODUCTS,
            total,
            date: params.date,
            buyer: params.buyer || {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
            },
            items: params.items,
            associatedInvoices: params.associatedInvoices,
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
        // 1. Get next invoice number
        const invoiceNumber = await this.getNextInvoiceNumber(request.type);

        // 2. Calculate totals
        let total = request.total || 0;
        let net = total;
        let vat = 0;

        if (request.items && request.items.length > 0) {
            const includesVAT = request.includesVAT || false;
            net = round(calculateSubtotal(request.items, includesVAT));
            vat = round(calculateVAT(request.items, includesVAT));
            total = round(calculateTotal(request.items, includesVAT));
        }

        if (total <= 0) {
            throw new ArcaValidationError('El monto total debe ser mayor a 0');
        }

        // 3. Build SOAP request
        const soapRequest = this.buildCAERequest({
            type: request.type,
            pointOfSale: this.config.pointOfSale,
            invoiceNumber,
            concept: request.concept,
            date: request.date || new Date(),
            buyer: request.buyer,
            associatedInvoices: request.associatedInvoices,
            net,
            vat,
            total,
            vatData: request.vatData,
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
     * Mapea alícuota % al código interno de ARCA
     */
    private getVATCode(percentage: number): number {
        const map: Record<number, number> = {
            0: 3,
            10.5: 4,
            21: 5,
            27: 6,
        };

        const code = map[percentage];
        if (code === undefined) {
            throw new ArcaValidationError(
                `Alícuota IVA inválida: ${percentage}%`,
                {
                    validRates: [0, 10.5, 21, 27],
                    hint: 'Usá una de las alícuotas oficiales de Argentina'
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
        date: Date;
        buyer?: IssueInvoiceRequest['buyer'];
        associatedInvoices?: AssociatedInvoice[];
        net: number;
        vat: number;
        total: number;
        vatData?: IssueInvoiceRequest['vatData'];
    }): string {
        const dateStr = params.date.toISOString().split('T')[0].replace(/-/g, '');

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
          ${asoc.cuit ? `<ar:Cuit>${asoc.cuit}</ar:Cuit>` : ''}
          ${asoc.date ? `<ar:CbteFch>${asoc.date.toISOString().split('T')[0].replace(/-/g, '')}</ar:CbteFch>` : ''}
        </ar:CbteAsoc>`;
            });
            asocXml += '\n      </ar:CbtesAsoc>';
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
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
            <ar:DocNro>${params.buyer?.docNumber || 0}</ar:DocNro>
            <ar:CbteDesde>${params.invoiceNumber}</ar:CbteDesde>
            <ar:CbteHasta>${params.invoiceNumber}</ar:CbteHasta>
            <ar:CbteFch>${dateStr}</ar:CbteFch>
            <ar:ImpTotal>${params.total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${params.net.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpIVA>${params.vat.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            ${asocXml}
            ${vatXml}
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
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
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
}
