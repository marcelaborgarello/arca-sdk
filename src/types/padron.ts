import type { ArcaConfig } from './common';
import type { TokenStorage } from '../auth/storage';

/**
 * Configuración para PadronService
 */
export interface TaxpayerServiceConfig extends ArcaConfig {
    /** CUIT del emisor (quien consulta) */
    cuit: string;
    /** Certificado X.509 en formato PEM */
    cert: string;
    /** Clave privada en formato PEM */
    key: string;
    /** Adaptador opcional para persistencia de tokens */
    storage?: TokenStorage;
}

/**
 * Actividad económica según AFIP
 */
export interface Activity {
    id: number;
    description: string;
    order: number;
    period: number;
}

/**
 * Impuesto registrado en AFIP
 */
export interface TaxRecord {
    id: number;
    description: string;
    period: number;
}

/**
 * Domicilio registrado en AFIP
 */
export interface Address {
    street: string;
    city?: string;
    postalCode?: string;
    provinceId: number;
    province: string;
    /** Tipo: FISCAL, LEGAL, etc. */
    type: string;
}

/**
 * Persona (física o jurídica) obtenida del Padrón A13
 */
export interface Taxpayer {
    taxId: number;
    personType: 'FISICA' | 'JURIDICA';
    /** Nombre (persona física) */
    firstName?: string;
    /** Apellido (persona física) */
    lastName?: string;
    /** Razón social (persona jurídica) */
    companyName?: string;
    /** Estado de la clave fiscal */
    status: string;
    addresses: Address[];
    activities?: Activity[];
    taxes?: TaxRecord[];
    mainActivity?: string;
    /** ¿Está inscripto en IVA? */
    isVATRegistered: boolean;
    /** ¿Es monotributista (Régimen General o Social)? */
    isMonotax: boolean;
    /** ¿Es exclusivamente Monotributista Social / Autónomo / Promovido? */
    isSocialMonotax: boolean;
    /** ¿Es exento de IVA? */
    isVATExempt: boolean;
    /** Condición frente al IVA autocalculada (lista para WSFE/CAEA) */
    vatCondition?: import('./wsfe').VatCondition;
}

/**
 * Estado de los componentes del servicio de Padrón A13, devuelto por `dummy()`.
 *
 * El manual (*Manual Consulta a Padrón – Alcance 13 v1.4*, sección 3.1.2) documenta sólo
 * estos dos valores posibles para cada componente: `"OK"` o, ante una falla, `"ERROR"`.
 */
export interface PadronServiceStatus {
    /** Estado de la aplicación. */
    appServer: 'OK' | 'ERROR';
    /** Estado del servicio de autenticación (WSAA). */
    authServer: 'OK' | 'ERROR';
    /** Estado de la base de datos. */
    dbServer: 'OK' | 'ERROR';
}

/**
 * Respuesta del servicio de Padrón
 */
export interface TaxpayerResponse {
    taxpayer?: Taxpayer;
    error?: string;
    /**
     * Sugerencia de qué hacer ante `error`, cuando el SDK reconoce el mensaje. Sólo se
     * completa para los faults de ARCA documentados en el anexo 5.3 del *Manual Consulta a
     * Padrón – Alcance 13 v1.4* (ver `getPadronHint()` en `constants/errors.ts`); un `error`
     * sin `hint` no es un bug, es un mensaje que el manual no describe.
     */
    hint?: string;
}

/**
 * Respuesta de `getTaxpayerIdsByDocument()` (método SOAP `getIdPersonaListByDocumento`,
 * Manual A13 v1.4, sección 3.3).
 */
export interface TaxpayerIdsResponse {
    /**
     * CUITs/CUILs asociados al documento consultado. Un array vacío es un resultado
     * válido (el documento no tiene claves asociadas en el padrón), no un error — el
     * manual no documenta "sin resultados" como fault para este método.
     *
     * **Sin verificar contra ARCA real todavía** que un documento sin coincidencias
     * efectivamente devuelva esto en vez de, por ejemplo, un `Fault`: el manual no trae
     * un ejemplo de ese caso.
     */
    taxIds?: number[];
    error?: string;
    /** Ver {@link TaxpayerResponse.hint}. */
    hint?: string;
}
