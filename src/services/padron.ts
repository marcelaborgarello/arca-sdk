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
    PadronServiceStatus,
    TaxpayerIdsResponse,
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
     * @remarks Si la clave está **INACTIVA**, ARCA rechaza la consulta (anexo 5.3,
     * `PADRON_INACTIVE`) y este método no devuelve datos — usá
     * {@link getTaxpayerAllowInactive} para ese caso.
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
        return this.parseResponse(xml, 'getPersonaResponse', response.ok, response.status);
    }

    /**
     * Consulta los datos de un contribuyente por CUIT, **incluso si la clave fiscal está
     * INACTIVA**.
     *
     * Método SOAP `getPersonaV2` (Manual A13 v1.4, sección 3.4). El request es idéntico
     * al de {@link getTaxpayer} — mismos parámetros, sin nada nuevo — y es exactamente
     * por eso que viven como dos métodos separados en vez de una opción en
     * `getTaxpayer()`: la única diferencia es qué llamada de red se hace, no qué se le
     * manda a ARCA, así que no hay nada que una opción pudiera describir mejor que el
     * nombre del método.
     *
     * Usalo cuando `getTaxpayer()` te devuelva el error de clave INACTIVA
     * (`PADRON_INACTIVE`) y necesites los datos igual — por ejemplo, para mostrarle al
     * usuario por qué no se le puede facturar (wsfev1 rechaza un receptor inactivo con el
     * 10247) en vez de sólo decir "no se pudo consultar".
     *
     * @param taxId CUIT a consultar (11 dígitos sin guiones)
     * @returns Datos del contribuyente o mensaje de error
     */
    async getTaxpayerAllowInactive(taxId: string): Promise<TaxpayerResponse> {
        const ticket = await this.wsaa.login();

        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getPersonaV2>
      <token>${escapeXml(ticket.token)}</token>
      <sign>${escapeXml(ticket.sign)}</sign>
      <cuitRepresentada>${escapeXml(this.config.cuit)}</cuitRepresentada>
      <idPersona>${escapeXml(taxId)}</idPersona>
    </a13:getPersonaV2>
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

        // Mismo motivo que getTaxpayer(): A13 envuelve sus faults de negocio en HTTP 500.
        const xml = await response.text();
        return this.parseResponse(xml, 'getPersonaV2Response', response.ok, response.status);
    }

    /**
     * Verifica el estado del servicio de Padrón A13: aplicación, autenticación y base de
     * datos.
     *
     * A diferencia de {@link getTaxpayer}, **no requiere token ni sign** — el manual
     * (*Manual Consulta a Padrón – Alcance 13 v1.4*, sección 2.2) exceptúa explícitamente
     * a `dummy` de la autenticación: es el único de los cuatro métodos del servicio que
     * no la necesita. Por eso esta llamada no pasa por `WsaaService.login()`.
     *
     * @returns Estado de los tres componentes (`"OK"` o `"ERROR"` cada uno).
     */
    async dummy(): Promise<PadronServiceStatus> {
        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:dummy/>
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

        const xml = await response.text();
        return this.parseDummyResponse(xml);
    }

    /**
     * Busca las claves (CUIT/CUIL) asociadas a un número de documento (típicamente DNI).
     *
     * Método SOAP `getIdPersonaListByDocumento` (Manual A13 v1.4, sección 3.3). Sirve
     * para resolver la CUIT de un comprador a partir de su DNI — el caso de la RG 5866
     * (tope de $10.000.000 para identificar al Consumidor Final) cuando se tiene el
     * documento pero no la CUIT.
     *
     * @param document - Número de documento, sin puntos ni guiones.
     * @returns `taxIds` con las claves encontradas (array vacío si no hay ninguna), o
     *   `error`/`hint` si ARCA devolvió un fault.
     */
    async getTaxpayerIdsByDocument(document: string): Promise<TaxpayerIdsResponse> {
        const ticket = await this.wsaa.login();

        const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getIdPersonaListByDocumento>
      <token>${escapeXml(ticket.token)}</token>
      <sign>${escapeXml(ticket.sign)}</sign>
      <cuitRepresentada>${escapeXml(this.config.cuit)}</cuitRepresentada>
      <documento>${escapeXml(document)}</documento>
    </a13:getIdPersonaListByDocumento>
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

        // Mismo motivo que en getTaxpayer(): A13 envuelve sus faults de negocio en HTTP
        // 500, así que hay que leer el body antes de mirar response.ok.
        const xml = await response.text();
        return this.parseIdPersonaListResponse(xml);
    }

    /**
     * Parsea la respuesta XML de getIdPersonaListByDocumento
     */
    private parseIdPersonaListResponse(xml: string): TaxpayerIdsResponse {
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
                { xml },
                getArcaHint('PADRON_ERROR')
            );
        }

        const listReturn = body.getIdPersonaListByDocumentoResponse?.idPersonaListReturn;
        if (!listReturn) {
            const fault = body.Fault;
            if (fault) {
                const faultString = fault.faultstring || 'Error desconocido en ARCA';
                return { error: faultString, hint: getPadronHint(faultString) };
            }
            return { error: 'No se encontraron datos para el documento informado' };
        }

        // idPersona puede venir ausente (documento sin claves asociadas — ver la nota en
        // TaxpayerIdsResponse.taxIds), un único valor, o varios.
        return { taxIds: this.toNumberArray(listReturn.idPersona) };
    }

    /**
     * Parsea la respuesta XML de dummy
     */
    private parseDummyResponse(xml: string): PadronServiceStatus {
        const parser = new XMLParser({
            ignoreAttributes: false,
            removeNSPrefix: true,
        });
        const result = parser.parse(xml);

        const status = result.Envelope?.Body?.dummyResponse?.return;
        if (!status) {
            // Mismo criterio que getTaxpayer(): una respuesta sin el sobre esperado es
            // casi siempre el servicio de homologación caído, no un problema de quien
            // integra — y es irónico que sea justo dummy, el método pensado para
            // detectar esto, el que falle así. El hint de PADRON_ERROR aplica igual.
            throw new ArcaError(
                'Respuesta del Padrón inválida: no se encontró dummyResponse',
                'PADRON_ERROR',
                { xml },
                getArcaHint('PADRON_ERROR')
            );
        }

        return {
            appServer: status.appserver,
            authServer: status.authserver,
            dbServer: status.dbserver,
        };
    }

    /**
     * Parsea la respuesta XML de getPersona / getPersonaV2 — comparten todo salvo el
     * nombre del elemento raíz de la respuesta.
     *
     * @param responseTag - `'getPersonaResponse'` para {@link getTaxpayer},
     *   `'getPersonaV2Response'` para {@link getTaxpayerAllowInactive}.
     * @param httpOk - `response.ok` de la llamada HTTP. Sólo se usa para enriquecer el
     *   error cuando el body no trae un sobre SOAP — A13 devuelve sus faults de negocio
     *   con HTTP 500, así que `!httpOk` por sí solo **no** implica un error de
     *   infraestructura (ver `getTaxpayer()`).
     * @param httpStatus - status HTTP, para el mismo fin.
     */
    private parseResponse(
        xml: string,
        responseTag: 'getPersonaResponse' | 'getPersonaV2Response',
        httpOk?: boolean,
        httpStatus?: number
    ): TaxpayerResponse {
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

        const response = body[responseTag]?.personaReturn;
        if (!response) {
            const fault = body.Fault;
            if (fault) {
                const faultString = fault.faultstring || 'Error desconocido en ARCA';
                return { error: faultString, hint: getPadronHint(faultString) };
            }
            // Mismo caso que el !p de más abajo: ningún camino conocido de ARCA llega
            // sin personaReturn y sin Fault a la vez — los siete mensajes del anexo 5.3
            // viajan por Fault (confirmado 2026-10-02). Forma sin precedente, no un
            // "sin datos" que ARCA haya dicho así.
            throw new ArcaError(
                'Respuesta del Padrón inválida: ni personaReturn ni Fault',
                'PADRON_ERROR',
                { xml },
                getArcaHint('PADRON_ERROR')
            );
        }

        const p = response.persona;
        if (!p) {
            // Nunca se vio esta forma contra ARCA real: el anexo 5.3 documenta siete
            // mensajes y los siete llegan como soap:Fault (confirmado 2026-10-02, ver
            // tests/integration/padron.integration.test.ts). Un personaReturn presente
            // sin persona ni Fault es una forma sin precedente, no un "no encontrado"
            // conocido — tratarla como error de negocio inventado el texto. Mismo
            // criterio que el !body de más arriba.
            throw new ArcaError(
                'Respuesta del Padrón inválida: personaReturn sin persona ni Fault',
                'PADRON_ERROR',
                { xml },
                getArcaHint('PADRON_ERROR')
            );
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
            inactiveRelatedKeys: this.toNumberArray(p.claveInactivaAsociada),
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

    /**
     * Igual que {@link toArray}, pero para campos que son valores sueltos (CUITs), no
     * objetos — `idPersona` de `getIdPersonaListByDocumento` y `claveInactivaAsociada`
     * de `Persona` son del mismo caso de fast-xml-parser (ausente / un valor / varios),
     * sólo que el contenido es primitivo.
     */
    private toNumberArray(raw: unknown): number[] {
        if (raw === undefined || raw === null) return [];
        return (Array.isArray(raw) ? raw : [raw]).map((v) => Number(v));
    }
}
