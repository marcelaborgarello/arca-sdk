# 🇦🇷 arca-sdk

**La SDK moderna de ARCA (ex-AFIP) que no te rompe las bolas.**

SDK en TypeScript para integración con servicios de ARCA:
- ✅ **Type-safe**: TypeScript strict mode, 100% tipado
- ✅ **Simple**: API en inglés, sin XML manual, sin magia negra
- ✅ **Automático**: Cache de tokens + persistencia opcional (God Mode)
- ✅ **Fiscal**: Generador de QR oficial de ARCA ultra-robusto
- ✅ **Padrón**: Consulta de CUIT (A13) para autocompletado de datos
- ✅ **Resiliente**: Maneja errores SSL ("dh key too small") y timeouts
- ✅ **Moderno**: ESM + CJS nativo, Node.js 18+, Bun compatible

---

## 🚀 Instalación
```bash
npm install arca-sdk
# o
bun add arca-sdk
```

---

## ⚡ Quick Start
```typescript
import { WsaaService, WsfeService } from 'arca-sdk';
import * as fs from 'fs';

// 1. Autenticar con WSAA
const wsaa = new WsaaService({
  environment: 'homologacion',
  cuit: '20123456789',
  cert: fs.readFileSync('cert.pem', 'utf-8'),
  key: fs.readFileSync('key.pem', 'utf-8'),
  service: 'wsfe',
});

const ticket = await wsaa.login();

// 2. Crear servicio de facturación
const wsfe = new WsfeService({
  environment: 'homologacion',
  cuit: '20123456789',
  ticket,
  pointOfSale: 4,
});

// 3. Emitir un Ticket C
const result = await wsfe.issueSimpleReceipt({ total: 1500 });

console.log('CAE:', result.cae);
console.log('QR URL:', result.qrUrl); // ← Ya viene integrado!
```

---

## 👑 God Mode: Persistencia Automática
No manejes tokens manualmente. Pasale un `storage` al SDK y se encargará de guardar, recuperar y renovar el TA solo cuando expire.

```typescript
const wsaa = new WsaaService({
  ...config,
  service: 'wsfe',
  storage: {
    get: async (cuit, env) => await db.token.findUnique({ where: { cuit, env } }),
    save: async (cuit, env, ticket) => await db.token.upsert({ ... }),
  }
});

// El SDK chequea el storage antes de pedir un nuevo ticket a ARCA
const ticket = await wsaa.login();
```

---

## 🔍 Consulta de Padrón (A13)
Obtené los datos de un contribuyente (nombre, domicilio, condición IVA) solo con su CUIT.

```typescript
import { PadronService } from 'arca-sdk';

const padron = new PadronService(config);
const { taxpayer, error } = await padron.getTaxpayer('30111111118');

if (taxpayer) {
  const name = taxpayer.companyName || `${taxpayer.firstName} ${taxpayer.lastName}`;
  console.log('Nombre:', name);
  console.log('Provincia:', taxpayer.addresses[0].province);
  console.log('¿Inscripto IVA?:', taxpayer.isVATRegistered);
  console.log('¿Monotributista?:', taxpayer.isMonotax);
}
```

---

## 📱 Comprobantes soportados

```typescript
// Ticket C — Consumidor Final (solo total)
const cae = await wsfe.issueSimpleReceipt({ total: 1500 });

// Ticket C — con detalle de items (los items se guardan localmente, no van a ARCA)
const cae = await wsfe.issueReceipt({
  items: [
    { description: 'Café con leche', quantity: 2, unitPrice: 750 },
    { description: 'Medialunas x3', quantity: 1, unitPrice: 500 },
  ],
});

// Factura C — Consumidor Final con items
const cae = await wsfe.issueInvoiceC({ items: [...] });

// Factura B — con IVA discriminado (requiere vatRate en cada item)
const cae = await wsfe.issueInvoiceB({
  items: [
    { description: 'Servicio de diseño', quantity: 10, unitPrice: 1000, vatRate: 21 },
  ],
  buyer: { docType: TaxIdType.CUIT, docNumber: '20987654321' },
});

// Factura A — entre Responsables Inscriptos
const cae = await wsfe.issueInvoiceA({
  items: [...],
  buyer: { docType: TaxIdType.CUIT, docNumber: '30123456789' },
});
```

---

## 🔎 Consultar un comprobante ya emitido

```typescript
const invoice = await wsfe.getInvoice(InvoiceType.TICKET_C, 42);
console.log('Total:', invoice.total);
console.log('CAE:', invoice.cae);
```

---

## 🏪 Listar puntos de venta

```typescript
const points = await wsfe.getPointsOfSale();
points.forEach(p => {
  console.log(`PdV ${p.number}: ${p.type} — ${p.isBlocked ? '🔴 Bloqueado' : '✅ Activo'}`);
});
```

---

## 📱 QR Oficial de ARCA

```typescript
// 1. Integrado automáticamente en todos los métodos de emisión
const result = await wsfe.issueSimpleReceipt({ total: 1500 });
console.log(result.qrUrl);

// 2. O generalo manualmente
import { generateQRUrl } from 'arca-sdk';
const url = generateQRUrl(caeResponse, '20123456789', 1500);
```

---

## 🩺 Estado de los servidores

```typescript
// Sin necesidad de autenticación
const status = await WsfeService.checkStatus('produccion');
console.log('AppServer:', status.appServer);  // 'OK'
console.log('DbServer:', status.dbServer);
console.log('AuthServer:', status.authServer);
```

---

## 📝 Referencia de Servicios

| Clase | Servicio ARCA | Descripción |
|-------|---------------|-------------|
| `WsaaService` | `wsaa` | Autenticación y Autorización |
| `WsfeService` | `wsfev1` | Facturación Electrónica (A, B, C) |
| `PadronService` | `ws_sr_padron_a13` | Consulta de datos de contribuyentes |

### Enums disponibles

```typescript
import { InvoiceType, BillingConcept, TaxIdType } from 'arca-sdk';

InvoiceType.FACTURA_A    // 1
InvoiceType.FACTURA_B    // 6
InvoiceType.FACTURA_C    // 11
InvoiceType.TICKET_C     // 83

BillingConcept.PRODUCTS               // 1
BillingConcept.SERVICES               // 2
BillingConcept.PRODUCTS_AND_SERVICES  // 3

TaxIdType.CUIT            // 80
TaxIdType.DNI             // 96
TaxIdType.FINAL_CONSUMER  // 99
```

---

## 🛠️ Desarrollo y Tests

```bash
# Correr tests (unit + mocks de ARCA)
bun test

# Verificar tipos TypeScript
bun run lint

# Build para producción (CJS + ESM + .d.ts)
bun run build
```

---

## 📄 Licencia
MIT © [Marcela Borgarello](https://github.com/marcelaborgarello)

---

**Hecho con ❤️ en Argentina 🇦🇷**
*Porque integrar con ARCA no tiene por qué ser un infierno.*
