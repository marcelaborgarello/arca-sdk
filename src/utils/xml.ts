import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { ArcaAuthError } from '../types/common';
import type { LoginTicket } from '../types/wsaa';

/**
 * Genera el XML TRA (Ticket de Requerimiento de Acceso)
 * 
 * @param service - Servicio ARCA (ej: 'wsfe')
 * @param cuit - CUIT del contribuyente
 * @returns XML del TRA
 */
export function buildTRA(service: string, cuit: string): string {
    const now = new Date();
    const expirationTime = new Date(now.getTime() + 12 * 60 * 60 * 1000); // +12 horas

    const tra = {
        loginTicketRequest: {
            '@_version': '1.0',
            header: {
                uniqueId: Math.floor(now.getTime() / 1000),
                generationTime: now.toISOString(),
                expirationTime: expirationTime.toISOString(),
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
    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            parseAttributeValue: true,
            removeNSPrefix: true, // Sugerencia: más robusto contra cambios de prefijos soapenv
        });

        const result = parser.parse(xml);

        // Navegar estructura XML de respuesta WSAA
        // Gracias a removeNSPrefix: true, evitamos depender de 'soapenv:'
        const credentials = result?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;

        if (!credentials) {
            // Intentar detectar error de ARCA en respuesta
            const fault = result?.Envelope?.Body?.Fault;
            if (fault) {
                throw new ArcaAuthError(
                    `Error ARCA: ${fault.faultstring || 'Error desconocido'}`,
                    { faultCode: fault.faultcode, detail: fault.detail }
                );
            }

            throw new ArcaAuthError(
                'Respuesta WSAA inválida: estructura no reconocida',
                { receivedStructure: result }
            );
        }

        // fast-xml-parser con removeNSPrefix puede dejar los campos limpios
        return {
            token: credentials.token,
            sign: credentials.sign,
            generationTime: new Date(credentials.header.generationTime),
            expirationTime: new Date(credentials.header.expirationTime),
        };
    } catch (error) {
        if (error instanceof ArcaAuthError) throw error;
        throw new ArcaAuthError(
            'Error al parsear respuesta WSAA',
            { originalError: error }
        );
    }
}

/**
 * Valida CUIT (11 dígitos sin guiones)
 */
export function validateCUIT(cuit: string): boolean {
    return /^\d{11}$/.test(cuit);
}
