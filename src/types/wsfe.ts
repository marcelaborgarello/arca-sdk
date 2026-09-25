import type { ArcaConfig } from './common';
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
 * Tipo de comprobante ARCA
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

    TICKET_A = 81,
    TICKET_B = 82,
    TICKET_C = 83,
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
     * Disponible desde v1.5.0.
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
     * @note AFIP usa el código 96 para ambos. En la práctica, DNI es el más utilizado.
     * Fuente: Tabla 13 del catálogo ARCA — ambos valores son 96 en el catálogo oficial.
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
    /** Alícuota IVA % (0, 10.5, 21, 27) */
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
 * | 1      | IVA Responsable Inscripto            | A/ALEY, 49    |
 * | 4      | IVA Sujeto Exento                    | A/ALEY, 49    |
 * | 5      | Consumidor Final                     | B, C, 49      |
 * | 6      | Responsable Monotributo              | A/ALEY, 49    |
 * | 7      | Sujeto No Categorizado               | B, C          |
 * | 8      | Proveedor del Exterior               | B, C          |
 * | 9      | Cliente del Exterior                 | B, C          |
 * | 10     | IVA Liberado – Ley N° 19.640         | B, C          |
 * | 13     | Monotributista Social                | A/ALEY, 49    |
 * | 15     | IVA No Alcanzado                     | B, C          |
 * | 16     | Monotributo Trab. Indep. Promovido   | A/ALEY, 49    |
 *
 * ALEY = "A con leyenda 'operación sujeta a retención'" (RG 5762/2025).
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
    /** Monotributista Social. Disponible desde v1.5.0. */
    MONOTRIBUTISTA_SOCIAL = 13,
    /** IVA No Alcanzado. Disponible desde v1.5.0. */
    IVA_NO_ALCANZADO = 15,
    /** Monotributo Trabajador Independiente Promovido. Disponible desde v1.5.0. */
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
    /** Opcional: Condición frente al IVA del receptor (ej: VatCondition.CONSUMIDOR_FINAL) */
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
 * Disponible desde v1.5.0.
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
 * Disponible desde v1.5.0. Hasta entonces cada método declaraba estos campos inline
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
    /** Campos opcionales adjuntos (ej. RG 5762/2025, leyendas de Factura A). */
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
    /** Campos opcionales adjuntos (ej: Condición IVA receptor ID 1010) */
    optionals?: InvoiceOptional[];
    /**
     * Otros tributos (percepciones, impuestos internos, tasas). Suman a `ImpTrib`
     * y al importe total. No incluir acá el IVA. Disponible desde v1.5.0.
     */
    taxes?: InvoiceTax[];
    /**
     * Moneda del comprobante (`MonId`). Default: `'PES'`.
     *
     * Los códigos los da `FEParamGetTiposMonedas` (`'DOL'` para dólar estadounidense,
     * `'060'` para euro). Si no es `'PES'` hay que informar `exchangeRate`.
     *
     * Disponible desde v1.5.0.
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
     * Disponible desde v1.5.0.
     */
    exchangeRate?: number;
    /**
     * Indica que el comprobante se cancela en la misma moneda extranjera en que fue
     * emitido (`CanMisMonExt`, campo incorporado por el Manual v4.0 / RG 5616).
     *
     * Sólo aplica con `currency` distinta de `'PES'`: con moneda nacional el campo no
     * debe informarse (código 822 en CAEA / validación equivalente en CAE).
     *
     * Disponible desde v1.5.0.
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
    /** Observaciones de ARCA */
    observations?: string[];
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
