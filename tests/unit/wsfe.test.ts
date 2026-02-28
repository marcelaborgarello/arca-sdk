import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsfeService } from '../../src/services/wsfe';
import { callArcaApi } from '../../src/utils/network';
import { InvoiceType, BillingConcept, TaxIdType } from '../../src/types/wsfe';

vi.mock('../../src/utils/network', () => ({
  callArcaApi: vi.fn(),
}));

const MOCK_TICKET = {
  token: 'mock-token',
  sign: 'mock-sign',
  generationTime: new Date(),
  expirationTime: new Date(Date.now() + 3600000),
};

const BASE_CONFIG = {
  environment: 'homologacion' as const,
  cuit: '20123456789',
  ticket: MOCK_TICKET,
  pointOfSale: 4,
};

// Respuesta exitosa de FECompUltimoAutorizado (último nro = 0, próximo = 1)
const mockLastInvoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECompUltimoAutorizadoResult>
        <PtoVta>4</PtoVta>
        <CbteTipo>83</CbteTipo>
        <CbteNro>0</CbteNro>
      </FECompUltimoAutorizadoResult>
    </FECompUltimoAutorizadoResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

// Respuesta exitosa de FECAESolicitar
function buildMockCAEXml(type = 83): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAESolicitarResult>
        <FeCabResp>
          <Cuit>20123456789</Cuit>
          <PtoVta>4</PtoVta>
          <CbteTipo>${type}</CbteTipo>
          <FchProceso>20260220120000</FchProceso>
          <CantReg>1</CantReg>
          <Resultado>A</Resultado>
          <Reproceso>N</Reproceso>
        </FeCabResp>
        <FeDetResp>
          <FECAEDetResponse>
            <Concepto>1</Concepto>
            <DocTipo>99</DocTipo>
            <DocNro>0</DocNro>
            <CbteDesde>1</CbteDesde>
            <CbteHasta>1</CbteHasta>
            <CbteFch>20260220</CbteFch>
            <Resultado>A</Resultado>
            <CAE>75157992335329</CAE>
            <CAEFchVto>20260302</CAEFchVto>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function mockCalls(caeType = 83): void {
  (callArcaApi as any)
    .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
    .mockResolvedValueOnce({ ok: true, text: async () => buildMockCAEXml(caeType) });
}

describe('WsfeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor validation', () => {
    it('should throw if ticket is missing', () => {
      expect(() => new WsfeService({
        ...BASE_CONFIG,
        ticket: null as any,
      })).toThrow('Ticket WSAA requerido');
    });

    it('should throw if pointOfSale is invalid', () => {
      expect(() => new WsfeService({
        ...BASE_CONFIG,
        pointOfSale: 0,
      })).toThrow('Punto de venta inválido');
    });
  });

  describe('issueSimpleReceipt', () => {
    it('should issue a Ticket C with only a total amount', async () => {
      mockCalls(83);
      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueSimpleReceipt({ total: 1500 });

      expect(result.cae).toBe('75157992335329');
      expect(result.invoiceType).toBe(83);
      expect(result.invoiceNumber).toBe(1);
      expect(result.result).toBe('A');
      expect(result.qrUrl).toContain('afip.gob.ar/fe/qr');
      expect(callArcaApi).toHaveBeenCalledTimes(2);
    });
  });

  describe('issueReceipt', () => {
    it('should issue a Ticket C with items and return them in the response', async () => {
      mockCalls(83);
      const wsfe = new WsfeService(BASE_CONFIG);
      const items = [
        { description: 'Coca Cola', quantity: 2, unitPrice: 500 },
        { description: 'Pan lactal', quantity: 3, unitPrice: 250 },
      ];
      const result = await wsfe.issueReceipt({ items });

      expect(result.cae).toBeDefined();
      expect(result.items).toEqual(items);
      expect(result.items?.length).toBe(2);
    });
  });

  describe('issueInvoiceB', () => {
    it('should throw if items are missing vatRate', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);
      await expect(wsfe.issueInvoiceB({
        items: [{ description: 'Servicio', quantity: 1, unitPrice: 1000 }], // no vatRate
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
      })).rejects.toThrow('vatRate');
    });

    it('should issue a Factura B with VAT breakdown', async () => {
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockResolvedValueOnce({ ok: true, text: async () => buildMockCAEXml(6) });

      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueInvoiceB({
        items: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, vatRate: 21 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
      });

      expect(result.cae).toBeDefined();
      expect(result.vat).toBeDefined();
      expect(result.vat?.[0].rate).toBe(21);
    });
  });

  describe('issueReceiptA', () => {
    it('should issue a Recibo A with VAT breakdown', async () => {
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockResolvedValueOnce({ ok: true, text: async () => buildMockCAEXml(4) });

      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueReceiptA({
        items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 10000, vatRate: 21 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
      });

      expect(result.cae).toBeDefined();
      expect(result.invoiceType).toBe(4);
      expect(result.vat).toBeDefined();
      expect(result.vat?.[0].rate).toBe(21);
    });
  });

  describe('issueCreditNoteC', () => {
    it('should throw if associated invoices are missing', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);
      await expect(wsfe.issueCreditNoteC({
        items: [{ description: 'Anulación total', quantity: 1, unitPrice: 1000 }],
        associatedInvoices: [], // Empty
      })).rejects.toThrow('requieren al menos un comprobante asociado');
    });

    it('should issue a Nota de Credito C with associated invoices', async () => {
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockResolvedValueOnce({ ok: true, text: async () => buildMockCAEXml(13) });

      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueCreditNoteC({
        items: [{ description: 'Anulación total', quantity: 1, unitPrice: 1000 }],
        associatedInvoices: [{
          type: InvoiceType.FACTURA_C,
          pointOfSale: 4,
          invoiceNumber: 15,
        }],
      });

      expect(result.cae).toBeDefined();
      expect(result.invoiceType).toBe(13);
    });
  });

  describe('checkStatus (static)', () => {
    it('should return server status', async () => {
      const mockStatusXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FEDummyResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FEDummyResult>
        <AppServer>OK</AppServer>
        <DbServer>OK</DbServer>
        <AuthServer>OK</AuthServer>
      </FEDummyResult>
    </FEDummyResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

      (callArcaApi as any).mockResolvedValueOnce({
        ok: true,
        text: async () => mockStatusXml,
      });

      const status = await WsfeService.checkStatus('homologacion');
      expect(status.appServer).toBe('OK');
      expect(status.dbServer).toBe('OK');
      expect(status.authServer).toBe('OK');
    });
  });
});
