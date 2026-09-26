import { getWsaaEndpoint } from '../constants/endpoints';
import { ArcaAuthError, ArcaValidationError } from '../types/common';
import type { WsaaConfig, LoginTicket } from '../types/wsaa';
import { buildTRA, parseWsaaResponse, validateCUIT } from '../utils/xml';
import { validateCertificate, validatePrivateKey, signCMS } from '../utils/crypto';
import { TicketManager } from './ticket';
import { callArcaApi } from '../utils/network';
import { getArcaHint } from '../constants/errors';
import { XMLParser } from 'fast-xml-parser';

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
     * Obtiene un ticket de acceso válido.
     * 
     * Prioridad de búsqueda:
     * 1. Memoria (TicketManager cache)
     * 2. Persistencia (si config.storage está definido)
     * 3. Nueva solicitud a WSAA
     * 
     * @returns Ticket de acceso
     */
    async login(): Promise<LoginTicket> {
        // 1. Intentar usar ticket en memoria (muy rápido)
        const cachedTicket = this.ticketManager.getTicket();
        if (cachedTicket) {
            return cachedTicket;
        }

        // 2. Intentar usar persistencia externa si está disponible
        if (this.config.storage) {
            try {
                const storedTicket = await this.config.storage.get(this.config.cuit, this.config.environment);
                if (storedTicket) {
                    // Validar si el ticket devuelto por el storage no está expirado
                    // Agrego un margen de 5 minutos
                    const now = new Date();
                    if (new Date(storedTicket.expirationTime) > new Date(now.getTime() + 5 * 60000)) {
                        this.ticketManager.setTicket(storedTicket);
                        return storedTicket;
                    }
                }
            } catch (error) {
                console.warn('[ARCA-SDK] TokenStorage.get falló, intentando login directo:', error);
            }
        }

        // 3. Generar nuevo ticket (llamada a AFIP)
        const ticket = await this.requestNewTicket();

        // Guardar en memoria
        this.ticketManager.setTicket(ticket);

        // Guardar en persistencia externa
        if (this.config.storage) {
            try {
                await this.config.storage.save(this.config.cuit, this.config.environment, ticket);
            } catch (error) {
                console.warn('[ARCA-SDK] TokenStorage.save falló:', error);
            }
        }

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

        const responseText = await response.text();

        if (!response.ok) {
            let errorMessage = `Error HTTP al comunicarse con WSAA: ${response.status} ${response.statusText}`;
            let faultString = '';
            try {
                const parser = new XMLParser({
                    ignoreAttributes: false,
                    removeNSPrefix: true,
                });
                const result = parser.parse(responseText);
                const fault = result.Envelope?.Body?.Fault;
                if (fault && fault.faultstring) {
                    faultString = String(fault.faultstring);
                    errorMessage = `Error AFIP WSAA: ${faultString}`;
                }
            } catch (e) {
                // Ignorar error de parseo si no es XML válido
            }

            // ARCA no emite un TA nuevo mientras el anterior siga vigente (12 h). Sin
            // persistencia, cada proceso nuevo vuelve a pedir uno y queda bloqueado.
            // El faultstring no trae código, así que se detecta por texto.
            //
            // Hoy ARCA escribe "valido" sin tilde, pero es prosa de un mensaje de error,
            // no un código: puede corregirse en cualquier deploy. Se aceptan las dos
            // grafías para que el hint no desaparezca en silencio por una tilde.
            const hint = /ya posee un TA v[aá]lido/i.test(faultString)
                ? getArcaHint('ALREADY_HAS_TA')
                : undefined;

            throw new ArcaAuthError(
                errorMessage,
                { status: response.status, statusText: response.statusText, body: responseText },
                hint
            );
        }

        const responseXml = responseText;

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