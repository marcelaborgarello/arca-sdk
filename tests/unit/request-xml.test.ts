import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsfeService } from '../../src/services/wsfe';
import { CaeaService } from '../../src/services/caea';
import { callArcaApi } from '../../src/utils/network';
import { escapeXml } from '../../src/utils/xml';
import { InvoiceType, BillingConcept, TaxIdType, VatCondition } from '../../src/types/wsfe';

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
