import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { ArcaAuthError } from '../types/common';
import type { LoginTicket } from '../types/wsaa';
import { formatArcaDate } from './formatArcaDate';

/**
 * Genera el XML TRA (Ticket de Requerimiento de Acceso)
 * 
 * @param service - Servicio ARCA (ej: 'wsfe')
 * @param cuit - CUIT del contribuyente
 * @returns XML del TRA
 */
export function buildTRA(service: string, cuit: string): string {
    const now = new Date();
    const genTime = new Date(now.getTime() - (10 * 60 * 1000)); 
    const expTime = new Date(now.getTime() + (12 * 60 * 60 * 1000));

    const tra = {
        loginTicketRequest: {
            '@_version': '1.0',
            header: {
                uniqueId: Math.floor(now.getTime() / 1000),
                generationTime: formatArcaDate(genTime),
                expirationTime: formatArcaDate(expTime),
            },
            service,
        },
    };

    const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
    });

    const xml = builder.build(tra);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

/**
 * Parsea la respuesta XML de WSAA
 * 
 * @param xml - XML de respuesta
 * @returns Ticket de login
 */
export function parseWsaaResponse(xml: string): LoginTicket {
    const parser = new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: true,
        removeNSPrefix: true,
    });

    try {
        const envelope = parser.parse(xml);

        // El loginCmsReturn contiene el ticket real como un XML escapado (string)
        const loginCmsReturn = envelope?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;

        if (!loginCmsReturn) {
            const fault = envelope?.Envelope?.Body?.Fault;
            if (fault) {
                throw new ArcaAuthError(
                    `Error ARCA: ${fault.faultstring || 'Error desconocido'}`,
                    { faultCode: fault.faultcode, detail: fault.detail }
                );
            }

            throw new ArcaAuthError(
                'Respuesta WSAA inválida: estructura no reconocida',
                {
                    receivedXml: xml.substring(0, 5000),
                    receivedStructure: JSON.stringify(envelope).substring(0, 500)
                }
            );
        }

        // Segundo nivel de parseo: El XML interno escapado que viene dentro de loginCmsReturn
        const ticketResult = parser.parse(loginCmsReturn);
        const ticket = ticketResult?.loginTicketResponse;

        if (!ticket || !ticket.header || !ticket.credentials) {
            throw new ArcaAuthError('Ticket WSAA inválido o malformado dentro de loginCmsReturn', {
                innerStructure: JSON.stringify(ticketResult).substring(0, 500),
                receivedXml: xml.substring(0, 5000)
            });
        }

        return {
            token: ticket.credentials.token,
            sign: ticket.credentials.sign,
            generationTime: new Date(ticket.header.generationTime),
            expirationTime: new Date(ticket.header.expirationTime),
        };
    } catch (error) {
        if (error instanceof ArcaAuthError) throw error;
        throw new ArcaAuthError(
            'Error al parsear respuesta WSAA (posible XML anidado malformado)',
            {
                originalError: error instanceof Error ? error.message : String(error),
                receivedXml: xml.substring(0, 5000)
            }
        );
    }
}

/**
 * Parsea un XML genérico de ARCA
 * 
 * @param xml - XML de respuesta
 * @returns Objeto parseado
 */
export function parseXml(xml: string): any {
    const parser = new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: true,
        removeNSPrefix: true,
    });
    return parser.parse(xml);
}

/**
 * Valida CUIT (11 dígitos sin guiones)
 */
export function validateCUIT(cuit: string): boolean {
    return /^\d{11}$/.test(cuit);
}
