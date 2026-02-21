import { WsaaService } from '../auth/wsaa';
import { getPadronEndpoint } from '../constants/endpoints';
import { ArcaNetworkError, ArcaError } from '../types/common';
import type { PadronConfig, Persona, PadronResponse } from '../types/padron';
import { callArcaApi } from '../utils/network';
import { XMLParser } from 'fast-xml-parser';

/**
 * Servicio para consultar el Padrón de AFIP (ws_sr_padron_a13)
 */
export class PadronService {
    private wsaa: WsaaService;
    private config: PadronConfig;

    constructor(config: PadronConfig) {
        this.config = config;
        this.wsaa = new WsaaService({
            environment: config.environment,
            cuit: config.cuit,
            cert: config.cert,
            key: config.key,
            service: 'ws_sr_padron_a13',
            storage: config.storage
        });
    }

    /**
     * Consulta los datos de una persona por CUIT
     * 
     * @param idPersona CUIT a consultar
     * @returns Datos de la persona o error
     */
    async getPersona(idPersona: string): Promise<PadronResponse> {
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
      <idPersona>${idPersona}</idPersona>
    </a13:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

        const endpoint = getPadronEndpoint(this.config.environment);

        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': '', // A13 no suele requerir SOAPAction específica en el header
            },
            body: soapRequest,
            timeout: this.config.timeout || 15000,
        });

        if (!response.ok) {
            throw new ArcaNetworkError(
                `Error HTTP al comunicarse con Padron A13: ${response.status}`,
                { status: response.status }
            );
        }

        const xml = await response.text();
        return this.parseResponse(xml);
    }

    /**
     * Parsear la respuesta XML de getPersona
     */
    private parseResponse(xml: string): PadronResponse {
        const parser = new XMLParser({
            ignoreAttributes: false,
            removeNSPrefix: true,
        });
        const result = parser.parse(xml);

        const body = result.Envelope?.Body;
        if (!body) {
            throw new ArcaError('Respuesta de Padrón inválida: No se encontró Body', 'PADRON_ERROR');
        }

        const response = body.getPersonaResponse?.personaReturn;
        if (!response) {
            // Manejar errores devueltos por ARCA en el body
            const fault = body.Fault;
            if (fault) {
                return { error: fault.faultstring || 'Error desconocido en AFIP' };
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

        // Mapear datos a nuestra interfaz simplificada
        const persona: Persona = {
            idPersona: Number(p.idPersona),
            tipoPersona: p.tipoPersona,
            nombre: p.nombre,
            apellido: p.apellido,
            razonSocial: p.razonSocial,
            estadoClave: p.estadoClave,
            domicilio: this.mapDomicilios(p.domicilio),
            descripcionActividadPrincipal: p.descripcionActividadPrincipal,
            esInscriptoIVA: this.checkImpuesto(p, 30), // 30 = IVA
            esMonotributista: this.checkImpuesto(p, 20), // 20 = Monotributo
            esExento: this.checkImpuesto(p, 32), // 32 = Exento
        };

        return { persona };
    }

    private mapDomicilios(d: any): any[] {
        if (!d) return [];
        const list = Array.isArray(d) ? d : [d];
        return list.map(item => ({
            direccion: item.direccion,
            localidad: item.localidad,
            codPostal: item.codPostal,
            idProvincia: Number(item.idProvincia),
            descripcionProvincia: item.descripcionProvincia,
            tipoDomicilio: item.tipoDomicilio
        }));
    }

    private checkImpuesto(p: any, id: number): boolean {
        const impuestos = p.impuesto;
        if (!impuestos) return false;
        const list = Array.isArray(impuestos) ? impuestos : [impuestos];
        return list.some((i: any) => Number(i.idImpuesto) === id);
    }
}
