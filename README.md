<div align="center">

# 🇦🇷 arca-sdk

**La SDK de ARCA (ex-AFIP) que querías que alguien hiciera.**

TypeScript nativo · API limpia en inglés · Tokens automáticos · QR oficial · Padrón A13

[![npm version](https://img.shields.io/npm/v/arca-sdk?color=CB3837&label=npm)](https://www.npmjs.com/package/arca-sdk)
[![npm downloads](https://img.shields.io/npm/dm/arca-sdk?color=CB3837)](https://www.npmjs.com/package/arca-sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

## ¿Por qué arca-sdk?

La mayoría de las librerías de AFIP/ARCA para Node.js son:
- Ports de código PHP/Java sin tipos
- Sin soporte para el Padrón A13
- Sin manejo de tokens (te obligan a gestionarlos a mano)
- Sin QR oficial
- Sin mantenimiento activo

`arca-sdk` fue construida desde cero en TypeScript moderno, probada contra producción real, y documenta quirks del spec oficial que ninguna otra librería menciona (como el `encodeURIComponent` que rompe el scanner de ARCA).

---

## Instalación

```bash
# npm
npm install arca-sdk

# bun
bun add arca-sdk

# pnpm
pnpm add arca-sdk
```

**Requisitos:** Node.js 18+ · TypeScript 5+ (optional but recommended) · Bun compatible

---

## 🔐 Security & Responsibility / Seguridad y Responsabilidad

### 🇺🇸 English

**arca-sdk** is designed to be **stateless and cloud-native**. It does **NOT** persist certificates or private keys to the filesystem.

It is the responsibility of the implementing application to:
1.  **Securely store** the Private Key (`.key`) and Certificate (`.crt`). (Recommended: Encrypted Database, AWS KMS, HashiCorp Vault).
2.  **Decrypt** credentials only at runtime.
3.  Pass the raw strings/buffers to the SDK constructors.

> [!WARNING]
> Never commit your `.key` files to Git or expose them in public folders. The SDK operates in-memory to ensure maximum security in Serverless environments (Vercel, AWS Lambda).

### 🇦🇷 Español

**arca-sdk** está diseñado para ser **stateless** (sin estado) y **cloud-native**. **NO** guarda certificados ni claves privadas en el sistema de archivos.

Es responsabilidad de la aplicación que implementa el SDK:
1.  **Almacenar de forma segura** la Clave Privada (`.key`) y el Certificado (`.crt`). (Recomendado: Base de Datos encriptada, AWS KMS, HashiCorp Vault).
2.  **Desencriptar** las credenciales solo en tiempo de ejecución.
3.  Pasar los strings o buffers crudos a los constructores del SDK.

> [!CAUTION]
> Nunca subas tus archivos `.key` a Git ni los expongas en carpetas públicas. El SDK opera en memoria para garantizar la máxima seguridad en entornos Serverless (Vercel, AWS Lambda).

---

## Quick Start — 5 minutos y estás facturando

```typescript
import * as fs from 'fs';
import { WsaaService, WsfeService, TaxIdType, VatCondition } from 'arca-sdk';

// 1. Autenticación con WSAA (se renueva automáticamente)
const wsaa = new WsaaService({
  environment: 'homologacion', // 'produccion' cuando estés listo
  cuit: '20123456789',
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key:  fs.readFileSync('key.pem',  'utf-8'),
  service: 'wsfe',
});

const ticket = await wsaa.login();

// 2. Servicio de facturación
const wsfe = new WsfeService({
  environment: 'homologacion',
  cuit: '20123456789',
  ticket,
  pointOfSale: 4,
});

// 3. Emitir Factura C
const result = await wsfe.issueInvoiceC({
  items: [{ description: 'Producto', quantity: 1, unitPrice: 1500 }],
  buyer: {
    docType: TaxIdType.FINAL_CONSUMER,
    docNumber: '0',
    vatCondition: VatCondition.CONSUMIDOR_FINAL,   // RG 5616 — ver abajo
  },
});

console.log('CAE:', result.cae);              // '75157992335329'
console.log('Vto:', result.caeExpiry);        // '20260302'
console.log('QR:', result.qrUrl);             // 'https://www.arca.gob.ar/fe/qr/?p=...'
```

> [!IMPORTANT]
> **`buyer.vatCondition` no es opcional en la práctica.** Homologación ya rechaza los
> comprobantes que no lo informan, y en producción es obligatorio desde el 01/12/2026
> (RG 5616). Si lo omitís, ARCA devuelve `Resultado = 'R'` y el SDK lanza
> `ArcaRejectionError`. Detalle en "Normativas ARCA 2026", punto 0.

> Los certificados se obtienen en el [portal de ARCA](https://auth.afip.gob.ar/contribuyente_/login.xhtml) (CLAVE FISCAL nivel 3+).

---

## Funcionalidades

### ✅ Servicios soportados

| Servicio | Descripción | Estado |
|----------|-------------|--------|
| **WSAA** | Autenticación y Autorización | ✅ Completo |
| **WSFE v1** | Facturación Electrónica (A, B, C) | ✅ Completo |
| **Padrón A13** | Consulta de datos de contribuyentes | ✅ Completo |
| **CAEA** | Contingencia: solicitud, consulta y rendición informativa | ⚠️ Implementado, sin verificar contra homologación |

### ✅ Tipos de comprobantes

| Método | Comprobante | Cuándo usarlo |
|--------|-------------|---------------|
| `issueSimpleReceipt()` ⚠️ | Ticket C | **Deprecado.** Ver nota abajo |
| `issueReceipt()` ⚠️ | Ticket C + items | **Deprecado.** Ver nota abajo |
| `issueInvoiceC()` | Factura C | Monotributistas a consumidor final / Empresas |
| `issueInvoiceB()` | Factura B | Responsable Inscripto a consumidor final / Monotributo |
| `issueInvoiceA()` | Factura A | Responsable Inscripto a Responsable Inscripto |
| `issueCreditNoteA/B/C()` | Nota de Crédito | Anulación/Devolución (Requiere asociar la factura original) |
| `issueDebitNoteA/B/C()` | Nota de Débito | Cobro extra/Penalidad (Requiere asociar la factura original) |
| `issueReceiptA/B/C()` | Recibo | Comprobante de pago (misma emisión que una factura) |

> [!WARNING]
> **`issueSimpleReceipt()` e `issueReceipt()` están deprecados.** El comprobante
> "Tique" (81/82/83) está regido por la RG 3561/2013 (Controladores Fiscales), una
> resolución distinta de la RG 4291/wsfev1 que sigue el resto del SDK. `FECAESolicitar`
> con `CbteTipo=83` se rechaza con error ARCA **11001** desde un punto de venta Web
> Services estándar — el único tipo de punto de venta que un consumidor de este SDK
> puede tener. Para el caso general (consumidor final, sin Controlador Fiscal
> homologado) usá `issueInvoiceC()`.

### ✅ Consultas disponibles

| Método | Descripción |
|--------|-------------|
| `wsfe.getInvoice(type, n)` | Consulta un comprobante ya emitido (FECompConsultar) |
| `wsfe.getPointsOfSale()` | Lista puntos de venta habilitados (FEParamGetPtosVenta). Devuelve `[]` si el CUIT no tiene ninguno |
| `WsfeService.checkStatus()` | Estado de los servidores de ARCA (FEDummy) |
| `padron.getTaxpayer(cuit)` | Datos del contribuyente — nombre, domicilio, condición IVA |

### ✅ Catálogos de referencia (`FEParamGet*`)

Los enums de este SDK son una copia local del catálogo de ARCA: dan autocompletado y
chequeo en compilación, pero **se desactualizan en silencio**. Estos métodos consultan la
fuente autoritativa en vivo.

| Método | Servicio | Devuelve |
|--------|----------|----------|
| `wsfe.getInvoiceTypes()` | `FEParamGetTiposCbte` | La lista real de comprobantes emitibles |
| `wsfe.getVatRates()` | `FEParamGetTiposIva` | Alícuotas de IVA vigentes |
| `wsfe.getTaxTypes()` | `FEParamGetTiposTributos` | Tributos para `taxes` |
| `wsfe.getVatConditions()` | `FEParamGetCondicionIvaReceptor` | Condiciones de IVA admitidas **para el emisor autenticado**, con la clase de comprobante en que aplican |
| `wsfe.getExchangeRate(moneda, fecha?)` | `FEParamGetCotizacion` | Cotización oficial — usala en vez de fijar `exchangeRate` a mano |
| `wsfe.getDocumentTypes()` | `FEParamGetTiposDoc` | Tipos de documento del receptor |
| `wsfe.getCurrencies()` | `FEParamGetTiposMonedas` | Monedas |
| `wsfe.getConceptTypes()` | `FEParamGetTiposConcepto` | Productos / servicios / ambos |
| `wsfe.getOptionalTypes()` | `FEParamGetTiposOpcional` | Ids válidos para `optionals` |
| `wsfe.getActivities()` | `FEParamGetActividades` | Actividades económicas del emisor |

> **`getVatConditions()` depende del emisor**: ARCA devuelve las combinaciones válidas para
> ese CUIT, que no coinciden necesariamente con la tabla del manual. Por eso esa relación
> no está hardcodeada en el SDK.

---

## Ejemplos

### Ticket C con detalle de items ⚠️ (deprecado)

> Ver la advertencia en "Tipos de comprobantes" más arriba — `issueReceipt()`
> emite Tique C, que ARCA rechaza desde un punto de venta Web Services estándar. Este
> ejemplo queda documentado solo para quien tenga un Controlador Fiscal homologado.

```typescript
const result = await wsfe.issueReceipt({
  items: [
    { description: 'Café con leche',  quantity: 2, unitPrice: 750 },
    { description: 'Medialunas x4',   quantity: 1, unitPrice: 600 },
  ],
});

console.log('Items en respuesta:', result.items?.length); // 2
console.log('QR URL:', result.qrUrl);
```

### Factura B con IVA discriminado

```typescript
import { TaxIdType, VatCondition } from 'arca-sdk';

const result = await wsfe.issueInvoiceB({
  items: [
    { description: 'Servicio de diseño', quantity: 10, unitPrice: 1000, vatRate: 21 },
    { description: 'Hosting mensual',    quantity: 1,  unitPrice: 5000, vatRate: 21 },
  ],
  buyer: {
    docType: TaxIdType.CUIT,
    docNumber: '20987654321',
    vatCondition: VatCondition.CONSUMIDOR_FINAL,
  },
});

// VAT breakdown (required by ARCA for A/B invoices)
result.vat?.forEach(v => {
  console.log(`IVA ${v.rate}%: base $${v.taxBase} → $${v.amount}`);
});
```

### Campos opcionales (`optionals`)

Los Opcionales son un array de pares `id`/`value` del esquema de ARCA, para datos que
sólo aplican a ciertos regímenes. El caso más común es la **leyenda de Factura A** que
exige la RG 5762/2025 — ver "Normativas ARCA 2026", punto 2.

> [!IMPORTANT]
> **La Condición frente al IVA del receptor NO se envía por `optionals`.** Tiene campo
> propio: `buyer.vatCondition` (el `CondicionIVAReceptorId` del esquema). Hasta la v1.1.0
> este README documentaba mandarla como un opcional; ese camino quedó obsoleto cuando el
> Manual del Desarrollador le dio un campo propio, y **los valores del catálogo no son los
> mismos**. Ver "Normativas ARCA 2026", punto 0.

```typescript
import { TaxIdType, VatCondition } from 'arca-sdk';

const result = await wsfe.issueInvoiceC({
  items: [
    { description: 'Licencia de software', quantity: 1, unitPrice: 15000 },
  ],
  buyer: {
    docType: TaxIdType.FINAL_CONSUMER,
    docNumber: '0',
    vatCondition: VatCondition.CONSUMIDOR_FINAL,   // ← campo propio, no un opcional
  },
  optionals: [
    { id: 5, value: '1' },   // consultá el catálogo antes de fijar un id a mano
  ],
});
```

> El catálogo de ids válidos lo devuelve `wsfe.getOptionalTypes()`
> (`FEParamGetTiposOpcional`). Es la fuente autoritativa: los ids que aplican dependen del
> régimen y de la clase de comprobante.

### Nota de Crédito (Anulando factura previa)

```typescript
import { InvoiceType, TaxIdType, VatCondition } from 'arca-sdk';

const result = await wsfe.issueCreditNoteC({
  items: [
    { description: 'Anulación de equipo defectuoso', quantity: 1, unitPrice: 45000 },
  ],
  buyer: {
    docType: TaxIdType.FINAL_CONSUMER,
    docNumber: '0',
    vatCondition: VatCondition.CONSUMIDOR_FINAL,
  },
  // ⚠️ Obligatorio en NC/ND: especificar el comprobante original afectado
  associatedInvoices: [{
    type: InvoiceType.FACTURA_C, // La factura que estoy anulando
    pointOfSale: 4,
    invoiceNumber: 15302,
  }],
});

console.log('CAE de anulación:', result.cae);
```

### Consulta de Padrón A13

```typescript
import { PadronService } from 'arca-sdk';

const padron = new PadronService({
  environment: 'homologacion',
  cuit: '20123456789',
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key:  fs.readFileSync('key.pem',  'utf-8'),
});

const { taxpayer, error } = await padron.getTaxpayer('30111111118');
if (taxpayer) {
  const name = taxpayer.companyName || `${taxpayer.firstName} ${taxpayer.lastName}`;
  console.log('Nombre:', name);
  console.log('Provincia:', taxpayer.addresses[0]?.province);
  console.log('¿IVA?:', taxpayer.isVATRegistered);
  console.log('¿Mono?:', taxpayer.isMonotax);
}
```

### God Mode: persistencia automática de tokens

Pasale un adaptador `storage` y el SDK gestiona el ciclo de vida del ticket solo — incluyendo renovación automática al expirar.

```typescript
const wsaa = new WsaaService({
  ...config,
  service: 'wsfe',
  storage: {
    // Leé el ticket guardado (de DB, Redis, filesystem, lo que sea)
    get: async (cuit, env) => {
      const row = await db.token.findUnique({ where: { cuit, env } });
      return row ? { token: row.token, sign: row.sign, ... } : null;
    },
    // Guardá el ticket nuevo
    save: async (cuit, env, ticket) => {
      await db.token.upsert({ ... });
    },
  }
});

// Desde ahora, .login() va a buscar el token en la DB antes de pedirle uno a ARCA
const ticket = await wsaa.login();
```

### QR oficial de ARCA

```typescript
import { generateQRUrl } from 'arca-sdk';

// 1. Ya viene integrado en todos los métodos de emisión:
const result = await wsfe.issueInvoiceC({
  items: [{ description: 'Producto', quantity: 1, unitPrice: 1500 }],
  buyer: {
    docType: TaxIdType.FINAL_CONSUMER,
    docNumber: '0',
    vatCondition: VatCondition.CONSUMIDOR_FINAL,
  },
});
console.log(result.qrUrl); // listo para embeber en un generador de QR

// 2. O generalo a mano si ya tenés la respuesta:
const url = generateQRUrl(caeResponse, '20123456789', 1500.00);
```

> **Nota:** La URL usa base64 crudo sin `encodeURIComponent`. Es un quirk del spec oficial de ARCA — su scanner no acepta caracteres URL-encoded.

### 📋 Normativas ARCA 2026 & Buenas Prácticas

`arca-sdk` está completamente adaptada a las últimas directivas de la **Agencia de Recaudación y Control Aduanero (ARCA)**:

#### 0. Condición frente al IVA del receptor (RG 5616) — **obligatorio**

Es el requisito más urgente. Informá siempre `buyer.vatCondition`:

```typescript
import { VatCondition, TaxIdType } from 'arca-sdk';

await wsfe.issueInvoiceC({
  items: [{ description: 'Producto', quantity: 1, unitPrice: 1500 }],
  buyer: {
    docType: TaxIdType.FINAL_CONSUMER,
    docNumber: '0',
    vatCondition: VatCondition.CONSUMIDOR_FINAL, // ← sin esto, ARCA rechaza
  },
});
```

* **En producción es obligatorio desde el 01/12/2026** ([Manual del Desarrollador RG 4291](https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf), v4.8).
  Hasta entonces el comprobante sale con una observación; después, se rechaza.
* **En homologación ya se rechaza hoy** (verificado el 25/09/2026): la respuesta vuelve
  con `Resultado = 'R'` y la observación del código **10246**. Si estás probando ahí y
  te rechaza, es esto.
* El catálogo **no es correlativo**: los códigos 2, 3 y 11 **no existen** y ARCA los
  rechaza con el código 10242. Están deprecados en el enum y se eliminan en la próxima
  major. Los válidos son 1, 4, 5, 6, 7, 8, 9, 10, 13, 15 y 16 — exportados en
  `VALID_VAT_CONDITION_IDS`.
* Cada código aplica sólo a ciertas clases de comprobante: Consumidor Final (5) va en
  B y C, Responsable Inscripto (1) va en A. La combinación inválida da 10243.

#### 1. Identificación del Comprador (RG 5866/2026)
* A partir de 2026, bajo la **RG 5866/2026** (que abrogó y unificó la RG 5824/2026), el monto límite para compras de **Consumidores Finales** sin identificar se estableció en **$10.000.000**.
* Si el importe acumulado del comprobante es **igual o mayor a $10.000.000**, es **obligatorio** identificar al comprador mediante su DNI, CUIT, CUIL o CDI en el objeto `buyer`.
* Si el cliente solicita el comprobante para deducir el gasto en el Impuesto a las Ganancias, es obligatorio identificarlo con su CUIT sin importar el monto.

#### 2. Emisión de Facturas Clase "A" con Leyenda (RG 5762/2025)
Con la eliminación total de la Factura Clase "M", ARCA instruyó el uso de Facturas Clase "A" tradicionales acompañadas de leyendas impositivas obligatorias. La SDK permite resolver este requerimiento utilizando el bloque de campos opcionales del protocolo SOAP:

* **Operación Sujeta a Retención (Reemplazo de Factura M):**
  Para emitir una Factura A sujeta al régimen de retención, debés pasar en la propiedad `optionals` el identificador oficial provisto por ARCA:
  ```typescript
  const result = await wsfe.issueInvoiceA({
    items: [...],
    buyer: {
      docType: TaxIdType.CUIT,
      docNumber: '30716024941',
      vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO,
    },
    optionals: [
      {
        id: 5, // ID opcional para indicar la condicion
        value: '1' // Valor segun catalogo de ARCA
      }
    ]
  });
  ```
* **Pago en CBU Informada:**
  De igual modo, si te corresponde emitir con la leyenda de obligatoriedad de CBU, se adjunta el opcional correspondiente declarando tu cuenta bancaria asociada.

#### 3. Otros tributos: percepciones, impuestos internos, tasas

Los tributos que **no son IVA** viajan en su propio array y suman a `ImpTrib` y al total:

```typescript
await wsfe.issueInvoiceB({
  items: [{ description: 'Producto', quantity: 1, unitPrice: 1000, vatRate: 21 }],
  buyer: { docType: TaxIdType.CUIT, docNumber: '20111111112', vatCondition: VatCondition.CONSUMIDOR_FINAL },
  taxes: [{
    id: 2,                    // 2 = Provinciales (FEParamGetTiposTributos)
    description: 'Percepción IIBB',
    taxBase: 1000,
    rate: 3,
    amount: 30,
  }],
});
```

Es también la forma de cumplir el código **10283** del Manual v4.7 (vigente 01/09/2026),
que exige informar el tributo `ID 13 – Percepción de IVA No Categorizado` en
comprobantes clase B cuyo receptor sea No Categorizado.

#### 4. Moneda extranjera

```typescript
await wsfe.issueInvoiceA({
  items: [{ description: 'Servicio', quantity: 1, unitPrice: 100, vatRate: 21 }],
  buyer: { docType: TaxIdType.CUIT, docNumber: '20111111112', vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO },
  currency: 'DOL',                  // FEParamGetTiposMonedas
  exchangeRate: 1450.50,
  payInSameForeignCurrency: true,   // CanMisMonExt (RG 5616)
});
```

> **Traé la cotización de ARCA, no la fijes a mano.** Si el pago es en la misma moneda
> extranjera, ARCA exige que coincida **exactamente** con la del día hábil anterior y
> rechaza con el código 10038 si no.

### 🤝 Monotributo Social y Regímenes Especiales

El SDK detecta automáticamente si el contribuyente tiene activos los impuestos de recaudación de monotributo (20, 21, 22 o 24) en su perfil y mapea su propiedad `vatCondition` a **Responsable Monotributo (código 6)** — estándar, social o promovido, todos al 6. Es el valor que ARCA acepta con certeza, y evita errores de autorización.

Sobre el código **13 (Monotributista Social)**: figura como válido en la tabla "Condición Frente al IVA del receptor" del [Manual del Desarrollador RG 4291](https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf) (última página) y lo devuelve el método `FEParamGetCondicionIvaReceptor`. Está disponible en el enum `VatCondition`, pero **no verificamos su comportamiento en producción**: si tu caso lo requiere, probalo contra homologación antes de usarlo.

> Podés consultar el catálogo vigente para tu CUIT con `wsfe.getVatConditions()`, que devuelve los códigos admitidos y en qué clases de comprobante aplican.

---

### Manejo de errores

Todos los errores son instancias tipadas de `ArcaError`, con un campo `hint` que te dice qué hacer:

```typescript
import {
  ArcaError, ArcaAuthError, ArcaValidationError,
  ArcaNetworkError, ArcaRejectionError,
} from 'arca-sdk';

try {
  const result = await wsfe.issueInvoiceC({
    items: [{ description: 'Producto', quantity: 1, unitPrice: 1500 }],
  });
} catch (error) {
  if (error instanceof ArcaRejectionError) {
    // ARCA procesó la solicitud y NO autorizó el comprobante.
    // No hay CAE: el comprobante no existe.
    console.error('Rechazado:', error.message);
    console.error('Motivos:', error.observations);
    console.log('Hint:', error.hint);
  } else if (error instanceof ArcaAuthError) {
    // Token expirado, certificado inválido, etc.
    console.error('Auth error:', error.message);
    console.log('Hint:', error.hint); // → "El certificado puede haber expirado..."
  } else if (error instanceof ArcaValidationError) {
    // Datos inválidos antes de llamar a ARCA
    console.error('Validation:', error.message, error.details);
  } else if (error instanceof ArcaNetworkError) {
    // Timeout, error HTTP
    console.error('Network:', error.message);
  } else if (error instanceof ArcaError) {
    // Error semántico de ARCA (código de error en la respuesta SOAP)
    console.error(`ARCA Error [${error.code}]:`, error.message);
    console.log('Hint:', error.hint); // Pista específica por código de error
  }
}
```

#### Rechazo ≠ error

ARCA distingue dos cosas que conviene no confundir:

| Situación | Qué significa | Cómo llega |
|---|---|---|
| `Errors` en la respuesta | La llamada no se pudo procesar (auth, parámetros mal) | `ArcaError` |
| `Resultado = 'R'` | Se procesó bien y ARCA **no autorizó** el comprobante | `ArcaRejectionError` |
| `Resultado = 'A'` con observaciones | **Autorizado**, con advertencias | Se devuelve normal, en `observations` |

> **Cambio en la v2.0.0**: hasta la v1.x un rechazo se devolvía como un `CAEResponse`
> con `result: 'R'` y `cae: ''` en vez de lanzar. Quien no inspeccionara `result`
> creía haber facturado un comprobante que no existe. Si tu código ya chequeaba
> `result === 'R'`, esa rama deja de alcanzarse y podés reemplazarla por un
> `catch (ArcaRejectionError)`.

### 🚚 Acerca de los Remitos
> **¡Atención!** Este SDK implementa nativamente el servicio `WSFE` (Facturación Electrónica). Si tu negocio necesita emitir **Remitos Electrónicos Oficiales** para el traslado físico de mercaderías (Remitos Cárnicos, Azucareros, Harineros, etc.), tené en cuenta que la AFIP exige usar un webservice totalmente distinto llamado `WSREM` o similares. Estos servicios aún no están cubiertos por esta versión del SDK.

---

## Compatibilidad

| Runtime | Versión mínima | Estado |
|---------|---------------|--------|
| Node.js | 18 LTS | ✅ Soportado |
| Node.js | 20 LTS | ✅ Soportado |
| Node.js | 22 LTS | ✅ Soportado |
| Bun | 1.x | ✅ Soportado |
| Deno | — | ⚠️ Sin probar |
| Browser | — | ❌ No soportado (requiere `node:https`) |

> El SDK maneja automáticamente los errores SSL de los servidores de ARCA ("dh key too small") mediante configuración custom del `https.Agent`.

---

## Tipos exportados

```typescript
// Servicios
import { WsaaService, WsfeService, PadronService, CaeaService } from 'arca-sdk';

// Enums y constantes
import {
  InvoiceType, BillingConcept, TaxIdType, VatCondition,
  VALID_VAT_CONDITION_IDS, VAT_RATE_CODES,
} from 'arca-sdk';

// Tipos de configuración
import type {
  Environment, ArcaConfig,
  WsaaConfig, WsfeConfig, CaeaConfig, TaxpayerServiceConfig,
} from 'arca-sdk';

// Tipos de respuesta
import type { CAEResponse, InvoiceDetails, PointOfSale, ServiceStatus, InvoiceOptional } from 'arca-sdk';
import type { TaxpayerResponse, Taxpayer, Address, Activity, TaxRecord } from 'arca-sdk';

// Catálogos (FEParamGet*)
import type { CatalogEntry, VatConditionEntry, CurrencyRate } from 'arca-sdk';

// CAEA (contingencia)
import type {
  CAEASolicitarRequest, CAEASolicitarResponse, CAEAConsultarResponse,
  CaeaInvoice, CAEARegInformativoResponse,
} from 'arca-sdk';

// Items de factura y opciones de emisión
import type {
  InvoiceItem, InvoiceTax, Buyer, IssueInvoiceRequest, IssueOptions,
  AssociatedInvoice, ServiceDates, ArcaDateInput,
} from 'arca-sdk';

// Storage
import type { TokenStorage, LoginTicket } from 'arca-sdk';

// Errores
import {
  ArcaError, ArcaAuthError, ArcaValidationError,
  ArcaNetworkError, ArcaRejectionError,
} from 'arca-sdk';

// QR
import { generateQRUrl } from 'arca-sdk';
```

---

## Desarrollo

```bash
# Clonar e instalar
git clone https://github.com/marcelaborgarello/arca-sdk
cd arca-sdk
bun install

# Tests unitarios
bun run test

# Verificar tipos
bun run lint

# Build (CJS + ESM + .d.ts)
bun run build
```

> Es `bun run test` (vitest), **no** `bun test`. Son runners distintos: bajo el runner
> nativo de Bun los `vi.mock` se filtran entre archivos y la suite queda menos aislada.

### Tests de integración (opcional)

Corren contra **ARCA homologación** de verdad. Son opt-in: sin credenciales, se
saltean. Necesitás un certificado de homologación y el punto de venta dado de alta
como Webservices.

```bash
export ARCA_TEST_CUIT=20123456789
export ARCA_TEST_CERT=./certs/cert.pem   # ruta al PEM, no su contenido
export ARCA_TEST_KEY=./certs/key.pem

bun run test:integration
```

Detalle completo en [`tests/integration/README.md`](tests/integration/README.md).

### Tests disponibles

13 archivos, 152 tests:

| Suite | Archivo | Qué cubre |
|-------|---------|-----------|
| WSAA | `wsaa.test.ts` | `login()` con prioridad memoria → storage → red, márgenes de expiración, fallas del `TokenStorage`, `clearCache()` |
| WSFE | `wsfe.test.ts` | Emisión (`issueInvoiceB`, `issueReceiptA`, `issueCreditNoteC`), `checkStatus`, `getPointsOfSale`, RG 5616, RG 5866 |
| CAEA | `caea.test.ts` | Solicitud, consulta, rendición informativa, sin movimiento, `CbteFchHsGen` |
| Padrón | `padron.test.ts` | Parsing de respuesta, CUIT not found, condición IVA |
| XML del request | `request-xml.test.ts` | Orden del `sequence` del XSD en los dos builders, escapado, Tributos, moneda extranjera, rechazos |
| XML / TRA | `xml.test.ts` | Construcción del TRA y sus márgenes de tiempo, parsing de WSAA, validación de CUIT |
| Fechas | `formatArcaDate.test.ts` | Fecha-calendario vs. instante, conversión a UTC-3, `yyyymmddhhmmss` |
| Cálculos | `calculations.test.ts` | IVA, subtotales, totales con y sin IVA incluido |
| Cripto | `crypto.test.ts` | Validación de certificado y clave privada, firma CMS |
| Ticket | `ticket.test.ts` | `TicketManager`: expiración y reuso |
| Red | `network.test.ts` | Verificación de identidad del servidor de ARCA, ciphers OpenSSL vs. Bun |
| Validaciones | `validation.test.ts` | Validaciones del constructor de `WsaaService` |
| QR | `qr.test.ts` | Generación de URL, limpieza de CUIT/CAE, campo comprador |

> `request-xml.test.ts` mira el XML que **sale**. El resto de la suite mockea la red y
> sólo verifica la respuesta parseada, con lo cual un request mal formado pasa
> desapercibido. Si tocás un constructor de XML, agregá la aserción de orden ahí.

---

## Roadmap

- [ ] Comprobantes de Seguros de Caución (Manual v4.7, códigos 10273-10282)
- [ ] Verificación en homologación de comprobantes clase B con receptor Sujeto No Categorizado (Manual v4.7, código 10283)
- [ ] Soporte WSMTXCA (Factura de Crédito Electrónica MiPyME)
- [ ] Soporte WSCT (Turismo)
- [ ] Método `consultar()` para servicios adicionales del Padrón
- [ ] Opción de exportar a PDF (recibo y factura)

---

## Licencia

MIT © [Marcela Borgarello](https://github.com/marcelaborgarello)

---

<div align="center">

**Hecho con ❤️ en Argentina 🇦🇷**

*Porque integrar con ARCA no tiene por qué ser un infierno.*

[npm](https://www.npmjs.com/package/arca-sdk) · [GitHub](https://github.com/marcelaborgarello/arca-sdk) · [CHANGELOG](CHANGELOG.md)

</div>
