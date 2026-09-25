# Tests de integración

Corren contra **ARCA homologación** de verdad. Son los únicos que pueden ponerse en
rojo por un rechazo de ARCA: el resto de la suite mockea `callArcaApi` y prueba que el
SDK hace lo que creemos, no que ARCA lo acepte.

El caso testigo es el error **11001** del Tique C: apareció en una corrida manual y
nunca en los tests unitarios, que seguían en verde afirmando que se emitía bien.

## Cómo correrlos

Son **opt-in**. Sin las variables de entorno, la suite entera se saltea.

```bash
export ARCA_TEST_CUIT=20123456789
export ARCA_TEST_CERT=./certs/cert.pem   # ruta al PEM, no su contenido
export ARCA_TEST_KEY=./certs/key.pem
export ARCA_TEST_PTO_VTA=1               # opcional, default 1

bun run test:integration
```

En PowerShell:

```powershell
$env:ARCA_TEST_CUIT = "20123456789"
$env:ARCA_TEST_CERT = "./certs/cert.pem"
$env:ARCA_TEST_KEY  = "./certs/key.pem"

bun run test:integration
```

`ARCA_TEST_CERT` y `ARCA_TEST_KEY` son **rutas**, no el contenido del PEM: así una
clave privada no termina en el historial de la shell ni en los logs de un CI.

## Por qué no corren en CI

Dependen de un servicio de terceros que se cae, y consumen numeración real de
comprobantes en homologación. Enganchalos al `prepublishOnly`, no a cada PR.

## El TA vigente

ARCA **no emite un ticket de acceso nuevo mientras el anterior siga vigente** (12 h).
Si la suite pidiera uno en cada corrida, la segunda fallaría con:

```
Error AFIP WSAA: El CEE ya posee un TA valido para el acceso al WSN solicitado
```

...y quedaría bloqueada hasta que expire. Por eso `helpers.ts` implementa un
`TokenStorage` que persiste el TA en `.ta-cache.json` (gitignorado). Es el mismo
patrón que necesita cualquier consumidor del SDK en producción: pasarle un `storage`
a `WsaaService` en vez de hacer `login()` en cada proceso.

Para forzar un TA nuevo, borrá el cache — pero sólo va a funcionar si el anterior ya
expiró.

## Requisitos del lado de ARCA

- Certificado de **homologación** (emitido por "Computadores Test"), no de producción.
- El CUIT tiene que tener la relación con el servicio `wsfe` habilitada.
- El punto de venta tiene que estar dado de alta **como Webservices** en el portal.
  Si `FEParamGetPtosVenta` devuelve "Sin Resultados", falta ese alta y la emisión va
  a fallar con 10048 o 602.

## Regla de diseño

Ningún tipo de comprobante entra al enum público ni recibe helper dedicado sin una
corrida verde acá. La lista autoritativa la da `FEParamGetTiposCbte`.
