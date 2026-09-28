import type { ArcaConfig, ArcaObservation } from './common';
import type { LoginTicket } from './wsaa';
import type { ArcaDateInput } from '../utils/formatArcaDate';

export type { ArcaDateInput };

/**
 * Configuración para WsfeService
 */
export interface WsfeConfig extends ArcaConfig {
    /** Ticket de autenticación WSAA */
    ticket: LoginTicket;
    /** Punto de venta (1-9999) */
    pointOfSale: number;
}

/**
 * Tipo de comprobante ARCA (`CbteTipo`).
 *
 * Este enum es una selección, no el catálogo completo: ARCA informa 36 tipos y acá hay
 * los de uso general. **La lista autoritativa la da `FEParamGetTiposCbte`**, consultable
 * con {@link WsfeService.getInvoiceTypes}.
 */
export enum InvoiceType {
    FACTURA_A = 1,
    NOTA_DEBITO_A = 2,
    NOTA_CREDITO_A = 3,
    RECIBO_A = 4,

    FACTURA_B = 6,
    NOTA_DEBITO_B = 7,
    NOTA_CREDITO_B = 8,
    RECIBO_B = 9,

    FACTURA_C = 11,
    NOTA_DEBITO_C = 12,
    NOTA_CREDITO_C = 13,
    RECIBO_C = 15,

    /**
     * Factura A con leyenda "Operación Sujeta a Retención".
     *
     * Es la clase que el manual abrevia **ALEY** (ver la tabla de {@link VatCondition}).
     * Junto con 52, 53 y 54 es el reemplazo de la Factura clase "M", disuelta por la
     * **RG 5762/2025** — pero los códigos no son nuevos: ARCA los tiene vigentes desde
     * el **22/05/2015**, verificado contra `FEParamGetTiposCbte` el 2026-09-27.
     *
     * @remarks **El SDK todavía no puede emitir este comprobante**: los métodos de
     * emisión fijan internamente su `CbteTipo` y no hay uno genérico que reciba un
     * `InvoiceType`. Lo que sí sirve hoy es **consultar**
     * ({@link WsfeService.getInvoice}) y **asociar** ({@link AssociatedInvoice.type},
     * para una Nota de Crédito que anule una Factura A con leyenda).
     *
     * @remarks **No se verificó por emisión real.** La única prueba es que ARCA lo lista
     * en su catálogo. Por eso tampoco hay helper dedicado: un helper afirma que el camino
     * funciona, y eso todavía no está probado.
     *
     * Disponible desde v3.0.0.
     */
    FACTURA_A_LEYENDA = 51,
    /** Nota de Débito A con leyenda "Operación Sujeta a Retención". Ver {@link InvoiceType.FACTURA_A_LEYENDA}. */
    NOTA_DEBITO_A_LEYENDA = 52,
    /** Nota de Crédito A con leyenda "Operación Sujeta a Retención". Ver {@link InvoiceType.FACTURA_A_LEYENDA}. */
    NOTA_CREDITO_A_LEYENDA = 53,
    /** Recibo A con leyenda "Operación Sujeta a Retención". Ver {@link InvoiceType.FACTURA_A_LEYENDA}. */
    RECIBO_A_LEYENDA = 54,

    // Los Tique (81 Tique A, 82 Tique B, 83 Tique C) se **eliminaron en la v3.0.0**.
    // ARCA no los lista en `FEParamGetTiposCbte` —verificado el 2026-09-27: de los quince
    // valores que tenía este enum, los únicos tres ausentes del catálogo eran ésos— y
    // `FECAESolicitar` los rechaza con el error 11001 desde un punto de venta Web
    // Services. Son de la RG 3561/2013 (Controladores Fiscales), un régimen distinto del
    // de la RG 4291/wsfev1. No se vuelven a agregar: para el caso general va Factura
    // (1 / 6 / 11). Ver el CHANGELOG de la v3.0.0 para la migración.
}

/**
 * Concepto de facturación
 */
export enum BillingConcept {
    PRODUCTS = 1,
    SERVICES = 2,
    PRODUCTS_AND_SERVICES = 3,
}

/**
 * Tipo de documento del receptor
 */
export enum TaxIdType {
    /**
     * Fondo Común de Inversiones CNV.
     *
     * Incorporado por el Manual del Desarrollador v4.5 (vigente 02/07/2026) para la
     * emisión de comprobantes por Entidades Financieras (RG 5866). El número de
     * documento es numérico de **hasta 4 dígitos** — informar más rechaza con el
     * código 10271.
     *
     * Disponible desde v2.0.0.
     */
    FCI_CNV = 31,

    CUIT = 80,
    CUIL = 86,
    CDI = 87,
    LE = 89,
    LC = 90,
    FOREIGN_ID = 91,
    PASSPORT = 94,
    BUENOS_AIRES_ID = 95,
    /**
     * Alias de {@link TaxIdType.DNI}: los dos valen **96**.
     *
     * @deprecated Usar `DNI`. Dos miembros con el mismo valor no conviven en un enum de
     * TypeScript: el reverse-mapping guarda el **último** declarado, así que
     * `TaxIdType[96]` es `'DNI'` y este nombre no se recupera nunca a partir del número.
     * Quien loguee o serialice `TaxIdType[docType]` va a ver `'DNI'` aunque haya pasado
     * `NATIONAL_POLICE_ID`.
     *
     * Y la equivalencia en sí no está verificada: la nota que traía este miembro citaba
     * una "Tabla 13 del catálogo ARCA" que no aparece en ninguno de los cuatro manuales.
     * La fuente autoritativa de los tipos de documento es `FEParamGetTiposDoc`, en vivo:
     * `wsfe.getDocumentTypes()`. Se conserva por compatibilidad —quitarlo rompe la
     * compilación de quien lo importe— y se elimina en la próxima major.
     */
    NATIONAL_POLICE_ID = 96,
    DNI = 96,
    FINAL_CONSUMER = 99,
}

/**
 * Ítem de factura
 */
export interface InvoiceItem {
    /** Descripción del producto/servicio */
    description: string;
    /** Cantidad */
    quantity: number;
    /** Precio unitario */
    unitPrice: number;
    /**
     * Alícuota de IVA en porcentaje: `0`, `2.5`, `5`, `10.5`, `21` o `27`.
     *
     * El catálogo completo, con el código que ARCA espera en `<AlicIva><Id>`, está en
     * {@link VAT_RATE_CODES}; la fuente autoritativa la da `wsfe.getVatRates()`.
     */
    vatRate?: number;
}

/**
 * Condición frente al IVA del receptor — campo `CondicionIVAReceptorId` (RG 5616/2024).
 *
 * El catálogo autoritativo lo devuelve `FEParamGetCondicionIvaReceptor` y está en la
 * última página del Manual del Desarrollador RG 4291. **No es correlativo**: los
 * códigos 2, 3 y 11 no pertenecen a esta tabla (ver los miembros deprecados abajo).
 *
 * Cada código aplica sólo a ciertas clases de comprobante. ARCA rechaza la combinación
 * inválida con el código 10243 (CAE) / 824 (CAEA):
 *
 * | Código | Descripción                          | Clases        |
 * |--------|--------------------------------------|---------------|
 * | 1      | IVA Responsable Inscripto            | A/ALEY, C     |
 * | 4      | IVA Sujeto Exento                    | B, C          |
 * | 5      | Consumidor Final                     | B, C, 49      |
 * | 6      | Responsable Monotributo              | A/ALEY, C     |
 * | 7      | Sujeto No Categorizado               | B, C          |
 * | 8      | Proveedor del Exterior               | B, C          |
 * | 9      | Cliente del Exterior                 | B, C          |
 * | 10     | IVA Liberado – Ley N° 19.640         | B, C          |
 * | 13     | Monotributista Social                | A/ALEY, C     |
 * | 15     | IVA No Alcanzado                     | B, C          |
 * | 16     | Monotributo Trab. Indep. Promovido   | A/ALEY, C     |
 *
 * ALEY = "A con leyenda 'operación sujeta a retención'" (RG 5762/2025).
 * La columna **49** es el Comprobante de Compra de Bienes Usados, y la única condición
 * que lo admite es Consumidor Final: se le emite a un particular que vende algo usado.
 *
 * @remarks Hasta la v3.0.0 esta tabla tenía **cinco filas mal** —la 1, 4, 6, 13 y 16—
 * porque se leyó la columna `C` como la `49`. La tabla del manual (v4.8, p. 202) marca
 * las clases con una `X` por celda, y el texto extraído del PDF las devuelve sin columna:
 * se reconstruyó con las coordenadas X de cada celda. Dos comprobaciones que cierran:
 * las **once** condiciones tienen `X` en la columna `C` —en clase C no hay IVA que
 * discriminar, así que las admite todas— y la columna `49` la tiene sólo la fila 5.
 *
 * @remarks A partir del **01/12/2026** informar este campo es obligatorio
 * (Manual v4.8, RG 5616): omitirlo pasa a rechazar con el código 10246 / 826.
 */
export enum VatCondition {
    IVA_RESPONSABLE_INSCRIPTO = 1,
    IVA_SUJETO_EXENTO = 4,
    CONSUMIDOR_FINAL = 5,
    RESPONSABLE_MONOTRIBUTO = 6,
    SUJETO_NO_CATEGORIZADO = 7,
    PROVEEDOR_DEL_EXTERIOR = 8,
    CLIENTE_DEL_EXTERIOR = 9,
    IVA_LIBERADO_LEY_19640 = 10,
    /**
     * Monotributista Social.
     *
     * @remarks Figura en el catálogo del manual, pero **en producción suele
     * rechazarse**: ARCA espera que todo monotributista —estándar, social o
     * promovido— se declare como {@link VatCondition.RESPONSABLE_MONOTRIBUTO} (6).
     * Por eso `PadronService` mapea a 6 y no a 13 aunque detecte los impuestos de
     * monotributo social. Está disponible acá para quien lo necesite y sepa que su
     * caso lo admite, pero **probalo contra homologación antes de usarlo**.
     *
     * Disponible desde v2.0.0.
     */
    MONOTRIBUTISTA_SOCIAL = 13,
    /** IVA No Alcanzado. Disponible desde v2.0.0. */
    IVA_NO_ALCANZADO = 15,
    /** Monotributo Trabajador Independiente Promovido. Disponible desde v2.0.0. */
    MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO = 16,

    /**
     * @deprecated No pertenece al catálogo de `CondicionIVAReceptorId`. ARCA rechaza
     * este valor con el código 10242 ("no es un valor permitido"). La figura del
     * Responsable No Inscripto no existe más en el IVA. Se elimina en la próxima major.
     */
    IVA_RESPONSABLE_NO_INSCRIPTO = 2,
    /**
     * @deprecated No pertenece al catálogo de `CondicionIVAReceptorId`. ARCA rechaza
     * este valor con el código 10242 ("no es un valor permitido"). Para un receptor
     * no alcanzado por el impuesto usá {@link VatCondition.IVA_NO_ALCANZADO} (15).
     * Se elimina en la próxima major.
     */
    IVA_NO_RESPONSABLE = 3,
    /**
     * @deprecated No pertenece al catálogo de `CondicionIVAReceptorId`. ARCA rechaza
     * este valor con el código 10242 ("no es un valor permitido"). La condición de
     * agente de percepción no se informa en este campo. Usá
     * {@link VatCondition.IVA_RESPONSABLE_INSCRIPTO} (1). Se elimina en la próxima major.
     */
    IVA_RESPONSABLE_INSCRIPTO_AGENTE_PERCEPCION = 11,
}

/**
 * Alícuotas de IVA vigentes, mapeadas al código que espera ARCA en `<AlicIva><Id>`.
 *
 * Copia local del catálogo que devuelve `FEParamGetTiposIva`, para poder validar sin
 * una llamada de red. **La autoridad es el método**, no este objeto: consultalo con
 * `wsfe.getVatRates()` si sospechás que ARCA agregó una.
 *
 * | Id | Alícuota | Vigente desde |
 * |----|----------|---------------|
 * | 3  | 0%       | 20/02/2009    |
 * | 4  | 10.5%    | 20/02/2009    |
 * | 5  | 21%      | 20/02/2009    |
 * | 6  | 27%      | 20/02/2009    |
 * | 8  | 5%       | 20/10/2014    |
 * | 9  | 2.5%     | 20/10/2014    |
 *
 * @remarks Hasta la v2.1.0 faltaban el 5% y el 2.5%, y el SDK las rechazaba como
 * inválidas pese a que ARCA las acepta desde 2014.
 *
 * Disponible desde v2.1.0.
 */
export const VAT_RATE_CODES: Readonly<Record<number, number>> = {
    0: 3,
    2.5: 9,
    5: 8,
    10.5: 4,
    21: 5,
    27: 6,
};

/**
 * Las alícuotas de {@link VAT_RATE_CODES} en porcentaje, ordenadas de menor a mayor y
 * listas para intercalar en un mensaje: `'0, 2.5, 5, 10.5, 21, 27'`.
 *
 * Existe para que ningún mensaje de error tenga su propia copia de la lista. Hasta la
 * v2.1.0 había varias copias escritas a mano y dos de ellas nombraban cuatro alícuotas
 * de las seis: el SDK aceptaba el 5% y el 2,5% y al mismo tiempo le decía al usuario
 * que no existían.
 *
 * `Object.keys` por sí solo no alcanza: JavaScript devuelve primero las claves que son
 * enteros, en orden ascendente, y después el resto en orden de inserción — daría
 * `0, 5, 21, 27, 2.5, 10.5`. De ahí el orden numérico explícito.
 *
 * @internal Uso interno del SDK. No se exporta desde el índice del paquete.
 */
export function listVatRates(): string {
    return Object.keys(VAT_RATE_CODES)
        .map(Number)
        .sort((a, b) => a - b)
        .join(', ');
}

/**
 * Códigos que ARCA acepta en `CondicionIVAReceptorId`.
 * Se usa para avisar temprano, antes de gastar un request que ARCA va a rechazar
 * con el código 10242.
 */
export const VALID_VAT_CONDITION_IDS: readonly number[] = [1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16];

/**
 * Datos del comprador
 */
export interface Buyer {
    /** Tipo de documento */
    docType: TaxIdType;
    /** Número de documento (sin guiones) */
    docNumber: string;
    /**
     * Condición frente al IVA del receptor — `CondicionIVAReceptorId` (RG 5616/2024).
     * Ej.: `VatCondition.CONSUMIDOR_FINAL`.
     *
     * @remarks **Opcional en el tipo, obligatorio en los hechos.** Homologación ya
     * rechaza el comprobante si falta (`Resultado = 'R'` con la observación **10246**,
     * verificado el 2026-09-25), y en producción pasa a rechazar el **01/12/2026**
     * (Manual v4.8). Sigue siendo opcional en el tipo para no romper la compilación de
     * quien ya usa el SDK, pero omitirlo hoy significa no poder facturar.
     */
    vatCondition?: VatCondition | number;
}

/**
 * Comprobante asociado (Requerido al emitir Notas de Crédito/Débito)
 */
export interface AssociatedInvoice {
    /** Tipo de comprobante original (ej. FACTURA_C) */
    type: InvoiceType;
    /** Punto de venta original */
    pointOfSale: number;
    /** Número de comprobante original */
    invoiceNumber: number;
    /** CUIT emisor (requerido a veces en MiPyME, opcional para resto) */
    cuit?: string;
    /** Fecha de emisión del comprobante original */
    date?: ArcaDateInput;
}

/**
 * Campo opcional de AFIP (ej. Condición IVA Receptor RG 5616)
 */
export interface InvoiceOptional {
    /** ID del dato opcional (ej. 1010) */
    id: string | number;
    /** Valor del dato opcional */
    value: string;
}

/**
 * Otro tributo del comprobante: percepciones, impuestos internos, tasas municipales.
 *
 * Son los que viajan en el array `<Tributos>` y suman a `ImpTrib` — **no** el IVA,
 * que va aparte en `<Iva>`. Los códigos los da `FEParamGetTiposTributos`; los más
 * usados son 2 (Provinciales), 3 (Municipales), 4 (Internos) y 13 (Percepción de
 * IVA No Categorizado, RG 2126/2006).
 *
 * @remarks El tributo **13** es obligatorio en comprobantes clase B cuyo receptor sea
 * No Categorizado (CUIT 23000000000) con `ImpTrib` > 0 — código 10283, incorporado
 * por el Manual v4.7 (vigente 01/09/2026).
 *
 * Disponible desde v2.0.0.
 */
export interface InvoiceTax {
    /** Código del tributo según `FEParamGetTiposTributos` (ej. 13). */
    id: number;
    /** Descripción libre. Opcional: ARCA usa la de su catálogo si se omite. */
    description?: string;
    /** Base imponible sobre la que se calcula. */
    taxBase: number;
    /** Alícuota aplicada, en porcentaje. */
    rate: number;
    /** Importe del tributo. Es lo que suma a `ImpTrib` y al total. */
    amount: number;
}

/**
 * Fechas de servicio (Obligatorio si concept es 2 o 3)
 */
export interface ServiceDates {
    startDate: ArcaDateInput;
    endDate: ArcaDateInput;
    dueDate: ArcaDateInput;
}

/**
 * Opciones comunes a todos los métodos de emisión de `WsfeService`.
 *
 * Disponible desde v2.0.0. Hasta entonces cada método declaraba estos campos inline
 * y tipaba `date` como `Date`, lo que impedía pasar la fecha-calendario literal
 * (`'2026-08-24'`) que es la forma recomendada — ver {@link ArcaDateInput}.
 */
export interface IssueOptions {
    /** Concepto. Default: `BillingConcept.PRODUCTS`. */
    concept?: BillingConcept;
    /**
     * Fecha del comprobante (default: hoy).
     *
     * Acepta `'YYYY-MM-DD'` / `'YYYYMMDD'` (fecha literal, **forma recomendada**) o un
     * `Date` (instante, se convierte al día calendario argentino).
     */
    date?: ArcaDateInput;
    /**
     * Campos opcionales adjuntos, para regímenes que los exigen. El catálogo lo da
     * {@link WsfeService.getOptionalTypes}; cada `id` tiene su formato y ARCA lo valida
     * por separado.
     *
     * @remarks No sirven para la leyenda de la RG 5762/2025 —ésa es una clase de
     * comprobante, {@link InvoiceType.FACTURA_A_LEYENDA}— ni para la condición de IVA
     * del receptor, que tiene campo propio en {@link Buyer.vatCondition}.
     */
    optionals?: InvoiceOptional[];
    /** Fechas de servicio. Obligatorias si `concept` es 2 o 3. */
    serviceDates?: ServiceDates;
    /** Otros tributos: percepciones, impuestos internos, tasas. Suman a `ImpTrib`. */
    taxes?: InvoiceTax[];
    /** Moneda del comprobante (`MonId`). Default: `'PES'`. */
    currency?: string;
    /** Cotización respecto del peso (`MonCotiz`). Default: `1`. */
    exchangeRate?: number;
    /** Cancelación en la misma moneda extranjera (`CanMisMonExt`). */
    payInSameForeignCurrency?: boolean;
}

/**
 * Request para emitir comprobante
 */
export interface IssueInvoiceRequest {
    /** Tipo de comprobante */
    type: InvoiceType;
    /** Concepto */
    concept: BillingConcept;
    /** Comprador (opcional para Factura C consumidor final) */
    buyer?: Buyer;
    /** Items de la factura */
    items?: InvoiceItem[];
    /** Comprobantes asociados (Obligatorio para Nota de Crédito/Débito) */
    associatedInvoices?: AssociatedInvoice[];
    /** Fechas de servicio (Obligatorio si concept es 2 o 3) */
    serviceDates?: ServiceDates;
    /** Monto total (requerido si no hay items) */
    total?: number;
    /** Desglose de IVA (requerido para Factura A/B) */
    vatData?: {
        rate: number;
        taxBase: number;
        amount: number;
    }[];
    /** Indica si los precios unitarios YA incluyen el IVA. Defecto: false */
    includesVAT?: boolean;
    /**
     * Fecha del comprobante (default: hoy).
     *
     * Acepta `'YYYY-MM-DD'` / `'YYYYMMDD'` (fecha literal) o un `Date`
     * (instante, se convierte al día calendario argentino). Ver {@link ArcaDateInput}.
     */
    date?: ArcaDateInput;
    /**
     * Campos opcionales adjuntos, para regímenes que los exigen: Promoción Industrial
     * (`id` 2), RG 3368 (`10`, `1011`, `1012`), RG 4004-E (`17`, `1801`, `1802`), y
     * demás. El catálogo lo da {@link WsfeService.getOptionalTypes}.
     *
     * @remarks **La condición de IVA del receptor NO va acá.** Tiene campo propio:
     * {@link Buyer.vatCondition}. Informarla como opcional con el `id` 1010 es la forma
     * vieja, anterior a que el manual le diera un campo, y hoy da rechazo **10242**.
     */
    optionals?: InvoiceOptional[];
    /**
     * Otros tributos (percepciones, impuestos internos, tasas). Suman a `ImpTrib`
     * y al importe total. No incluir acá el IVA. Disponible desde v2.0.0.
     */
    taxes?: InvoiceTax[];
    /**
     * Moneda del comprobante (`MonId`). Default: `'PES'`.
     *
     * Los códigos los da `FEParamGetTiposMonedas` (`'DOL'` para dólar estadounidense,
     * `'060'` para euro). Si no es `'PES'` hay que informar `exchangeRate`.
     *
     * Disponible desde v2.0.0.
     */
    currency?: string;
    /**
     * Cotización de la moneda respecto del peso (`MonCotiz`). Default: `1`.
     *
     * **Traela de `FEParamGetCotizacion`, no la fijes a mano.** Si el pago es en la
     * misma moneda extranjera (`payInSameForeignCurrency`), ARCA exige que coincida
     * *exactamente* con la cotización del día hábil anterior, y rechaza con el
     * código 10038 si no.
     *
     * Disponible desde v2.0.0.
     */
    exchangeRate?: number;
    /**
     * Indica que el comprobante se cancela en la misma moneda extranjera en que fue
     * emitido (`CanMisMonExt`, campo incorporado por el Manual v4.0 / RG 5616).
     *
     * Sólo aplica con `currency` distinta de `'PES'`: con moneda nacional el campo no
     * debe informarse (código 822 en CAEA / validación equivalente en CAE).
     *
     * Disponible desde v2.0.0.
     */
    payInSameForeignCurrency?: boolean;
}

/**
 * Respuesta CAE (Código de Autorización Electrónico)
 */
export interface CAEResponse {
    /** Tipo de comprobante */
    invoiceType: number;
    /** Punto de venta */
    pointOfSale: number;
    /** Número de comprobante */
    invoiceNumber: number;
    /** Fecha de emisión (YYYYMMDD) */
    date: string;
    /** CAE asignado */
    cae: string;
    /** Fecha de vencimiento del CAE (YYYYMMDD) */
    caeExpiry: string;
    /** Resultado (A = Aprobado, R = Rechazado) */
    result: 'A' | 'R';
    /**
     * Observaciones de ARCA, sólo los mensajes.
     *
     * Un comprobante puede salir **aprobado con observaciones**: eso no es un rechazo y no
     * lanza. Para ramificar por código usá {@link CAEResponse.observationDetails}.
     */
    observations?: string[];
    /**
     * Las mismas observaciones, con el código de cada una (`Obs.Code`).
     *
     * Disponible desde v3.0.0: hasta entonces el SDK descartaba el código al parsear, así
     * que quien quisiera distinguir una observación de otra tenía que hacer expresiones
     * regulares sobre el texto.
     */
    observationDetails?: ArcaObservation[];
    /** Items (se retornan si fueron proveídos en el request) */
    items?: InvoiceItem[];
    /** Desglose IVA (solo para Factura A/B) */
    vat?: {
        rate: number;
        taxBase: number;
        amount: number;
    }[];
    /** URL del código QR oficial de ARCA */
    qrUrl?: string;
}

/**
 * Detalle de un comprobante consultado (FECompConsultar)
 */
export interface InvoiceDetails {
    /** Tipo de comprobante */
    invoiceType: number;
    /** Punto de venta */
    pointOfSale: number;
    /** Número de comprobante */
    invoiceNumber: number;
    /** Fecha de emisión (YYYYMMDD) */
    date: string;
    /** Concepto */
    concept: number;
    /** Tipo de documento del receptor */
    docType: number;
    /** Número de documento del receptor */
    docNumber: number;
    /** Importe total */
    total: number;
    /** Importe neto gravado */
    net: number;
    /** Importe IVA */
    vat: number;
    /** CAE */
    cae: string;
    /** Vencimiento CAE (YYYYMMDD) */
    caeExpiry: string;
    /** Resultado */
    result: 'A' | 'R';
    /** Campos opcionales adjuntos */
    optionals?: InvoiceOptional[];
}

/**
 * Punto de venta habilitado en ARCA
 */
export interface PointOfSale {
    /** Número de punto de venta */
    number: number;
    /** Tipo (CAI, CAE, CAEA, etc.) */
    type: string;
    /** Indica si está bloqueado */
    isBlocked: boolean;
    /** Fecha de bloqueo (si aplica) */
    blockedSince?: string;
}

/**
 * Entrada de un catálogo de referencia de ARCA (`FEParamGet*`).
 *
 * Los catálogos son la fuente autoritativa: los enums de este SDK son una copia local
 * para tener autocompletado y chequeo en compilación, pero se desactualizan cuando ARCA
 * agrega un valor. Si una validación local rechaza algo que creés válido, consultá el
 * catálogo vivo antes de asumir que el equivocado sos vos.
 *
 * Disponible desde v2.1.0.
 */
export interface CatalogEntry {
    /** Código que espera ARCA en el comprobante. */
    id: string;
    /** Descripción oficial. */
    description: string;
    /** Vigente desde (`yyyymmdd`), si ARCA la informa. */
    validFrom?: string;
    /** Vigente hasta (`yyyymmdd`). Ausente o `NULL` significa sin fecha de baja. */
    validTo?: string;
}

/**
 * Entrada del catálogo de condición de IVA del receptor
 * (`FEParamGetCondicionIvaReceptor`).
 *
 * Disponible desde v2.1.0.
 */
export interface VatConditionEntry extends CatalogEntry {
    /**
     * Clases de comprobante en las que ARCA admite esta condición (ej. `'A/ALEY/C'`).
     *
     * **La autoridad es el servicio, no la copia local.** Este campo llega tal como lo
     * devuelve ARCA en `Cmp_Clase`, y por eso la relación no está hardcodeada: la tabla
     * del manual es una foto, y una copia escrita a mano se desactualiza en silencio el
     * día que ARCA cambia una fila.
     *
     * @remarks **No varía según el emisor**, aunque hasta la v3.0.0 este JSDoc lo
     * afirmaba. Medido el 27/09/2026: el servicio devuelve las mismas once filas, una
     * por una, para un CUIT monotributista y para uno Responsable Inscripto —los dos
     * extremos, uno que sólo emite C y otro que emite A—. Son dos CUITs, no un censo,
     * pero alcanzan para no seguir afirmando lo contrario.
     */
    invoiceClass?: string;
}

/**
 * Cotización de una moneda (`FEParamGetCotizacion`).
 *
 * Disponible desde v2.1.0.
 */
export interface CurrencyRate {
    /** Código de moneda (ej. `'DOL'`). */
    currency: string;
    /** Cotización respecto del peso. */
    rate: number;
    /** Fecha de la cotización (`yyyymmdd`). */
    date: string;
}

/**
 * Estado de los servidores de ARCA
 */
export interface ServiceStatus {
    /** Estado del servidor de aplicaciones */
    appServer: string;
    /** Estado del servidor de base de datos */
    dbServer: string;
    /** Estado del servidor de autenticación */
    authServer: string;
}
