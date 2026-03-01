import { XMLParser } from 'fast-xml-parser';
import { WsaaService } from '../auth/wsaa';
import { getPadronEndpoint } from '../constants/endpoints';
import { ArcaError, ArcaNetworkError } from '../types/common';
import type {
    Activity,
    Address,
    Taxpayer,
    TaxpayerResponse,
    TaxpayerServiceConfig,
    TaxRecord,
} from '../types/padron';
import { callArcaApi } from '../utils/network';

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
      <token>${ticket.token}</token>
      <sign>${ticket.sign}</sign>
      <cuitRepresentada>${this.config.cuit}</cuitRepresentada>
      <idPersona>${taxId}</idPersona>
    </a13:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getPadronEndpoint(this.config.environment);

        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: '',
            },
            body: soapRequest,
            timeout: this.config.timeout || 15000,
        });

        if (!response.ok) {
            throw new ArcaNetworkError(
                `Error HTTP al comunicarse con Padrón A13: ${response.status}`,
                { status: response.status },
            );
        }

        const xml = await response.text();
        return this.parseResponse(xml);
    }

    /**
     * Parsea la respuesta XML de getPersona
     */
    private parseResponse(xml: string): TaxpayerResponse {
        const parser = new XMLParser({
            ignoreAttributes: false,
            removeNSPrefix: true,
        });
        const result = parser.parse(xml);

        const body = result.Envelope?.Body;
        if (!body) {
            throw new ArcaError(
                'Respuesta del Padrón inválida: Body no encontrado',
                'PADRON_ERROR',
            );
        }

        const response = body.getPersonaResponse?.personaReturn;
        if (!response) {
            const fault = body.Fault;
            if (fault) {
                return { error: fault.faultstring || 'Error desconocido en ARCA' };
            }
            return { error: 'No se encontraron datos para el CUIT informado' };
        }

        if (response.errorConstancia) {
            return { error: response.errorConstancia };
        }

        const p = response.persona;
        if (!p) {
            return { error: 'CUIT no encontrado' };
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
            isVATRegistered: this.hasTaxId(p, 30), // 30 = IVA
            isMonotax: this.hasTaxId(p, 20), // 20 = Monotributo
            isVATExempt: this.hasTaxId(p, 32), // 32 = IVA Exento
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
        return this.toArray(taxes).some(
            (i: Record<string, unknown>) => Number(i.idImpuesto) === id,
        );
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
