import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsfeService } from '../../src/services/wsfe';
import { callArcaApi } from '../../src/utils/network';
import { InvoiceType, BillingConcept, TaxIdType, VatCondition, VAT_RATE_CODES, listVatRates } from '../../src/types/wsfe';
import type { AssociatedInvoice } from '../../src/types/wsfe';
import { ArcaValidationError } from '../../src/types/common';

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
      expect(result.qrUrl).toContain('arca.gob.ar/fe/qr');
      expect(callArcaApi).toHaveBeenCalledTimes(2);
    });

    // Deprecado: CbteTipo=83 lo rechaza ARCA (error 11001) desde un PtoVta
    // Web Services estándar. Ver CLAUDE.md, "Tique (81/82/83) vs. Factura".
    it('should warn that the method is deprecated', async () => {
      mockCalls(83);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueSimpleReceipt({ total: 1500 });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('issueSimpleReceipt() está deprecado'));
      warnSpy.mockRestore();
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

    // Deprecado: CbteTipo=83 lo rechaza ARCA (error 11001) desde un PtoVta
    // Web Services estándar. Ver CLAUDE.md, "Tique (81/82/83) vs. Factura".
    it('should warn that the method is deprecated', async () => {
      mockCalls(83);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueReceipt({ items: [{ description: 'Café', quantity: 1, unitPrice: 500 }] });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('issueReceipt() está deprecado'));
      warnSpy.mockRestore();
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
      await expect(wsfe.issueSimpleReceipt({
        total: 10000000,
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
      mockCalls(83);
      const wsfe = new WsfeService(BASE_CONFIG);
      const result = await wsfe.issueSimpleReceipt({
        total: 9999999.99,
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

  /** Emite y devuelve el error, tipado. `.catch()` suelto da la unión con `CAEResponse`. */
  async function capturarError(emitir: () => Promise<unknown>): Promise<ArcaValidationError> {
    try {
      await emitir();
    } catch (e) {
      return e as ArcaValidationError;
    }
    throw new Error('Se esperaba un ArcaValidationError y la emisión no lanzó');
  }

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
