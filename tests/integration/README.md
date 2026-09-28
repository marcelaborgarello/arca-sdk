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

Teniendo un TA vigente, ARCA **se niega a emitir otro** durante un lapso preventivo.
Si la suite pidiera uno en cada corrida, la segunda fallaría con:

```
Error AFIP WSAA: El CEE ya posee un TA valido para el acceso al WSN solicitado
```

**Cuánto dura el bloqueo: 10 minutos en homologación**, 2 en producción, según el
*WSAA Manual del Desarrollador* cap. 10.6 — que aclara que esos valores *"pueden ser
modificados dinámicamente y sin aviso previo"*. Medido contra homologación real el
2026-09-26: el bloqueo se levantó entre los 9m32s y los 10m32s del TA anterior.

> **No confundir con las 12 h**, que es la **vigencia** del TA (`expirationTime`). Son
> dos números distintos y hasta la v3.0.0 la documentación de este proyecto usaba el de
> la vigencia para describir el bloqueo. Equivocarse acá cuesta 10 minutos, no un día.

Por eso `helpers.ts` implementa un
`TokenStorage` que persiste el TA en `.ta-cache.json` (gitignorado). Es el mismo
patrón que necesita cualquier consumidor del SDK en producción: pasarle un `storage`
a `WsaaService` en vez de hacer `login()` en cada proceso.

Para forzar un TA nuevo, borrá el cache — pero sólo va a funcionar si el anterior ya
expiró.

## Requisitos del lado de ARCA

- Certificado de **homologación** (emitido por "Computadores Test"), no de producción.
- El CUIT tiene que tener la relación con el servicio `wsfe` habilitada.
- El punto de venta tiene que estar dado de alta **como Webservices** en el portal.

> **`FEParamGetPtosVenta` vacío no significa nada.** Hasta el 27/09/2026 acá decía que
> si devuelve "Sin Resultados" falta el alta del punto de venta y la emisión va a fallar
> con 10048 o 602. **Es falso**, y medido: en homologación devuelve `[]` para el CUIT
> del proyecto *y* para el CUIT de prueba 30000000007, y los dos facturan sin problema
> desde el punto de venta 1 (el del proyecto lleva 26 Facturas C). La lista vacía no
> predice nada — no la uses como diagnóstico.

## Probar comprobantes clase A siendo monotributista

Se puede, y no hace falta pedirle un CUIT prestado a nadie. El certificado identifica al
**sistema cliente**, no al contribuyente: el CUIT emisor viaja aparte, en `<Auth><Cuit>`,
que en el SDK es `config.cuit`. **No hay que cambiar una línea de código ni generar otro
certificado.**

Receta, verificada el 27/09/2026 (Factura A autorizada, CAE `86390929393429`):

1. Entrar a [WSASS homologación](https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx)
   con Clave Fiscal → **"Crear autorización a servicio"**.
2. Dejar el alias del DN, poner el CUIT a representar en **"CUIT representado"** y elegir
   el servicio `wsfe`. El campo *"CUIT autorizante"* queda clavado en el usuario conectado:
   **homologación no valida la representación**, no hay consentimiento de un tercero.
3. **Pedir un TA nuevo** (ver abajo, es el paso que más confunde).
4. Correr con `ARCA_TEST_CUIT=<CUIT representado>`. El `WsaaService` se sigue construyendo
   con el CUIT del certificado; sólo cambia el del `WsfeService`.

Para clase A sirve el CUIT de prueba **30000000007**, que ARCA acepta como emisor de
comprobantes A. Ojo con dos cosas:

- **La numeración es compartida** con el resto de los desarrolladores que lo usen.
  Consultar siempre el último autorizado; nunca hardcodear un número.
- Un receptor inexistente **no hace fallar** el comprobante: `20000000001` no está en el
  padrón y ARCA igual autorizó, devolviendo `Resultado = 'A'` **con** una observación.
  Eso no es un error (ver "Rechazo ≠ error" en `CLAUDE.md`).

### La delegación tiene que existir ANTES de pedir el TA

Es el detalle que cuesta media hora entenderlo, y que **está documentado en el manual que
nadie mira**: el de [Padrón A13](https://arca.gob.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.4.pdf),
en la descripción del parámetro `cuitRepresentada` de sus tres métodos:

> *Debe coincidir con alguna de las CUITS listadas en la sección **relations** del token
> enviado.*

No está en el manual de wsfev1 ni en el de WSAA, que son los dos donde uno lo busca. Hasta el
27/09/2026 acá decía que no estaba documentado en ninguno.

**El TA trae congelada la lista de relaciones del momento en que se emitió.** Si creás la
delegación en WSASS y reusás un TA anterior —el que cachea `.ta-cache.json`, por
ejemplo— wsfev1 la ignora y devuelve:

```
Error ARCA 600: ValidacionDeToken: No aparecio CUIT en lista de relaciones: 30000000007
```

No es que la delegación no sirva: es que ese token no la conoce. **Después de crear
cualquier delegación nueva, borrá el cache de TA.** Y acordate del bloqueo de 10 minutos
de arriba: si el TA anterior se generó recién, hay que esperar.

## Regla de diseño

Ningún tipo de comprobante entra al enum público ni recibe helper dedicado sin una
corrida verde acá. La lista autoritativa la da `FEParamGetTiposCbte`.
