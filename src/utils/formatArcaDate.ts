/**
 * Utilidades de fecha/hora para ARCA.
 *
 * ARCA opera íntegramente en horario de Argentina (UTC-3, sin DST desde 2009).
 * Todas las fechas enviadas a los web services deben expresarse en esa zona,
 * independientemente de la zona horaria del servidor donde corra el SDK
 * (AWS, Vercel, etc. suelen correr en UTC).
 *
 * ## Instante vs. fecha-calendario
 *
 * Un `Date` de JavaScript es un **instante** en la línea de tiempo, mientras que
 * `CbteFch` es una **fecha-calendario** (el día que figura en el comprobante).
 * Para poder expresar ambas cosas sin ambigüedad, los campos de fecha del SDK
 * aceptan {@link ArcaDateInput}:
 *
 * - `'2026-08-24'` o `'20260824'` → fecha literal, se usa tal cual.
 * - `new Date()` → instante, se convierte al día calendario argentino.
 */

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` o `YYYYMMDD` */
const CALENDAR_DATE_RE = /^(\d{4})-?(\d{2})-?(\d{2})$/;

/**
 * Valor aceptado por los campos de fecha del SDK.
 *
 * - `string` en formato `'YYYY-MM-DD'` o `'YYYYMMDD'`: fecha-calendario literal,
 *   sin conversión de zona horaria. Es la forma recomendada cuando ya sabés qué
 *   día debe figurar en el comprobante.
 * - `Date`: instante, se convierte al día calendario de Argentina (UTC-3).
 */
export type ArcaDateInput = Date | string;

const pad = (n: number): string => n.toString().padStart(2, '0');

/**
 * Convierte un Date al "reloj de pared" argentino (UTC-3) y devuelve sus componentes.
 *
 * Se resta el offset y luego se leen los getters UTC: eso hace que los componentes
 * devueltos sean los de Argentina, sin depender del timezone del host.
 */
function getArgentinaParts(date: Date) {
    const arTime = new Date(date.getTime() - AR_OFFSET_MS);

    return {
        yyyy: arTime.getUTCFullYear().toString(),
        mm: pad(arTime.getUTCMonth() + 1),
        dd: pad(arTime.getUTCDate()),
        hh: pad(arTime.getUTCHours()),
        mi: pad(arTime.getUTCMinutes()),
        ss: pad(arTime.getUTCSeconds()),
    };
}

/**
 * Determina si un `Date` representa una fecha-calendario en lugar de un instante.
 *
 * `new Date('2026-08-24')`, `new Date('2026-08-24T00:00:00Z')` y
 * `new Date(Date.UTC(2026, 7, 24))` producen todos exactamente medianoche UTC.
 * Es la forma más habitual de construir "un día" en JS, así que se interpreta
 * literalmente: de lo contrario el SDK le restaría 3 horas y devolvería el día
 * anterior.
 *
 * El costo es que un instante genuino que caiga exactamente en las 21:00:00.000
 * de Argentina se tratará como fecha-calendario. Para ese caso —y para cualquier
 * momento en que la hora importe— usá `generatedAt`, que nunca aplica esta regla.
 */
function isCalendarDate(date: Date): boolean {
    return date.getTime() % MS_PER_DAY === 0;
}

/**
 * Normaliza un {@link ArcaDateInput} a los componentes de fecha `yyyy/mm/dd`.
 *
 * @throws {RangeError} Si el valor es una fecha inválida o un string con formato desconocido.
 */
function resolveDateParts(value: ArcaDateInput): { yyyy: string; mm: string; dd: string } {
    if (typeof value === 'string') {
        const match = CALENDAR_DATE_RE.exec(value.trim());

        if (!match) {
            throw new RangeError(
                `Fecha inválida: "${value}". Se espera 'YYYY-MM-DD', 'YYYYMMDD' o un objeto Date.`
            );
        }

        const [, yyyy, mm, dd] = match;

        // Validación real de calendario (descarta 2026-02-30, mes 13, etc.)
        const probe = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
        if (Number.isNaN(probe.getTime()) || probe.getUTCDate() !== Number(dd)) {
            throw new RangeError(`Fecha inexistente: "${value}".`);
        }

        return { yyyy, mm, dd };
    }

    if (Number.isNaN(value.getTime())) {
        throw new RangeError('Fecha inválida: se recibió un Date con valor NaN.');
    }

    // Medianoche UTC exacta: el usuario expresó un día, no un instante.
    if (isCalendarDate(value)) {
        return {
            yyyy: value.getUTCFullYear().toString(),
            mm: pad(value.getUTCMonth() + 1),
            dd: pad(value.getUTCDate()),
        };
    }

    const { yyyy, mm, dd } = getArgentinaParts(value);
    return { yyyy, mm, dd };
}

/**
 * Formato ISO 8601 con offset explícito: `YYYY-MM-DDTHH:mm:ss-03:00`.
 *
 * Usado por el WSAA en los campos `generationTime` / `expirationTime` del TRA.
 * Siempre trata el valor como instante, porque ahí la hora es significativa.
 */
export function formatArcaDate(date: Date): string {
    const { yyyy, mm, dd, hh, mi, ss } = getArgentinaParts(date);

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
}

/**
 * Formato de fecha de comprobante: `yyyymmdd` (String 8).
 *
 * Usado en `CbteFch`, `FchServDesde`, `FchServHasta`, `FchVtoPago` y en la
 * fecha de los comprobantes asociados (`CbtesAsoc`).
 *
 * @example
 * formatArcaDateOnly('2026-08-24')                    // '20260824' (literal)
 * formatArcaDateOnly(new Date('2026-08-24'))          // '20260824' (medianoche UTC = día)
 * formatArcaDateOnly(new Date('2026-08-25T01:00:00Z')) // '20260824' (22:00 en Argentina)
 */
export function formatArcaDateOnly(date: ArcaDateInput): string {
    const { yyyy, mm, dd } = resolveDateParts(date);

    return `${yyyy}${mm}${dd}`;
}

/**
 * Formato de fecha y hora compacto: `yyyymmddhhmmss` (String 14) en horario argentino.
 *
 * Requerido por `CbteFchHsGen` en la modalidad CAEA a partir de la versión 4.6 del
 * Manual del Desarrollador RG 4291 (vigente 01/08/2026, en cumplimiento de la RG 5782).
 *
 * A diferencia de {@link formatArcaDateOnly}, un `Date` se interpreta **siempre**
 * como instante: acá la hora es el dato que ARCA valida. Un string de fecha-calendario
 * se completa con `000000`, pero conviene evitarlo e informar la hora real de emisión.
 *
 * @example
 * formatArcaTimestamp(new Date('2026-08-25T01:35:07Z')) // '20260824223507'
 * formatArcaTimestamp('2026-08-24')                     // '20260824000000'
 */
export function formatArcaTimestamp(date: ArcaDateInput): string {
    if (typeof date === 'string') {
        const { yyyy, mm, dd } = resolveDateParts(date);
        return `${yyyy}${mm}${dd}000000`;
    }

    if (Number.isNaN(date.getTime())) {
        throw new RangeError('Fecha inválida: se recibió un Date con valor NaN.');
    }

    const { yyyy, mm, dd, hh, mi, ss } = getArgentinaParts(date);

    return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}
