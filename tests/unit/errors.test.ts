import { describe, it, expect } from 'vitest';
import {
    ARCA_ERROR_HINTS,
    getArcaHint,
    getHintForObservations,
    getWsaaHint,
    WSAA_FAULT_PATTERNS,
} from '../../src/constants/errors';
import { VAT_RATE_CODES } from '../../src/types/wsfe';

/**
 * Tests del diccionario de hints (`src/constants/errors.ts`).
 *
 * Por qué existe: un hint no lo mira ni el compilador ni ningún otro test, así que puede
 * quedar congelado —o directamente colgado del código equivocado— sin que nada se ponga
 * en rojo. Fue exactamente lo que pasó con la alícuota de IVA.
 *
 * **Alcance, y conviene tenerlo claro**: está cubierto el texto de los códigos de IVA
 * (10019, 10043), el de `ALREADY_HAS_TA`, los **once** que hasta la v3.0.0 describían otro
 * código, y la búsqueda de `getHintForObservations`. El resto del diccionario sigue sin
 * cobertura de su texto: que este archivo exista no significa que el diccionario esté
 * probado.
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
 * `getWsaaHint` — los nueve faults que documenta el cap. 10 del *WSAA Manual del
 * Desarrollador* (publicación 20.2.19).
 *
 * **Por qué por texto y no por código**: WSAA no devuelve códigos numéricos. No hay tabla
 * de códigos en las 35 páginas de su manual; devuelve SOAP Faults con `faultstring`, y los
 * únicos códigos que existen son strings y sólo para uno de los nueve casos
 * (`cms.sign.invalid`, `cms.bad`, `cms.bad.base64`).
 *
 * Hasta la v3.0.0 el diccionario tenía cinco códigos **inventados** —503, 1000, 1001, 1003
 * y 1005— bajo el título "Autenticación WSAA", y un solo fault reconocido de verdad.
 *
 * Los `faultString` de esta tabla están escritos **sin acentos a propósito**: es como los
 * escribe ARCA en el único que pudimos leer de verdad ("TA valido"), y los patrones tienen
 * que tolerarlo. Hay dos tests aparte con la grafía acentuada.
 */
const FAULTS_DE_WSAA: ReadonlyArray<{ cap: string; faultString: string; clave: string }> = [
    { cap: '10.2', faultString: 'Certificado no emitido por AC de confianza', clave: 'CERT_NOT_TRUSTED' },
    {
        cap: '10.3',
        faultString: 'Computador no autorizado a acceder a los servicios de AFIP',
        clave: 'COMPUTER_NOT_AUTHORIZED',
    },
    { cap: '10.4', faultString: 'Computador no autorizado a acceder al servicio', clave: 'SERVICE_NOT_AUTHORIZED' },
    { cap: '10.5', faultString: 'DN del source invalido', clave: 'INVALID_SOURCE_DN' },
    {
        cap: '10.6',
        faultString: 'El CEE ya posee un TA valido para el acceso al WSN solicitado',
        clave: 'ALREADY_HAS_TA',
    },
    { cap: '10.7', faultString: 'El tiempo de expiracion es inferior a la hora actual', clave: 'TRA_EXPIRED' },
    { cap: '10.8', faultString: 'cms.sign.invalid', clave: 'INVALID_SIGNATURE' },
    {
        cap: '10.9',
        faultString: 'GenerationTime en el futuro o mas de 24 horas de antiguedad',
        clave: 'INVALID_GENERATION_TIME',
    },
    { cap: '10.10', faultString: 'No se ha podido interpretar el XML contra el SCHEMA', clave: 'TRA_SCHEMA_ERROR' },
];

describe('getWsaaHint', () => {
    it.each(FAULTS_DE_WSAA)('cap. $cap → $clave', ({ faultString, clave }) => {
        expect(getWsaaHint(faultString)).toBe(getArcaHint(clave));
    });

    it('cubre los nueve casos del manual', () => {
        // Si la tabla quedara vacía o a medias, los `it.each` de arriba desaparecerían sin
        // que nada se ponga en rojo: un `it.each` sobre una lista vacía no corre y no falla.
        expect(WSAA_FAULT_PATTERNS).toHaveLength(9);
        expect(FAULTS_DE_WSAA).toHaveLength(9);
    });

    it('cada clave de la tabla tiene un hint escrito', () => {
        // Una clave con un typo devuelve undefined en silencio: el patrón matchea, el
        // usuario no recibe nada y el test de arriba pasaría igual (undefined === undefined).
        for (const { key } of WSAA_FAULT_PATTERNS) {
            expect(getArcaHint(key), `falta el hint de ${key}`).toBeDefined();
        }
    });

    it('no confunde los dos "Computador no autorizado", que arrancan igual', () => {
        // El 10.3 es el ambiente cruzado; el 10.4, el servicio sin autorizar. Se distinguen
        // sólo por la cola: "a los servicios de AFIP" contra "al servicio". Si los dos
        // patrones colapsaran en uno, el `it.each` de arriba seguiría verde para el primero.
        const ambiente = getWsaaHint('Computador no autorizado a acceder a los servicios de AFIP');
        const servicio = getWsaaHint('Computador no autorizado a acceder al servicio');

        expect(ambiente).toBe(getArcaHint('COMPUTER_NOT_AUTHORIZED'));
        expect(servicio).toBe(getArcaHint('SERVICE_NOT_AUTHORIZED'));
        expect(ambiente).not.toBe(servicio);
    });

    it('reconoce el fault con acentos', () => {
        expect(getWsaaHint('El tiempo de expiración es inferior a la hora actual'))
            .toBe(getArcaHint('TRA_EXPIRED'));
        expect(getWsaaHint('Firma inválida o algoritmo no soportado'))
            .toBe(getArcaHint('INVALID_SIGNATURE'));
    });

    it('no inventa un hint para un fault que el manual no documenta', () => {
        // El manual documenta nueve casos y ARCA puede devolver otros. Que no haya hint es
        // un estado normal; inventarle uno sería peor que no darlo.
        expect(getWsaaHint('El certificado no esta vigente')).toBeUndefined();
    });

    it('tolera un faultstring vacío o ausente', () => {
        expect(getWsaaHint(undefined)).toBeUndefined();
        expect(getWsaaHint(null)).toBeUndefined();
        expect(getWsaaHint('')).toBeUndefined();
    });
});

describe('los cinco códigos de WSAA que el SDK tenía inventados', () => {
    // Regresión: el manual de WSAA no tiene tabla de códigos numéricos. Estos cinco no
    // existen en ninguna fuente de ARCA y estuvieron en el diccionario hasta la v3.0.0.
    it.each([503, 1000, 1001, 1003, 1005])('el %i ya no está en el diccionario', codigo => {
        expect(getArcaHint(codigo)).toBeUndefined();
    });
});

/**
 * Los trece hints cuyo texto se corrigió en la v3.0.0: **once describían otro código** y
 * **dos eran inexactos**.
 *
 * No es un caso raro: eran trece de los cuarenta, verificados uno por uno contra el PDF del
 * Manual del Desarrollador RG 4291 v4.8 (idéntico al v4.7 en todos ellos). El patrón era
 * siempre el mismo — el texto describía el error que uno *espera* de ese número, no el que
 * ARCA le asignó.
 *
 * Cada caso lleva las dos mitades, y las dos hacen falta:
 * - `debeDecir`: que el texto nuevo diga lo que dice el manual.
 * - `noDebeDecir`: que no vuelva el significado viejo. Sin esto, agregar una frase correcta
 *   arriba del texto equivocado dejaría el test en verde.
 */
interface CasoDeTexto {
    codigo: number;
    /** Dónde está la fila en el manual v4.8. */
    pagina: string;
    debeDecir: RegExp[];
    noDebeDecir: RegExp[];
}

const TEXTOS_CORREGIDOS: CasoDeTexto[] = [
    // Tabla de "errores internos de infraestructura" (p. 21). Los cinco llegan por `Errors`.
    {
        codigo: 501,
        pagina: 'p. 21 — Error interno de base de datos',
        debeDecir: [/base de datos/i],
        // Decía "el certificado puede haber expirado o la relación CUIT/Servicio no está
        // habilitada": mandaba a revisar el certificado por un problema de ARCA.
        noDebeDecir: [/expirad/i, /CUIT\/Servicio/i],
    },
    {
        codigo: 502,
        pagina: 'p. 21 — Error interno de base de datos, Autorizador CAE / Régimen CAEA',
        debeDecir: [/base de datos/i, /CAEA/],
        // Decía que el TA era inválido y que había que volver a hacer login.
        noDebeDecir: [/wsaa\.login/i, /ticket de acceso/i],
    },
    {
        codigo: 600,
        pagina: 'p. 21 — No se corresponden token y firma / usuario no autorizado',
        debeDecir: [/token y firma/i, /WSASS/],
        // Decía "no se pudo autorizar el comprobante, revisá observations", que es la
        // descripción de un rechazo. El 600 es de autenticación y no hay comprobante.
        noDebeDecir: [/observations/i, /no se pudo autorizar/i],
    },
    {
        codigo: 601,
        pagina: 'p. 21 — CUIT representada no incluida en token',
        debeDecir: [/representada/i, /token/i],
        // Decía "el comprobante ya fue autorizado anteriormente". Quien lo recibiera iba a
        // buscar un problema de numeración que no existe — y es el error que aparece al
        // usar una delegación de WSASS, donde la numeración está intacta.
        noDebeDecir: [/ya fue autorizado/i, /dos veces/i],
    },
    {
        codigo: 602,
        pagina: 'p. 21 — No existen datos en nuestros registros',
        debeDecir: [/no existen datos/i, /FEParamGetPtosVenta/],
        noDebeDecir: [/n[úu]mero de comprobante/i],
    },
    // Validaciones excluyentes de FECAESolicitar.
    {
        codigo: 10016,
        pagina: 'p. 42-43 — CbteDesde debe ser el último autorizado + 1',
        debeDecir: [/CbteDesde/, /FECompUltimoAutorizado/],
        // Decía que el CUIT receptor no existía en el Padrón, que es el 10238.
        noDebeDecir: [/Padr[óo]n/i, /receptor/i],
    },
    {
        codigo: 10039,
        pagina: 'p. 46 — MonCotiz debe ser 1 cuando MonId = PES',
        debeDecir: [/MonCotiz/, /igual a 1/],
        // Estaba literalmente al revés: decía "si la moneda no es PES, la cotización debe
        // ser mayor a cero". Esa parte es del 10038.
        noDebeDecir: [/no es PES/i, /mayor a cero/i],
    },
    {
        codigo: 10044,
        pagina: 'p. 47-48 — ImpOpEx no puede ser menor a cero',
        debeDecir: [/ImpOpEx/, /exento/i],
        // Decía que el IVA no cuadraba con base × alícuota. El descuadre del IVA es el
        // 10023 (suma de importes vs ImpIVA) y el 10051 (importes según tipo de IVA).
        noDebeDecir: [/al[íi]cuota/i, /IVA/],
    },
    {
        codigo: 10048,
        pagina: 'p. 48-49 — ImpTotal es la suma de todos los importes',
        debeDecir: [/ImpTotal/, /ImpTotConc/],
        // Decía que el punto de venta no estaba dado de alta, que es el 10005 y el 11002.
        noDebeDecir: [/punto de venta/i],
    },
    {
        codigo: 10049,
        pagina: 'p. 49 — fechas de servicio obligatorias con Concepto 2 o 3',
        debeDecir: [/FchServDesde/, /Concepto/],
        // Decía que el punto de venta no estaba activo.
        noDebeDecir: [/punto de venta/i],
    },
    // Validaciones de FECompUltimoAutorizado (p. 128), reutilizadas por FECAESolicitar:
    // el 11001 llegó en una corrida real contra homologación con CbteTipo=83.
    {
        codigo: 11001,
        pagina: 'p. 128 — debe ser alguno de los habilitados en este WS',
        debeDecir: [/web service/i, /FEParamGetTiposCbte/, /11002/, /Tique/],
        // Arrancaba con "no es válido para **este punto de venta**", que es el significado
        // del 11002. Ojo con el regex: el texto nuevo nombra el punto de venta a propósito,
        // para derivar al 11002. Lo que no puede volver es la afirmación.
        noDebeDecir: [/para este punto de venta/i],
    },
    // Los dos que no describían otro código, sólo eran imprecisos.
    {
        codigo: 10272,
        pagina: 'p. 72 — con DocTipo 31, la condición debe ser 15 (IVA No Alcanzado)',
        debeDecir: [/31/, /15/, /No Alcanzado/i],
        // Decía "no permitida para la combinación informada por entidades financieras", sin
        // nombrar el valor: mandaba a adivinar cuál de los once códigos del catálogo era.
        noDebeDecir: [/combinaci[óo]n informada/i],
    },
    {
        codigo: 10251,
        pagina: 'p. 71 — las entidades financieras no pueden emitir MiPyMEs (FCE)',
        // La RG 5866 **se conserva**: no está en la fila, pero sí en el historial del manual
        // (entrada v4.4), que es lo que dio de alta este código. Lo que faltaba era el caso.
        debeDecir: [/FCE/, /RG 5866/],
        noDebeDecir: [/restricciones de entidades financieras y seguros/i],
    },
];

/**
 * Devuelve los problemas de un hint contra su caso. Vacío = está bien.
 *
 * Vive afuera del test para poder correrla contra los textos **viejos** y comprobar que
 * detecta lo que dice detectar: un `toMatch` debilitado por descuido quedaría verde para
 * siempre y sería indistinguible de uno que funciona.
 */
function problemasDeTexto(hint: string | undefined, caso: CasoDeTexto): string[] {
    if (hint === undefined) return ['no hay hint'];

    return [
        ...caso.debeDecir.filter(re => !re.test(hint)).map(re => `falta ${re}`),
        ...caso.noDebeDecir.filter(re => re.test(hint)).map(re => `sobra ${re}`),
    ];
}

describe('ARCA_ERROR_HINTS — los hints que describían otro código', () => {
    describe('el chequeo se puede poner en rojo', () => {
        it('detecta el texto viejo del 601', () => {
            const viejo = 'El comprobante ya fue autorizado anteriormente. No emitas dos veces el mismo número.';
            const caso = TEXTOS_CORREGIDOS.find(c => c.codigo === 601)!;

            expect(problemasDeTexto(viejo, caso).length).toBeGreaterThan(0);
        });

        it('detecta el texto viejo del 11001, que comparte palabras con el nuevo', () => {
            // El caso más fino de la tabla: las dos versiones nombran el punto de venta, y
            // sólo una lo culpa. Si este test pasara, el regex estaría mirando la palabra
            // en vez de la afirmación.
            const viejo = 'El tipo de comprobante no es válido para este punto de venta. Pasa con los Tique ' +
                '(81/82/83), que son de Controlador Fiscal (RG 3561/2013) y no se emiten por wsfev1: ' +
                'usá Factura (1/6/11). La lista autoritativa la da FEParamGetTiposCbte.';
            const caso = TEXTOS_CORREGIDOS.find(c => c.codigo === 11001)!;

            expect(problemasDeTexto(viejo, caso)).toContain('sobra /para este punto de venta/i');
        });

        it('no marca problemas en un texto que cumple las dos mitades', () => {
            const caso = TEXTOS_CORREGIDOS.find(c => c.codigo === 10048)!;

            expect(problemasDeTexto('ImpTotal es la suma de ImpTotConc y los demás importes.', caso))
                .toEqual([]);
        });
    });

    it('cubre los trece', () => {
        // Un `it.each` sobre una lista vacía no corre y no falla: sin esto, vaciar la tabla
        // haría desaparecer trece tests en silencio.
        expect(TEXTOS_CORREGIDOS).toHaveLength(13);
    });

    it.each(TEXTOS_CORREGIDOS)('$codigo — $pagina', caso => {
        expect(problemasDeTexto(getArcaHint(caso.codigo), caso)).toEqual([]);
    });
});

/**
 * Los códigos que el SDK **creía tener y no tenía**.
 *
 * El texto estaba escrito y era correcto; estaba colgado del número equivocado. Al corregir
 * ese número (ver `TEXTOS_CORREGIDOS`) el texto útil se perdía, así que acá vuelve a su
 * lugar:
 *
 * - *"el punto de venta no está dado de alta"* estaba en el 10048 (importes) y el 10049
 *   (fechas de servicio). Los códigos reales son el **10005** y el **11002**.
 * - *"el IVA no cuadra"* estaba en el 10044 (importe exento). Los códigos reales son el
 *   **10023** (la suma del array contra `ImpIVA`) y el **10051** (cada alícuota contra su
 *   base).
 * - El **10067** y el **1425** son la mitad que le faltaba a la regla del tributo ID 13.
 */
interface CasoDeContenido {
    codigo: number;
    /** Dónde está la fila en el manual v4.8. */
    pagina: string;
    debeDecir: RegExp[];
}

/** Lo que le falta a un hint para cubrir su caso. Vacío = está bien. */
function contenidoFaltante(hint: string | undefined, debeDecir: RegExp[]): string[] {
    if (hint === undefined) return ['no hay hint'];

    return debeDecir.filter(re => !re.test(hint)).map(re => `falta ${re}`);
}

const HINTS_NUEVOS: ReadonlyArray<CasoDeContenido> = [
    { codigo: 10005, pagina: 'p. 40 — dado de alta y del tipo RECE', debeDecir: [/RECE/, /getPointsOfSale/] },
    { codigo: 11002, pagina: 'p. 128 — habilitado en este WS', debeDecir: [/FEParamGetPtosVenta/, /11001/] },
    { codigo: 10023, pagina: 'p. 44 — la suma del array de IVA contra ImpIVA', debeDecir: [/ImpIVA/, /suma/i] },
    { codigo: 10051, pagina: 'p. 49 — cada alícuota contra su base', debeDecir: [/al[íi]cuota/i, /0,01/] },
    { codigo: 10067, pagina: 'p. 51 — tributo ID 13, excluyente', debeDecir: [/ID 13/, /excluyente/i] },
    { codigo: 1425, pagina: 'p. 156-157 — tributo ID 13 en CAEA', debeDecir: [/ID 13/, /observaci[óo]n/i] },
];

describe('ARCA_ERROR_HINTS — los códigos que no tenían hint', () => {
    it('cubre los seis', () => {
        expect(HINTS_NUEVOS).toHaveLength(6);
    });

    it.each(HINTS_NUEVOS)('$codigo — $pagina', ({ codigo, debeDecir }) => {
        expect(contenidoFaltante(getArcaHint(codigo), debeDecir)).toEqual([]);
    });
});

/**
 * Los quince hints que **estaban bien** y no tenían ninguna prueba.
 *
 * No corrigen nada: fijan. Se verificaron uno por uno contra el PDF v4.8 el 2026-09-27 y
 * los quince describían su código correctamente — quien los escribió tenía el manual
 * abierto, sobre todo en el bloque de la RG 5616 y el del receptor.
 *
 * **Por qué vale escribir un test de algo que ya está bien.** Trece hints del diccionario
 * llegaron a describir otro código, y nada se puso en rojo en ningún momento: ni el
 * compilador ni el resto de la suite miran un texto. Estos quince no están bien por algo
 * estructural, están bien porque alguien los escribió con cuidado una vez. Sin un test, la
 * próxima corrección descuidada es indistinguible de la de hoy.
 */
const TEXTOS_FIJADOS: ReadonlyArray<CasoDeContenido> = [
    { codigo: 10015, pagina: 'p. 41-42 — Factura B, identificación según el monto', debeDecir: [/Factura B/, /identific/i] },
    {
        codigo: 10038,
        pagina: 'p. 46 — la cotización debe coincidir con la del día hábil anterior',
        debeDecir: [/CanMisMonExt/, /d[íi]a h[áa]bil anterior/i, /FEParamGetCotizacion/],
    },
    // RG 5616. El 10245 observa y el 10246 rechaza; en CAEA, el 825 observa y el 826
    // rechaza. Verificado por la tabla en la que está cada uno, no por su texto.
    {
        codigo: 10242,
        pagina: 'p. 72 — valor no permitido (el catálogo no es correlativo)',
        debeDecir: [/FEParamGetCondicionIvaReceptor/, /2, 3 y 11/],
    },
    { codigo: 10243, pagina: 'p. 72 — no aplica a la clase de comprobante', debeDecir: [/clase de comprobante/i] },
    { codigo: 10245, pagina: 'p. 76 — no excluyente: hoy observa', debeDecir: [/observa/i, /01\/12\/2026/] },
    { codigo: 10246, pagina: 'p. 72 — excluyente: es obligatorio', debeDecir: [/obligatoria/i, /01\/12\/2026/] },
    { codigo: 823, pagina: 'p. 155 — CAEA, excluyente, ver 10242', debeDecir: [/CAEA/, /10242/] },
    { codigo: 824, pagina: 'p. 161 — CAEA, no excluyente, ver 10243', debeDecir: [/CAEA/, /10243/] },
    { codigo: 825, pagina: 'p. 161 — CAEA, no excluyente', debeDecir: [/CAEA/, /01\/12\/2026/] },
    { codigo: 826, pagina: 'p. 155 — CAEA, excluyente', debeDecir: [/CAEA/, /01\/12\/2026/] },
    // Receptor.
    { codigo: 10238, pagina: 'p. 76 — la CUIT receptora no existe', debeDecir: [/no existe/i] },
    {
        codigo: 10247,
        pagina: 'p. 72 — inactiva o inválida, excluyente salvo en NC',
        debeDecir: [/inactiva/i, /Notas de Cr[ée]dito/],
    },
    {
        codigo: 10248,
        pagina: 'p. 72 — sujeto no confiable en Seguridad Social',
        debeDecir: [/Seguridad Social/, /Notas de Cr[ée]dito/],
    },
    { codigo: 10249, pagina: 'p. 76 — sujeto fallecido sin sucesión indivisa', debeDecir: [/fallecido/i] },
    { codigo: 10271, pagina: 'p. 72 — DocTipo 31, numérico de hasta 4 dígitos', debeDecir: [/31/, /4 d[íi]gitos/] },
];

describe('ARCA_ERROR_HINTS — los hints que estaban bien, fijados', () => {
    it('cubre los quince', () => {
        expect(TEXTOS_FIJADOS).toHaveLength(15);
    });

    it.each(TEXTOS_FIJADOS)('$codigo — $pagina', ({ codigo, debeDecir }) => {
        expect(contenidoFaltante(getArcaHint(codigo), debeDecir)).toEqual([]);
    });
});

/**
 * Cuántas entradas del diccionario tienen test de su texto.
 *
 * Es el número que explica el problema de fondo: al empezar el 2026-09-27 eran **2 de 40**,
 * y por eso trece pudieron quedar describiendo otro código sin que nada avisara. Este test
 * existe para que agregar una entrada sin cubrirla se note.
 */
describe('cobertura del diccionario', () => {
    it('las entradas cubiertas son las que decimos', () => {
        const cubiertos = new Set<string | number>([
            ...TEXTOS_CORREGIDOS.map(c => c.codigo),
            ...HINTS_NUEVOS.map(c => c.codigo),
            ...TEXTOS_FIJADOS.map(c => c.codigo),
            ...WSAA_FAULT_PATTERNS.map(p => p.key),
            10019, 10043,          // describes de IVA, más arriba
            10283, 1527,           // describe del tributo ID 13
        ]);

        // 13 + 6 + 15 + 9 + 2 + 2, sin repetidos: el 10283 y el 1527 no están en las tablas.
        expect(cubiertos.size).toBe(47);

        // La única que falta es `PADRON_ERROR`, que no es un código de ARCA sino interno del
        // SDK: su cobertura vive en `padron.test.ts`, que es donde se usa.
        expect(Object.keys(ARCA_ERROR_HINTS)).toHaveLength(48);
    });

    it('no quedó ninguna entrada que ningún camino del código pueda entregar', () => {
        // Regresión del hallazgo del 2026-09-27: `PADRON_ERROR` y `CUIT_NOT_FOUND` estaban
        // escritos y `padron.ts` no llamaba a `getArcaHint` en ninguna línea. El primero se
        // cableó; el segundo se borró, porque su texto repetía el mensaje de error en vez de
        // agregarle una acción.
        expect(getArcaHint('CUIT_NOT_FOUND')).toBeUndefined();
    });
});

/**
 * La regla del tributo **ID 13 – Percepción de IVA No Categorizado** (RG 2126/2006) son
 * cuatro códigos, y **sólo uno rechaza**.
 *
 * Se determinó por el encabezado de cada tabla del manual, que es lo que las distingue: las
 * excluyentes dicen *"Código de error"* y las no excluyentes *"Código de Observ."*. El
 * 10067 está en la tabla excluyente de `FECAESolicitar` (p. 51); el 10283, en la no
 * excluyente del mismo método (p. 76).
 *
 * Es al revés de lo que uno supondría —rechaza el de `ImpTrib = 0`, no el de `ImpTrib > 0`—
 * y por eso vale un test: es exactamente el tipo de dato que se transcribe mal.
 */
describe('el tributo ID 13 — cuál rechaza y cuáles observan', () => {
    it('el 10067 avisa que es excluyente y que ARCA rechaza', () => {
        expect(getArcaHint(10067)).toMatch(/excluyente/i);
        expect(getArcaHint(10067)).toMatch(/rechaza/i);
    });

    it.each([10283, 1527, 1425])('el %i avisa que es una observación, no un rechazo', codigo => {
        expect(getArcaHint(codigo)).toMatch(/observaci[óo]n/i);
        expect(getArcaHint(codigo)).toMatch(/no un rechazo/i);
    });

    it('el 10067 y el 10283 se distinguen por ImpTrib, que es lo único que los separa', () => {
        // Los dos son el mismo tributo faltante en el mismo tipo de comprobante y con el
        // mismo receptor. Si un hint no dice de qué lado de ImpTrib está, no sirve para
        // saber si el comprobante salió o no.
        expect(getArcaHint(10067)).toMatch(/ImpTrib = 0/);
        expect(getArcaHint(10283)).toMatch(/ImpTrib > 0/);
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
