import { getWsaaEndpoint } from '../constants/endpoints';
import { ArcaAuthError, ArcaValidationError } from '../types/common';
import type { WsaaConfig, LoginTicket } from '../types/wsaa';
import { buildTRA, parseWsaaResponse, validateCUIT } from '../utils/xml';
import { validateCertificate, validatePrivateKey, signCMS } from '../utils/crypto';
import { TicketManager } from './ticket';
import { callArcaApi } from '../utils/network';

/**
 * Servicio de autenticación WSAA (Web Service de Autenticación y Autorización)
 * 
 * @example
 * ```typescript
 * const wsaa = new WsaaService({
 *   environment: 'homologacion',
 *   cuit: '20123456789',
 *   cert: fs.readFileSync('cert.pem', 'utf-8'),
 *   key: fs.readFileSync('key.pem', 'utf-8'),
 *   service: 'wsfe',
 * });
 * 
 * const ticket = await wsaa.login();
 * console.log('Token:', ticket.token);
 * ```
 */
export class WsaaService {
    private config: WsaaConfig;
    private ticketManager: TicketManager;

    constructor(config: WsaaConfig) {
        this.validateConfig(config);
        this.config = config;
        this.ticketManager = new TicketManager();
    }

    /**
     * Valida la configuración
     */
    private validateConfig(config: WsaaConfig): void {
        if (!validateCUIT(config.cuit)) {
            throw new ArcaValidationError(
                'CUIT inválido: debe tener 11 dígitos sin guiones',
                { cuit: config.cuit }
            );
        }

        if (!validateCertificate(config.cert)) {
            throw new ArcaValidationError(
                'Certificado inválido: debe estar en formato PEM',
                { hint: 'Debe contener -----BEGIN CERTIFICATE-----' }
            );
        }

        if (!validatePrivateKey(config.key)) {
            throw new ArcaValidationError(
                'Clave privada inválida: debe estar en formato PEM',
                { hint: 'Debe contener -----BEGIN PRIVATE KEY----- o -----BEGIN RSA PRIVATE KEY-----' }
            );
        }

        if (!config.service || config.service.trim() === '') {
            throw new ArcaValidationError(
                'Servicio ARCA no especificado',
                { hint: 'Ejemplos: "wsfe", "wsmtxca"' }
            );
        }
    }

    /**
     * Obtiene un ticket de acceso válido
     * Usa cache si el ticket actual es válido
     * 
     * @returns Ticket de acceso
     */
    async login(): Promise<LoginTicket> {
        // Intentar usar ticket en cache
        const cachedTicket = this.ticketManager.getTicket();
        if (cachedTicket) {
            return cachedTicket;
        }

        // Generar nuevo ticket
        const ticket = await this.requestNewTicket();
        this.ticketManager.setTicket(ticket);
        return ticket;
    }

    /**
     * Solicita un nuevo ticket a WSAA
     */
    private async requestNewTicket(): Promise<LoginTicket> {
        // 1. Generar TRA (Ticket de Requerimiento de Acceso)
        const tra = buildTRA(this.config.service, this.config.cuit);

        // 2. Firmar TRA con certificado (genera CMS)
        let cms: string;
        try {
            cms = signCMS(tra, this.config.cert, this.config.key);
        } catch (error) {
            throw new ArcaAuthError(
                'Error al firmar TRA con certificado',
                { originalError: error }
            );
        }

        // 3. Enviar CMS a WSAA
        const endpoint = getWsaaEndpoint(this.config.environment);

        const response = await callArcaApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': '',
            },
            body: this.buildSoapRequest(cms),
            timeout: this.config.timeout,
        });

        if (!response.ok) {
            throw new ArcaAuthError(
                `Error HTTP al comunicarse con WSAA: ${response.status} ${response.statusText}`,
                { status: response.status, statusText: response.statusText }
            );
        }

        const responseXml = await response.text();

        // 4. Parsear respuesta
        return parseWsaaResponse(responseXml);
    }

    /**
     * Construye el SOAP request para WSAA
     */
    private buildSoapRequest(cms: string): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;
    }

    /**
     * Limpia el ticket en cache (forzar renovación)
     */
    clearCache(): void {
        this.ticketManager.clearTicket();
    }
}