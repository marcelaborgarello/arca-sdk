# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

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
