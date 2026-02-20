import { getWsfeEndpoint } from '../constants/endpoints';
import { ArcaError, ArcaValidationError } from '../types/common';
import type {
    WsfeConfig,
    EmitirFacturaRequest,
    CAEResponse,
    FacturaItem,
    Comprador,
} from '../types/wsfe';
import {
    TipoComprobante,
    Concepto,
    TipoDocumento
} from '../types/wsfe';
import {
    calcularSubtotal,
    calcularIVA,
    calcularTotal,
    redondear,
} from '../utils/calculations';
import { parseXml } from '../utils/xml';

/**
 * Servicio de Facturación Electrónica (WSFE v1)
 * 
 * @example
 * ```typescript
 * const wsfe = new WsfeService({
 *   environment: 'homologacion',
 *   cuit: '20123456789',
 *   ticket: await wsaa.login(),
 *   puntoVenta: 4,
 * });
 * 
 * const cae = await wsfe.emitirFacturaC({
 *   items: [
 *     { descripcion: 'Producto 1', cantidad: 2, precioUnitario: 100 }
 *   ]
 * });
 * 
 * console.log('CAE:', cae.cae);
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
                { hint: 'El ticket se obtiene del servicio WSAA' }
            );
        }

        if (!config.puntoVenta || config.puntoVenta < 1 || config.puntoVenta > 9999) {
            throw new ArcaValidationError(
                'Punto de venta inválido: debe ser un número entre 1 y 9999',
                { puntoVenta: config.puntoVenta }
            );
        }
    }

    /**
     * Emite un Ticket C de forma simple (solo total)
     * Tipo de comprobante: 83
     */
    async emitirTicketCSimple(params: {
        total: number;
        concepto?: Concepto;
        fecha?: Date;
    }): Promise<CAEResponse> {
        return this.emitirComprobante({
            tipo: TipoComprobante.TICKET_C,
            concepto: params.concepto || Concepto.PRODUCTOS,
            total: params.total,
            fecha: params.fecha,
            comprador: {
                tipoDocumento: TipoDocumento.CONSUMIDOR_FINAL,
                nroDocumento: '0',
            },
        });
    }

    /**
     * Emite un Ticket C completo (con detalle de items)
     * Los items no se envían a ARCA, pero se retornan en la respuesta.
     */
    async emitirTicketC(params: {
        items: FacturaItem[];
        concepto?: Concepto;
        fecha?: Date;
    }): Promise<CAEResponse> {
        const total = redondear(calcularTotal(params.items));

        const cae = await this.emitirComprobante({
            tipo: TipoComprobante.TICKET_C,
            concepto: params.concepto || Concepto.PRODUCTOS,
            total,
            fecha: params.fecha,
            comprador: {
                tipoDocumento: TipoDocumento.CONSUMIDOR_FINAL,
                nroDocumento: '0',
            },
        });

        return {
            ...cae,
            items: params.items,
        };
    }
    /**
     * Emite una Factura B (monotributo a responsable inscripto)
     * REQUIERE detalle de items con IVA discriminado
     */
    async emitirFacturaB(params: {
        items: FacturaItem[];
        comprador: Comprador;
        concepto?: Concepto;
        fecha?: Date;
        incluyeIva?: boolean;
    }): Promise<CAEResponse> {
        this.validateItemsWithIVA(params.items);
        const incluyeIva = params.incluyeIva || false;
        const ivaData = this.calcularIVAPorAlicuota(params.items, incluyeIva);

        return this.emitirComprobante({
            tipo: TipoComprobante.FACTURA_B,
            concepto: params.concepto || Concepto.PRODUCTOS,
            items: params.items,
            comprador: params.comprador,
            fecha: params.fecha,
            ivaData,
            incluyeIva,
        });
    }

    /**
     * Emite una Factura A (RI a RI)
     * REQUIERE detalle de items con IVA discriminado
     */
    async emitirFacturaA(params: {
        items: FacturaItem[];
        comprador: Comprador;
        concepto?: Concepto;
        fecha?: Date;
        incluyeIva?: boolean;
    }): Promise<CAEResponse> {
        this.validateItemsWithIVA(params.items);
        const incluyeIva = params.incluyeIva || false;
        const ivaData = this.calcularIVAPorAlicuota(params.items, incluyeIva);

        return this.emitirComprobante({
            tipo: TipoComprobante.FACTURA_A,
            concepto: params.concepto || Concepto.PRODUCTOS,
            items: params.items,
            comprador: params.comprador,
            fecha: params.fecha,
            ivaData,
            incluyeIva,
        });
    }

    /**
     * Valida que todos los items tengan alícuota IVA definida
     */
    private validateItemsWithIVA(items: FacturaItem[]): void {
        const sinIva = items.filter(item =>
            item.alicuotaIva === undefined || item.alicuotaIva === null
        );

        if (sinIva.length > 0) {
            throw new ArcaValidationError(
                'Esta operación requiere IVA discriminado en todos los items',
                {
                    itemsSinIva: sinIva.map(i => i.descripcion),
                    hint: 'Agregá alicuotaIva a cada item (21, 10.5, 27, o 0)'
                }
            );
        }
    }

    /**
     * Calcula IVA agrupado por alícuota
     * ARCA requiere esto para Factura B/A
     */
    private calcularIVAPorAlicuota(items: FacturaItem[], incluyeIva = false): {
        alicuota: number;
        baseImponible: number;
        importe: number;
    }[] {
        const porAlicuota = new Map<number, { base: number; importe: number }>();

        items.forEach(item => {
            const alicuota = item.alicuotaIva || 0;
            let precioNeto = item.precioUnitario;

            if (incluyeIva && alicuota) {
                precioNeto = item.precioUnitario / (1 + (alicuota / 100));
            }

            const base = item.cantidad * precioNeto;
            const importe = base * alicuota / 100;

            const actual = porAlicuota.get(alicuota) || { base: 0, importe: 0 };
            porAlicuota.set(alicuota, {
                base: actual.base + base,
                importe: actual.importe + importe,
            });
        });

        return Array.from(porAlicuota.entries()).map(([alicuota, valores]) => ({
            alicuota,
            baseImponible: redondear(valores.base),
            importe: redondear(valores.importe),
        }));
    }

    /**
     * Emite una Factura C (consumidor final)
     * Forma simplificada sin especificar comprador
     */
    async emitirFacturaC(params: {
        items: FacturaItem[];
        concepto?: Concepto;
        fecha?: Date;
    }): Promise<CAEResponse> {
        const total = redondear(calcularTotal(params.items));

        return this.emitirComprobante({
            tipo: TipoComprobante.FACTURA_C,
            concepto: params.concepto || Concepto.PRODUCTOS,
            total,
            fecha: params.fecha,
            comprador: {
                tipoDocumento: TipoDocumento.CONSUMIDOR_FINAL,
                nroDocumento: '0',
            },
            items: params.items,
        });
    }

    /**
     * Emite un comprobante (método genérico interno)
     */
    async emitirComprobante(request: EmitirFacturaRequest): Promise<CAEResponse> {
        // 1. Obtener próximo número de comprobante
        const nroComprobante = await this.obtenerProximoNumero(request.tipo);

        // 2. Determinar total
        let total = request.total || 0;
        let subtotal = total; // Para Factura C/Ticket C, el neto es igual al total si no discriminamos
        let iva = 0;

        if (request.items && request.items.length > 0) {
            const incluyeIva = request.incluyeIva || false;
            subtotal = redondear(calcularSubtotal(request.items, incluyeIva));
            iva = redondear(calcularIVA(request.items, incluyeIva));
            total = redondear(calcularTotal(request.items, incluyeIva));
        }

        if (total <= 0) {
            throw new ArcaValidationError('El monto total debe ser mayor a 0');
        }

        // 3. Preparar request SOAP
        const soapRequest = this.buildCAESolicitarRequest({
            tipo: request.tipo,
            puntoVenta: this.config.puntoVenta,
            nroComprobante,
            concepto: request.concepto,
            fecha: request.fecha || new Date(),
            comprador: request.comprador,
            subtotal,
            iva,
            total,
            ivaData: request.ivaData,
        });

        // 4. Enviar a ARCA
        const endpoint = getWsfeEndpoint(this.config.environment);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
            },
            body: soapRequest,
        });

        if (!response.ok) {
            throw new ArcaError(
                `Error HTTP al comunicarse con WSFE: ${response.status}`,
                'HTTP_ERROR',
                { status: response.status }
            );
        }

        const responseXml = await response.text();

        // 5. Parsear respuesta CAE
        const result = await this.parseCAEResponse(responseXml);

        return {
            ...result,
            items: request.items,
            iva: request.ivaData,
        };
    }

    /**
     * Obtiene el próximo número de comprobante disponible
     */
    private async obtenerProximoNumero(tipo: TipoComprobante): Promise<number> {
        const soapRequest = this.buildProximoNumeroRequest(tipo);
        const endpoint = getWsfeEndpoint(this.config.environment);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
            },
            body: soapRequest,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al consultar próximo número: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);

        const data = result?.Envelope?.Body?.FECompUltimoAutorizadoResponse?.FECompUltimoAutorizadoResult;

        if (data?.Errors) {
            const error = Array.isArray(data.Errors.Err) ? data.Errors.Err[0] : data.Errors.Err;
            throw new ArcaError(`Error ARCA: ${error?.Msg || 'Error desconocido'}`, 'ARCA_ERROR', data.Errors);
        }

        const nro = data?.CbteNro;
        return typeof nro === 'number' ? nro + 1 : 1;
    }

    private buildCAESolicitarRequest(params: {
        tipo: TipoComprobante;
        puntoVenta: number;
        nroComprobante: number;
        concepto: Concepto;
        fecha: Date;
        comprador?: EmitirFacturaRequest['comprador'];
        subtotal: number;
        iva: number;
        total: number;
        ivaData?: EmitirFacturaRequest['ivaData'];
    }): string {
        const fechaStr = params.fecha.toISOString().split('T')[0].replace(/-/g, '');

        let ivaXml = '';
        if (params.ivaData && params.ivaData.length > 0) {
            ivaXml = '<ar:Iva>';
            params.ivaData.forEach(aliquot => {
                ivaXml += `
        <ar:AlicIva>
          <ar:Id>${this.getCodigoAlicuota(aliquot.alicuota)}</ar:Id>
          <ar:BaseImp>${aliquot.baseImponible.toFixed(2)}</ar:BaseImp>
          <ar:Importe>${aliquot.importe.toFixed(2)}</ar:Importe>
        </ar:AlicIva>`;
            });
            ivaXml += '\n      </ar:Iva>';
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
          <ar:PtoVta>${params.puntoVenta}</ar:PtoVta>
          <ar:CbteTipo>${params.tipo}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${params.concepto}</ar:Concepto>
            <ar:DocTipo>${params.comprador?.tipoDocumento || 99}</ar:DocTipo>
            <ar:DocNro>${params.comprador?.nroDocumento || 0}</ar:DocNro>
            <ar:CbteDesde>${params.nroComprobante}</ar:CbteDesde>
            <ar:CbteHasta>${params.nroComprobante}</ar:CbteHasta>
            <ar:CbteFch>${fechaStr}</ar:CbteFch>
            <ar:ImpTotal>${params.total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${params.subtotal.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpIVA>${params.iva.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            ${ivaXml}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;
    }

    /**
     * Mapea alícuota % a código ARCA
     */
    private getCodigoAlicuota(porcentaje: number): number {
        const mapa: Record<number, number> = {
            0: 3,
            10.5: 4,
            21: 5,
            27: 6,
        };

        const codigo = mapa[porcentaje];
        if (!codigo) {
            throw new ArcaValidationError(
                `Alícuota IVA inválida: ${porcentaje}%`,
                {
                    alicuotasValidas: [0, 10.5, 21, 27],
                    hint: 'Usar una de las alícuotas oficiales de Argentina'
                }
            );
        }

        return codigo;
    }

    private buildProximoNumeroRequest(tipo: TipoComprobante): string {
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
      <ar:PtoVta>${this.config.puntoVenta}</ar:PtoVta>
      <ar:CbteTipo>${tipo}</ar:CbteTipo>
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
            throw new ArcaError(`Error ARCA: ${error?.Msg || 'Error desconocido'}`, 'ARCA_ERROR', data.Errors);
        }

        const cab = data.FeCabResp;
        const det = Array.isArray(data.FeDetResp.FECAEDetResponse)
            ? data.FeDetResp.FECAEDetResponse[0]
            : data.FeDetResp.FECAEDetResponse;

        if (!det) {
            throw new ArcaError('Respuesta WSFE incompleta: falta detalle del comprobante', 'PARSE_ERROR');
        }

        const observaciones: string[] = [];
        if (det.Observaciones) {
            const obsArray = Array.isArray(det.Observaciones.Obs)
                ? det.Observaciones.Obs
                : [det.Observaciones.Obs];
            obsArray.forEach((o: any) => observaciones.push(o.Msg));
        }

        return {
            tipoComprobante: cab.CbteTipo,
            puntoVenta: cab.PtoVta,
            nroComprobante: det.CbteDesde,
            fecha: det.CbteFch,
            cae: det.CAE,
            vencimientoCae: det.CAEFchVto,
            resultado: det.Resultado,
            observaciones: observaciones.length > 0 ? observaciones : undefined,
        };
    }
}
