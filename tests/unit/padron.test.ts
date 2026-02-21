import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PadronService } from '../../src/services/padron';
import { callArcaApi } from '../../src/utils/network';
import { WsaaService } from '../../src/auth/wsaa';

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
    // Mock login to avoid crypto validation/signing issues in this test suite
    vi.spyOn(WsaaService.prototype, 'login').mockResolvedValue({
      token: 'mock-token',
      sign: 'mock-sign',
      generationTime: new Date(),
      expirationTime: new Date(Date.now() + 3600000)
    } as any);
  });

  it('should parse a successful getPersona response correctly', async () => {
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

    const result = await service.getPersona('20123456789');

    expect(result.persona).toBeDefined();
    expect(result.persona?.nombre).toBe('JUAN');
    expect(result.persona?.apellido).toBe('PEREZ');
    expect(result.persona?.esInscriptoIVA).toBe(true);
    expect(result.persona?.esMonotributista).toBe(false);
    expect(result.persona?.domicilio[0].direccion).toBe('CALLE FALSA 123');
  });

  it('should handle "CUIT no encontrado" response', async () => {
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

    const result = await service.getPersona('22222222222');
    expect(result.error).toBe('CUIT no encontrado');
  });
});
