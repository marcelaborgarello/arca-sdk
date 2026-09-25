import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsfeService } from '../../src/services/wsfe';
import { CaeaService } from '../../src/services/caea';
import { callArcaApi } from '../../src/utils/network';
import { escapeXml } from '../../src/utils/xml';
import { ArcaRejectionError } from '../../src/types/common';
import {
  InvoiceType,
  BillingConcept,
  TaxIdType,
  VatCondition,
  VALID_VAT_CONDITION_IDS,
} from '../../src/types/wsfe';

vi.mock('../../src/utils/network', () => ({
  callArcaApi: vi.fn(),
}));

/**
 * Tests del XML que el SDK *envía*, no del que recibe.
 *
 * El resto de la suite mockea `callArcaApi` y sólo mira la respuesta parseada, con lo
 * cual un request mal formado pasa desapercibido: se puede reordenar el comprobante
 * entero sin que se ponga un test en rojo. Estos tests miran el argumento que recibe
 * el mock.
 *
 * El orden importa de verdad: el esquema de ARCA es un `sequence`, no un `all`.
 */

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

const MOCK_LAST_INVOICE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECompUltimoAutorizadoResult><PtoVta>4</PtoVta><CbteTipo>3</CbteTipo><CbteNro>0</CbteNro></FECompUltimoAutorizadoResult>
    </FECompUltimoAutorizadoResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const MOCK_CAE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAESolicitarResult>
        <FeCabResp><Cuit>20123456789</Cuit><PtoVta>4</PtoVta><CbteTipo>3</CbteTipo><Resultado>A</Resultado></FeCabResp>
        <FeDetResp>
          <FECAEDetResponse>
            <CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta><CbteFch>20260925</CbteFch>
            <Resultado>A</Resultado><CAE>75157992335329</CAE><CAEFchVto>20261005</CAEFchVto>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const MOCK_REG_INFORMATIVO = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAEARegInformativoResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAEARegInformativoResult>
        <FeCabResp><Cuit>20123456789</Cuit><PtoVta>4</PtoVta><CbteTipo>1</CbteTipo><Resultado>A</Resultado></FeCabResp>
        <FeDetResp><FECAEDetResponse><CAEA>25157992335329</CAEA><Resultado>A</Resultado></FECAEDetResponse></FeDetResp>
      </FECAEARegInformativoResult>
    </FECAEARegInformativoResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

/**
 * Posición de la primera aparición de `<ar:TAG>` en el XML.
 * Se usa la primera porque algunos nombres se repiten dentro de estructuras anidadas
 * (`CbteFch` vuelve a aparecer dentro de `CbtesAsoc`), y el que interesa es el del
 * nivel del detalle, que siempre viene antes.
 */
function positionOf(xml: string, tag: string): number {
  const index = xml.indexOf(`<ar:${tag}>`);
  expect(index, `el request no contiene <ar:${tag}>`).toBeGreaterThan(-1);
  return index;
}

/** Afirma que los tags aparecen en el XML exactamente en el orden dado. */
function expectSequence(xml: string, tags: string[]): void {
  const positions = tags.map(tag => ({ tag, at: positionOf(xml, tag) }));

  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    expect(
      curr.at,
      `<ar:${curr.tag}> debe ir después de <ar:${prev.tag}> según el sequence del XSD`
    ).toBeGreaterThan(prev.at);
  }
}

describe('XML del request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('escapeXml', () => {
    it('escapa los cinco caracteres del estándar XML', () => {
      expect(escapeXml('Belgrano 123 & Cía')).toBe('Belgrano 123 &amp; Cía');
      expect(escapeXml('<script>')).toBe('&lt;script&gt;');
      expect(escapeXml(`comillas " y '`)).toBe('comillas &quot; y &apos;');
    });

    it('escapa el & primero, sin doble escape', () => {
      expect(escapeXml('a & b < c')).toBe('a &amp; b &lt; c');
      expect(escapeXml('&amp;')).toBe('&amp;amp;');
    });

    it('devuelve string vacío para undefined y null', () => {
      expect(escapeXml(undefined)).toBe('');
      expect(escapeXml(null)).toBe('');
    });

    it('acepta números', () => {
      expect(escapeXml(1010)).toBe('1010');
    });
  });

  describe('FECAESolicitar — orden del sequence', () => {
    // Manual del Desarrollador RG 4291 v4.7/v4.8, pág. 26 (FECAEDetRequest).
    it('emite los elementos del detalle en el orden del XSD', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);

      // Nota de Crédito A con concepto Servicios: es el caso que hace aparecer todos
      // los elementos opcionales a la vez (FchServ*, CbtesAsoc, Iva, Opcionales).
      await wsfe.issueCreditNoteA({
        items: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, vatRate: 21 }],
        buyer: {
          docType: TaxIdType.CUIT,
          docNumber: '20987654321',
          vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO,
        },
        associatedInvoices: [{
          type: InvoiceType.FACTURA_A,
          pointOfSale: 4,
          invoiceNumber: 99,
        }],
        concept: BillingConcept.SERVICES,
        optionals: [{ id: 1010, value: '1' }],
      });

      expectSequence(capturedXml, [
        'Concepto',
        'DocTipo',
        'DocNro',
        'CbteDesde',
        'CbteHasta',
        'CbteFch',
        'ImpTotal',
        'ImpTotConc',
        'ImpNeto',
        'ImpOpEx',
        'ImpTrib',
        'ImpIVA',
        'FchServDesde',
        'FchServHasta',
        'FchVtoPago',
        'MonId',
        'MonCotiz',
        'CondicionIVAReceptorId',
        'CbtesAsoc',
        'Iva',
        'Opcionales',
      ]);
    });

    // RG 5616 — obligatorio desde el 01/12/2026 (manual v4.8). Hasta esa fecha el campo
    // viaja poco, así que una posición equivocada pasa inadvertida; desde entonces va en
    // todos los requests.
    it('ubica CondicionIVAReceptorId después de MonCotiz, no junto a DocNro', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueInvoiceB({
        items: [{ description: 'Producto', quantity: 1, unitPrice: 100, vatRate: 21 }],
        buyer: {
          docType: TaxIdType.DNI,
          docNumber: '30111222',
          vatCondition: VatCondition.CONSUMIDOR_FINAL,
        },
      });

      expect(positionOf(capturedXml, 'CondicionIVAReceptorId'))
        .toBeGreaterThan(positionOf(capturedXml, 'MonCotiz'));
      expect(capturedXml).toContain('<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>');
    });

    it('omite CondicionIVAReceptorId cuando no se informa', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueInvoiceC({
        items: [{ description: 'Producto', quantity: 1, unitPrice: 100 }],
      });

      expect(capturedXml).not.toContain('CondicionIVAReceptorId');
    });

    it('escapa los valores de texto en Opcionales', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueInvoiceC({
        items: [{ description: 'Producto', quantity: 1, unitPrice: 100 }],
        optionals: [{ id: 17, value: 'Belgrano 123 & Cía <SA>' }],
      });

      expect(capturedXml).toContain('<ar:Valor>Belgrano 123 &amp; Cía &lt;SA&gt;</ar:Valor>');
      // El & crudo rompería el XML y ARCA rechazaría el request entero.
      expect(capturedXml).not.toContain('& Cía');
    });
  });

  // El catálogo de CondicionIVAReceptorId lo devuelve FEParamGetCondicionIvaReceptor y
  // está en la última página del manual. No es correlativo.
  describe('catálogo de CondicionIVAReceptorId (RG 5616)', () => {
    it('expone exactamente los códigos del catálogo de ARCA', () => {
      expect([...VALID_VAT_CONDITION_IDS].sort((a, b) => a - b))
        .toEqual([1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16]);
    });

    it('incluye los códigos que faltaban: 13, 15 y 16', () => {
      expect(VatCondition.MONOTRIBUTISTA_SOCIAL).toBe(13);
      expect(VatCondition.IVA_NO_ALCANZADO).toBe(15);
      expect(VatCondition.MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO).toBe(16);
    });

    it.each([
      ['IVA_RESPONSABLE_NO_INSCRIPTO', 2],
      ['IVA_NO_RESPONSABLE', 3],
      ['IVA_RESPONSABLE_INSCRIPTO_AGENTE_PERCEPCION', 11],
    ])('rechaza %s (%i), que no pertenece al catálogo', async (_nombre, codigo) => {
      const wsfe = new WsfeService(BASE_CONFIG);

      await expect(wsfe.issueInvoiceC({
        items: [{ description: 'Producto', quantity: 1, unitPrice: 100 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20111111112', vatCondition: codigo },
      })).rejects.toThrow('10242');

      // Falla antes de salir a la red: no se gasta el request.
      expect(callArcaApi).not.toHaveBeenCalled();
    });
  });

  // Manual v4.7 (01/09/2026): el codigo 10283 exige el tributo ID 13 en comprobantes B
  // con receptor No Categorizado. Antes de v1.5.0 el array no se construia nunca.
  describe('Tributos', () => {
    it('emite el array Tributos y suma los importes a ImpTrib y al total', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueInvoiceB({
        items: [{ description: 'Producto', quantity: 1, unitPrice: 1000, vatRate: 21 }],
        buyer: {
          docType: TaxIdType.CUIT,
          docNumber: '23000000000',
          vatCondition: VatCondition.SUJETO_NO_CATEGORIZADO,
        },
        taxes: [{
          id: 13,
          description: 'Percepción de IVA No Categorizado',
          taxBase: 1000,
          rate: 10.5,
          amount: 105,
        }],
      });

      expect(capturedXml).toContain('<ar:Id>13</ar:Id>');
      expect(capturedXml).toContain('<ar:Desc>Percepción de IVA No Categorizado</ar:Desc>');
      expect(capturedXml).toContain('<ar:ImpTrib>105.00</ar:ImpTrib>');
      // 1000 neto + 210 IVA + 105 de percepción
      expect(capturedXml).toContain('<ar:ImpTotal>1315.00</ar:ImpTotal>');
    });

    it('ubica Tributos entre CbtesAsoc e Iva', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueCreditNoteB({
        items: [{ description: 'Producto', quantity: 1, unitPrice: 1000, vatRate: 21 }],
        buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
        associatedInvoices: [{ type: InvoiceType.FACTURA_B, pointOfSale: 4, invoiceNumber: 1 }],
        taxes: [{ id: 2, taxBase: 1000, rate: 3, amount: 30 }],
      });

      expectSequence(capturedXml, ['CbtesAsoc', 'Tributos', 'Iva']);
    });

    it('mantiene ImpTrib en 0.00 cuando no hay tributos', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueInvoiceC({ items: [{ description: 'X', quantity: 1, unitPrice: 100 }] });

      expect(capturedXml).toContain('<ar:ImpTrib>0.00</ar:ImpTrib>');
      expect(capturedXml).not.toContain('<ar:Tributos>');
    });
  });

  // Campo CanMisMonExt y MonId/MonCotiz parametrizables (Manual v4.0, RG 5616).
  describe('moneda extranjera', () => {
    it('emite MonId, MonCotiz y CanMisMonExt en la posición del XSD', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueInvoiceA({
        items: [{ description: 'Export', quantity: 1, unitPrice: 100, vatRate: 21 }],
        buyer: {
          docType: TaxIdType.CUIT,
          docNumber: '20987654321',
          vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO,
        },
        currency: 'DOL',
        exchangeRate: 1450.5,
        payInSameForeignCurrency: true,
      });

      expect(capturedXml).toContain('<ar:MonId>DOL</ar:MonId>');
      expect(capturedXml).toContain('<ar:MonCotiz>1450.5</ar:MonCotiz>');
      expect(capturedXml).toContain('<ar:CanMisMonExt>S</ar:CanMisMonExt>');
      expectSequence(capturedXml, ['MonId', 'MonCotiz', 'CanMisMonExt', 'CondicionIVAReceptorId']);
    });

    it('usa PES y cotización 1 por defecto, sin emitir CanMisMonExt', async () => {
      let capturedXml = '';
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockImplementationOnce((_url: string, options: any) => {
          capturedXml = options.body;
          return Promise.resolve({ ok: true, text: async () => MOCK_CAE });
        });

      const wsfe = new WsfeService(BASE_CONFIG);
      await wsfe.issueInvoiceC({ items: [{ description: 'X', quantity: 1, unitPrice: 100 }] });

      expect(capturedXml).toContain('<ar:MonId>PES</ar:MonId>');
      expect(capturedXml).toContain('<ar:MonCotiz>1</ar:MonCotiz>');
      // Con moneda nacional el campo no debe informarse.
      expect(capturedXml).not.toContain('CanMisMonExt');
    });

    it('rechaza moneda extranjera sin cotización antes de salir a la red', async () => {
      const wsfe = new WsfeService(BASE_CONFIG);

      await expect(wsfe.issueInvoiceC({
        items: [{ description: 'X', quantity: 1, unitPrice: 100 }],
        currency: 'DOL',
        exchangeRate: 0,
      })).rejects.toThrow('cotización mayor a cero');

      expect(callArcaApi).not.toHaveBeenCalled();
    });
  });

  // Hasta v1.5.0 CaeaInvoice no tenía serviceDates y las tres fechas salían con la
  // fecha del comprobante.
  describe('CAEA — fechas de servicio', () => {
    it('respeta serviceDates en la rendición informativa', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((_url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO });
      });

      const caea = new CaeaService(BASE_CONFIG);
      await caea.reportCAEAPeriod({
        caea: '25157992335329',
        invoices: [{
          invoiceType: InvoiceType.FACTURA_C,
          concept: BillingConcept.SERVICES,
          invoiceNumber: 1,
          date: '2026-09-25',
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 100 }],
          serviceDates: {
            startDate: '2026-09-01',
            endDate: '2026-09-30',
            dueDate: '2026-10-10',
          },
        }],
      });

      expect(capturedXml).toContain('<ar:FchServDesde>20260901</ar:FchServDesde>');
      expect(capturedXml).toContain('<ar:FchServHasta>20260930</ar:FchServHasta>');
      expect(capturedXml).toContain('<ar:FchVtoPago>20261010</ar:FchVtoPago>');
    });
  });

  // Verificado contra homologación el 2026-09-25: ARCA devuelve Resultado 'R' con
  // CAE vacío. Hasta la v1.x el SDK lo devolvía como si fuera un resultado válido.
  describe('rechazo de ARCA (Resultado = R)', () => {
    const MOCK_RECHAZO = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAESolicitarResult>
        <FeCabResp><Cuit>20123456789</Cuit><PtoVta>4</PtoVta><CbteTipo>11</CbteTipo><Resultado>R</Resultado></FeCabResp>
        <FeDetResp>
          <FECAEDetResponse>
            <CbteDesde>11</CbteDesde><CbteHasta>11</CbteHasta><CbteFch>20260925</CbteFch>
            <Resultado>R</Resultado><CAE></CAE><CAEFchVto></CAEFchVto>
            <Observaciones>
              <Obs>
                <Code>10246</Code>
                <Msg>Campo Condicion Frente al IVA del receptor es obligatorio conforme a lo reglamentado por la Resolucion General Nro 5616.</Msg>
              </Obs>
            </Observaciones>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    function mockRechazo() {
      (callArcaApi as any)
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_LAST_INVOICE })
        .mockResolvedValueOnce({ ok: true, text: async () => MOCK_RECHAZO });
    }

    it('lanza ArcaRejectionError en vez de devolver un comprobante sin CAE', async () => {
      mockRechazo();
      const wsfe = new WsfeService(BASE_CONFIG);

      await expect(wsfe.issueInvoiceC({
        items: [{ description: 'X', quantity: 1, unitPrice: 100 }],
      })).rejects.toThrow(ArcaRejectionError);
    });

    it('expone las observaciones y el hint del motivo', async () => {
      mockRechazo();
      const wsfe = new WsfeService(BASE_CONFIG);

      try {
        await wsfe.issueInvoiceC({ items: [{ description: 'X', quantity: 1, unitPrice: 100 }] });
        expect.unreachable('debería haber lanzado');
      } catch (e) {
        const error = e as ArcaRejectionError;
        expect(error.code).toBe('REJECTED');
        expect(error.observations).toHaveLength(1);
        expect(error.observations[0]).toMatch(/Condicion Frente al IVA/);
        // El hint tiene que explicar qué hacer, no repetir el mensaje de ARCA.
        expect(error.hint).toMatch(/buyer\.vatCondition/);
      }
    });
  });

  describe('FECAEARegInformativo — orden del sequence', () => {
    // Manual del Desarrollador RG 4291 v4.7/v4.8, pág. 131-132 (FECAEADetRequest).
    it('emite los elementos del detalle en el orden del XSD', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((_url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO });
      });

      const caea = new CaeaService(BASE_CONFIG);
      await caea.reportCAEAPeriod({
        caea: '25157992335329',
        invoices: [{
          invoiceType: InvoiceType.NOTA_CREDITO_A,
          concept: BillingConcept.SERVICES,
          invoiceNumber: 150,
          date: '2026-09-25',
          generatedAt: new Date('2026-09-25T18:30:00Z'),
          buyer: {
            docType: TaxIdType.CUIT,
            docNumber: '20987654321',
            vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO,
          },
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, vatRate: 21 }],
          associatedInvoices: [{
            type: InvoiceType.FACTURA_A,
            pointOfSale: 4,
            invoiceNumber: 99,
          }],
          optionals: [{ id: 1010, value: '1' }],
        }],
      });

      // Ojo: acá los importes van ImpOpEx, ImpIVA, ImpTrib — al revés que en
      // FECAEDetRequest. El manual los declara distinto; no es una errata.
      expectSequence(capturedXml, [
        'Concepto',
        'DocTipo',
        'DocNro',
        'CbteDesde',
        'CbteHasta',
        'CbteFch',
        'ImpTotal',
        'ImpTotConc',
        'ImpNeto',
        'ImpOpEx',
        'ImpIVA',
        'ImpTrib',
        'FchServDesde',
        'FchServHasta',
        'FchVtoPago',
        'MonId',
        'MonCotiz',
        'CondicionIVAReceptorId',
        'CbtesAsoc',
        'Iva',
        'Opcionales',
        'CAEA',
        'CbteFchHsGen',
      ]);
    });

    // El XSD define FECAEADetRequest extendiendo FEDetRequest: CAEA y CbteFchHsGen
    // se agregan al final, después de PeriodoAsoc.
    it('ubica CAEA y CbteFchHsGen al final del detalle', async () => {
      let capturedXml = '';
      (callArcaApi as any).mockImplementationOnce((_url: string, options: any) => {
        capturedXml = options.body;
        return Promise.resolve({ ok: true, text: async () => MOCK_REG_INFORMATIVO });
      });

      const caea = new CaeaService(BASE_CONFIG);
      await caea.reportCAEAPeriod({
        caea: '25157992335329',
        invoices: [{
          invoiceType: InvoiceType.FACTURA_C,
          concept: BillingConcept.PRODUCTS,
          invoiceNumber: 1,
          date: '2026-09-25',
          items: [{ description: 'Producto', quantity: 1, unitPrice: 100 }],
        }],
      });

      const detail = capturedXml.slice(
        capturedXml.indexOf('<ar:FECAEADetRequest>'),
        capturedXml.indexOf('</ar:FECAEADetRequest>')
      );

      expect(positionOf(detail, 'CAEA')).toBeGreaterThan(positionOf(detail, 'MonCotiz'));
      expect(positionOf(detail, 'CbteFchHsGen')).toBeGreaterThan(positionOf(detail, 'CAEA'));
    });
  });
});
