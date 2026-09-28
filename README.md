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

## ⚠️ Qué está verificado contra ARCA y qué no — 28/09/2026

Este README describe la **v3.0.0**, que es la que sirve npm.

Venimos auditando **cada afirmación normativa de esta documentación contra los manuales oficiales
de ARCA** —los cuatro, no sólo el de facturación— y corrigiendo lo que no coincide. Aparecieron
más de veinte afirmaciones falsas sin buscarlas sistemáticamente: hints de error que describían
otro código, una tabla de condiciones de IVA con cinco filas mal transcriptas, y una advertencia
que decía que algo *"no está documentado en ningún manual"* cuando sí lo está. Buscándolas van a
aparecer más, así que la tabla de abajo es lo que conviene leer antes de confiar en una parte del
SDK que no hayas probado.

**Qué está verificado contra ARCA de verdad**, o sea con un CAE real en la mano:

| | Estado |
|---|---|
| **Factura C** — `issueInvoiceC()` | ✅ Producción y homologación |
| **Nota de Crédito C** — `issueCreditNoteC()` | ✅ Producción |
| **Factura A** con IVA discriminado — `issueInvoiceA()` | ✅ Homologación — **una sola alícuota, el 21%** |
| Notas de Crédito **A y B**, Notas de Débito, Recibos | ❌ **Nunca se emitió ninguno** |
| Las otras cinco alícuotas (0, 2,5, 5, 10,5 y 27%) | ❌ Nunca pasaron por ARCA |
| Otros tributos (`taxes`) | ❌ Nunca llegó uno a ARCA |
| **CAEA** (contingencia) | ❌ Sin verificar, entero |

Lo marcado con ❌ **está implementado** y tiene tests unitarios, pero esos tests mockean la red:
prueban que el SDK hace lo que creemos, no que ARCA lo acepte. Ya pasó una vez que un comprobante
entero fuera imposible de emitir con la suite en verde, así que preferimos decirlo.

**Si vas a usar algo de esa lista, probalo contra homologación antes de producción.**

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

| Servicio | Descripción | Estado | Manual oficial |
|----------|-------------|--------|----------------|
| **WSAA** | Autenticación y Autorización | ✅ Completo | [WSAA](https://www.arca.gob.ar/ws/WSAA/WSAAmanualDev.pdf) |
| **WSFE v1** | Facturación Electrónica (A, B, C) | ✅ Completo | [RG 4291 v4.8](https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf) |
| **Padrón A13** | Consulta de datos de contribuyentes | ⚠️ Un método de los cuatro del manual | [Padrón A13 v1.4](https://arca.gob.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.4.pdf) |
| **CAEA** | Contingencia: solicitud, consulta y rendición informativa | ⚠️ Implementado, sin verificar contra homologación | [RG 4291 v4.8](https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf) |

> **Padrón A13**: `getTaxpayer()` implementa `getPersona`, que es la consulta por CUIT. El
> manual documenta otros tres métodos que el SDK todavía no expone: `dummy` (estado del
> servicio), `getIdPersonaListByDocumento` (DNI → las CUITs asociadas) y `getPersonaV2`, que es
> el único que permite consultar una clave en estado **INACTIVA**. Si necesitás alguno,
> [abrí un issue](https://github.com/marcelaborgarello/arca-sdk/issues).

### ✅ Tipos de comprobantes

| Método | Comprobante | Cuándo usarlo |
|--------|-------------|---------------|
| `issueInvoiceC()` | Factura C | Monotributistas a consumidor final / Empresas |
| `issueInvoiceB()` | Factura B | Responsable Inscripto a consumidor final / Monotributo |
| `issueInvoiceA()` | Factura A | Responsable Inscripto a Responsable Inscripto |
| `issueCreditNoteA/B/C()` | Nota de Crédito | Anulación/Devolución (Requiere asociar la factura original) |
| `issueDebitNoteA/B/C()` | Nota de Débito | Cobro extra/Penalidad (Requiere asociar la factura original) |
| `issueReceiptA/B/C()` | Recibo | Comprobante de pago (misma emisión que una factura) |

> [!WARNING]
> **Los Tique se eliminaron en la v3.0.0.** Si venís de la v2.x, ver
> ["Migrar a la v3.0.0"](#migrar-a-la-v300).
>
> El comprobante "Tique" (81/82/83) está regido por la **RG 3561/2013** (Controladores
> Fiscales), una resolución distinta de la RG 4291/wsfev1 que sigue el resto del SDK.
> **ARCA no lo lista en `FEParamGetTiposCbte`** y `FECAESolicitar` con `CbteTipo=83` lo
> rechaza con el error **11001** desde un punto de venta Web Services — el único tipo de
> punto de venta que un consumidor de este SDK puede tener. Para el caso general
> (consumidor final, sin Controlador Fiscal homologado) usá `issueInvoiceC()`.

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
| `wsfe.getVatConditions()` | `FEParamGetCondicionIvaReceptor` | Las condiciones de IVA del receptor, con la clase de comprobante en que aplican |
| `wsfe.getExchangeRate(moneda, fecha?)` | `FEParamGetCotizacion` | Cotización oficial — usala en vez de fijar `exchangeRate` a mano |
| `wsfe.getDocumentTypes()` | `FEParamGetTiposDoc` | Tipos de documento del receptor |
| `wsfe.getCurrencies()` | `FEParamGetTiposMonedas` | Monedas |
| `wsfe.getConceptTypes()` | `FEParamGetTiposConcepto` | Productos / servicios / ambos |
| `wsfe.getOptionalTypes()` | `FEParamGetTiposOpcional` | Ids válidos para `optionals` |
| `wsfe.getActivities()` | `FEParamGetActividades` | Actividades económicas del emisor |

> **`getVatConditions()` es la fuente autoritativa**, y por eso la relación entre condición y
> clase de comprobante no está hardcodeada: la tabla del manual es una foto, y una copia
> escrita a mano se desactualiza en silencio.
>
> **No depende del emisor**, aunque este README lo afirmó hasta la v3.0.0. Medido el
> 27/09/2026: el servicio devuelve las mismas once filas, una por una, para un CUIT
> monotributista y para uno Responsable Inscripto.

---

## Ejemplos

### Factura C con varios items

```typescript
import { TaxIdType, VatCondition } from 'arca-sdk';

const result = await wsfe.issueInvoiceC({
  items: [
    { description: 'Café con leche',  quantity: 2, unitPrice: 750 },
    { description: 'Medialunas x4',   quantity: 1, unitPrice: 600 },
  ],
  buyer: {
    docType: TaxIdType.FINAL_CONSUMER,
    docNumber: '0',
    vatCondition: VatCondition.CONSUMIDOR_FINAL,
  },
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
sólo aplican a ciertos regímenes: Promoción Industrial (`id` 2), establecimientos
educativos de gestión privada de la RG 3368 (`10`, `1011`, `1012`), locación de
inmuebles con fines turísticos de la RG 3687 (`12`), casa-habitación de la RG 4004-E
(`17`, `1801`, `1802`), y demás.

> [!CAUTION]
> **Los ids no son intercambiables y ARCA valida cada uno por separado.** Cada régimen
> tiene el suyo, con su formato: el `id` 5 (RG 3668) exige un código de excepción
> alfanumérico de **dos** caracteres (`'01'` a `'06'`) y rechaza cualquier otra cosa con
> la observación 10088/10089; el `2` exige un numérico de ocho dígitos (10064). No
> adivines un id: pedilos con `wsfe.getOptionalTypes()`.

> La **leyenda de Factura A** de la RG 5762/2025 **no se informa por acá**: es una clase
> de comprobante propia (códigos 51 a 54). Ver "Normativas ARCA 2026", punto 2.

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
    // Promoción Industrial: el id 2 lleva el número de proyecto, numérico de 8 dígitos.
    { id: 2, value: '12345678' },
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

#### 2. Facturas Clase "A" con Leyenda (RG 5762/2025)

Con la disolución de la Factura Clase "M", ARCA instruyó el uso de Facturas Clase "A"
con una leyenda impositiva. **No es un campo opcional: es una clase de comprobante
propia**, con sus propios códigos de `CbteTipo`:

| Código | Comprobante |
|---|---|
| `InvoiceType.FACTURA_A_LEYENDA` (51) | Factura A con Leyenda "Operación Sujeta a Retención" |
| `InvoiceType.NOTA_DEBITO_A_LEYENDA` (52) | Nota de Débito A con Leyenda |
| `InvoiceType.NOTA_CREDITO_A_LEYENDA` (53) | Nota de Crédito A con Leyenda |
| `InvoiceType.RECIBO_A_LEYENDA` (54) | Recibo A con Leyenda |

Los códigos **no son nuevos**: ARCA los tiene vigentes desde el 22/05/2015. Lo que hizo
la RG 5762/2025 fue convertirlos en el reemplazo de la clase "M". El manual los trata
como una clase más —las validaciones 10017, 10061, 10063, 10217 y 10234 hablan de
comprobantes *"Clase A y A con leyenda operación sujeta a retención"*— y la tabla del
enum `VatCondition` los abrevia **ALEY**.

> [!IMPORTANT]
> **El SDK todavía no puede *emitir* estos comprobantes.** Los métodos de emisión fijan
> internamente su tipo de comprobante y no hay uno genérico que acepte un `InvoiceType`.
> Lo que sí podés hacer hoy con estos valores es **consultarlos** y **asociarlos**:

```typescript
import { InvoiceType } from 'arca-sdk';

// Consultar una Factura A con leyenda ya emitida
const cbte = await wsfe.getInvoice(InvoiceType.FACTURA_A_LEYENDA, 1234);

// Emitir una Nota de Crédito que anula una Factura A con leyenda
await wsfe.issueCreditNoteA({
  items: [{ description: 'Anulación', quantity: 1, unitPrice: 10000, vatRate: 21 }],
  buyer: { docType: TaxIdType.CUIT, docNumber: '30716024941', vatCondition: VatCondition.IVA_RESPONSABLE_INSCRIPTO },
  associatedInvoices: [{
    type: InvoiceType.FACTURA_A_LEYENDA,   // ← el comprobante original
    pointOfSale: 4,
    invoiceNumber: 1234,
  }],
});
```

> **Por qué no hay helper de emisión todavía.** Los cuatro tipos están verificados contra
> el catálogo de ARCA (`FEParamGetTiposCbte`, consultado el 27/09/2026), pero **nunca se
> emitió uno realmente** en homologación. Un helper afirma que el camino funciona, y eso
> todavía no está probado — es exactamente lo que produjo el episodio del error 11001 con
> los Tique. Si necesitás emitirlos,
> [abrí un issue](https://github.com/marcelaborgarello/arca-sdk/issues).

> **La leyenda de "Pago en CBU informada"** de la misma RG **no está implementada** y no
> sabemos por qué campo viaja: no figura en el Manual del Desarrollador (revisadas las
> 202 páginas de la v4.8), y los opcionales de CBU que sí documenta —el `2101` y el
> `27`— son exclusivos de Factura de Crédito Electrónica MiPyME según las validaciones
> 10214 a 10216.

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

> Podés consultar el catálogo vigente con `wsfe.getVatConditions()`, que devuelve los once códigos y en qué clases de comprobante aplican. Es la fuente autoritativa: el enum es una copia local.

---

## 📚 Manuales oficiales de ARCA

Si tenés una duda sobre qué espera ARCA, la respuesta está en un PDF suyo y no en este README.
El SDK habla con cuatro servicios y **cada uno tiene su propio manual**:

| Manual | Qué cubre | Páginas |
|---|---|---|
| **[RG 4291 – Proyecto FE v4.8](https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf)** | `wsfev1`: facturación, CAEA, todos los códigos de validación y los catálogos `FEParamGet*` | 202 |
| **[WSAA Manual del Desarrollador](https://www.arca.gob.ar/ws/WSAA/WSAAmanualDev.pdf)** | Autenticación: el TRA, la firma CMS, el ciclo de vida del ticket | 35 |
| **[Consulta a Padrón – Alcance 13 v1.4](https://arca.gob.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.4.pdf)** | El servicio de Padrón: sus cuatro métodos y sus mensajes de error | 25 |
| **[WSASS Manual del Usuario](https://www.arca.gob.ar/ws/WSASS/WSASS_manual.pdf)** | Cómo autorizar un servicio para tu certificado **en homologación** | 19 |

**Cuál abrir según la duda** — esta tabla existe porque buscar en el manual equivocado es lo que
más tiempo hace perder:

| Si buscás… | Está en |
|---|---|
| Qué significa un código de rechazo (`10xxx`, `1xxx`, `8xx`) | RG 4291, tablas de validaciones |
| Los errores `500` a `602` | RG 4291, **p. 21** |
| Qué condición de IVA del receptor va en cada clase de comprobante | RG 4291, **última página** |
| La lista real de comprobantes, alícuotas, monedas o tributos | No está en el PDF: la dan los métodos `FEParamGet*`. Ver "Catálogos de referencia" |
| Por qué WSAA rechaza tu login | WSAA, **cap. 10** — son nueve casos, documentados por su texto: WSAA no devuelve códigos numéricos |
| Cuánto tiempo ARCA no te emite otro ticket teniendo uno vigente | WSAA, **cap. 10.6** (10 min en homologación, 2 en producción) |
| Los mensajes de error del Padrón | Padrón A13, **anexo 5.3** |
| Por qué tu token no sirve para la CUIT que acabás de delegar | Padrón A13, en la descripción de `cuitRepresentada`: el token trae **congelada** la lista de relaciones del momento en que se emitió |

> [!TIP]
> **Verificá la versión del manual que abrís.** ARCA publica el de `wsfev1` en varias URLs y
> **no siempre tienen la misma versión**: la de arriba es la v4.8, y hubo semanas en que otra URL
> servía la v4.7 mientras la página índice anunciaba "V. 4.7" con la v4.8 ya publicada. La portada
> trae número de versión y fecha de revisión — es lo primero que conviene mirar.
>
> El de Padrón A13 tiene el problema inverso: la URL que más circula es la del dominio viejo
> (`afip.gob.ar/ws/ws-padron-a13/…`) y **ya no responde**. La de arriba sí.

---

### Manejo de errores

Todos los errores son instancias tipadas de `ArcaError`, y la mayoría traen un campo `hint` que
te dice qué hacer:

```typescript
import {
  ArcaError, ArcaAuthError, ArcaValidationError,
  ArcaNetworkError, ArcaRejectionError,
  TaxIdType, VatCondition,
} from 'arca-sdk';

try {
  const result = await wsfe.issueInvoiceC({
    items: [{ description: 'Producto', quantity: 1, unitPrice: 1500 }],
    buyer: {
      docType: TaxIdType.FINAL_CONSUMER,
      docNumber: '0',
      vatCondition: VatCondition.CONSUMIDOR_FINAL,   // RG 5616 — sin esto, rechazo 10246
    },
  });
} catch (error) {
  if (error instanceof ArcaRejectionError) {
    // ARCA procesó la solicitud y NO autorizó el comprobante.
    // No hay CAE: el comprobante no existe.
    console.error('Rechazado:', error.message);
    console.error('Motivos:', error.observations);          // string[]
    console.log('Hint:', error.hint);

    // Con el código de cada observación, para ramificar sin hacer regex sobre el texto
    for (const obs of error.observationDetails ?? []) {
      if (obs.code === 10246) redirigirAFormularioDeCondicionIVA();
      console.error(`  [${obs.code}] ${obs.message}`);
    }
  } else if (error instanceof ArcaAuthError) {
    // WSAA rechazó el login. El hint sale de los nueve casos que documenta su manual
    // (cap. 10), reconocidos por el texto del fault: WSAA no devuelve códigos numéricos.
    console.error('Auth error:', error.message);
    console.log('Hint:', error.hint);
    // → "Ya existe un TA vigente para este CUIT y servicio y ARCA no emite otro por unos
    //    minutos (...). Guardá el ticket entre ejecuciones pasando un `storage` ..."
  } else if (error instanceof ArcaValidationError) {
    // Datos inválidos antes de llamar a ARCA. Ojo: acá el hint viaja en `details.hint`,
    // no en `error.hint` — ver la nota de abajo.
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

> [!NOTE]
> **`ArcaValidationError` y `ArcaNetworkError` no pueblan `error.hint`**: su constructor no lo
> recibe, así que ese campo es siempre `undefined` en esos dos. Cuando hay una pista —y en las
> validaciones locales casi siempre la hay— viaja en **`error.details.hint`**. Los que sí usan
> `error.hint` son `ArcaError`, `ArcaAuthError` y `ArcaRejectionError`.
>
> Es una inconsistencia de la API, no una decisión: se unifica en una próxima versión, porque
> empezar a poblar `error.hint` donde hoy hay `undefined` es un cambio de comportamiento y va
> anunciado.

#### Rechazo ≠ error

ARCA distingue dos cosas que conviene no confundir:

| Situación | Qué significa | Cómo llega |
|---|---|---|
| `Errors` en la respuesta | La llamada no se pudo procesar (auth, parámetros mal) | `ArcaError` |
| `Resultado = 'R'` | Se procesó bien y ARCA **no autorizó** el comprobante | `ArcaRejectionError` |
| `Resultado = 'A'` con observaciones | **Autorizado**, con advertencias | Se devuelve normal, en `observations` y `observationDetails` |

> **Los códigos de observación están disponibles desde la v3.0.0.** Hasta entonces el SDK
> descartaba `Obs.Code` al parsear, así que el `hint` de un rechazo se resolvía con dos
> expresiones regulares sobre el texto y **casi ningún hint del diccionario llegaba por este
> canal**. Si tu código hacía regex sobre `observations` para saber qué pasó, ahora podés
> mirar `observationDetails[].code`.

> **Cambio en la v2.0.0**: hasta la v1.x un rechazo se devolvía como un `CAEResponse`
> con `result: 'R'` y `cae: ''` en vez de lanzar. Quien no inspeccionara `result`
> creía haber facturado un comprobante que no existe. Si tu código ya chequeaba
> `result === 'R'`, esa rama deja de alcanzarse y podés reemplazarla por un
> `catch (ArcaRejectionError)`.

### 🚚 Acerca de los Remitos
> **¡Atención!** Este SDK implementa nativamente el servicio `WSFE` (Facturación Electrónica). Si tu negocio necesita emitir **Remitos Electrónicos Oficiales** para el traslado físico de mercaderías (Remitos Cárnicos, Azucareros, Harineros, etc.), tené en cuenta que la AFIP exige usar un webservice totalmente distinto llamado `WSREM` o similares. Estos servicios aún no están cubiertos por esta versión del SDK.

---

## Migrar a la v3.0.0

**Un solo cambio incompatible, y sólo te afecta si emitías Tique.** Si nunca usaste
`issueSimpleReceipt()`, `issueReceipt()` ni `InvoiceType.TICKET_*`, actualizá y listo.

Se eliminaron:

| Eliminado en v3.0.0 | Reemplazo |
|---|---|
| `wsfe.issueSimpleReceipt({ total })` | `wsfe.issueInvoiceC({ total })` |
| `wsfe.issueReceipt({ items })` | `wsfe.issueInvoiceC({ items })` |
| `InvoiceType.TICKET_A` / `TICKET_B` / `TICKET_C` | `InvoiceType.FACTURA_A` / `FACTURA_B` / `FACTURA_C` |

**Por qué se borraron y no se dejaron deprecados.** Estaban `@deprecated` desde la v1.4.1,
pero seguir ofreciéndolos era ofrecer algo que no funciona: **ARCA no lista los Tique en
`FEParamGetTiposCbte`** (verificado el 27/09/2026 — de los quince tipos que el SDK
declaraba, los únicos tres ausentes del catálogo eran ésos) y `FECAESolicitar` los rechaza
con el error **11001**. No es una limitación del SDK ni de tu punto de venta: los Tique son
de la **RG 3561/2013** (Controladores Fiscales) y no se emiten por este webservice.

**La comodidad del método viejo se conservó.** `issueSimpleReceipt()` tomaba un `total` en
vez de `items`, y eso estaba bien —una venta de mostrador no siempre se detalla—: lo que
estaba mal era el comprobante que emitía. Así que `issueInvoiceC()` ahora acepta **`items`
o `total`**, y la migración es de una línea:

```diff
- const cae = await wsfe.issueSimpleReceipt({ total: 1500 });
+ const cae = await wsfe.issueInvoiceC({ total: 1500 });
```

Si no pasás `buyer`, se asume consumidor final sin identificar (`DocTipo` 99, `DocNro` 0),
igual que hacía el método viejo.

> **Aprovechá para informar `buyer.vatCondition`**, que no es opcional en la práctica:
> homologación ya rechaza sin ese campo y producción lo hace desde el 01/12/2026 (RG 5616).
>
> ```typescript
> await wsfe.issueInvoiceC({
>   total: 1500,
>   buyer: { docType: TaxIdType.FINAL_CONSUMER, docNumber: '0', vatCondition: VatCondition.CONSUMIDOR_FINAL },
> });
> ```

> **`items` y `total` son excluyentes**: el tipo no deja mandar los dos ni ninguno, y en
> JavaScript sin tipos el SDK lanza `ArcaValidationError` antes de tocar la red. Con `items`
> el total se calcula.

**Si necesitás emitir tique de verdad**, no hay camino por `wsfev1`: hace falta un
Controlador Fiscal homologado, o el régimen "Facturador" de la RG 5198/2022 —que usa otros
códigos (109, 114) y todavía no se investigó si es alcanzable por webservice—.

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
import type { CAEResponse, InvoiceDetails, PointOfSale, ServiceStatus, InvoiceOptional, ArcaObservation } from 'arca-sdk';
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

14 archivos, 266 tests — es lo que corre `bun run test`. **No incluye
`tests/integration/wsfe.integration.test.ts`**: `vitest.config.ts` limita la corrida a
`tests/unit/**`, y la integración va aparte con `bun run test:integration`.

| Suite | Archivo | Qué cubre |
|-------|---------|-----------|
| WSAA | `wsaa.test.ts` | `login()` con prioridad memoria → storage → red, márgenes de expiración, fallas del `TokenStorage`, `clearCache()` |
| WSFE | `wsfe.test.ts` | Emisión (`issueInvoiceB`, `issueReceiptA`, `issueCreditNoteC`), `checkStatus`, `getPointsOfSale`, RG 5616, RG 5866, códigos de `InvoiceType`, el 96 compartido de `TaxIdType`, hints de alícuota |
| CAEA | `caea.test.ts` | Solicitud, consulta, rendición informativa, sin movimiento, `CbteFchHsGen`, las seis alícuotas de IVA en el XML |
| Errores | `errors.test.ts` | El diccionario de hints: **47 de sus 48 entradas** están cubiertas — en 40 se verifica el **texto** contra el manual que corresponde, y en los ocho faults de WSAA restantes, que el `faultstring` llegue al hint (WSAA no devuelve códigos numéricos, así que se reconocen por texto). La única sin cubrir es `PADRON_ERROR`, que se prueba en `padron.test.ts` |
| Padrón | `padron.test.ts` | Parsing de respuesta, CUIT not found, condición IVA, el hint del servicio caído |
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
