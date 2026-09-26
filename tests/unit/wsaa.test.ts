import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsaaService } from '../../src/auth/wsaa';
import { callArcaApi } from '../../src/utils/network';
import { signCMS } from '../../src/utils/crypto';
import { ArcaAuthError } from '../../src/types/common';
import { ARCA_ERROR_HINTS } from '../../src/constants/errors';
import type { LoginTicket } from '../../src/types/wsaa';
import type { TokenStorage } from '../../src/auth/storage';

vi.mock('../../src/utils/network', () => ({
    callArcaApi: vi.fn(),
}));

// `signCMS` necesita un certificado y una clave de verdad; las validaciones del
// constructor se conforman con el encabezado PEM. Se mockea sólo la firma y se deja
// pasar el resto del módulo, así el constructor sigue validando como en producción.
vi.mock('../../src/utils/crypto', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../src/utils/crypto')>()),
    signCMS: vi.fn(() => 'BASE64-CMS-FIRMADO'),
}));

const BASE_CONFIG = {
    environment: 'homologacion' as const,
    cuit: '20123456789',
    cert: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
    key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    service: 'wsfe',
};

/**
 * Respuesta de `loginCms`: el ticket real viaja como XML escapado dentro de
 * `loginCmsReturn`, o sea que hay dos niveles de parseo. El token se parametriza
 * para poder distinguir de qué fuente salió el ticket que devolvió `login()`.
 */
function buildLoginResponseXml(token = 'token-de-red', hoursValid = 12): string {
    const now = new Date();
    const exp = new Date(now.getTime() + hoursValid * 60 * 60 * 1000);

    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">
      <loginCmsReturn>&lt;?xml version="1.0" encoding="UTF-8" standalone="yes"?&gt;
&lt;loginTicketResponse version="1.0"&gt;
    &lt;header&gt;
        &lt;generationTime&gt;${now.toISOString()}&lt;/generationTime&gt;
        &lt;expirationTime&gt;${exp.toISOString()}&lt;/expirationTime&gt;
    &lt;/header&gt;
    &lt;credentials&gt;
        &lt;token&gt;${token}&lt;/token&gt;
        &lt;sign&gt;sign-de-red&lt;/sign&gt;
    &lt;/credentials&gt;
&lt;/loginTicketResponse&gt;</loginCmsReturn>
    </loginCmsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** WSAA contesta los errores con HTTP 500 y un SOAP Fault, sin código de error. */
function buildFaultXml(faultstring: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>ns1:cms.sign.invalid</faultcode>
      <faultstring>${faultstring}</faultstring>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function mockNetworkOk(token = 'token-de-red'): void {
    (callArcaApi as any).mockResolvedValue({
        ok: true,
        text: async () => buildLoginResponseXml(token),
    });
}

function mockNetworkFault(faultstring: string): void {
    (callArcaApi as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => buildFaultXml(faultstring),
    });
}

/** Ticket que vence dentro de `minutes` minutos, para probar el margen de 5 min. */
function ticketExpiringIn(minutes: number, token = 'token-de-storage'): LoginTicket {
    return {
        token,
        sign: 'sign-de-storage',
        generationTime: new Date(Date.now() - 60 * 60 * 1000),
        expirationTime: new Date(Date.now() + minutes * 60 * 1000),
    };
}

function fakeStorage(overrides: Partial<TokenStorage> = {}): TokenStorage {
    return {
        get: vi.fn(async () => null),
        save: vi.fn(async () => { }),
        ...overrides,
    };
}

describe('WsaaService.login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // El orden memoria → storage → red es lo más caro de romper de todo el SDK: un
    // pedido de TA de más deja al CUIT bloqueado 12 h ("el CEE ya posee un TA valido"),
    // y no es un error que se arregle reintentando.
    describe('prioridad memoria → storage → red', () => {
        it('debe devolver el ticket de memoria sin tocar el storage ni la red', async () => {
            mockNetworkOk('token-de-red');
            const storage = fakeStorage();
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            const primero = await wsaa.login();
            const segundo = await wsaa.login();

            expect(primero.token).toBe('token-de-red');
            expect(segundo.token).toBe('token-de-red');
            // Una sola ida a la red y una sola consulta al storage, las del primer login.
            expect(callArcaApi).toHaveBeenCalledTimes(1);
            expect(storage.get).toHaveBeenCalledTimes(1);
        });

        it('debe usar el ticket del storage sin salir a la red', async () => {
            mockNetworkOk('token-de-red');
            const storage = fakeStorage({
                get: vi.fn(async () => ticketExpiringIn(11 * 60)),
            });
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            const ticket = await wsaa.login();

            expect(ticket.token).toBe('token-de-storage');
            expect(storage.get).toHaveBeenCalledWith('20123456789', 'homologacion');
            expect(callArcaApi).not.toHaveBeenCalled();
        });

        it('debe cachear en memoria el ticket que vino del storage', async () => {
            const storage = fakeStorage({
                get: vi.fn(async () => ticketExpiringIn(11 * 60)),
            });
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            await wsaa.login();
            await wsaa.login();

            expect(storage.get).toHaveBeenCalledTimes(1);
        });

        it('debe pedir un ticket nuevo si no hay ni memoria ni storage', async () => {
            mockNetworkOk('token-de-red');
            const wsaa = new WsaaService(BASE_CONFIG);

            const ticket = await wsaa.login();

            expect(ticket.token).toBe('token-de-red');
            expect(ticket.sign).toBe('sign-de-red');
            expect(ticket.expirationTime).toBeInstanceOf(Date);
            expect(callArcaApi).toHaveBeenCalledTimes(1);
        });

        it('debe persistir en el storage el ticket recién pedido', async () => {
            mockNetworkOk('token-de-red');
            const storage = fakeStorage();
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            const ticket = await wsaa.login();

            expect(storage.save).toHaveBeenCalledWith('20123456789', 'homologacion', ticket);
        });

        // El margen de 5 minutos existe para no usar un ticket que va a vencer en medio
        // de la operación. Sin este test, invertir la comparación no pone nada en rojo.
        it('debe ignorar el ticket del storage si vence dentro del margen de 5 minutos', async () => {
            mockNetworkOk('token-de-red');
            const storage = fakeStorage({
                get: vi.fn(async () => ticketExpiringIn(2)),
            });
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            const ticket = await wsaa.login();

            expect(ticket.token).toBe('token-de-red');
            expect(callArcaApi).toHaveBeenCalledTimes(1);
        });

        it('debe ignorar el ticket del storage si ya está vencido', async () => {
            mockNetworkOk('token-de-red');
            const storage = fakeStorage({
                get: vi.fn(async () => ticketExpiringIn(-60)),
            });
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            const ticket = await wsaa.login();

            expect(ticket.token).toBe('token-de-red');
            expect(callArcaApi).toHaveBeenCalledTimes(1);
        });

        it('debe salir a la red si el storage no tiene nada guardado', async () => {
            mockNetworkOk('token-de-red');
            const storage = fakeStorage({ get: vi.fn(async () => null) });
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            const ticket = await wsaa.login();

            expect(ticket.token).toBe('token-de-red');
            expect(callArcaApi).toHaveBeenCalledTimes(1);
        });
    });

    // Un storage roto (archivo corrupto, disco lleno, Redis caído) no puede dejar sin
    // facturar: es un cache, no la fuente de verdad. Avisa por consola y sigue.
    describe('tolerancia a fallas del TokenStorage', () => {
        it('debe seguir con el login si storage.get lanza', async () => {
            mockNetworkOk('token-de-red');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            const storage = fakeStorage({
                get: vi.fn(async () => { throw new Error('archivo corrupto'); }),
            });
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            const ticket = await wsaa.login();

            expect(ticket.token).toBe('token-de-red');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('TokenStorage.get falló'),
                expect.anything()
            );
            warnSpy.mockRestore();
        });

        it('debe devolver el ticket igual si storage.save lanza', async () => {
            mockNetworkOk('token-de-red');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            const storage = fakeStorage({
                save: vi.fn(async () => { throw new Error('disco lleno'); }),
            });
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            const ticket = await wsaa.login();

            expect(ticket.token).toBe('token-de-red');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('TokenStorage.save falló'),
                expect.anything()
            );
            warnSpy.mockRestore();
        });

        it('debe cachear en memoria aunque el storage falle al guardar', async () => {
            mockNetworkOk('token-de-red');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            const storage = fakeStorage({
                save: vi.fn(async () => { throw new Error('disco lleno'); }),
            });
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            await wsaa.login();
            await wsaa.login();

            expect(callArcaApi).toHaveBeenCalledTimes(1);
            warnSpy.mockRestore();
        });
    });

    describe('errores de WSAA', () => {
        // El faultstring no trae código de error, así que el hint se decide por texto.
        it('debe agregar el hint de TA vigente ante "ya posee un TA valido"', async () => {
            mockNetworkFault('El CEE ya posee un TA valido para el acceso al WSN solicitado');
            const wsaa = new WsaaService(BASE_CONFIG);

            await expect(wsaa.login()).rejects.toThrow(ArcaAuthError);

            try {
                await wsaa.login();
                expect.unreachable('login() debía lanzar');
            } catch (error) {
                expect(error).toBeInstanceOf(ArcaAuthError);
                expect((error as ArcaAuthError).hint).toBe(ARCA_ERROR_HINTS.ALREADY_HAS_TA);
            }
        });

        // ARCA escribe "valido" sin tilde, pero es prosa de un faultstring, no un código:
        // puede corregirse en cualquier deploy. Si el hint dependiera de la ortografía,
        // desaparecería en silencio y el usuario se quedaría sin saber por qué está
        // bloqueado 12 h.
        it('debe agregar el hint también si ARCA escribe "válido" con tilde', async () => {
            mockNetworkFault('El CEE ya posee un TA válido para el acceso al WSN solicitado');
            const wsaa = new WsaaService(BASE_CONFIG);

            try {
                await wsaa.login();
                expect.unreachable('login() debía lanzar');
            } catch (error) {
                expect((error as ArcaAuthError).hint).toBe(ARCA_ERROR_HINTS.ALREADY_HAS_TA);
            }
        });

        it('debe usar el faultstring de ARCA como mensaje de error', async () => {
            mockNetworkFault('El certificado no esta vigente');
            const wsaa = new WsaaService(BASE_CONFIG);

            try {
                await wsaa.login();
                expect.unreachable('login() debía lanzar');
            } catch (error) {
                expect((error as Error).message).toContain('El certificado no esta vigente');
                // Sólo el TA vigente tiene hint; los demás faults no deben inventar uno.
                expect((error as ArcaAuthError).hint).toBeUndefined();
            }
        });

        it('debe lanzar con el status HTTP si la respuesta no es XML parseable', async () => {
            (callArcaApi as any).mockResolvedValue({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
                text: async () => '<html><body>Servicio no disponible</body></html>',
            });
            const wsaa = new WsaaService(BASE_CONFIG);

            try {
                await wsaa.login();
                expect.unreachable('login() debía lanzar');
            } catch (error) {
                expect(error).toBeInstanceOf(ArcaAuthError);
                expect((error as Error).message).toContain('503');
                expect((error as ArcaAuthError).hint).toBeUndefined();
            }
        });

        // El certificado y la clave los pasa quien integra: una clave que no
        // corresponde al certificado, o un PEM con el encabezado correcto y el cuerpo
        // roto, falla acá y no en la red. Tiene que quedar claro que el problema es la
        // firma local y no ARCA.
        it('debe lanzar un error de firma si el certificado no sirve para firmar', async () => {
            (signCMS as any).mockImplementationOnce(() => {
                throw new Error('error:0909006C:PEM routines:get_name:no start line');
            });
            const wsaa = new WsaaService(BASE_CONFIG);

            try {
                await wsaa.login();
                expect.unreachable('login() debía lanzar');
            } catch (error) {
                expect(error).toBeInstanceOf(ArcaAuthError);
                expect((error as Error).message).toContain('Error al firmar TRA');
                // No llegó a salir a la red: el error es local.
                expect(callArcaApi).not.toHaveBeenCalled();
            }
        });

        it('no debe cachear nada si el login falla', async () => {
            mockNetworkFault('El certificado no esta vigente');
            const storage = fakeStorage();
            const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

            await expect(wsaa.login()).rejects.toThrow(ArcaAuthError);
            await expect(wsaa.login()).rejects.toThrow(ArcaAuthError);

            // Si un login fallido dejara basura en memoria, el segundo intento no
            // reintentaría y el error quedaría pegado hasta reiniciar el proceso.
            expect(callArcaApi).toHaveBeenCalledTimes(2);
            expect(storage.save).not.toHaveBeenCalled();
        });
    });

    describe('request SOAP', () => {
        it('debe mandar el CMS firmado al endpoint de homologación', async () => {
            mockNetworkOk();
            const wsaa = new WsaaService(BASE_CONFIG);

            await wsaa.login();

            const [url, options] = (callArcaApi as any).mock.calls[0];
            expect(url).toContain('wsaahomo.afip.gov.ar');
            expect(options.method).toBe('POST');
            expect(options.headers['Content-Type']).toContain('text/xml');
            expect(options.body).toContain('<wsaa:loginCms>');
            expect(options.body).toContain('<wsaa:in0>BASE64-CMS-FIRMADO</wsaa:in0>');
        });

        it('debe apuntar al endpoint de producción cuando el environment es producción', async () => {
            mockNetworkOk();
            const wsaa = new WsaaService({ ...BASE_CONFIG, environment: 'produccion' });

            await wsaa.login();

            const [url] = (callArcaApi as any).mock.calls[0];
            expect(url).toContain('wsaa.arca.gob.ar');
            expect(url).not.toContain('homo');
        });
    });
});

describe('WsaaService.clearCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('debe forzar un login nuevo después de limpiar el cache', async () => {
        mockNetworkOk('token-de-red');
        const wsaa = new WsaaService(BASE_CONFIG);

        await wsaa.login();
        expect(callArcaApi).toHaveBeenCalledTimes(1);

        wsaa.clearCache();
        await wsaa.login();

        expect(callArcaApi).toHaveBeenCalledTimes(2);
    });

    // Sólo limpia la memoria: el storage es de quien lo pasó, y borrarlo por debajo
    // haría que el proceso vuelva a pedir un TA y quede bloqueado 12 h.
    it('no debe borrar el ticket del storage', async () => {
        mockNetworkOk('token-de-red');
        const storage = fakeStorage({
            get: vi.fn(async () => ticketExpiringIn(11 * 60)),
        });
        const wsaa = new WsaaService({ ...BASE_CONFIG, storage });

        await wsaa.login();
        wsaa.clearCache();
        const ticket = await wsaa.login();

        expect(ticket.token).toBe('token-de-storage');
        expect(callArcaApi).not.toHaveBeenCalled();
    });

    it('debe poder llamarse sin haber hecho login', () => {
        const wsaa = new WsaaService(BASE_CONFIG);

        expect(() => wsaa.clearCache()).not.toThrow();
    });
});
