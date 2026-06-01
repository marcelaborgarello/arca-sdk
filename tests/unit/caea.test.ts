import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaeaService } from '../../src/services/caea';
import { callArcaApi } from '../../src/utils/network';
import { InvoiceType, BillingConcept, TaxIdType } from '../../src/types/wsfe';

vi.mock('../../src/utils/network', () => ({
  callArcaApi: vi.fn(),
}));

const MOCK_TICKET = {
  token: 'mock-caea-token',
  sign: 'mock-caea-sign',
  generationTime: new Date(),
  expirationTime: new Date(Date.now() + 3600000),
};

const BASE_CONFIG = {
  environment: 'homologacion' as const,
  cuit: '20123456789',
  ticket: MOCK_TICKET,
  pointOfSale: 4,
};

// XML Responses
const MOCK_SOLICITAR_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAEASolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAEASolicitarResult>
        <ResultGet>
          <CAEA>25157992335329</CAEA>
          <Periodo>202606</Periodo>
          <Orden>1</Orden>
          <FchVto>20260615</FchVto>
          <FchVigDesde>20260601</FchVigDesde>
          <FchVigHasta>20260615</FchVigHasta>
          <FchTopeInf>20260620</FchTopeInf>
        </ResultGet>
      </FECAEASolicitarResult>
    </FECAEASolicitarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const MOCK_CONSULTAR_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAEAConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAEAConsultarResult>
        <ResultGet>
          <CAEA>25157992335329</CAEA>
          <Periodo>202606</Periodo>
          <Orden>1</Orden>
          <FchVto>20260615</FchVto>
          <FchVigDesde>20260601</FchVigDesde>
          <FchVigHasta>20260615</FchVigHasta>
          <FchTopeInf>20260620</FchTopeInf>
        </ResultGet>
      </FECAEAConsultarResult>
    </FECAEAConsultarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const MOCK_REG_INFORMATIVO_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAEARegInformativoResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAEARegInformativoResult>
        <FeCabResp>
          <Cuit>20123456789</Cuit>
          <PtoVta>4</PtoVta>
          <CbteTipo>1</CbteTipo>
          <Resultado>A</Resultado>
        </FeCabResp>
        <FeDetResp>
          <FECAEDetResponse>
            <CAEA>25157992335329</CAEA>
            <Resultado>A</Resultado>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAEARegInformativoResult>
    </FECAEARegInformativoResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const MOCK_SIN_MOVIMIENTO_INFORMAR_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAEASinMovimientoInformarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAEASinMovimientoInformarResult>
        <PtoVta>4</PtoVta>
        <CAEA>25157992335329</CAEA>
        <Resultado>A</Resultado>
      </FECAEASinMovimientoInformarResult>
    </FECAEASinMovimientoInformarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const MOCK_SIN_MOVIMIENTO_CONSULTAR_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAEASinMovimientoConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAEASinMovimientoConsultarResult>
        <ResultGet>
          <FECAEASinMov>
            <CAEA>25157992335329</CAEA>
            <PtoVta>4</PtoVta>
            <FchProceso>20260602120000</FchProceso>
          </FECAEASinMov>
        </ResultGet>
      </FECAEASinMovimientoConsultarResult>
    </FECAEASinMovimientoConsultarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

describe('CaeaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor validation', () => {
    it('should throw if ticket is missing', () => {
      expect(() => new CaeaService({
        ...BASE_CONFIG,
        ticket: null as any,
      })).toThrow('Ticket WSAA requerido');
    });

    it('should throw if pointOfSale is invalid', () => {
      expect(() => new CaeaService({
        ...BASE_CONFIG,
        pointOfSale: 0,
      })).toThrow('Punto de venta inválido');
    });
  });

  describe('solicitCAEA', () => {
    it('should request a new CAEA code', async () => {
      (callArcaApi as any).mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_SOLICITAR_RESPONSE,
      });

      const caeaService = new CaeaService(BASE_CONFIG);
      const result = await caeaService.solicitCAEA({ period: '202606', order: 1 });

      expect(result.caea).toBe('25157992335329');
      expect(result.period).toBe(202606);
      expect(result.order).toBe(1);
      expect(result.expiryDate).toBe('20260615');
      expect(result.limitDate).toBe('20260620');
      expect(callArcaApi).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCAEA', () => {
    it('should retrieve info for a specific CAEA code', async () => {
      (callArcaApi as any).mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_CONSULTAR_RESPONSE,
      });

      const caeaService = new CaeaService(BASE_CONFIG);
      const result = await caeaService.getCAEA('25157992335329');

      expect(result.caea).toBe('25157992335329');
      expect(result.expiryDate).toBe('20260615');
      expect(result.limitDate).toBe('20260620');
    });
  });

  describe('reportCAEAPeriod (FECAEARegInformativo)', () => {
    it('should report a batch of invoices emitted in contingency', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO_RESPONSE });
      });

      const caeaService = new CaeaService(BASE_CONFIG);
      const invoices = [{
        invoiceType: InvoiceType.FACTURA_A,
        concept: BillingConcept.PRODUCTS,
        invoiceNumber: 150,
        items: [{ description: 'Test Item', quantity: 2, unitPrice: 500, vatRate: 21 }],
        buyer: {
          docType: TaxIdType.CUIT,
          docNumber: '20987654321',
        }
      }];

      const result = await caeaService.reportCAEAPeriod({
        caea: '25157992335329',
        invoices,
      });

      expect(result.caea).toBe('25157992335329');
      expect(result.result).toBe('A');
      expect(capturedXml).toContain('<ar:FECAEARegInformativo>');
      expect(capturedXml).toContain('<ar:CAEA>25157992335329</ar:CAEA>');
      expect(capturedXml).toContain('<ar:ImpTotal>1210.00</ar:ImpTotal>');
    });

    it('should throw ArcaValidationError when invoices is empty', async () => {
      const caeaService = new CaeaService(BASE_CONFIG);
      await expect(caeaService.reportCAEAPeriod({
        caea: '25157992335329',
        invoices: [],
      })).rejects.toThrow('Debe proveer al menos un comprobante');
    });

    it('should throw ArcaValidationError when invoices have heterogeneous types', async () => {
      const caeaService = new CaeaService(BASE_CONFIG);
      const invoices = [
        {
          invoiceType: InvoiceType.FACTURA_A,
          concept: BillingConcept.PRODUCTS,
          invoiceNumber: 150,
          items: [{ description: 'Test Item', quantity: 2, unitPrice: 500 }],
        },
        {
          invoiceType: InvoiceType.FACTURA_B, // Different type
          concept: BillingConcept.PRODUCTS,
          invoiceNumber: 151,
          items: [{ description: 'Test Item 2', quantity: 1, unitPrice: 100 }],
        }
      ];

      await expect(caeaService.reportCAEAPeriod({
        caea: '25157992335329',
        invoices,
      })).rejects.toThrow('mismo tipo de factura');
    });
  });

  describe('reportCAEANoMovement', () => {
    it('should report that a CAEA had no operations in the fortnight', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_SIN_MOVIMIENTO_INFORMAR_RESPONSE });
      });

      const caeaService = new CaeaService(BASE_CONFIG);
      await caeaService.reportCAEANoMovement({ caea: '25157992335329' });

      expect(capturedXml).toContain('<ar:FECAEASinMovimientoInformar>');
      expect(capturedXml).toContain('<ar:Caea>25157992335329</ar:Caea>');
    });
  });

  describe('getCAEANoMovement', () => {
    it('should consult the no-movement declaration for a CAEA', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_SIN_MOVIMIENTO_CONSULTAR_RESPONSE });
      });

      const caeaService = new CaeaService(BASE_CONFIG);
      const result = await caeaService.getCAEANoMovement('25157992335329');

      expect(capturedXml).toContain('<ar:FECAEASinMovimientoConsultar>');
      expect(String(result.CAEA)).toBe('25157992335329');
    });
  });
});
