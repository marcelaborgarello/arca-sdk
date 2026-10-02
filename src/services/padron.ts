import { WsaaService } from '../auth/wsaa';
import { getPadronEndpoint } from '../constants/endpoints';
import { getArcaHint, getPadronHint } from '../constants/errors';
import { ArcaError } from '../types/common';
import type {
    TaxpayerServiceConfig,
    Taxpayer,
    TaxpayerResponse,
    Address,
    Activity,
    TaxRecord,
} from '../types/padron';
import { callArcaApi } from '../utils/network';
import { escapeXml } from '../utils/xml';
import { XMLParser } from 'fast-xml-parser';
import { VatCondition } from '../types/wsfe';

/**
 * Servicio para consultar el Padrón de AFIP (ws_sr_padron_a13)
 *
 * @example
 * ```typescript
 * const padron = new PadronService({
 *   environment: 'homologacion',
 *   cuit: '20123456789',
 *   cert: fs.readFileSync('cert.pem', 'utf-8'),
 *   key: fs.readFileSync('key.pem', 'utf-8'),
 * });
 *
 * const { taxpayer, error } = await padron.getTaxpayer('30111111118');
 * if (taxpayer) {
 *   console.log(taxpayer.companyName || `${taxpayer.firstName} ${taxpayer.lastName}`);
 *   console.log('¿Inscripto IVA?:', taxpayer.isVATRegistered);
 * }
 * ```
 */
export class PadronService {
    private wsaa: WsaaService;
    private config: TaxpayerServiceConfig;

    constructor(config: TaxpayerServiceConfig) {
        this.config = config;
        this.wsaa = new WsaaService({
            environment: config.environment,
            cuit: config.cuit,
            cert: config.cert,
            key: config.key,
            service: 'ws_sr_padron_a13',
            storage: config.storage,
        });
    }

    /**
     * Consulta los datos de un contribuyente por CUIT
     *
     * @param taxId CUIT a consultar (11 dígitos sin guiones)
     * @returns Datos del contribuyente o mensaje de error
     */
    async getTaxpayer(taxId: string): Promise<TaxpayerResponse> {
        const ticket = await this.wsaa.login();

        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getPersona>
      <token>${escapeXml(ticket.token)}</token>
      <sign>${escapeXml(ticket.sign)}</sign>
      <cuitRepresentada>${escapeXml(this.config.cuit)}</cuitRepresentada>
      <idPersona>${escapeXml(taxId)}</idPersona>
    </a13:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getPadronEndpoint(this.config.environment);

        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': '',
            },
            body: soapRequest,
            timeout: this.config.timeout || 15000,
        });

        // A13 devuelve sus faults de negocio (los siete del anexo 5.3, incluidos los seis
        // que reconoce getPadronHint()) con HTTP 500 — verificado contra homologación
        // real el 2026-10-02: "El Id de la persona no es valido" y "La Clave (CUIT/CUIL)
        // consultada es inexistente" llegan los dos con status 500. Leer el body antes de
        // mirar `response.ok`, igual que ya hace wsaa.ts, es obligatorio: devolver el fault
        // tal cual sin leerlo es la línea que hacía perder el hint en una llamada real,
        // aunque los tests unitarios (que mockean `ok: true`) seguían verdes.
        const xml = await response.text();
        return this.parseResponse(xml, response.ok, response.status);
    }

    /**
     * Parsea la respuesta XML de getPersona
     *
     * @param httpOk - `response.ok` de la llamada HTTP. Sólo se usa para enriquecer el
     *   error cuando el body no trae un sobre SOAP — A13 devuelve sus faults de negocio
     *   con HTTP 500, así que `!httpOk` por sí solo **no** implica un error de
     *   infraestructura (ver `getTaxpayer()`).
     * @param httpStatus - status HTTP, para el mismo fin.
     */
    private parseResponse(xml: string, httpOk?: boolean, httpStatus?: number): TaxpayerResponse {
        const parser = new XMLParser({
            ignoreAttributes: false,
            removeNSPrefix: true,
        });
        const result = parser.parse(xml);

        const body = result.Envelope?.Body;
        if (!body) {
            // Hasta la v3.0.0 `padron.ts` no llamaba a `getArcaHint` en ninguna línea, así
            // que el hint de `PADRON_ERROR` —escrito y correcto— no le llegaba nunca a
            // nadie. Es el caso en que más sirve: una respuesta sin Body es casi siempre el
            // servicio de homologación caído, no un problema de quien integra.
            throw new ArcaError(
                'Respuesta del Padrón inválida: Body no encontrado',
                'PADRON_ERROR',
                { xml, httpOk, httpStatus },
                getArcaHint('PADRON_ERROR')
            );
        }

        const response = body.getPersonaResponse?.personaReturn;
        if (!response) {
            const fault = body.Fault;
            if (fault) {
                const faultString = fault.faultstring || 'Error desconocido en ARCA';
                return { error: faultString, hint: getPadronHint(faultString) };
            }
            return { error: 'No se encontraron datos para el CUIT informado' };
        }

        const p = response.persona;
        if (!p) {
            return { error: 'CUIT no encontrado' };
        }

        let vatCondition: VatCondition | undefined;
        if (this.hasTaxId(p, 30)) {
            vatCondition = VatCondition.IVA_RESPONSABLE_INSCRIPTO;
        } else if (this.hasTaxId(p, 32)) {
            vatCondition = VatCondition.IVA_SUJETO_EXENTO;
        } else if (this.hasTaxId(p, 20) || this.hasTaxId(p, 21) || this.hasTaxId(p, 22) || this.hasTaxId(p, 24)) {
            vatCondition = VatCondition.RESPONSABLE_MONOTRIBUTO;
        } else {
            vatCondition = VatCondition.CONSUMIDOR_FINAL;
        }

        const taxpayer: Taxpayer = {
            taxId: Number(p.idPersona),
            personType: p.tipoPersona as 'FISICA' | 'JURIDICA',
            firstName: p.nombre,
            lastName: p.apellido,
            companyName: p.razonSocial,
            status: p.estadoClave,
            addresses: this.mapAddresses(p.domicilio),
            activities: this.mapActivities(p.actividad),
            taxes: this.mapTaxRecords(p.impuesto),
            mainActivity: p.descripcionActividadPrincipal,
            isVATRegistered: this.hasTaxId(p, 30),   // 30 = IVA
            isMonotax: this.hasTaxId(p, 20) || this.hasTaxId(p, 24) || this.hasTaxId(p, 21) || this.hasTaxId(p, 22), // General o Social/Autónomo
            isSocialMonotax: this.hasTaxId(p, 24) || this.hasTaxId(p, 21), // 24 = Obra Social / Promovido, 21 = Autónomo
            isVATExempt: this.hasTaxId(p, 32),        // 32 = IVA Exento
            vatCondition,
        };

        return { taxpayer };
    }

    private mapAddresses(raw: unknown): Address[] {
        if (!raw) return [];
        return this.toArray(raw).map((item: Record<string, unknown>) => ({
            street: item.direccion as string,
            city: item.localidad as string | undefined,
            postalCode: item.codPostal as string | undefined,
            provinceId: Number(item.idProvincia),
            province: item.descripcionProvincia as string,
            type: item.tipoDomicilio as string,
        }));
    }

    private mapActivities(raw: unknown): Activity[] {
        if (!raw) return [];
        return this.toArray(raw).map((item: Record<string, unknown>) => ({
            id: Number(item.idActividad),
            description: item.descripcion as string,
            order: Number(item.orden),
            period: Number(item.periodo),
        }));
    }

    private mapTaxRecords(raw: unknown): TaxRecord[] {
        if (!raw) return [];
        return this.toArray(raw).map((item: Record<string, unknown>) => ({
            id: Number(item.idImpuesto),
            description: item.descripcion as string,
            period: Number(item.periodo),
        }));
    }

    private hasTaxId(p: Record<string, unknown>, id: number): boolean {
        const taxes = p.impuesto;
        if (!taxes) return false;
        return this.toArray(taxes).some((i: Record<string, unknown>) => Number(i.idImpuesto) === id);
    }

    /**
     * Normaliza un valor que puede ser un objeto único o un array (comportamiento de fast-xml-parser)
     */
    private toArray(data: unknown): Record<string, unknown>[] {
        if (data === undefined || data === null) return [];
        if (Array.isArray(data)) return data as Record<string, unknown>[];
        return [data as Record<string, unknown>];
    }
}
