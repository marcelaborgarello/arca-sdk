# arca-sdk

SDK de TypeScript para los web services de ARCA (ex-AFIP): WSAA (autenticación),
WSFE (facturación electrónica), Padrón A13 y CAEA (contingencia).

- Autora: Marcela Borgarello
- Repo: https://github.com/marcelaborgarello/arca-sdk · npm: `arca-sdk` · Licencia MIT

## Esto es una librería open source, no una app

Es la restricción de diseño más importante del proyecto y la que más fácil se olvida.

- **La vara de corrección es la spec de ARCA, no ningún consumidor en particular.**
  Que la autora no use una feature (CAEA, comprobantes de servicios, MiPyME) no la
  vuelve menos importante: alguien la usa. No validar decisiones contra un solo caso de uso.
- **Pensar en todos los usos plausibles**, no en el más obvio. Un SaaS multi-tenant
  factura a cualquier hora del día; un script de backoffice corre a las 3 AM en un
  servidor en UTC; alguien va a pasar un string donde esperabas un `Date`.
- **Los cambios de API son públicos.** Romper una firma obliga a migrar a terceros.
  Preferir cambios aditivos; si hay que romper, es major y va documentado.
- Hay PRs y contribuciones externas. El código lo lee gente que no tiene el contexto
  de la conversación en la que se escribió: los comentarios explican el *porqué*
  normativo, no el *qué* del código.

## Comandos

Runtime y package manager: **Bun** (hay `bun.lock`).

```bash
bun install
bun run lint     # tsc --noEmit
bun test         # vitest run
bun run build    # tsup (ESM + CJS + .d.ts)
```

El CI (`.github/workflows/ci.yml`) corre lint → build → test en cada PR contra `main`.
Un PR no se acepta con el check en rojo.

> **Ojo**: `bun test` usa el runner nativo de Bun, que no es exactamente `vitest run`
> (el script `test` de `package.json`). Si algo pasa local y falla en CI, empezá por ahí.

## Normativa ARCA

El SDK sigue el **Manual del Desarrollador RG 4291 – Proyecto FE (`wsfev1`)**, que ARCA
versiona aparte de las resoluciones generales. El historial de cambios del PDF es la
fuente autoritativa para cambios técnicos: los medios y las consultoras suelen errarle
a las fechas de vigencia.

Ya contemplado (no reportar como novedad):

- **RG 5866/2026** (01/07/2026): unificó y abrogó el régimen de factura electrónica.
  Tope de $10.000.000 para identificar al comprador Consumidor Final.
- **RG 5762/2025**: disolución de la Factura clase "M". Se emiten Facturas A con leyenda
  ("OPERACIÓN SUJETA A RETENCIÓN" / "PAGO EN CBU INFORMADA") vía el campo `optionals`.
- **RG 5616/2024**: `CondicionIVAReceptorId`. Pasa a ser **obligatorio el 01/12/2026**
  (manual v4.8) — no el 01/09, como afirman varias fuentes secundarias.
- **RG 5782** (manual v4.6, 01/08/2026): todos los puntos de venta CAEA pasan a
  Contingencia y `CbteFchHsGen` es obligatorio.
- Migración de endpoints `*.afip.gob.ar` → `*.arca.gob.ar` y QR en
  `https://www.arca.gob.ar/fe/qr/?p=...`.

Pendiente / a futuro: manual v4.7 (01/09/2026, Seguros de Caución, códigos 10273-10281);
tipo de documento receptor `31 - FCI CNV` (v4.5) todavía no está en el enum `TaxIdType`.

## Fechas: instante vs. fecha-calendario

La trampa más grande del proyecto, y la causa de un bug real.

ARCA opera **siempre** en horario de Argentina (UTC-3, sin DST). Un `Date` de JS es un
*instante*; `CbteFch` es una *fecha-calendario*. Con un `Date` pelado las dos cosas son
indistinguibles, y elegir mal desplaza el comprobante un día.

Los campos de fecha usan `ArcaDateInput = Date | string` (`src/utils/formatArcaDate.ts`):

- `'2026-08-24'` / `'20260824'` → fecha literal, sin conversión. Forma recomendada.
- `new Date()` → instante, se convierte al día calendario argentino.
- Un `Date` en medianoche UTC exacta se trata como fecha-calendario (es como se
  construye "un día" en JS: `new Date('2026-08-24')`).
- `generatedAt` (→ `CbteFchHsGen`) es la excepción: un `Date` ahí es **siempre** un
  instante, porque la hora es justamente el dato que ARCA valida.

**Nunca uses `toISOString()` para armar una fecha de comprobante.** Usá
`formatArcaDateOnly()` (`yyyymmdd`) o `formatArcaTimestamp()` (`yyyymmddhhmmss`).

Nota: `CbteFch` y `CbteFchHsGen` **pueden** diferir legítimamente — para concepto 1 la
fecha del comprobante admite ±5 días respecto de la de generación. No agregar una
validación de igualdad estricta entre ambos.

## Estructura

```
src/
  auth/       wsaa.ts (login), ticket.ts, storage.ts
  services/   wsfe.ts (facturación), caea.ts (contingencia), padron.ts
  types/      un archivo por servicio + common.ts
  utils/      formatArcaDate, crypto, xml, qr, network, calculations
  constants/  endpoints.ts, errors.ts (hints por código de error de ARCA)
```

El XML SOAP se arma con template strings, no con un serializador. **El orden de los
elementos importa**: el esquema es un `sequence` y `FECAEADetRequest` extiende
`FEDetRequest` agregando `CAEA` y `CbteFchHsGen` al final, en ese orden.

Deuda conocida: dentro de `FECAEADetRequest` el orden actual está desviado del XSD
(`CondicionIVAReceptorId` va pegado a `DocNro`, las `FchServ*` después de `MonCotiz`).
Funciona hoy; si aparecen rechazos raros en CAEA, mirar ahí primero.

## Convenciones

- **Commits**: conventional commits en minúscula, con scope.
  `fix(wsfe): ...`, `feat(caea): ...`, `chore: ...`
- **Ramas**: `feat/`, `fix/`, `chore/`, `cleanup/`. PR contra `main`.
- **Versionado**: semver. Campo opcional nuevo = minor; cambio de firma = major.
  El `CHANGELOG.md` está en español, agrupado por tipo de cambio y con la RG o versión
  del manual que motiva cada entrada.
- **Comentarios y docs en español** (rioplatense); identificadores y API en inglés.
- Los tests referencian la normativa que cubren
  (ej. `// RG 5782 — Manual del Desarrollador RG 4291 v4.6`).

## Al tocar código

- Correr `bun run lint` y `bun test` siempre. Agregar tests de regresión con los casos
  borde de zona horaria: medianoche, 21:00-00:00 ART, fecha-calendario vs. instante.
- No modificar la normativa implementada sin verificar contra el PDF oficial del manual.
  Las fuentes secundarias se equivocan seguido.

## Nota sobre el repo

No hay `.gitattributes` y los archivos están en CRLF en disco pero LF en el índice, así
que `git status` marca como modificados archivos que nadie tocó. Para ver el diff real:

```bash
git diff --ignore-cr-at-eol
```

Se arregla con `.gitattributes` (`* text=auto eol=lf`) + `git add --renormalize .`, pero
eso genera un commit que toca todo el árbol: va solo, nunca mezclado con otro cambio.
