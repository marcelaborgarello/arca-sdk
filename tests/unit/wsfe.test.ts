import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsfeService } from '../../src/services/wsfe';
import { callArcaApi } from '../../src/utils/network';
import { InvoiceType, BillingConcept, TaxIdType, VatCondition, VAT_RATE_CODES, listVatRates } from '../../src/types/wsfe';
import type { AssociatedInvoice } from '../../src/types/wsfe';
import { ArcaError, ArcaValidationError } from '../../src/types/common';
import { ARCA_ERROR_HINTS } from '../../src/constants/errors';

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
        <CbteTipo>11</CbteTipo>
        <CbteNro>0</CbteNro>
      </FECompUltimoAutorizadoResult>
    </FECompUltimoAutorizadoResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

// Respuesta exitosa de FECAESolicitar. Default 11 = Factura C (hasta la v3.0.0 era 83,
// Tique C, un comprobante que ARCA no acepta: los fixtures describían un mundo imposible).
function buildMockCAEXml(type = 11): string {
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

/**
 * Emite y devuelve el error, tipado. Un `.catch()` suelto da la unión con `CAEResponse` y
 * TypeScript no deja leerle `.details`.
 */
async function capturarError(emitir: () => Promise<unknown>): Promise<ArcaValidationError> {
  try {
    await emitir();
  } catch (e) {
    return e as ArcaValidationError;
  }
  throw new Error('Se esperaba un ArcaValidationError y la emisión no lanzó');
}

function mockCalls(caeType = 11): void {
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

  // Los tests de `issueSimpleReceipt` e `issueReceipt` se borraron con los métodos en la
  // v3.0.0. Emitían Tique C (83), que ARCA no lista en FEParamGetTiposCbte y rechaza con
  // el error 11001: el fixture describía un CAE aprobado para un comprobante imposible.
  // La cobertura de "emitir a consumidor final sin identificar" quedó en `issueInvoiceC`.

  describe('issueInvoiceC a consumidor final sin identificar', () => {
    it('emite con buyer por defecto y devuelve CAE, número y QR', async () => {
      mockCalls(11);
      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueInvoiceC({
        items: [{ description: 'Producto', quantity: 1, unitPrice: 1500 }],
      });

      expect(result.cae).toBe('75157992335329');
      expect(result.invoiceType).toBe(11);
      expect(result.invoiceNumber).toBe(1);
      expect(result.result).toBe('A');
      expect(result.qrUrl).toContain('arca.gob.ar/fe/qr');
      expect(callArcaApi).toHaveBeenCalledTimes(2);
    });

    it('devuelve los items en la respuesta', async () => {
      mockCalls(11);
      const wsfe = new WsfeService(BASE_CONFIG);
      const items = [
        { description: 'Coca Cola', quantity: 2, unitPrice: 500 },
        { description: 'Pan lactal', quantity: 3, unitPrice: 250 },
      ];
      const result = await wsfe.issueInvoiceC({ items });

      // Hasta la v3.0.0 esto sólo se probaba a través de issueReceipt(), que agregaba
      // `items` a mano sobre la respuesta. Era redundante: issueDocument() ya los pone.
      expect(result.items).toEqual(items);
      expect(result.items?.length).toBe(2);
    });
  });

  /**
   * El atajo `total`, que reemplaza la comodidad de `issueSimpleReceipt({ total })`.
   *
   * Esa parte del método viejo estaba bien: una venta de mostrador no siempre se detalla.
   * Lo que estaba mal era que emitía Tique C (83), un comprobante que ARCA no acepta por
   * wsfev1. Acá el mismo atajo emite Factura C y se llama Factura C.
   */
  describe('issueInvoiceC con `total` en vez de `items`', () => {
    it('emite por el monto informado, sin detallar', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => buildMockCAEXml(11) });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueInvoiceC({ total: 1500 });

      expect(result.cae).toBe('75157992335329');
      expect(result.invoiceType).toBe(11);
      // El importe tiene que llegar al XML, no quedarse en el objeto.
      expect(capturedXml).toContain('<ar:ImpTotal>1500.00</ar:ImpTotal>');
    });

    it('asume consumidor final sin identificar si no se pasa buyer', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => buildMockCAEXml(11) });
        });

      await new WsfeService(BASE_CONFIG).issueInvoiceC({ total: 1500 });

      expect(capturedXml).toContain('<ar:DocTipo>99</ar:DocTipo>');
      expect(capturedXml).toContain('<ar:DocNro>0</ar:DocNro>');
    });

    it('sigue validando el tope de la RG 5866 con el atajo', async () => {
      // El camino de `total` no puede saltearse la validación del comprador: a partir de
      // $10.000.000 hay que identificarlo. Era el riesgo de agregar una segunda entrada.
      const wsfe = new WsfeService(BASE_CONFIG);

      await expect(
        wsfe.issueInvoiceC({ total: 10000000 })
      ).rejects.toThrow('es obligatorio identificar al comprador');
    });

    it('lanza si no se informa ni `items` ni `total`', async () => {
      // El tipo lo impide, pero al SDK lo consume también JavaScript sin tipos. Sin este
      // chequeo se emitiría un comprobante por $0 gastando un número real.
      const wsfe = new WsfeService(BASE_CONFIG);

      const error = await capturarError(() => (wsfe.issueInvoiceC as any)({}));

      expect(error).toBeInstanceOf(ArcaValidationError);
      expect(error.message).toMatch(/items.*total|total.*items/i);
      // Y no llegó a tocar la red.
      expect(callArcaApi).not.toHaveBeenCalled();
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

  describe('issueReceiptB', () => {
    it('should throw if items are missing vatRate', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);
      await expect(wsfe.issueReceiptB({
        items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 10000 }], // no vatRate
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
      })).rejects.toThrow('vatRate');
    });

    it('should issue a Recibo B with VAT breakdown', async () => {
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockResolvedValueOnce({ ok: true, text: async () => buildMockCAEXml(9) });

      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueReceiptB({
        items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 10000, vatRate: 21 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
      });

      expect(result.cae).toBeDefined();
      expect(result.invoiceType).toBe(9);
      expect(result.vat).toBeDefined();
      expect(result.vat?.[0].rate).toBe(21);
    });
  });

  describe('issueReceiptC', () => {
    it('should issue a Recibo C without VAT breakdown', async () => {
      mockCalls(15);
      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueReceiptC({
        items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 10000 }],
      });

      expect(result.cae).toBeDefined();
      expect(result.invoiceType).toBe(15);
      expect(result.vat).toBeUndefined();
    });

    it('asume consumidor final sin identificar si no se pasa buyer', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => buildMockCAEXml(15) });
        });

      await new WsfeService(BASE_CONFIG).issueReceiptC({
        items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 10000 }],
      });

      expect(capturedXml).toContain('<ar:DocTipo>99</ar:DocTipo>');
      expect(capturedXml).toContain('<ar:DocNro>0</ar:DocNro>');
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

  describe('issueDebitNoteA', () => {
    it('should throw if items are missing vatRate', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);
      await expect(wsfe.issueDebitNoteA({
        items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 500 }], // no vatRate
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        associatedInvoices: [{ type: InvoiceType.FACTURA_A, pointOfSale: 4, invoiceNumber: 10 }],
      })).rejects.toThrow('vatRate');
    });

    it('should throw if associated invoices are missing', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);
      await expect(wsfe.issueDebitNoteA({
        items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 500, vatRate: 21 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        associatedInvoices: [], // Empty
      })).rejects.toThrow('requieren al menos un comprobante asociado');
    });

    it('should issue a Nota de Débito A with VAT breakdown and associated invoice', async () => {
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockResolvedValueOnce({ ok: true, text: async () => buildMockCAEXml(2) });

      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueDebitNoteA({
        items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 500, vatRate: 21 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        associatedInvoices: [{ type: InvoiceType.FACTURA_A, pointOfSale: 4, invoiceNumber: 10 }],
      });

      expect(result.cae).toBeDefined();
      expect(result.invoiceType).toBe(2);
      expect(result.vat).toBeDefined();
      expect(result.vat?.[0].rate).toBe(21);
    });
  });

  describe('issueDebitNoteB', () => {
    it('should throw if items are missing vatRate', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);
      await expect(wsfe.issueDebitNoteB({
        items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 500 }], // no vatRate
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        associatedInvoices: [{ type: InvoiceType.FACTURA_B, pointOfSale: 4, invoiceNumber: 10 }],
      })).rejects.toThrow('vatRate');
    });

    it('should throw if associated invoices are missing', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);
      await expect(wsfe.issueDebitNoteB({
        items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 500, vatRate: 21 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        associatedInvoices: [], // Empty
      })).rejects.toThrow('requieren al menos un comprobante asociado');
    });

    it('should issue a Nota de Débito B with VAT breakdown and associated invoice', async () => {
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockResolvedValueOnce({ ok: true, text: async () => buildMockCAEXml(7) });

      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueDebitNoteB({
        items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 500, vatRate: 21 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        associatedInvoices: [{ type: InvoiceType.FACTURA_B, pointOfSale: 4, invoiceNumber: 10 }],
      });

      expect(result.cae).toBeDefined();
      expect(result.invoiceType).toBe(7);
      expect(result.vat).toBeDefined();
      expect(result.vat?.[0].rate).toBe(21);
    });
  });

  describe('issueDebitNoteC', () => {
    it('should throw if associated invoices are missing', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);
      await expect(wsfe.issueDebitNoteC({
        items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 500 }],
        associatedInvoices: [], // Empty
      })).rejects.toThrow('requieren al menos un comprobante asociado');
    });

    it('should issue a Nota de Débito C with associated invoice', async () => {
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockResolvedValueOnce({ ok: true, text: async () => buildMockCAEXml(12) });

      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueDebitNoteC({
        items: [{ description: 'Interés por mora', quantity: 1, unitPrice: 500 }],
        associatedInvoices: [{ type: InvoiceType.FACTURA_C, pointOfSale: 4, invoiceNumber: 15 }],
      });

      expect(result.cae).toBeDefined();
      expect(result.invoiceType).toBe(12);
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

  describe('RG 5616 and Service Dates (CondicionIVAReceptorId & FchServDesde)', () => {
    it('should inject CondicionIVAReceptorId and service dates when concept is 2 and buyer has vat condition', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => mockLastInvoiceXml })
        .mockImplementationOnce((url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => buildMockCAEXml(11) });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      const testDate = new Date('2026-03-04T10:00:00Z');

      await wsfe.issueInvoiceC({
        concept: BillingConcept.SERVICES,
        date: testDate,
        items: [{ description: 'Test', quantity: 1, unitPrice: 1000 }],
        buyer: {
          docType: TaxIdType.CUIT,
          docNumber: '20111111112',
          // Consumidor Final: es la condición que el catálogo admite para clase C.
          // (Antes decía 2 "Monotributo" — el 2 no existe en el catálogo y Monotributo
          // es 6, que además sólo aplica a clase A.)
          vatCondition: VatCondition.CONSUMIDOR_FINAL,
        },
        serviceDates: {
          startDate: new Date('2026-03-01T10:00:00Z'),
          endDate: new Date('2026-03-31T10:00:00Z'),
          dueDate: new Date('2026-04-10T10:00:00Z'),
        }
      });

      expect(capturedXml).toContain('<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>');
      expect(capturedXml).toContain('<ar:FchServDesde>20260301</ar:FchServDesde>');
      expect(capturedXml).toContain('<ar:FchServHasta>20260331</ar:FchServHasta>');
      expect(capturedXml).toContain('<ar:FchVtoPago>20260410</ar:FchVtoPago>');
    });
  });

  describe('buyer identification validation (RG 5866/2026)', () => {
    it('should throw an ArcaValidationError when total is >= 10,000,000 and buyer is FINAL_CONSUMER/unidentified', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);

      // Con buyer omitido (que por defecto es consumidor final sin identificar)
      await expect(wsfe.issueInvoiceC({
        items: [{ description: 'Servicio', quantity: 1, unitPrice: 10000000 }],
      })).rejects.toThrow('es obligatorio identificar al comprador');

      // Con buyer explícitamente como FINAL_CONSUMER y número 0
      await expect(wsfe.issueInvoiceC({
        items: [{ description: 'Servicio', quantity: 1, unitPrice: 12000000 }],
        buyer: {
          docType: TaxIdType.FINAL_CONSUMER,
          docNumber: '0',
        }
      })).rejects.toThrow('es obligatorio identificar al comprador');
    });

    it('should NOT throw when total is < 10,000,000 and buyer is unidentified', async () => {
      mockCalls(11);
      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueInvoiceC({
        items: [{ description: 'Servicio', quantity: 1, unitPrice: 9999999.99 }],
      });
      expect(result.cae).toBeDefined();
    });

    it('should NOT throw when total is >= 10,000,000 but buyer is identified', async () => {
      mockCalls(11);
      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueInvoiceC({
        items: [{ description: 'Servicio premium', quantity: 1, unitPrice: 15000000 }],
        buyer: {
          docType: TaxIdType.DNI,
          docNumber: '20123456',
        }
      });
      expect(result.cae).toBeDefined();
    });
  });

  describe('getPointsOfSale', () => {
    function mockPtosVenta(inner: string): void {
      (callArcaApi as any).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FEParamGetPtosVentaResult>${inner}</FEParamGetPtosVentaResult>
    </FEParamGetPtosVentaResponse>
  </soapenv:Body>
</soapenv:Envelope>`,
      });
    }

    it('mapea los puntos de venta que informa ARCA', async () => {
      mockPtosVenta(`
        <ResultGet>
          <PtoVenta><Nro>1</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta>
          <PtoVenta><Nro>2</Nro><EmisionTipo>CAEA</EmisionTipo><Bloqueado>S</Bloqueado><FchBaja>20260101</FchBaja></PtoVenta>
        </ResultGet>`);

      const puntos = await new WsfeService(BASE_CONFIG).getPointsOfSale();

      expect(puntos).toHaveLength(2);
      expect(puntos[0]).toMatchObject({ number: 1, type: 'CAE', isBlocked: false });
      expect(puntos[1]).toMatchObject({ number: 2, type: 'CAEA', isBlocked: true, blockedSince: '20260101' });
    });

    // ARCA devuelve un solo elemento como objeto pelado, no como array de uno.
    it('normaliza la respuesta de un único punto de venta', async () => {
      mockPtosVenta(`
        <ResultGet>
          <PtoVenta><Nro>1</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado></PtoVenta>
        </ResultGet>`);

      const puntos = await new WsfeService(BASE_CONFIG).getPointsOfSale();

      expect(puntos).toHaveLength(1);
      expect(puntos[0].number).toBe(1);
    });

    // Verificado contra homologación el 2026-09-25: un CUIT sin puntos de venta
    // listados no recibe una lista vacía sino el error 602 "Sin Resultados". No tener
    // ninguno es un estado normal —ese CUIT igual emite en el PV 1—, así que el SDK lo
    // traduce a `[]` en vez de lanzar: distinguirlo de un certificado vencido no puede
    // depender de leer el texto del mensaje.
    it('devuelve [] cuando ARCA responde 602 Sin Resultados', async () => {
      mockPtosVenta('<Errors><Err><Code>602</Code><Msg>Sin Resultados: - Metodo FEParamGetPtosVenta</Msg></Err></Errors>');

      await expect(new WsfeService(BASE_CONFIG).getPointsOfSale()).resolves.toEqual([]);
    });

    // El 602 es la única excepción: cualquier otro error sigue lanzando.
    it('lanza ante un error de ARCA que no sea el 602', async () => {
      mockPtosVenta('<Errors><Err><Code>600</Code><Msg>Token invalido</Msg></Err></Errors>');

      await expect(new WsfeService(BASE_CONFIG).getPointsOfSale())
        .rejects.toThrow('Token invalido');
    });

    // Hasta la v3.0.0 éste era el **único** throw de `ArcaError` del SDK que no pasaba el
    // hint. Se nota justo acá: los códigos que ARCA devuelve en este método son el 10005 y
    // el 11002 —punto de venta no dado de alta, no habilitado en este WS—, o sea el error
    // de configuración más común de todos, y llegaba sin una sola pista.
    it('pasa el hint del código que devolvió ARCA', async () => {
      mockPtosVenta('<Errors><Err><Code>10005</Code><Msg>El punto de venta debe estar dado de alta</Msg></Err></Errors>');

      try {
        await new WsfeService(BASE_CONFIG).getPointsOfSale();
        expect.unreachable('getPointsOfSale() debía lanzar');
      } catch (error) {
        expect((error as ArcaError).hint).toBe(ARCA_ERROR_HINTS[10005]);
      }
    });

    it('no inventa un hint si el código no está en el diccionario', async () => {
      mockPtosVenta('<Errors><Err><Code>99999</Code><Msg>Algo raro</Msg></Err></Errors>');

      try {
        await new WsfeService(BASE_CONFIG).getPointsOfSale();
        expect.unreachable('getPointsOfSale() debía lanzar');
      } catch (error) {
        expect((error as ArcaError).hint).toBeUndefined();
      }
    });
  });
});

/**
 * Los valores de `InvoiceType` contra el catálogo de ARCA.
 *
 * Es un test de transcripción: un enum mal tipeado compila igual y el error recién
 * aparece cuando ARCA rechaza el comprobante. Los números salen de `FEParamGetTiposCbte`
 * consultado el 2026-09-27 (la fuente autoritativa según el manual), no del PDF.
 *
 * El guard real —que ARCA siga listando estos tipos— vive en `tests/integration/`:
 * esta suite mockea la red y no puede contradecir a ARCA.
 */
describe('InvoiceType — códigos de CbteTipo', () => {
  // RG 5762/2025: reemplazo de la Factura clase "M". ARCA los tiene vigentes desde el
  // 22/05/2015; la leyenda NO es un `optionals`, es una clase de comprobante.
  it('los cuatro "A con leyenda" son 51, 52, 53 y 54', () => {
    expect(InvoiceType.FACTURA_A_LEYENDA).toBe(51);
    expect(InvoiceType.NOTA_DEBITO_A_LEYENDA).toBe(52);
    expect(InvoiceType.NOTA_CREDITO_A_LEYENDA).toBe(53);
    expect(InvoiceType.RECIBO_A_LEYENDA).toBe(54);
  });

  it('son usables donde el SDK acepta un InvoiceType', () => {
    // No hay método público de emisión que reciba un tipo, así que estos dos son los
    // usos reales que habilita el enum. Si alguna vez se agrega uno genérico, este test
    // queda corto a propósito.
    const asociado: AssociatedInvoice = {
      type: InvoiceType.FACTURA_A_LEYENDA,
      pointOfSale: 4,
      invoiceNumber: 1234,
    };

    expect(asociado.type).toBe(51);
  });
});

/**
 * `TaxIdType.NATIONAL_POLICE_ID` y `TaxIdType.DNI` valen los dos **96**, y eso tiene una
 * consecuencia que no se ve leyendo el enum: el reverse-mapping de TypeScript guarda el
 * **último** miembro declarado, así que `TaxIdType[96]` es `'DNI'` y el otro nombre no se
 * recupera nunca a partir del número.
 *
 * El test fija cuál de los dos gana. Reordenar los miembros —algo que parece cosmético—
 * cambiaría en silencio lo que ve quien loguee o serialice `TaxIdType[docType]`.
 */
describe('TaxIdType — el 96 lo comparten dos nombres', () => {
  it('el reverse-mapping del 96 resuelve a DNI, no al alias', () => {
    expect(TaxIdType.NATIONAL_POLICE_ID).toBe(TaxIdType.DNI);
    expect(TaxIdType[96]).toBe('DNI');
  });
});

/**
 * Los dos hints de alícuota de `WsfeService`.
 *
 * Por qué existen estos tests: un hint no lo mira ni el compilador ni ningún otro test.
 * Hasta acá, el de `validateItemsWithVAT` nombraba **cuatro** alícuotas de las seis —el
 * SDK aceptaba el 5% y el 2,5% y en el mismo mensaje le decía al usuario que no
 * existían— y la suite estaba entera en verde. El camino de la alícuota inválida no
 * tenía ningún test.
 *
 * Ahora los dos textos se derivan de `VAT_RATE_CODES`. Esto verifica que sigan
 * derivados: si alguien vuelve a escribir la lista a mano y queda corta, se pone rojo.
 */
describe('WsfeService — los hints de alícuota de IVA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Alícuotas de `rates` que el texto no nombra como número suelto.
   *
   * Vive afuera de los tests a propósito, igual que en `errors.test.ts`: así se la
   * puede correr contra un texto **inventado** y comprobar que detecta lo que dice
   * detectar. Un chequeo debilitado por descuido quedaría verde para siempre y sería
   * indistinguible de uno que funciona.
   *
   * No reutiliza `listVatRates()` a propósito: si lo hiciera, estaría comparando la
   * función consigo misma y un error dentro de ella pasaría desapercibido.
   */
  function alicuotasNoNombradas(
    texto: string,
    rates: Readonly<Record<number, number>> = VAT_RATE_CODES,
  ): string[] {
    return Object.keys(rates)
      .filter(porcentaje => {
        // El número tiene que aparecer suelto. Dos trampas, las dos reales:
        //   - el "5" de "10.5" no es el 5%      → no puede venir precedido de dígito ni punto
        //   - el "27" de "27." SÍ es el 27%     → el punto final de una oración no es un decimal,
        //                                         así que sólo descarta si le sigue un dígito
        const suelto = new RegExp(`(^|[^\\d.])${porcentaje.replace('.', '\\.')}(?!\\d)(?!\\.\\d)`);
        return !suelto.test(texto);
      })
      // Orden numérico: `Object.keys` devuelve primero las claves enteras y después el
      // resto, con lo cual la lista de faltantes saldría en un orden difícil de leer.
      .sort((a, b) => Number(a) - Number(b));
  }

  describe('el chequeo se puede poner en rojo', () => {
    it('detecta las alícuotas que faltan', () => {
      // El texto que tenía el SDK hasta la v2.1.0.
      expect(alicuotasNoNombradas('Agregá vatRate a cada item (21, 10.5, 27, o 0)'))
        .toEqual(['2.5', '5']);
    });

    it('no se deja engañar por el 5 que vive adentro de 10.5', () => {
      expect(alicuotasNoNombradas('Vigentes: 0, 2.5, 10.5, 21, 27')).toEqual(['5']);
    });

    it('no marca faltantes cuando están las seis', () => {
      expect(alicuotasNoNombradas('Vigentes: 0, 2.5, 5, 10.5, 21 y 27.')).toEqual([]);
    });

    it('VAT_RATE_CODES tiene las seis alícuotas', () => {
      // Con el mapa vacío, `alicuotasNoNombradas` devolvería [] para cualquier texto y
      // los tests de abajo pasarían sin mirar nada.
      expect(Object.keys(VAT_RATE_CODES)).toHaveLength(6);
    });
  });

  describe('listVatRates()', () => {
    it('ordena de menor a mayor', () => {
      // `Object.keys` solo devuelve primero las claves enteras en orden ascendente y
      // después el resto: daría '0, 5, 21, 27, 2.5, 10.5'. El orden es explícito.
      expect(listVatRates()).toBe('0, 2.5, 5, 10.5, 21, 27');
    });
  });

  it('el hint de "falta vatRate" nombra las seis alícuotas', async () => {
    const wsfe = new WsfeService(BASE_CONFIG);

    const error = await capturarError(() => wsfe.issueInvoiceB({
      items: [{ description: 'Servicio', quantity: 1, unitPrice: 1000 }], // sin vatRate
      buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
    }));

    expect(error).toBeInstanceOf(ArcaValidationError);
    // El hint viaja en `details`, no en `.hint`: ArcaValidationError no se lo pasa al
    // constructor de ArcaError.
    const { hint } = error.details as { hint: string };
    expect(alicuotasNoNombradas(hint)).toEqual([]);
  });

  it('el hint de la alícuota inválida nombra las seis y manda al catálogo en vivo', async () => {
    mockCalls(6);
    const wsfe = new WsfeService(BASE_CONFIG);

    // 13% no es una alícuota de ARCA: `getVATCode` no la encuentra en VAT_RATE_CODES.
    const error = await capturarError(() => wsfe.issueInvoiceB({
      items: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, vatRate: 13 }],
      buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
    }));

    expect(error).toBeInstanceOf(ArcaValidationError);
    expect(error.message).toContain('13');

    const { hint, validRates } = error.details as { hint: string; validRates: number[] };
    expect(alicuotasNoNombradas(hint)).toEqual([]);
    // VAT_RATE_CODES es una copia local y se desactualiza en silencio; la fuente
    // autoritativa es FEParamGetTiposIva.
    expect(hint).toContain('getVatRates()');
    expect(validRates).toHaveLength(6);
  });
});
