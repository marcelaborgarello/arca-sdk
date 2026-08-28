# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

---

## [Unreleased]

### 🐛 WSAA no autenticaba bajo Node.js ESM

- **Bugfix crítico**: `src/utils/crypto.ts` importaba `node-forge` con `import * as forge from 'node-forge'`. Bajo Node.js ESM nativo (el runtime que usa este mismo proyecto, `"type": "module"`), esa forma de import resuelve a un namespace vacío para paquetes CJS como `node-forge` — `forge.pki` quedaba `undefined` y `wsaa.login()` fallaba siempre con `ArcaAuthError: Error al firmar TRA con certificado`. Cambiado a `import forge from 'node-forge'` (default import), que sí resuelve a `module.exports` de forma confiable. Verificado contra `dist/index.js` con Node.js real y contra ARCA homologación. No afectaba a consumidores CJS (`require('arca-sdk')`), donde el bundle de tsup ya copiaba las propiedades en runtime.

---

## [1.4.0] — 2026-08-24

### 🌐 CAEA como Contingencia — `CbteFchHsGen` obligatorio (RG 5782)

- **Campo `CbteFchHsGen`**: Se incorporó el envío del campo `<ar:CbteFchHsGen>` en el detalle de `FECAEARegInformativo` (`CaeaService.reportCAEAPeriod()`). A partir de la **versión 4.6 del Manual del Desarrollador RG 4291** (vigente desde el **01/08/2026**, en cumplimiento de la **RG 5782**), todos los puntos de venta CAEA pasaron a considerarse de Contingencia y este campo es de integración obligatoria. Su ausencia puede provocar el rechazo de la rendición informativa.
- **Nueva propiedad `generatedAt`**: La interfaz `CaeaInvoice` acepta ahora `generatedAt?: Date` para informar la fecha y hora real de generación local del comprobante durante la contingencia. Si se omite, se utiliza `date` como valor por defecto.

### 🐛 Normalización de fechas a horario argentino (UTC-3)

- **Bugfix de zona horaria**: Las fechas construidas a partir de un instante (ej. `new Date()`) se calculan ahora en horario de Argentina (UTC-3) en lugar de UTC. Anteriormente se usaba `Date.toISOString()`, lo que provocaba que los comprobantes emitidos entre las **21:00 y las 00:00 hora argentina** se informaran con la **fecha del día siguiente**. Afecta a `CbteFch`, `FchServDesde`, `FchServHasta`, `FchVtoPago` y a la fecha de los comprobantes asociados (`CbtesAsoc`), tanto en `WsfeService` como en `CaeaService`.

### ✨ `ArcaDateInput`: fechas-calendario explícitas

- **Los campos de fecha aceptan ahora `Date | string`**. Un `Date` de JavaScript es un *instante*, mientras que `CbteFch` es una *fecha-calendario*; con un `Date` pelado las dos cosas son indistinguibles. Ahora se puede expresar la intención sin ambigüedad:
  - `'2026-08-24'` o `'20260824'` → fecha literal, sin conversión de zona horaria (**forma recomendada**).
  - `new Date()` → instante, se convierte al día calendario argentino.
- **Compatibilidad**: el cambio es aditivo, no requiere migrar código. Un `Date` que caiga exactamente en medianoche UTC —como `new Date('2026-08-24')`, la forma habitual de construir "un día" en JS— se sigue interpretando como fecha-calendario literal, de modo que quien ya pasaba fechas así obtiene el mismo resultado que antes.
- **Validación**: los strings con formato desconocido (`'24/08/2026'`) o fechas inexistentes (`'2026-02-30'`), y los `Date` inválidos, ahora lanzan `RangeError` en lugar de generar silenciosamente un comprobante con fecha incorrecta.
- **Nuevos helpers** exportados en `src/utils/formatArcaDate.ts`: `formatArcaDateOnly()` (`yyyymmdd`, String 8) y `formatArcaTimestamp()` (`yyyymmddhhmmss`, String 14), que unifican el criterio de zona horaria que hasta ahora solo aplicaba el TRA del WSAA.

> **Nota sobre `CbteFchHsGen`**: a diferencia de `date`, un `Date` en `generatedAt` se interpreta **siempre** como instante, porque ahí la hora es el dato que ARCA valida. Si se omite `generatedAt`, el SDK usa la fecha ya resuelta del comprobante con hora `000000`, garantizando que la parte de fecha coincida con `CbteFch`.

---

## [1.3.5] — 2026-08-03

### 🌐 Adecuación Normativa ARCA (RG 5866/2026)

- **Actualización de Referencia Normativa**: Se actualizó la referencia legal en las validaciones de `WsfeService`, unit tests y documentación de la antigua RG 5824/2026 a la **RG 5866/2026** (vigente desde el 01/07/2026), la cual abrogó y unificó el régimen de facturación electrónica de ARCA manteniendo el tope de $10.000.000 para la identificación de compradores a Consumidor Final.

---

## [1.2.1] — 2026-05-29

### 🌐 Normativas ARCA 2026 & Actualizaciones de Infraestructura

- **Migración a Dominios ARCA**: Se actualizaron todos los endpoints predeterminados SOAP del SDK (`WSAA`, `WSFE` y `Padrón A13`) reemplazando los antiguos servidores `*.afip.gov.ar` / `*.afip.gob.ar` por la infraestructura oficial y definitiva de ARCA (`*.arca.gob.ar`).
- **URL del Código QR Oficial**: Se actualizó la URL de validación del QR de comprobantes electrónicos a `https://www.arca.gob.ar/fe/qr/?p=...` según la normativa vigente en 2026.
- **Documentación de Normativas Recientes**:
  - **Identificación de Comprador (RG 5824/2026)**: Se documentó en el `README.md` el nuevo tope legal de **$10.000.000** a partir del cual es obligatorio identificar al receptor en facturas de Consumidores Finales.
  - **Facturación A con Leyenda (RG 5762/2025)**: Se documentó cómo utilizar el campo `optionals` del SDK para dar cumplimiento a la disolución de la Factura Clase "M" mediante la emisión de Facturas A tradicionales con leyendas de retención impositivas ("OPERACIÓN SUJETA A RETENCIÓN" o "PAGO EN CBU INFORMADA").

---

## [1.2.0] — 2026-03-18

### ✨ Developer Experience (DX) y Normativas 2025

- **VatCondition Enum**: Se introdujo el enumerador fuertemente tipado `VatCondition` para facilitar el envío del parámetro `<ar:CondicionIVAReceptorId>` (obligatorio para ciertas Facturas C según la RG 5616/2024 efectiva desde 2025). Ahora la interfaz `Buyer` acepta este enum en su propiedad `vatCondition`, previniendo errores por el uso de números mágicos (ej. `VatCondition.CONSUMIDOR_FINAL` en lugar de `5`).

---

## [1.1.2] — 2026-03-04

### 🐛 Fixes en Nodos para Facturas de Servicios (RG 5616)

- **Condición IVA Receptor Nativas**: Se solucionó un bug por el cual `<ar:CondicionIVAReceptorId>` no se renderizaba como nodo de primer nivel en `FECAEDetRequest`, requisito fundamental de la RG 5616 para Factura C de ciertos compradores. Ahora puede enviarse vía `buyer.vatCondition`.
- **Fechas de Servicio**: Se añadió inyección nativa de `<ar:FchServDesde>`, `<ar:FchServHasta>` y `<ar:FchVtoPago>` para cuando se facturan Conceptos `2` o `3` (Servicios o Productos + Servicios). Se puede especificar enviando el parámetro `serviceDates` en la Request.

---

## [1.1.1] — 2026-03-03

### ✨ Soporte para Opcionales y Resolución General 5616

- **Opcionales en WSFE**: Se agregó soporte completo para enviar el campo `<ar:Opcionales>` en todas las operaciones de emisión de comprobantes (Facturas A/B/C, Notas de Crédito, Notas de Débito, Recibos y Tickets).
- **Condición IVA Receptor**: Esto permite dar pleno cumplimiento a la reciente RG 5616 de AFIP, que hace obligatorio enviar la Condición frente al IVA del receptor en ciertas Facturas C, enviando el ID `1010` dentro de los opcionales.
- **Consulta de Comprobantes**: El método `WsfeService.getInvoice()` ahora retorna el array de `optionals` si el comprobante los posee.

---

## [1.1.0] — 2026-02-28

### ✨ Nuevos Comprobantes (Vouchers)

Se expandió la funcionalidad del servicio de facturación (`WsfeService`) para cubrir el espectro completo de comprobantes básicos:

- **Notas de Crédito**: Agregados métodos `issueCreditNoteA()`, `issueCreditNoteB()` y `issueCreditNoteC()`.
- **Notas de Débito**: Agregados métodos `issueDebitNoteA()`, `issueDebitNoteB()` y `issueDebitNoteC()`.
- **Recibos**: Agregados métodos `issueReceiptA()`, `issueReceiptB()` y `issueReceiptC()`.
- **Comprobantes Asociados**: El SDK ahora genera correctamente el nodo `<ar:CbtesAsoc>` de forma obligatoria para emitir NC/ND, asegurando que la operación de contingencia (anulación total o parcial de una factura) respete el estándar del ente recaudador. 

---

## [1.0.4] — 2026-02-27

### 🐛 Bugfix — Timezone Handling

- Se ajustó la generación de fechas para forzar la zona horaria UTC-3 (Argentina) independientemente de la zona horaria del servidor (ej: AWS, Vercel).
- Se restan 10 minutos al tiempo de generación en los TRA para evitar errores de desincronización con los servidores de ARCA.

---

## [1.0.1] — 2026-02-23

### 🐛 Bugfix crítico — QR URL

`generateQRUrl` usaba `encodeURIComponent` sobre el string base64, convirtiendo:
- `+` → `%2B`
- `=` → `%3D`
- `/` → `%2F`

El scanner de ARCA intenta decodificar el parámetro `?p=` como base64 puro. Al recibir `%2B` en lugar de `+`, la decodificación falla parcialmente: el CUIT y el CAE se rescatan por un camino alternativo interno, pero la fecha, punto de venta, número de comprobante e importe llegan vacíos.

**Fix:** El base64 ahora se embebe directamente sin URL-encoding, tal como especifica la [documentación oficial de ARCA](https://www.afip.gob.ar/fe/qr/especificaciones.asp).

```diff
- return `https://www.afip.gob.ar/fe/qr/?p=${encodeURIComponent(base64)}`;
+ return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
```

---

## [1.0.0] — 2026-02-23

### 🔴 Breaking Changes

Esta versión establece la API pública definitiva. **Requiere actualizar todos los imports** si venís de v0.x.

#### Métodos renombrados en WsfeService
| v0.x | v1.0.0 |
|-------|--------|
| `emitirTicketCSimple()` | `issueSimpleReceipt()` |
| `emitirTicketC()` | `issueReceipt()` |
| `emitirFacturaC()` | `issueInvoiceC()` |
| `emitirFacturaB()` | `issueInvoiceB()` |
| `emitirFacturaA()` | `issueInvoiceA()` |
| `emitirComprobante()` | *(privado — ya no accesible)* |

#### Método renombrado en PadronService
| v0.x | v1.0.0 |
|-------|--------|
| `getPersona(cuit)` | `getTaxpayer(cuit)` |

#### Configuración de WsfeService
| v0.x | v1.0.0 |
|-------|--------|
| `puntoVenta: 4` | `pointOfSale: 4` |

#### Tipos renombrados
| v0.x | v1.0.0 |
|-------|--------|
| `TipoComprobante` | `InvoiceType` |
| `TipoDocumento` | `TaxIdType` |
| `Concepto` | `BillingConcept` |
| `FacturaItem` | `InvoiceItem` |
| `Comprador` | `Buyer` |
| `EmitirFacturaRequest` | `IssueInvoiceRequest` |
| `Persona` | `Taxpayer` |
| `Domicilio` | `Address` |
| `Actividad` | `Activity` |
| `Impuesto` | `TaxRecord` |
| `PadronResponse` | `TaxpayerResponse` |
| `PadronConfig` | `TaxpayerServiceConfig` |

#### Fields renombrados en tipos
| Tipo | v0.x | v1.0.0 |
|------|-------|--------|
| `InvoiceItem` | `descripcion` | `description` |
| `InvoiceItem` | `cantidad` | `quantity` |
| `InvoiceItem` | `precioUnitario` | `unitPrice` |
| `InvoiceItem` | `alicuotaIva` | `vatRate` |
| `Buyer` | `tipoDocumento` | `docType` |
| `Buyer` | `nroDocumento` | `docNumber` |
| `CAEResponse` | `tipoComprobante` | `invoiceType` |
| `CAEResponse` | `puntoVenta` | `pointOfSale` |
| `CAEResponse` | `nroComprobante` | `invoiceNumber` |
| `CAEResponse` | `fecha` | `date` |
| `CAEResponse` | `vencimientoCae` | `caeExpiry` |
| `CAEResponse` | `resultado` | `result` |
| `CAEResponse` | `observaciones` | `observations` |
| `CAEResponse` | `iva` | `vat` |
| `CAEResponse` | `urlQr` | `qrUrl` |
| `ServiceStatus` | `AppServer` | `appServer` |
| `ServiceStatus` | `DbServer` | `dbServer` |
| `ServiceStatus` | `AuthServer` | `authServer` |
| `Taxpayer` | `idPersona` | `taxId` |
| `Taxpayer` | `tipoPersona` | `personType` |
| `Taxpayer` | `nombre` | `firstName` |
| `Taxpayer` | `apellido` | `lastName` |
| `Taxpayer` | `razonSocial` | `companyName` |
| `Taxpayer` | `estadoClave` | `status` |
| `Taxpayer` | `domicilio` | `addresses` |
| `Taxpayer` | `actividad` | `activities` |
| `Taxpayer` | `impuesto` | `taxes` |
| `Taxpayer` | `descripcionActividadPrincipal` | `mainActivity` |
| `Taxpayer` | `esInscriptoIVA` | `isVATRegistered` |
| `Taxpayer` | `esMonotributista` | `isMonotax` |
| `Taxpayer` | `esExento` | `isVATExempt` |
| `Address` | `direccion` | `street` |
| `Address` | `localidad` | `city` |
| `Address` | `codPostal` | `postalCode` |
| `Address` | `idProvincia` | `provinceId` |
| `Address` | `descripcionProvincia` | `province` |
| `Address` | `tipoDomicilio` | `type` |

#### Función renombrada en utils
| v0.x | v1.0.0 |
|-------|--------|
| `generarUrlQR()` | `generateQRUrl()` |

#### Enums — valores constantes renombrados
| Enum | v0.x | v1.0.0 |
|------|-------|--------|
| `TaxIdType` | `CONSUMIDOR_FINAL` | `FINAL_CONSUMER` |
| `TaxIdType` | `CI_EXTRANJERA` | `FOREIGN_ID` |
| `TaxIdType` | `CI_BUENOS_AIRES` | `BUENOS_AIRES_ID` |
| `TaxIdType` | `CI_POLICIA_FEDERAL` | `NATIONAL_POLICE_ID` |
| `BillingConcept` | `PRODUCTOS` | `PRODUCTS` |
| `BillingConcept` | `SERVICIOS` | `SERVICES` |
| `BillingConcept` | `PRODUCTOS_Y_SERVICIOS` | `PRODUCTS_AND_SERVICES` |

---

### ✅ Nuevas funcionalidades

- **`WsfeService.getInvoice(type, number)`**: Consulta un comprobante ya emitido (FECompConsultar).
- **`WsfeService.getPointsOfSale()`**: Lista los puntos de venta habilitados (FEParamGetPtosVenta).
- **`ArcaNetworkError`**: Ahora exportado públicamente para manejo de errores de red.
- **`InvoiceDetails`**: Nuevo tipo para la respuesta de `getInvoice()`.
- **`PointOfSale`**: Nuevo tipo para la respuesta de `getPointsOfSale()`.

### 🐛 Fixes

- `ServiceStatus` ahora tiene campos `camelCase` (`appServer`, `dbServer`, `authServer`) en lugar de `PascalCase`.
- `emitirComprobante` (ahora `issueDocument`) se volvió privado — ya no es accesible desde fuera del servicio.
- Diccionario de hints de errores (`ARCA_ERROR_HINTS`) expandido a 15+ códigos documentados.
- Eliminado `WsaaResponse` (tipo sin uso).
- Tipado explícito en `PadronService`: eliminados todos los `any` en métodos privados.

### 🧪 Tests

- Nuevo suite de tests para `WsfeService` (`wsfe.test.ts`).
- Tests existentes actualizados a la nueva API.

---

## [0.5.0] — 2026-02-22

- Agregado Padrón A13 service (`PadronService`)
- `ArcaError` con campo `hint` para guiar al desarrollador
- `checkStatus()` con default seguro en `homologacion`

## [0.4.0] — 2026-02-21

- Primera versión pública del SDK
- `WsaaService` con cache en memoria + persistencia opcional
- `WsfeService` con Ticket C, Factura A, B, C
- Generador de QR oficial de ARCA
