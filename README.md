# 🇦🇷 arca-sdk

**La SDK moderna de ARCA (ex-AFIP) que no te rompe las bolas.**

SDK en TypeScript para integración con servicios de ARCA:
- ✅ **Type-safe**: TypeScript strict mode
- ✅ **Simple**: No más XML manual
- ✅ **Automático**: Cache de tokens, retry logic
- ✅ **Moderno**: ESM + CJS, Node.js 18+

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
import { WsaaService } from 'arca-sdk';
import * as fs from 'node:fs';

// 1. Crear servicio con tus certificados
const wsaa = new WsaaService({
  environment: 'homologacion',  // 'homologacion' o 'produccion'
  cuit: '20123456789',
  cert: fs.readFileSync('./cert.pem', 'utf-8'),
  key: fs.readFileSync('./key.pem', 'utf-8'),
  service: 'wsfe',
});

// 2. Obtener ticket (automático, con cache)
const ticket = await wsaa.login();

// 3. Usar token en otros servicios ARCA
console.log('Token:', ticket.token);
```

**Eso es todo.** No XML. No SOAP. No pain.

---

## 📖 Servicios Disponibles

### WSAA - Autenticación
```typescript
import { WsaaService } from 'arca-sdk';

const wsaa = new WsaaService({
  environment: 'homologacion',
  cuit: '20123456789',
  cert: '...certificado PEM...',
  key: '...clave privada PEM...',
  service: 'wsfe',  // o 'wsmtxca', etc
});

const ticket = await wsaa.login();
// Ticket válido por ~12 horas
// Se renueva automáticamente
```

### WSFE - Facturación *(próximamente)*
```typescript
// Próximamente:
const wsfe = new WsfeService(config);
await wsfe.emitirFacturaC({ ... });
```

---

## 🔑 Certificados

Necesitás certificados de ARCA en formato PEM:
- `cert.pem`: Certificado X.509
- `key.pem`: Clave privada

**Homologación (testing):**
1. Ir a [ARCA Homologación](https://www.afip.gob.ar/ws/documentacion/certificados.asp)
2. Generar certificado de prueba
3. Descargar cert + key

**Producción:**
1. Generar CSR con tu CUIT
2. Subir a ARCA
3. Descargar certificado firmado

---

## 🛠️ Ejemplos

Ver carpeta [`/examples`](./examples):
- [`autenticacion.ts`](./examples/autenticacion.ts) - Obtener ticket WSAA
- [`quick-start.ts`](./examples/quick-start.ts) - Inicio rápido

---

## 🧪 Testing
```bash
# Tests unitarios
bun test

# Build
bun run build
```

---

## 📝 TypeScript

La SDK exporta todos los tipos:
```typescript
import type { 
  LoginTicket, 
  WsaaConfig, 
  Environment 
} from 'arca-sdk';
```

Autocomplete completo en tu IDE. ✨

---

## ⚠️ Manejo de Errores
```typescript
import { ArcaAuthError, ArcaValidationError } from 'arca-sdk';

try {
  const ticket = await wsaa.login();
} catch (error) {
  if (error instanceof ArcaAuthError) {
    console.error('Error de autenticación:', error.message);
  }
  
  if (error instanceof ArcaValidationError) {
    console.error('Configuración inválida:', error.message);
  }
}
```

Los errores incluyen contexto útil en `error.details`.

---

## 🤝 Contribuir

Contribuciones bienvenidas! Ver [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 Licencia

MIT © [Marcela Borgarello](https://github.com/marcelaborgarello)

---

## 🔗 Links

- [Documentación ARCA](https://www.afip.gob.ar/ws/)
- [Issues](https://github.com/marcelaborgarello/arca-sdk/issues)
- [NPM](https://www.npmjs.com/package/arca-sdk)

---

**Hecho con ❤️ en Argentina 🇦🇷**

*Porque integrar con ARCA no tiene por qué ser un infierno.*
