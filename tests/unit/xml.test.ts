import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTRA, parseWsaaResponse, validateCUIT, parseObservations } from '../../src/utils/xml';
import { ArcaAuthError } from '../../src/types/common';

/**
 * `parseObservations` — el bloque `<Observaciones>` de una respuesta de ARCA.
 *
 * Vive en `utils/xml.ts` porque hasta la v3.0.0 estaba **copiado** en `wsfe.ts` y en
 * `caea.ts`, y las dos copias descartaban `Obs.Code`. Arreglar una sola habría dejado la
 * otra rota, que es lo que ya había pasado con `getVATCode`.
 */
describe('parseObservations', () => {
  it('conserva el código además del mensaje', () => {
    // Es el punto de todo el cambio: hasta la v3.0.0 se guardaba sólo el Msg, y como el
    // diccionario de hints se busca por código, ninguno llegaba por este canal.
    const det = { Observaciones: { Obs: { Code: 10019, Msg: 'Alicuota invalida' } } };

    expect(parseObservations(det)).toEqual([{ code: 10019, message: 'Alicuota invalida' }]);
  });

  it('trata una sola observación como lista de uno', () => {
    // `fast-xml-parser` devuelve objeto con una y array con varias. Tratar el objeto como
    // lista hace que se itere sobre sus propiedades: dos "observaciones" basura.
    const det = { Observaciones: { Obs: { Code: 10016, Msg: 'Uno solo' } } };

    expect(parseObservations(det)).toHaveLength(1);
  });

  it('devuelve todas cuando ARCA manda varias', () => {
    const det = {
      Observaciones: {
        Obs: [
          { Code: 10245, Msg: 'Resultará obligatorio' },
          { Code: 10016, Msg: 'CbteDesde' },
        ],
      },
    };

    const obs = parseObservations(det);

    expect(obs).toHaveLength(2);
    expect(obs.map(o => o.code)).toEqual([10245, 10016]);
  });

  it('devuelve lista vacía si no hay observaciones', () => {
    expect(parseObservations({ Resultado: 'A' })).toEqual([]);
    expect(parseObservations({ Observaciones: {} })).toEqual([]);
    expect(parseObservations(undefined)).toEqual([]);
  });

  it('no inventa un código cuando ARCA no lo manda', () => {
    // `Number(undefined)` es NaN, no 0. Un 0 se confundiría con un código real y
    // `getHintForObservations` iría a buscar el hint del código 0.
    const obs = parseObservations({ Observaciones: { Obs: { Msg: 'Sin código' } } });

    expect(obs[0].message).toBe('Sin código');
    expect(Number.isNaN(obs[0].code)).toBe(true);
  });
});

describe('buildTRA', () => {
  it('debe generar XML TRA válido', () => {
    const tra = buildTRA('wsfe', '20123456789');

    expect(tra).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(tra).toContain('<loginTicketRequest');
    expect(tra).toContain('version="1.0"');
    expect(tra).toContain('<service>wsfe</service>');
    expect(tra).toContain('<uniqueId>');
    expect(tra).toContain('<generationTime>');
    expect(tra).toContain('<expirationTime>');
  });

  it('debe incluir timestamps válidos', () => {
    const tra = buildTRA('wsfe', '20123456789');

    // Verificar formato ISO
    expect(tra).toMatch(/<generationTime>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(tra).toMatch(/<expirationTime>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // Los dos tests de arriba verifican el formato, no los valores: con el signo del
  // margen invertido siguen pasando, y ARCA rechazaría con el error 1005 ("el TRA ya
  // expiró antes de ser presentado").
  describe('márgenes de tiempo', () => {
    function extraerFechas(tra: string): { gen: Date; exp: Date } {
      const gen = tra.match(/<generationTime>([^<]+)<\/generationTime>/)?.[1];
      const exp = tra.match(/<expirationTime>([^<]+)<\/expirationTime>/)?.[1];
      if (!gen || !exp) throw new Error('El TRA no trae generationTime y expirationTime');
      return { gen: new Date(gen), exp: new Date(exp) };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // El margen hacia atrás cubre el desfasaje entre el reloj del servidor de quien
    // integra y el de ARCA: sin él, un reloj apenas adelantado manda un TRA "del
    // futuro" y WSAA lo rechaza.
    it('debe fechar el generationTime 10 minutos en el pasado', () => {
      const { gen } = extraerFechas(buildTRA('wsfe', '20123456789'));

      expect(gen.getTime()).toBe(Date.now() - 10 * 60 * 1000);
      expect(gen.getTime()).toBeLessThan(Date.now());
    });

    it('debe fechar el expirationTime 12 horas en el futuro', () => {
      const { exp } = extraerFechas(buildTRA('wsfe', '20123456789'));

      expect(exp.getTime()).toBe(Date.now() + 12 * 60 * 60 * 1000);
      expect(exp.getTime()).toBeGreaterThan(Date.now());
    });

    it('debe generar un TRA con la generación anterior a la expiración', () => {
      const { gen, exp } = extraerFechas(buildTRA('wsfe', '20123456789'));

      expect(gen.getTime()).toBeLessThan(exp.getTime());
    });

    it('debe usar el timestamp en segundos como uniqueId', () => {
      const tra = buildTRA('wsfe', '20123456789');

      const uniqueId = tra.match(/<uniqueId>(\d+)<\/uniqueId>/)?.[1];
      expect(uniqueId).toBe(String(Math.floor(Date.now() / 1000)));
    });
  });
});

describe('parseWsaaResponse', () => {
  it('debe parsear respuesta WSAA exitosa', () => {
    const validResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">
      <loginCmsReturn>&lt;?xml version="1.0" encoding="UTF-8" standalone="yes"?&gt;
&lt;loginTicketResponse version="1.0"&gt;
    &lt;header&gt;
        &lt;generationTime&gt;2025-02-20T10:00:00.000Z&lt;/generationTime&gt;
        &lt;expirationTime&gt;2025-02-20T22:00:00.000Z&lt;/expirationTime&gt;
    &lt;/header&gt;
    &lt;credentials&gt;
        &lt;token&gt;test-token-123&lt;/token&gt;
        &lt;sign&gt;test-sign-456&lt;/sign&gt;
    &lt;/credentials&gt;
&lt;/loginTicketResponse&gt;</loginCmsReturn>
    </loginCmsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

    const ticket = parseWsaaResponse(validResponse);

    expect(ticket.token).toBe('test-token-123');
    expect(ticket.sign).toBe('test-sign-456');
    expect(ticket.generationTime).toBeInstanceOf(Date);
    expect(ticket.expirationTime).toBeInstanceOf(Date);
  });

  it('debe detectar SOAP Fault y lanzar error descriptivo', () => {
    const faultResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>Certificado inválido</faultstring>
      <detail>El certificado no es válido para este CUIT</detail>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>`;

    expect(() => parseWsaaResponse(faultResponse))
      .toThrow(ArcaAuthError);

    try {
      parseWsaaResponse(faultResponse);
    } catch (error) {
      expect(error).toBeInstanceOf(ArcaAuthError);
      expect((error as ArcaAuthError).message).toContain('Certificado inválido');
    }
  });

  it('debe lanzar error si estructura es inválida', () => {
    const invalidResponse = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <invalid>structure</invalid>
</root>`;

    expect(() => parseWsaaResponse(invalidResponse))
      .toThrow(ArcaAuthError);
  });
});

describe('validateCUIT', () => {
  it('debe validar CUIT correcto', () => {
    expect(validateCUIT('20123456789')).toBe(true);
    expect(validateCUIT('27123456789')).toBe(true);
  });

  it('debe rechazar CUIT con formato incorrecto', () => {
    expect(validateCUIT('20-12345678-9')).toBe(false); // Con guiones
    expect(validateCUIT('2012345678')).toBe(false);     // 10 dígitos
    expect(validateCUIT('201234567890')).toBe(false);   // 12 dígitos
    expect(validateCUIT('abc12345678')).toBe(false);    // Letras
    expect(validateCUIT('')).toBe(false);               // Vacío
  });
});
