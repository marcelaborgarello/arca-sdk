import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TokenStorage } from '../../src/auth/storage';
import type { LoginTicket } from '../../src/types/wsaa';

/**
 * Configuración de la suite de integración, leída del entorno.
 *
 * Es opt-in: sin `ARCA_TEST_CUIT`, `ARCA_TEST_CERT` y `ARCA_TEST_KEY` la suite se
 * saltea entera en vez de fallar. Así el repo sigue clonable y testeable por
 * cualquiera sin tener credenciales de homologación.
 */
export interface IntegrationConfig {
    cuit: string;
    cert: string;
    key: string;
    pointOfSale: number;
}

/** Ruta del cache de TA. Gitignorada. */
const TA_CACHE = process.env.ARCA_TEST_TA_CACHE ?? './.ta-cache.json';

/**
 * Devuelve la configuración si están las tres variables de entorno, o `null`.
 *
 * `ARCA_TEST_CERT` y `ARCA_TEST_KEY` son **rutas** a los PEM, no su contenido: así
 * no hay riesgo de que una clave privada quede en el historial de la shell ni en
 * los logs de un CI.
 */
export function getIntegrationConfig(): IntegrationConfig | null {
    const cuit = process.env.ARCA_TEST_CUIT;
    const certPath = process.env.ARCA_TEST_CERT;
    const keyPath = process.env.ARCA_TEST_KEY;

    if (!cuit || !certPath || !keyPath) return null;
    if (!existsSync(certPath) || !existsSync(keyPath)) {
        throw new Error(
            `No se encuentra el certificado o la clave: ${certPath} / ${keyPath}. ` +
            'ARCA_TEST_CERT y ARCA_TEST_KEY son rutas a los archivos PEM.'
        );
    }

    return {
        cuit,
        cert: readFileSync(certPath, 'utf-8'),
        key: readFileSync(keyPath, 'utf-8'),
        pointOfSale: Number(process.env.ARCA_TEST_PTO_VTA ?? 1),
    };
}

/**
 * Persistencia de TA en un archivo local.
 *
 * Teniendo un TA vigente, ARCA **se niega a emitir otro** durante un lapso preventivo:
 * sin esto, la segunda corrida de la suite se come el fault "El CEE ya posee un TA
 * valido para el acceso al WSN solicitado".
 *
 * Ese lapso son **10 minutos en homologación** (2 en producción) según el manual de
 * WSAA cap. 10.6, medido el 2026-09-26 contra homologación real: se liberó entre los
 * 9m32s y los 10m32s. **No son las 12 h que dura el TA** — eso es su vigencia, y es
 * otra cosa. El manual avisa que el valor puede cambiar sin previo aviso.
 *
 * Es también el patrón que cualquier consumidor del SDK necesita en producción.
 *
 * **Un solo archivo para los dos servicios.** Hasta la v3.1.0 `wsfe` y `ws_sr_padron_a13`
 * necesitaban cada uno su propio archivo de cache, porque `TokenStorage.get/save` no
 * recibían `service` y un único archivo no podía distinguir el TA de uno del otro para el
 * mismo CUIT — mezclarlos daba el fault *"Token recibido es para el servicio [wsfe],
 * deberia ser para servicio [ws_sr_padron_a13]"* (visto a mano el 2026-10-01). Con
 * `service` ya en la clave, un archivo alcanza.
 */
function makeFileTokenStorage(cachePath: string): TokenStorage {
    return {
        async get(cuit, env, service) {
            if (!existsSync(cachePath)) return null;

            try {
                const all = JSON.parse(readFileSync(cachePath, 'utf-8'));
                const raw = all[`${cuit}:${env}:${service ?? ''}`];
                if (!raw) return null;

                const ticket: LoginTicket = {
                    token: raw.token,
                    sign: raw.sign,
                    generationTime: new Date(raw.generationTime),
                    expirationTime: new Date(raw.expirationTime),
                };

                // Margen de 5 minutos: un TA que vence mientras corre la suite es peor
                // que uno que se renueva de más.
                const margen = new Date(Date.now() + 5 * 60 * 1000);
                return ticket.expirationTime > margen ? ticket : null;
            } catch {
                return null;
            }
        },

        async save(cuit, env, ticket, service) {
            const dir = dirname(cachePath);
            if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });

            const all = existsSync(cachePath)
                ? JSON.parse(readFileSync(cachePath, 'utf-8'))
                : {};

            all[`${cuit}:${env}:${service ?? ''}`] = ticket;
            writeFileSync(cachePath, JSON.stringify(all, null, 2), 'utf-8');
        },
    };
}

export const fileTokenStorage: TokenStorage = makeFileTokenStorage(TA_CACHE);
