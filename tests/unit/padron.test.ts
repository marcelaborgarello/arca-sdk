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
});
