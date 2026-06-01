import { getWsfeEndpoint } from '../constants/endpoints';
import { ArcaError, ArcaValidationError } from '../types/common';
import type {
    CaeaConfig,
    CAEASolicitarRequest,
    CAEASolicitarResponse,
    CAEAConsultarResponse,
    CaeaInvoice,
    CAEARegInformativoResponse,
} from '../types/caea';
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
import { getArcaHint } from '../constants/errors';

/**
 * Servicio de Código de Autorización Electrónico Anticipado (CAEA)
 *
 * Provee soporte para el esquema de contingencia obligatorio de ARCA
 * según Resoluciones Generales RG 5782/2025 y RG 5785/2025.
 */
export class CaeaService {
    private config: CaeaConfig;

    constructor(config: CaeaConfig) {
        this.validateConfig(config);
        this.config = config;
    }

    private validateConfig(config: CaeaConfig): void {
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
    // Métodos del Ciclo de Vida de CAEA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Solicita un CAEA (Código de Autorización Electrónico Anticipado) para una quincena específica (FECAEASolicitar).
     */
    async solicitCAEA(params: CAEASolicitarRequest): Promise<CAEASolicitarResponse> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAEASolicitar>
      <ar:Auth>
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
      </ar:Auth>
      <ar:Periodo>${params.period}</ar:Periodo>
      <ar:Orden>${params.order}</ar:Orden>
    </ar:FECAEASolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getWsfeEndpoint(this.config.environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAEASolicitar',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al solicitar CAEA: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FECAEASolicitarResponse?.FECAEASolicitarResult;

        if (!data) {
            throw new ArcaError('Respuesta FECAEASolicitar inválida', 'PARSE_ERROR', { xml: responseXml });
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

        const res = data.ResultGet;
        return {
            caea: String(res.CAEA),
            period: Number(res.Periodo),
            order: Number(res.Orden),
            expiryDate: String(res.FchVto),
            actualDate: String(res.FchVigDesde),
            receptionDate: String(res.FchVigHasta),
            limitDate: String(res.FchTopeInf),
        };
    }

    /**
     * Consulta un CAEA ya emitido (FECAEAConsultar).
     */
    async getCAEA(caea: string): Promise<CAEAConsultarResponse> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAEAConsultar>
      <ar:Auth>
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
      </ar:Auth>
      <ar:Caea>${caea}</ar:Caea>
    </ar:FECAEAConsultar>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getWsfeEndpoint(this.config.environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAEAConsultar',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al consultar CAEA: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FECAEAConsultarResponse?.FECAEAConsultarResult;

        if (!data) {
            throw new ArcaError('Respuesta FECAEAConsultar inválida', 'PARSE_ERROR', { xml: responseXml });
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

        const res = data.ResultGet;
        return {
            caea: String(res.CAEA),
            period: Number(res.Periodo),
            order: Number(res.Orden),
            expiryDate: String(res.FchVto),
            actualDate: String(res.FchVigDesde),
            receptionDate: String(res.FchVigHasta),
            limitDate: String(res.FchTopeInf),
        };
    }

    /**
     * Rinde/registra informativamente los comprobantes emitidos en contingencia local bajo un CAEA específico (FECAEARegInformativo).
     * Soporta el envío en lotes de comprobantes homogéneos del mismo tipo de factura y punto de venta.
     */
    async reportCAEAPeriod(params: {
        caea: string;
        invoices: CaeaInvoice[];
    }): Promise<CAEARegInformativoResponse> {
        if (!params.invoices || params.invoices.length === 0) {
            throw new ArcaValidationError('Debe proveer al menos un comprobante para realizar la rendición del CAEA.');
        }

        const firstInvoice = params.invoices[0];
        const invoiceType = firstInvoice.invoiceType;
        const countReg = params.invoices.length;

        // Validamos homogeneidad básica del tipo de comprobante en el lote
        const invalidInvoices = params.invoices.filter(inv => inv.invoiceType !== invoiceType);
        if (invalidInvoices.length > 0) {
            throw new ArcaValidationError('Todos los comprobantes en un mismo lote de rendición informativa deben poseer el mismo tipo de factura (invoiceType).');
        }

        // Construcción de la sección de detalles (FeDetReq)
        let detXml = '';
        params.invoices.forEach(inv => {
            const date = inv.date || new Date();
            const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

            let total = 0;
            let net = 0;
            let vat = 0;
            let vatXml = '';
            
            const includesVAT = inv.includesVAT || false;

            if (inv.items && inv.items.length > 0) {
                net = round(calculateSubtotal(inv.items, includesVAT));
                vat = round(calculateVAT(inv.items, includesVAT));
                total = round(calculateTotal(inv.items, includesVAT));

                // Agrupamiento de IVA
                const byRate = new Map<number, { base: number; amount: number }>();
                inv.items.forEach(item => {
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

                const vatEntries = Array.from(byRate.entries()).map(([rate, values]) => ({
                    rate,
                    taxBase: values.base,
                    amount: values.amount,
                }));

                if (vatEntries.length > 0) {
                    vatXml = '<ar:Iva>';
                    vatEntries.forEach(entry => {
                        vatXml += `
            <ar:AlicIva>
              <ar:Id>${this.getVATCode(entry.rate)}</ar:Id>
              <ar:BaseImp>${entry.taxBase.toFixed(2)}</ar:BaseImp>
              <ar:Importe>${entry.amount.toFixed(2)}</ar:Importe>
            </ar:AlicIva>`;
                    });
                    vatXml += '\n          </ar:Iva>';
                }
            }

            if (total <= 0) {
                throw new ArcaValidationError(`El monto total del comprobante número ${inv.invoiceNumber} debe ser mayor a 0.`);
            }

            // RG 5616: Si hay condición de IVA del receptor (ej. 5 Consumidor Final, 2 Monotributo)
            const condicionIVAReceptorXml = inv.buyer?.vatCondition !== undefined
                ? `\n            <ar:CondicionIVAReceptorId>${inv.buyer.vatCondition}</ar:CondicionIVAReceptorId>`
                : '';

            // Fechas de servicio (Obligatorio si concept es 2 (Servicios) o 3 (Productos y Servicios))
            let fechasServicioXml = '';
            if (inv.concept === BillingConcept.SERVICES || inv.concept === BillingConcept.PRODUCTS_AND_SERVICES) {
                const defaultDateStr = date.toISOString().split('T')[0].replace(/-/g, '');
                fechasServicioXml = `
            <ar:FchServDesde>${defaultDateStr}</ar:FchServDesde>
            <ar:FchServHasta>${defaultDateStr}</ar:FchServHasta>
            <ar:FchVtoPago>${defaultDateStr}</ar:FchVtoPago>`;
            }

            let asocXml = '';
            if (inv.associatedInvoices && inv.associatedInvoices.length > 0) {
                asocXml = '<ar:CbtesAsoc>';
                inv.associatedInvoices.forEach(asoc => {
                    asocXml += `
            <ar:CbteAsoc>
              <ar:Tipo>${asoc.type}</ar:Tipo>
              <ar:PtoVta>${asoc.pointOfSale}</ar:PtoVta>
              <ar:Nro>${asoc.invoiceNumber}</ar:Nro>
              ${asoc.cuit ? `<ar:Cuit>${asoc.cuit}</ar:Cuit>` : ''}
              ${asoc.date ? `<ar:CbteFch>${asoc.date.toISOString().split('T')[0].replace(/-/g, '')}</ar:CbteFch>` : ''}
            </ar:CbteAsoc>`;
                });
                asocXml += '\n          </ar:CbtesAsoc>';
            }

            let optXml = '';
            if (inv.optionals && inv.optionals.length > 0) {
                optXml = '<ar:Opcionales>';
                inv.optionals.forEach(opt => {
                    optXml += `
            <ar:Opcional>
              <ar:Id>${opt.id}</ar:Id>
              <ar:Valor>${opt.value}</ar:Valor>
            </ar:Opcional>`;
                });
                optXml += '\n          </ar:Opcionales>';
            }

            detXml += `
        <ar:FECAEADetRequest>
          <ar:Concepto>${inv.concept}</ar:Concepto>
          <ar:DocTipo>${inv.buyer?.docType || 99}</ar:DocTipo>
          <ar:DocNro>${inv.buyer?.docNumber || 0}</ar:DocNro>${condicionIVAReceptorXml}
          <ar:CbteDesde>${inv.invoiceNumber}</ar:CbteDesde>
          <ar:CbteHasta>${inv.invoiceNumber}</ar:CbteHasta>
          <ar:CbteFch>${dateStr}</ar:CbteFch>
          <ar:ImpTotal>${total.toFixed(2)}</ar:ImpTotal>
          <ar:ImpTotConc>0.00</ar:ImpTotConc>
          <ar:ImpNeto>${net.toFixed(2)}</ar:ImpNeto>
          <ar:ImpOpEx>0.00</ar:ImpOpEx>
          <ar:ImpIVA>${vat.toFixed(2)}</ar:ImpIVA>
          <ar:ImpTrib>0.00</ar:ImpTrib>
          <ar:MonId>PES</ar:MonId>
          <ar:MonCotiz>1</ar:MonCotiz>
          <ar:CAEA>${params.caea}</ar:CAEA>${fechasServicioXml}
          ${asocXml}
          ${vatXml}
          ${optXml}
        </ar:FECAEADetRequest>`;
        });

        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAEARegInformativo>
      <ar:Auth>
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEARegInfReq>
        <ar:FeCabReq>
          <ar:CantReg>${countReg}</ar:CantReg>
          <ar:PtoVta>${this.config.pointOfSale}</ar:PtoVta>
          <ar:CbteTipo>${invoiceType}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>${detXml}
        </ar:FeDetReq>
      </ar:FeCAEARegInfReq>
    </ar:FECAEARegInformativo>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getWsfeEndpoint(this.config.environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAEARegInformativo',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al rendir CAEA: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FECAEARegInformativoResponse?.FECAEARegInformativoResult;

        if (!data) {
            throw new ArcaError('Respuesta FECAEARegInformativo inválida', 'PARSE_ERROR', { xml: responseXml });
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

        const observations: string[] = [];
        if (det?.Observaciones) {
            const obsArray = Array.isArray(det.Observaciones.Obs)
                ? det.Observaciones.Obs
                : [det.Observaciones.Obs];
            obsArray.forEach((o: { Msg: string }) => observations.push(o.Msg));
        }

        return {
            caea: String(det.CAEA || params.caea),
            result: cab.Resultado,
            pointOfSale: Number(cab.PtoVta),
            invoiceType: Number(cab.CbteTipo),
            observations: observations.length > 0 ? observations : undefined,
        };
    }

    /**
     * Informa que un CAEA no tuvo movimientos en la quincena (FECAEASinMovimientoInformar).
     */
    async reportCAEANoMovement(params: { caea: string }): Promise<void> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAEASinMovimientoInformar>
      <ar:Auth>
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${this.config.pointOfSale}</ar:PtoVta>
      <ar:Caea>${params.caea}</ar:Caea>
    </ar:FECAEASinMovimientoInformar>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getWsfeEndpoint(this.config.environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAEASinMovimientoInformar',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al informar CAEA sin movimientos: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FECAEASinMovimientoInformarResponse?.FECAEASinMovimientoInformarResult;

        if (!data) {
            throw new ArcaError('Respuesta FECAEASinMovimientoInformar inválida', 'PARSE_ERROR', { xml: responseXml });
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
    }

    /**
     * Consulta si se informó la falta de movimientos de un CAEA (FECAEASinMovimientoConsultar).
     */
    async getCAEANoMovement(caea: string): Promise<any> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAEASinMovimientoConsultar>
      <ar:Auth>
        <ar:Token>${this.config.ticket.token}</ar:Token>
        <ar:Sign>${this.config.ticket.sign}</ar:Sign>
        <ar:Cuit>${this.config.cuit}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${this.config.pointOfSale}</ar:PtoVta>
      <ar:Caea>${caea}</ar:Caea>
    </ar:FECAEASinMovimientoConsultar>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getWsfeEndpoint(this.config.environment);
        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAEASinMovimientoConsultar',
            },
            body: soapRequest,
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaError(`Error HTTP al consultar CAEA sin movimientos: ${response.status}`, 'HTTP_ERROR');
        }

        const responseXml = await response.text();
        const result = parseXml(responseXml);
        const data = result?.Envelope?.Body?.FECAEASinMovimientoConsultarResponse?.FECAEASinMovimientoConsultarResult;

        if (!data) {
            throw new ArcaError('Respuesta FECAEASinMovimientoConsultar inválida', 'PARSE_ERROR', { xml: responseXml });
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

        return data.ResultGet?.FECAEASinMov || null;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Métodos internos auxiliares
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Mapea alícuotas numéricas a los códigos internos de ARCA
     */
    private getVATCode(rate: number): number {
        switch (rate) {
            case 0: return 3; // 0% / Exento / No gravado (código 3 en catálogo ARCA)
            case 10.5: return 4;
            case 21: return 5;
            case 27: return 6;
            case 5: return 8;
            case 2.5: return 9;
            default:
                throw new ArcaValidationError(`Alícuota IVA no soportada por ARCA: ${rate}%`, {
                    supportedRates: [0, 10.5, 21, 27, 5, 2.5]
                });
        }
    }
}
