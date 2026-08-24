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

    // RG 5782 — Manual del Desarrollador RG 4291 v4.6 (vigente 01/08/2026)
    it('should always send CbteFchHsGen (String 14, yyyymmddhhmmss) in the detail', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO_RESPONSE });
      });

      const caeaService = new CaeaService(BASE_CONFIG);

      await caeaService.reportCAEAPeriod({
        caea: '25157992335329',
        invoices: [{
          invoiceType: InvoiceType.FACTURA_A,
          concept: BillingConcept.PRODUCTS,
          invoiceNumber: 150,
          // 2026-08-24 22:35:07 hora argentina, expresada en UTC
          date: new Date('2026-08-25T01:35:07Z'),
          generatedAt: new Date('2026-08-25T01:35:07Z'),
          items: [{ description: 'Test Item', quantity: 2, unitPrice: 500, vatRate: 21 }],
          buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        }],
      });

      expect(capturedXml).toContain('<ar:CbteFchHsGen>20260824223507</ar:CbteFchHsGen>');

      // El campo va inmediatamente después de CAEA, según el esquema del WSDL
      // (FECAEADetRequest extiende FEDetRequest y agrega CAEA + CbteFchHsGen).
      expect(capturedXml).toMatch(/<ar:CAEA>25157992335329<\/ar:CAEA>\s*<ar:CbteFchHsGen>/);

      const hsGen = capturedXml.match(/<ar:CbteFchHsGen>(\d+)<\/ar:CbteFchHsGen>/)?.[1];
      expect(hsGen).toHaveLength(14);
    });

    it('should keep CbteFch and CbteFchHsGen on the same Argentine day near midnight', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO_RESPONSE });
      });

      const caeaService = new CaeaService(BASE_CONFIG);

      // 23:30 del 24/08 en Argentina => 02:30 UTC del 25/08.
      // Antes, CbteFch salía como 20260825 (UTC) y contradecía a CbteFchHsGen.
      await caeaService.reportCAEAPeriod({
        caea: '25157992335329',
        invoices: [{
          invoiceType: InvoiceType.FACTURA_A,
          concept: BillingConcept.PRODUCTS,
          invoiceNumber: 151,
          date: new Date('2026-08-25T02:30:00Z'),
          generatedAt: new Date('2026-08-25T02:30:00Z'),
          items: [{ description: 'Test Item', quantity: 1, unitPrice: 100, vatRate: 21 }],
          buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        }],
      });

      expect(capturedXml).toContain('<ar:CbteFch>20260824</ar:CbteFch>');
      expect(capturedXml).toContain('<ar:CbteFchHsGen>20260824233000</ar:CbteFchHsGen>');
    });

    // Regresión: un string de fecha (o un Date a medianoche UTC) representa un día
    // calendario y debe usarse literal, sin desplazarse a UTC-3.
    it.each([
      ['string YYYY-MM-DD', '2026-08-24'],
      ['string YYYYMMDD', '20260824'],
      ['Date a medianoche UTC', new Date('2026-08-24')],
    ])('should treat a calendar date literally (%s)', async (_label, date) => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO_RESPONSE });
      });

      const caeaService = new CaeaService(BASE_CONFIG);

      await caeaService.reportCAEAPeriod({
        caea: '25157992335329',
        invoices: [{
          invoiceType: InvoiceType.FACTURA_A,
          concept: BillingConcept.PRODUCTS,
          invoiceNumber: 153,
          date: date as any,
          items: [{ description: 'Test Item', quantity: 1, unitPrice: 100, vatRate: 21 }],
          buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        }],
      });

      expect(capturedXml).toContain('<ar:CbteFch>20260824</ar:CbteFch>');
    });

    it('should fall back to the invoice date at 000000 when generatedAt is omitted', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO_RESPONSE });
      });

      const caeaService = new CaeaService(BASE_CONFIG);

      await caeaService.reportCAEAPeriod({
        caea: '25157992335329',
        invoices: [{
          invoiceType: InvoiceType.FACTURA_A,
          concept: BillingConcept.PRODUCTS,
          invoiceNumber: 152,
          date: new Date('2026-08-24T15:00:00Z'),
          items: [{ description: 'Test Item', quantity: 1, unitPrice: 100, vatRate: 21 }],
          buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        }],
      });

      // Sin generatedAt no se puede inventar la hora: se usa 000000.
      // Lo que sí debe cumplirse siempre es que la fecha coincida con CbteFch.
      expect(capturedXml).toContain('<ar:CbteFch>20260824</ar:CbteFch>');
      expect(capturedXml).toContain('<ar:CbteFchHsGen>20260824000000</ar:CbteFchHsGen>');
    });

    it('should always keep the date portion of CbteFchHsGen in sync with CbteFch', async () => {
      const cases = [
        { date: '2026-08-24', generatedAt: undefined },
        { date: new Date('2026-08-25T02:30:00Z'), generatedAt: new Date('2026-08-25T02:30:00Z') },
        { date: new Date('2026-08-24'), generatedAt: undefined },
      ];

      for (const c of cases) {
        let capturedXml = '';
        (callArcaApi as any).mockImplementationOnce((url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO_RESPONSE });
        });

        const caeaService = new CaeaService(BASE_CONFIG);
        await caeaService.reportCAEAPeriod({
          caea: '25157992335329',
          invoices: [{
            invoiceType: InvoiceType.FACTURA_A,
            concept: BillingConcept.PRODUCTS,
            invoiceNumber: 154,
            date: c.date as any,
            generatedAt: c.generatedAt as any,
            items: [{ description: 'Test Item', quantity: 1, unitPrice: 100, vatRate: 21 }],
            buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
          }],
        });

        const cbteFch = capturedXml.match(/<ar:CbteFch>(\d{8})<\/ar:CbteFch>/)?.[1];
        const hsGen = capturedXml.match(/<ar:CbteFchHsGen>(\d{14})<\/ar:CbteFchHsGen>/)?.[1];

        expect(hsGen?.slice(0, 8)).toBe(cbteFch);
      }
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
