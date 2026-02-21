import { describe, it, expect } from 'vitest';
import { buildTRA, parseWsaaResponse, validateCUIT } from '../../src/utils/xml';
import { ArcaAuthError } from '../../src/types/common';

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
