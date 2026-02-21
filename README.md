# 🇦🇷 arca-sdk

**La SDK moderna de ARCA (ex-AFIP) que no te rompe las bolas.**

SDK en TypeScript para integración con servicios de ARCA:
- ✅ **Type-safe**: TypeScript strict mode
- ✅ **Simple**: No más XML manual
- ✅ **Automático**: Cache de tokens, persistencia opcional (God Mode)
- ✅ **Fiscal**: Generador de QR oficial ARCA/AFIP ultra-robusto
- ✅ **Padrón**: Consulta de CUIT (A13) para autocompletado de datos
- ✅ **Resiliente**: Maneja errores SSL ("dh key too small") y timeouts
- ✅ **Moderno**: ESM + CJS nativo, Node.js 18+

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

// 1. Configuración base
const config = {
  environment: 'homologacion',
  cuit: '20123456789',
  cert: '...certificado PEM...',
  key: '...clave privada PEM...',
};

// 2. Emitir un Ticket C en dos líneas
const wsfe = new WsfeService(config);
const result = await wsfe.emitirTicketCSimple({ total: 1500 });

console.log('CAE:', result.cae);
console.log('QR URL:', result.urlQr); // ← Ya viene integrado!
```

---

## 👑 God Mode: Persistencia Automática
No manejes tickets manualmente. Pasale un `storage` al SDK y se encargará de guardar, recuperar y renovar el token solo cuando expire.

```typescript
const wsaa = new WsaaService({
  ...config,
  service: 'wsfe',
  storage: {
    get: async (key) => await db.token.findUnique({ where: { key } }),
    save: async (key, data) => await db.token.upsert({ ... }),
  }
});

// El SDK chequea el storage antes de pedir un nuevo ticket a ARCA
const ticket = await wsaa.login();
```

---

## 🔍 Consulta de Padrón (A13)
Obtené los datos de un cliente (Nombre, Domicilio, IVA) solo con su CUIT. Ideal para POS.

```typescript
import { PadronService } from 'arca-sdk';

const padron = new PadronService(config);
const { persona, error } = await padron.getPersona('30111111118');

if (persona) {
  console.log('Razón Social:', persona.razonSocial || `${persona.nombre} ${persona.apellido}`);
  console.log('Provincia:', persona.domicilio[0].descripcionProvincia);
  console.log('¿Es Inscripto?:', persona.esInscriptoIVA);
}
```

---

## 📱 Generador de QR Oficial
AFIP exige que los comprobantes impresos tengan un código QR. El SDK lo genera cumpliendo estrictamente con el formato oficial (JSON ordenado, Base64 URL-safe, etc).

```typescript
// 1. Integrado en WsfeService (Recomendado)
const result = await wsfe.emitirTicketCSimple({ total: 1500 });
console.log(result.urlQr); 

// 2. O manual si lo necesitás por separado
import { generarUrlQR } from 'arca-sdk';
const urlQr = generarUrlQR(caeResponse, '20123456789', 1500);
```

---

## 🖨️ Generación de PDF
Para mantener la SDK ligera, no incluimos generadores de PDF (como `jspdf`) en el core. 
**Tip:** La URL del QR (`urlQr`) apunta a la vista oficial de ARCA que ya es 100% imprimible y legal. Si necesitás PDF local, podés usar los datos de `CAEResponse` con tu librería favorita.

---

## 🩺 Chequeo de Salud
Verificá si los servidores de ARCA están online antes de intentar facturar.

```typescript
const status = await wsfe.checkStatus();
console.log('AppServer:', status.appServer); // 'OK'
```

---

## 📝 Servicios y Comprobantes

| Clase | Servicio ARCA | Descripción |
|-------|---------------|-------------|
| `WsaaService` | `wsaa` | Autenticación y Autorización |
| `WsfeService` | `wsfev1` | Facturación Electrónica (A, B, C) |
| `PadronService` | `ws_sr_padron_a13` | Consulta de datos de contribuyentes |

### Comprobantes soportados en `WsfeService`:
- `emitirTicketCSimple()`: Rápido para Consumidor Final.
- `emitirTicketC()`: Con detalle de items.
- `emitirFacturaB()`: Para Responsables Inscriptos o Facturas > $ limite.
- `emitirFacturaA()`: Con discriminación de IVA.

---

## 🛠️ Desarrollo y Tests
```bash
# Correr tests con mocks de ARCA
bun test

# Verificar tipos
bun run lint

# Build para producción (CJS + ESM)
bun run build
```

---

## 📄 Licencia
MIT © [Marcela Borgarello](https://github.com/marcelaborgarello)

---

**Hecho con ❤️ en Argentina 🇦🇷**
*Porque integrar con ARCA no tiene por qué ser un infierno.*
