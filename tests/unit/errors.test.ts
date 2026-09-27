import { describe, it, expect } from 'vitest';
import { getArcaHint, getHintForObservations } from '../../src/constants/errors';
import { VAT_RATE_CODES } from '../../src/types/wsfe';

/**
 * Tests del diccionario de hints (`src/constants/errors.ts`).
 *
 * **Alcance: sólo los códigos de IVA (10019 y 10043).** El resto de los hints sigue sin
 * cobertura. Que este archivo exista no significa que el diccionario esté probado.
 *
 * Por qué existe: un hint no lo mira ni el compilador ni ningún otro test, así que puede
 * quedar congelado —o directamente colgado del código equivocado— sin que nada se ponga
 * en rojo. Fue exactamente lo que pasó con la alícuota de IVA.
 */

/**
 * Alícuotas de `rates` que el hint no nombra en la forma `código (porcentaje%)`.
 *
 * Vive afuera del test a propósito: así se la puede correr contra un hint **inventado**
 * y comprobar que detecta lo que dice detectar. Un `toContain` debilitado por descuido
 * quedaría verde para siempre, y sería indistinguible de uno que funciona.
 */
function alicuotasFaltantes(
    hint: string,
    rates: Readonly<Record<number, number>> = VAT_RATE_CODES,
): string[] {
    return Object.entries(rates)
        .filter(([percentage, code]) => !hint.includes(`${code} (${percentage}%)`))
        .map(([percentage]) => `${percentage}%`);
}

describe('ARCA_ERROR_HINTS — códigos de IVA', () => {
    // Estos tres prueban el chequeo, no el hint. Son los que hacen que los de más abajo
    // signifiquen algo.
    describe('el chequeo de alícuotas se puede poner en rojo', () => {
        it('detecta la alícuota que falta', () => {
            const incompleto = 'Los códigos vigentes son 3 (0%), 8 (5%), 4 (10.5%), 5 (21%) y 6 (27%).';

            expect(alicuotasFaltantes(incompleto)).toEqual(['2.5%']);
        });

        it('no marca faltantes cuando están las seis', () => {
            const completo = 'Los códigos vigentes son 3 (0%), 9 (2.5%), 8 (5%), 4 (10.5%), 5 (21%) y 6 (27%).';

            expect(alicuotasFaltantes(completo)).toEqual([]);
        });

        it('VAT_RATE_CODES tiene las seis alícuotas', () => {
            // Con el mapa vacío, `alicuotasFaltantes` devolvería [] para cualquier hint y
            // los tests de abajo pasarían sin mirar nada.
            expect(Object.keys(VAT_RATE_CODES)).toHaveLength(6);
        });
    });

    // Manual del Desarrollador RG 4291 v4.8, p. 43:
    // <AlicIVA><id> — 10019 — "Siempre que se informe Id, debe ser un valor devuelto por
    // el método FEParamGetTiposIva. No aplica para comprobantes tipo C."
    describe('10019 — alícuota de IVA fuera del catálogo', () => {
        it('tiene hint', () => {
            expect(getArcaHint(10019)).toBeDefined();
        });

        it('nombra las seis alícuotas de VAT_RATE_CODES con su código', () => {
            // Si alguien agrega una alícuota a VAT_RATE_CODES y no toca el hint, acá se
            // pone en rojo. Hasta la v2.1.0 el hint listaba cuatro de las seis.
            expect(alicuotasFaltantes(getArcaHint(10019)!)).toEqual([]);
        });

        it('manda al catálogo en vivo y no sólo a la lista fija', () => {
            // VAT_RATE_CODES es una copia local y se desactualiza en silencio; la fuente
            // autoritativa es FEParamGetTiposIva.
            expect(getArcaHint(10019)).toContain('getVatRates()');
        });
    });

    /**
     * WSAA Manual del Desarrollador 20.2.19, cap. 10.6:
     * "ACTUALMENTE ESE LAPSO PREVENTIVO ES DE 10 MINUTOS EN EL WSAA DE TESTING Y 2
     * MINUTOS EN EL WSAA DE PRODUCCION. TENER EN CUENTA QUE ESTOS VALORES PUEDEN SER
     * MODIFICADOS DINAMICAMENTE Y SIN AVISO PREVIO."
     *
     * Medido contra homologación el 2026-09-26: el bloqueo se levantó entre los 9m32s y
     * los 10m32s del TA anterior.
     */
    describe('ALREADY_HAS_TA — el bloqueo no dura lo que dura el TA', () => {
        it('no dice que el bloqueo dure hasta que expire el TA', () => {
            // Regresión: hasta la v3.0.0 el hint decía que ARCA no emite otro TA "hasta
            // que expire (12 h)". Las 12 h son la vigencia del ticket; el bloqueo son
            // minutos. La confusión estaba en diez lugares del repo y hacía parecer que
            // equivocarse corriendo los tests de integración costaba un día.
            //
            // No se puede chequear simplemente que el hint no diga "12 h": el texto
            // actual las nombra a propósito, para desmentirlas. Lo que no puede volver
            // es la afirmación.
            expect(getArcaHint('ALREADY_HAS_TA')).not.toMatch(/hasta que expire/i);
        });

        it('nombra la unidad correcta del bloqueo', () => {
            expect(getArcaHint('ALREADY_HAS_TA')).toMatch(/minutos/i);
        });

        it('sigue mandando a persistir el ticket, que es la solución', () => {
            expect(getArcaHint('ALREADY_HAS_TA')).toContain('TokenStorage');
        });
    });

    // Manual del Desarrollador RG 4291 v4.8, p. 47:
    // <ImpTotConc> — 10043 — "El campo 'Importe neto no gravado' <ImpTotConc>. No puede
    // ser menor a cero (0). Para comprobantes tipo C debe ser igual a cero (0)."
    describe('10043 — ImpTotConc, no es un código de IVA', () => {
        it('habla de ImpTotConc', () => {
            expect(getArcaHint(10043)).toContain('ImpTotConc');
        });

        it('no habla de alícuotas', () => {
            // Regresión: este hint describía la alícuota de IVA inválida, que es el 10019.
            // Quien recibiera un 10043 leía una respuesta sobre otro campo.
            expect(getArcaHint(10043)).not.toMatch(/al[ií]cuota/i);
        });
    });
});

/**
 * `getHintForObservations` — el puente entre un rechazo de ARCA y el diccionario.
 *
 * Por qué importa más que cualquier hint suelto: **las validaciones por comprobante llegan
 * por `Observaciones`, no por `Errors`**. Hasta la v3.0.0 el parseo descartaba `Obs.Code` y
 * esta búsqueda se hacía con dos expresiones regulares sobre el texto, así que de los ~40
 * hints del diccionario sólo dos podían llegarle a alguien que recibiera un rechazo.
 * Corregir un hint sin esto mejoraba el código para quien lo lee, no para quien lo usa.
 */
describe('getHintForObservations', () => {
    it('encuentra el hint por código', () => {
        // El caso que antes era imposible: el 10019 no lo matcheaba ningún regex.
        const hint = getHintForObservations([
            { code: 10019, message: 'Texto que no matchea ningún regex' },
        ]);

        expect(hint).toBe(getArcaHint(10019));
    });

    it('devuelve el primero que tenga hint, salteando los que no', () => {
        // ARCA manda varias observaciones y no todas son accionables.
        const hint = getHintForObservations([
            { code: 99999, message: 'Código inexistente en el diccionario' },
            { code: 10048, message: 'Otro' },
        ]);

        expect(hint).toBe(getArcaHint(10048));
    });

    it('cae al reconocimiento por texto si no hay código', () => {
        // Una observación sin código igual tiene que dar la pista del 10246, que va a ser
        // el rechazo masivo del 01/12/2026.
        const hint = getHintForObservations([
            {
                code: NaN,
                message: 'Campo Condicion Frente al IVA del receptor es obligatorio conforme ' +
                    'a lo reglamentado por la Resolucion General Nro 5616.',
            },
        ]);

        expect(hint).toBe(getArcaHint(10246));
    });

    it('no confunde el NaN con un código real', () => {
        // `Number.isNaN` tiene que cortar antes de buscar: `ARCA_ERROR_HINTS[NaN]` es
        // undefined igual, pero si el parseo alguna vez devolviera 0 en vez de NaN, buscar
        // sin chequear traería el hint del código 0 si algún día existe.
        expect(getHintForObservations([{ code: NaN, message: 'Sin nada reconocible' }]))
            .toBeUndefined();
    });

    it('devuelve undefined cuando no reconoce nada', () => {
        expect(getHintForObservations([{ code: 99999, message: 'Algo raro' }])).toBeUndefined();
        expect(getHintForObservations([])).toBeUndefined();
    });

    it('acepta un texto de fallback aparte de los mensajes', () => {
        // Lo usa quien tenga el texto del rechazo por otro lado que las observaciones.
        const hint = getHintForObservations(
            [],
            'Campo Condicion Frente al IVA del receptor es obligatorio'
        );

        expect(hint).toBe(getArcaHint(10246));
    });
});
