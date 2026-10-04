import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PadronService } from '../../src/services/padron';
import { callArcaApi } from '../../src/utils/network';
import { WsaaService } from '../../src/auth/wsaa';
import { ArcaError } from '../../src/types/common';
import { ARCA_ERROR_HINTS, getArcaHint } from '../../src/constants/errors';

vi.mock('../../src/utils/network', () => ({
  callArcaApi: vi.fn(),
}));

describe('PadronService (A13)', () => {
  const config = {
    environment: 'homologacion' as const,
    cuit: '20123456789',
    cert: '-----BEGIN CERTIFICATE-----\nmock\n-----END CERTIFICATE-----',
    key: '-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----',
  };

  const service = new PadronService(config);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(WsaaService.prototype, 'login').mockResolvedValue({
      token: 'mock-token',
      sign: 'mock-sign',
      generationTime: new Date(),
      expirationTime: new Date(Date.now() + 3600000),
    } as any);
  });

  it('should parse a successful getTaxpayer response correctly', async () => {
    const mockPadronXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getPersonaResponse xmlns="http://a13.soap.ws.server.puc.sr/">
      <personaReturn>
        <persona>
          <idPersona>20123456789</idPersona>
          <tipoPersona>FISICA</tipoPersona>
          <nombre>JUAN</nombre>
          <apellido>PEREZ</apellido>
          <estadoClave>ACTIVO</estadoClave>
          <domicilio>
            <direccion>CALLE FALSA 123</direccion>
            <localidad>CABA</localidad>
            <codPostal>1000</codPostal>
            <idProvincia>0</idProvincia>
            <descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES</descripcionProvincia>
            <tipoDomicilio>FISCAL</tipoDomicilio>
          </domicilio>
          <impuesto>
            <idImpuesto>30</idImpuesto>
            <descripcionImpuesto>IVA</descripcionImpuesto>
          </impuesto>
          <impuesto>
            <idImpuesto>10</idImpuesto>
            <descripcionImpuesto>GANANCIAS SOCIEDADES</descripcionImpuesto>
          </impuesto>
          <descripcionActividadPrincipal>VENTA AL POR MENOR</descripcionActividadPrincipal>
        </persona>
      </personaReturn>
    </getPersonaResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    (callArcaApi as any).mockResolvedValue({
      ok: true,
      text: async () => mockPadronXml,
    });

    const result = await service.getTaxpayer('20123456789');

    expect(result.taxpayer).toBeDefined();
    expect(result.taxpayer?.firstName).toBe('JUAN');
    expect(result.taxpayer?.lastName).toBe('PEREZ');
    expect(result.taxpayer?.isVATRegistered).toBe(true);
    expect(result.taxpayer?.isMonotax).toBe(false);
    expect(result.taxpayer?.addresses[0].street).toBe('CALLE FALSA 123');
    expect(result.taxpayer?.addresses[0].province).toBe('CIUDAD AUTONOMA BUENOS AIRES');
  });

  it('should handle "CUIT not found" response', async () => {
    const mockPadronXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getPersonaResponse xmlns="http://a13.soap.ws.server.puc.sr/">
      <personaReturn>
        <metadata>
            <fechaHora>2026-02-21T10:00:00</fechaHora>
        </metadata>
      </personaReturn>
    </getPersonaResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    (callArcaApi as any).mockResolvedValue({
      ok: true,
      text: async () => mockPadronXml,
    });

    const result = await service.getTaxpayer('22222222222');
    expect(result.error).toBe('CUIT no encontrado');
  });

  it('should parse Monotributo Social correctly (idImpuesto 24)', async () => {
    const mockPadronXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getPersonaResponse xmlns="http://a13.soap.ws.server.puc.sr/">
      <personaReturn>
        <persona>
          <idPersona>27111111112</idPersona>
          <tipoPersona>FISICA</tipoPersona>
          <nombre>MARIA</nombre>
          <impuesto>
            <idImpuesto>24</idImpuesto>
            <descripcionImpuesto>MONOTRIBUTO TRABAJADOR INDEPENDIENTE PROMOVIDO</descripcionImpuesto>
          </impuesto>
        </persona>
      </personaReturn>
    </getPersonaResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    (callArcaApi as any).mockResolvedValue({
      ok: true,
      text: async () => mockPadronXml,
    });

    const result = await service.getTaxpayer('27111111112');
    expect(result.taxpayer).toBeDefined();
    expect(result.taxpayer?.isMonotax).toBe(true);
    expect(result.taxpayer?.isSocialMonotax).toBe(true);
    // Verificar mapeo automático de IVA
    expect(result.taxpayer?.vatCondition).toBe(6); // RESPONSABLE_MONOTRIBUTO
  });

  it('should parse regular Monotributo correctly (idImpuesto 20) to VatCondition 6', async () => {
    const mockPadronXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getPersonaResponse xmlns="http://a13.soap.ws.server.puc.sr/">
      <personaReturn>
        <persona>
          <idPersona>20111111112</idPersona>
          <tipoPersona>FISICA</tipoPersona>
          <nombre>CARLOS</nombre>
          <impuesto>
            <idImpuesto>20</idImpuesto>
            <descripcionImpuesto>MONOTRIBUTO</descripcionImpuesto>
          </impuesto>
        </persona>
      </personaReturn>
    </getPersonaResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    (callArcaApi as any).mockResolvedValue({
      ok: true,
      text: async () => mockPadronXml,
    });

    const result = await service.getTaxpayer('20111111112');
    expect(result.taxpayer).toBeDefined();
    expect(result.taxpayer?.vatCondition).toBe(6); // RESPONSABLE_MONOTRIBUTO
  });

  /**
   * El hint del padrón. Hasta la v3.0.0 no le llegaba a nadie: `PADRON_ERROR` y
   * `CUIT_NOT_FOUND` estaban escritos en el diccionario desde siempre y `padron.ts` no
   * llamaba a `getArcaHint` en ninguna línea. El `CUIT_NOT_FOUND` se borró en la v3.0.0
   * (repetía el mensaje de error con otras palabras); `PADRON_ERROR` se cableó ahí mismo.
   *
   * **Desde la v3.1.0 (2026-10-01/02)**: el anexo 5.3 del *Manual Consulta a Padrón –
   * Alcance 13 v1.4* documenta siete mensajes y el SDK reconoce **seis** —el séptimo,
   * "clave inexistente", queda sin hint a propósito, el mensaje ya dice todo—, vía
   * `TaxpayerResponse.hint` y `getPadronHint()` (`constants/errors.ts`). Confirmado
   * contra homologación real que llegan por SOAP `Fault`, envuelto en **HTTP 500**: el
   * primer intento de cablear esto (2026-10-01) tenía el hint bien escrito pero
   * `getTaxpayer()` lanzaba antes de leer el body para cualquier `!response.ok`, así que
   * nunca se disparaba contra ARCA real — sólo acá, donde el mock de entonces usaba
   * `ok: true` sin querer. Los dos tests de abajo ya reflejan el `ok: false` real.
   */
  describe('el hint del padrón', () => {
    it('llega cuando la respuesta no tiene Body', async () => {
      // Una respuesta sin Body es casi siempre el servicio de homologación caído, que es
      // exactamente lo que dice el hint. Sin él, quien integra revisa su CUIT.
      (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => '<?xml version="1.0" encoding="UTF-8"?><algo>no es un sobre SOAP</algo>',
      });

      try {
        await service.getTaxpayer('20111111112');
        expect.unreachable('getTaxpayer() debía lanzar');
      } catch (error) {
        expect(error).toBeInstanceOf(ArcaError);
        expect((error as ArcaError).code).toBe('PADRON_ERROR');
        expect((error as ArcaError).hint).toBe(ARCA_ERROR_HINTS.PADRON_ERROR);
        expect((error as ArcaError).hint).toBeDefined();
      }
    });

    /**
     * Desde la v3.1.0: cuando ARCA contesta con un SOAP `Fault` reconocido (anexo 5.3 del
     * manual de A13), `getTaxpayer()` devuelve el hint junto con el error en vez de
     * entregar el `faultstring` pelado. No lanza — A13 nunca lanzó por un fault de negocio,
     * y cambiar eso acá hubiera sido romper la firma sin que nadie lo pidiera.
     *
     * **El `ok: false` / `status: 500` de estos dos mocks no es decorativo.** Verificado
     * contra homologación real el 2026-10-02: los dos faults del anexo 5.3 que se
     * provocaron —"El Id de la persona no es valido" y "La Clave (CUIT/CUIL) consultada
     * es inexistente"— llegaron los dos con HTTP 500. Hasta ese día `getTaxpayer()`
     * lanzaba `ArcaNetworkError` apenas veía `!response.ok`, sin leer el body: el hint
     * nunca llegaba a dispararse contra ARCA real, sólo acá, donde el mock usaba
     * `ok: true` sin querer.
     */
    it('llega cuando ARCA contesta un Fault reconocido (clave INACTIVA), con HTTP 500', async () => {
      const mockFaultXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>soapenv:Server</faultcode>
      <faultstring>La clave (CUIT/CUIL) consultada se encuentra INACTIVA</faultstring>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => mockFaultXml,
      });

      const result = await service.getTaxpayer('20111111112');

      expect(result.taxpayer).toBeUndefined();
      expect(result.error).toBe('La clave (CUIT/CUIL) consultada se encuentra INACTIVA');
      expect(result.hint).toBe(getArcaHint('PADRON_INACTIVE'));
      expect(result.hint).toBeDefined();
    });

    it('no inventa un hint para un Fault que el manual no documenta, con HTTP 500', async () => {
      const mockFaultXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>soapenv:Server</faultcode>
      <faultstring>Error interno no documentado</faultstring>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => mockFaultXml,
      });

      const result = await service.getTaxpayer('20111111112');

      expect(result.error).toBe('Error interno no documentado');
      expect(result.hint).toBeUndefined();
    });

    /**
     * El `!response.ok` no desapareció: sigue existiendo el caso de un 500 que **no**
     * trae un sobre SOAP (el servicio realmente caído, una página de error del balanceador,
     * etc.). Ese caso ya tenía cobertura arriba ("llega cuando la respuesta no tiene
     * Body"), pero no con `ok: false` — se repite acá para dejar explícito que seguir
     * lanzando `PADRON_ERROR` en ese caso es intencional, no un olvido del fix de arriba.
     */
    it('un 500 sin sobre SOAP sigue lanzando PADRON_ERROR, no lo confunde con un fault', async () => {
      (callArcaApi as any).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '<html><body>Internal Server Error</body></html>',
      });

      try {
        await service.getTaxpayer('20111111112');
        expect.unreachable('getTaxpayer() debía lanzar');
      } catch (error) {
        expect(error).toBeInstanceOf(ArcaError);
        expect((error as ArcaError).code).toBe('PADRON_ERROR');
        expect((error as ArcaError).hint).toBeDefined();
      }
    });
  });

  /**
   * `dummy()`, agregado en v3.1.0 — manual A13, sección 3.1. Es el único de los cuatro
   * métodos del servicio que el manual exceptúa de autenticación (sección 2.2): por eso
   * cada test verifica también que `WsaaService.login()` no se llame, no sólo que el
   * parseo sea correcto.
   */
  describe('dummy()', () => {
    it('parsea appserver/authserver/dbserver en OK sin pedir token', async () => {
      const mockDummyXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:dummyResponse xmlns:ns2="http://a13.soap.ws.server.puc.sr/">
      <return>
        <appserver>OK</appserver>
        <authserver>OK</authserver>
        <dbserver>OK</dbserver>
      </return>
    </ns2:dummyResponse>
  </soap:Body>
</soap:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => mockDummyXml,
      });

      const status = await service.dummy();

      expect(status).toEqual({ appServer: 'OK', authServer: 'OK', dbServer: 'OK' });
      expect(WsaaService.prototype.login).not.toHaveBeenCalled();
    });

    it('propaga un ERROR puntual (ej. base de datos caída) sin lanzar', async () => {
      // Un componente caído no es un fault de negocio ni una respuesta inválida: el
      // manual lo documenta como un valor más del campo, no como un error del WS.
      const mockDummyXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:dummyResponse xmlns:ns2="http://a13.soap.ws.server.puc.sr/">
      <return>
        <appserver>OK</appserver>
        <authserver>OK</authserver>
        <dbserver>ERROR</dbserver>
      </return>
    </ns2:dummyResponse>
  </soap:Body>
</soap:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => mockDummyXml,
      });

      const status = await service.dummy();

      expect(status.dbServer).toBe('ERROR');
      expect(status.appServer).toBe('OK');
    });

    it('lanza PADRON_ERROR con hint si la respuesta no trae dummyResponse', async () => {
      (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => '<?xml version="1.0" encoding="UTF-8"?><algo>no es dummyResponse</algo>',
      });

      try {
        await service.dummy();
        expect.unreachable('dummy() debía lanzar');
      } catch (error) {
        expect(error).toBeInstanceOf(ArcaError);
        expect((error as ArcaError).code).toBe('PADRON_ERROR');
        expect((error as ArcaError).hint).toBe(ARCA_ERROR_HINTS.PADRON_ERROR);
      }
    });
  });

  /**
   * `getTaxpayerIdsByDocument()` (método SOAP getIdPersonaListByDocumento), agregado en
   * v3.1.0 — manual A13, sección 3.3. A diferencia de dummy(), sí requiere token/sign:
   * no está en la excepción de autenticación de la sección 2.2.
   */
  describe('getTaxpayerIdsByDocument()', () => {
    it('devuelve las claves asociadas cuando hay más de una', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:getIdPersonaListByDocumentoResponse xmlns:ns2="http://a13.soap.ws.server.puc.sr/">
      <idPersonaListReturn>
        <idPersona>23117096769</idPersona>
        <idPersona>27117096764</idPersona>
        <metadata>
          <fechaHora>2025-07-17T16:22:09.168-03:00</fechaHora>
          <servidor>host</servidor>
        </metadata>
      </idPersonaListReturn>
    </ns2:getIdPersonaListByDocumentoResponse>
  </soap:Body>
</soap:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => mockXml,
      });

      const result = await service.getTaxpayerIdsByDocument('11709676');

      expect(result.taxIds).toEqual([23117096769, 27117096764]);
      expect(result.error).toBeUndefined();
    });

    it('devuelve un array con una sola clave cuando el parser no lo arma como lista', async () => {
      // fast-xml-parser devuelve un objeto pelado, no un array de uno, cuando el tag se
      // repite una sola vez — el mismo caso que ya cubre toArray() para domicilio/impuesto.
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:getIdPersonaListByDocumentoResponse xmlns:ns2="http://a13.soap.ws.server.puc.sr/">
      <idPersonaListReturn>
        <idPersona>20111111112</idPersona>
      </idPersonaListReturn>
    </ns2:getIdPersonaListByDocumentoResponse>
  </soap:Body>
</soap:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => mockXml,
      });

      const result = await service.getTaxpayerIdsByDocument('11111111');

      expect(result.taxIds).toEqual([20111111112]);
    });

    it('devuelve un array vacío, no un error, cuando el documento no tiene claves asociadas', async () => {
      // El manual no documenta este caso con un ejemplo: es la interpretación más
      // razonable de "idPersonaListReturn sin idPersona", no un hecho verificado contra
      // ARCA real (ver la nota en TaxpayerIdsResponse.taxIds).
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:getIdPersonaListByDocumentoResponse xmlns:ns2="http://a13.soap.ws.server.puc.sr/">
      <idPersonaListReturn>
        <metadata>
          <fechaHora>2025-07-17T16:22:09.168-03:00</fechaHora>
        </metadata>
      </idPersonaListReturn>
    </ns2:getIdPersonaListByDocumentoResponse>
  </soap:Body>
</soap:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => mockXml,
      });

      const result = await service.getTaxpayerIdsByDocument('99999999');

      expect(result.taxIds).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('devuelve el hint cuando ARCA contesta un Fault reconocido (falta cuitRepresentada)', async () => {
      const mockFaultXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>soapenv:Server</faultcode>
      <faultstring>Debe enviar la CUIT representada</faultstring>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => mockFaultXml,
      });

      const result = await service.getTaxpayerIdsByDocument('11709676');

      expect(result.taxIds).toBeUndefined();
      expect(result.error).toBe('Debe enviar la CUIT representada');
      expect(result.hint).toBe(getArcaHint('PADRON_MISSING_CUIT_REPRESENTADA'));
    });

    /**
     * A diferencia del test de arriba (mensaje sacado del manual, sin provocar), este
     * `faultstring` es real: se confirmó contra homologación el 2026-10-02 pasándole a
     * `getTaxpayerIdsByDocument()` un documento con ceros a la izquierda. HTTP 500, SOAP
     * `Fault`, igual que el resto de A13 — y el manual no lo menciona en ningún lado.
     */
    it('devuelve el hint de PADRON_INVALID_DOCUMENT, confirmado contra ARCA real', async () => {
      const mockFaultXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>El número de documento consultado es inválido.</faultstring></soap:Fault></soap:Body></soap:Envelope>`;

      (callArcaApi as any).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => mockFaultXml,
      });

      const result = await service.getTaxpayerIdsByDocument('00000001');

      expect(result.taxIds).toBeUndefined();
      expect(result.error).toBe('El número de documento consultado es inválido.');
      expect(result.hint).toBe(getArcaHint('PADRON_INVALID_DOCUMENT'));
      expect(result.hint).toBeDefined();
    });

    it('lanza PADRON_ERROR con hint si la respuesta no trae ningún sobre reconocido', async () => {
      (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => '<?xml version="1.0" encoding="UTF-8"?><algo>no es un sobre SOAP</algo>',
      });

      try {
        await service.getTaxpayerIdsByDocument('11709676');
        expect.unreachable('getTaxpayerIdsByDocument() debía lanzar');
      } catch (error) {
        expect(error).toBeInstanceOf(ArcaError);
        expect((error as ArcaError).code).toBe('PADRON_ERROR');
        expect((error as ArcaError).hint).toBe(ARCA_ERROR_HINTS.PADRON_ERROR);
      }
    });
  });
});

