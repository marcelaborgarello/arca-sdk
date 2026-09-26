# Publicar una versión

Checklist para publicar `arca-sdk` en npm. Está escrito porque los errores que tira
npm son engañosos y cuestan más tiempo del que deberían.

## TL;DR — se publica a mano, desde tu máquina

```bash
bun run lint && bun run test && bun run build
npm publish --dry-run    # no publica: lista los archivos que subirían
bun publish              # abre el navegador para autorizar
```

`bun publish` no pide token: abre una URL donde autorizás la publicación con la llave
(passkey) de la cuenta de npm, que en esta máquina está guardada con el PIN de Windows.
Autorizás en el navegador y sube.

> **Decidido el 2026-09-26: no hay publicación automática.** El repo tenía un workflow
> (`.github/workflows/release.yml`) que publicaba solo al pushear un tag de versión, con
> *trusted publishing* (OIDC). Se borró: la publicación la hace siempre la autora desde
> su máquina, como fue siempre, y el workflow obligaba a manejar tags y una
> configuración de trusted publisher en npmjs.com para resolver un problema —cómo
> autentica un robot sin guardar credenciales— que no existe cuando publica una persona.
>
> Un camino, no dos. Dos caminos armados a la vez significaban que un tag pusheado por
> cualquier motivo disparaba un intento de publicación.
>
> Si la configuración de **Trusted Publisher** quedó cargada en npmjs.com (paquete
> `arca-sdk` → *Settings*), conviene borrarla: ya no hay workflow del otro lado.

### ⚠️ El token granular con bypass de 2FA ya no sirve

Hasta mediados de 2026 esto se publicaba con un **Granular Access Token con bypass de
2FA**. npm [lo deprecó](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/):

- **Agosto 2026**: esos tokens ya no pueden hacer operaciones sensibles de cuenta,
  paquete ni organización — **incluido crear tokens**.
- **~Enero 2027**: pierden la publicación directa.

O sea: si el formulario de npm ya no te ofrece el toggle de bypass, o el token que
generás no publica, **no es un error tuyo**: es la deprecación. Por eso ahora se publica
con la llave y la autorización por navegador.

## 1. Antes de commitear

```bash
bun run lint     # tsc --noEmit
bun run test     # OJO: `bun run test` (vitest), NO `bun test`
bun run build
```

> Desde 2026-09-25 el runner oficial es **vitest**, y el CI corre `bun run test`. El
> runner nativo de Bun (`bun test`) no aísla los `vi.mock` entre archivos, así que la
> suite pasaba en verde con cosas rotas. `prepublishOnly` también usa `bun run test`.

Si el cambio toca el XML que se le manda a ARCA, corré además la suite de integración
contra homologación — es la única que puede ponerse en rojo por un rechazo real:

```bash
export ARCA_TEST_CUIT=...  ARCA_TEST_CERT=./certs/cert.pem  ARCA_TEST_KEY=./certs/key.pem
bun run test:integration
```

Actualizar `CHANGELOG.md` (en español, agrupado por tipo de cambio, citando la RG o la
versión del manual que motiva cada entrada) y subir la versión en `package.json` según
semver: campo opcional nuevo = minor, cambio de firma = major.

### Trampa: finales de línea

El repo no tiene `.gitattributes` y los archivos quedan en CRLF en disco pero en LF en
el índice, así que `git status` marca como modificados archivos que nadie tocó.

**Nunca uses `git add -A`**: staggea todo el árbol con basura de CRLF y ensucia el diff
que después lee gente de afuera. Stageá archivo por archivo y verificá con:

```bash
git diff --ignore-cr-at-eol --stat
```

Si un archivo tocado muestra cientos de líneas cambiadas cuando cambiaste tres, está en
CRLF. Normalizalo antes de commitear:

```bash
sed -i 's/\r$//' ruta/al/archivo.ts
```

## 2. La credencial: la llave de npm

No hay token guardado en ningún archivo. La cuenta de npm tiene una **llave (passkey)**
registrada, y en esta máquina esa llave está protegida con el **PIN de Windows**. Cuando
corrés `bun publish`, la consola imprime una URL: la abrís, autorizás con el PIN y la
publicación sigue sola.

Es más seguro que el token que había antes, por dos razones: la llave **no se puede
copiar** (vive en el hardware de la máquina, no en un archivo que se pueda filtrar en un
log o en una captura de pantalla) y **no se puede pescar por phishing**, porque está atada
al dominio de npm.

> Nunca le pases un token de publish a un asistente ni lo pegues en una conversación.
> Con la llave directamente no hay nada que pegar, que es el punto.

<!-- POR COMPLETAR: falta anotar el paso a paso exacto de esta pantalla (qué dice la URL,
     qué botón se toca) la próxima vez que se publique. Lo de arriba describe el flujo
     pero no se verificó contra una publicación real desde que se configuró la llave. -->

## 3. Publicar

Un último control local del contenido del tarball:

```bash
npm publish --dry-run    # no publica; sólo lista los archivos. Deben ser 10.
```

Y después:

```bash
bun publish
```

`prepublishOnly` corre `bun run build && bun run test` antes de subir: es la última red
antes de algo irreversible. Se abre el navegador, autorizás con la llave, y termina.

```bash
npm view arca-sdk version   # confirmá que subió
```

> **Una versión publicada en npm no se puede deshacer ni reemplazar.** Si subiste algo
> mal, la única salida es publicar otra versión encima. Por eso el `--dry-run` y por eso
> el checklist.

### Los tags de git son aparte

Un **tag** es una marca en el historial que dice "esta versión salió de este commit".
Ahora que no hay workflow, **crear un tag no publica nada**: es sólo un marcador para
poder volver y ver qué código salió en cada versión.

```bash
git tag -a v2.2.0 -m "v2.2.0"     # después de publicar
git push origin v2.2.0
```

Es opcional y no hace falta entenderlo para publicar. Queda anotado porque falta el tag
`v2.0.0`, que nunca se creó.

## 4. Descifrar los errores de npm

| Error | Qué significa en realidad |
|---|---|
| `E404 Not Found - PUT` / `'arca-sdk@X' does not exist in this registry` | **No es que el paquete no exista.** npm devuelve 404 en vez de 401/403 para no revelar si un paquete privado existe. Es **autenticación fallida**: la sesión venció o la publicación no se autorizó en el navegador. Volvé a correr `bun publish` y autorizá. |
| `E403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required` | Estás autenticada pero falta el segundo factor, o sea que el publish salió por el camino viejo (token) en vez de la llave. El bypass de 2FA que pedía este mensaje está deprecado y no se puede volver a él. |
| El formulario de npm no muestra el toggle de bypass de 2FA | No es tu navegador ni tu cuenta: npm lo retiró (deprecado en julio de 2026). Es correcto que no esté. |
| Nunca se abre el navegador al publicar | La consola imprime la URL de autorización: si no se abrió sola, copiala y pegala a mano. |
| `EOTP` | El OTP que pasaste es inválido o venció. Los códigos duran 30 segundos. |
| `E403 ... cannot publish over previously published version` | Esa versión ya existe. npm no permite republicar: subí la versión en `package.json`. |
| `npm warn ... "repository.url" was normalized` | Cosmético. No es la causa de ningún fallo de publish. Se silencia con `npm pkg fix`. |

## 5. Contenido del paquete

El tarball debe tener 10 archivos: `dist/`, `README.md`, `CHANGELOG.md`, `LICENSE` y
`package.json`. Verificalo siempre con `npm publish --dry-run`. En la v2.0.0 pesaba
~160 kB (eran ~122 kB en la v1.4.x; la diferencia es README y CHANGELOG, que crecieron).
Lo que importa es que sigan siendo **10 archivos**: si aparecen más, se coló algo.

Dos cosas que ya se corrigieron y conviene no volver a romper:

- **No dejes en la raíz ningún archivo que empiece con `README`** más allá de
  `README.md`. npm fuerza la inclusión de todo lo que matchee `README*`, **sin importar
  el campo `files` ni el `.npmignore`**. Ya pasó una vez con un `README.pdf` de 557 kB,
  que se colaba al paquete y era más de la mitad del peso. (Ese PDF y las herramientas
  que lo generaban se borraron el 2026-09-26: nada en el repo los enlazaba.)
- **`LICENSE` tiene que existir en la raíz.** `package.json` declara MIT y el README
  tiene el badge apuntando al archivo. Sin él, el badge da 404 en GitHub y el paquete se
  publica sin el texto de la licencia, lo que deja ambigua la concesión de derechos.
