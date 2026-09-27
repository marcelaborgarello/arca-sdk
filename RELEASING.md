# Publicar una versión

Checklist para publicar `arca-sdk` en npm.

## TL;DR — publica el CI, se dispara con un tag

```bash
bun run lint && bun run test && bun run build   # control local
# subir la versión en package.json, commitear, y después:
git tag -a v3.0.0 -m "v3.0.0"
git push origin v3.0.0                          # ← esto arranca la publicación
```

**Pushear el tag arranca la publicación; no la termina.** GitHub Actions corre `release.yml`,
que verifica que el tag coincida con `package.json`, corre lint y tests, y sube el paquete a
npm — **pero queda en una antesala, sin ser público**. El último paso es confirmarlo en
npmjs.com (§3). Son dos pasos a propósito: hasta que confirmás, nada es irreversible.

> **Decidido el 2026-09-26 (noche).** Esa mañana se había borrado el workflow con el
> argumento de "un camino, no dos", y **fue un error**: se restauró tal cual estaba. El
> motivo por el que se borró —"cualquier tag pusheado publica"— ya estaba cubierto en el
> propio archivo, que se dispara sólo con tags `v*` y aborta si el tag no coincide con
> `package.json`.
>
> Publicar a mano desde la máquina **funciona pero pierde la procedencia** (ver §2). Las
> versiones 2.0.0 y 2.1.0 salieron así y no la tienen. No se arregla hacia atrás.

## 1. Antes de commitear

```bash
bun run lint     # tsc --noEmit
bun run test     # OJO: `bun run test` (vitest), NO `bun test`
bun run build
```

> Desde 2026-09-25 el runner oficial es **vitest**, y el CI corre `bun run test`. El runner
> nativo de Bun (`bun test`) no aísla los `vi.mock` entre archivos, así que la suite pasaba
> en verde con cosas rotas. `prepublishOnly` también usa `bun run test`.

Si el cambio toca el XML que se le manda a ARCA, corré además la suite de integración contra
homologación — es la única que puede ponerse en rojo por un rechazo real:

```bash
export ARCA_TEST_CUIT=...  ARCA_TEST_CERT=./certs/cert.pem  ARCA_TEST_KEY=./certs/key.pem
bun run test:integration
```

Actualizar `CHANGELOG.md` (en español, agrupado por tipo de cambio, citando la RG o la
versión del manual que motiva cada entrada) y subir la versión en `package.json` según
semver: campo opcional nuevo = minor, cambio de firma = major.

### Trampa: finales de línea

El repo no tiene `.gitattributes` y los archivos quedan en CRLF en disco pero en LF en el
índice, así que `git status` marca como modificados archivos que nadie tocó.

**Nunca uses `git add -A`**: staggea todo el árbol con basura de CRLF y ensucia el diff que
después lee gente de afuera. Stageá archivo por archivo y verificá con:

```bash
git diff --ignore-cr-at-eol --stat
```

Si un archivo tocado muestra cientos de líneas cambiadas cuando cambiaste tres, está en
CRLF. Normalizalo antes de commitear:

```bash
sed -i 's/\r$//' ruta/al/archivo.ts
```

## 2. La configuración: trusted publishing (una sola vez)

**No hay ningún token guardado en ninguna parte, ni acá ni en GitHub.** El mecanismo se
llama *trusted publishing* y funciona por OIDC (OpenID Connect):

Cuando corre el workflow, GitHub le presenta a npm una credencial **efímera y firmada** que
dice *"soy el workflow `release.yml` del repo `marcelaborgarello/arca-sdk`"*. Vive unos
minutos y no sirve para nada más. npm la verifica contra una configuración registrada en el
paquete, y si coincide, publica. O sea: la credencial no es un secreto que se guarda, **es
la identidad de la corrida**.

Esto reemplaza al Granular Access Token con bypass de 2FA que se usaba hasta mediados de
2026. npm [lo deprecó](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/):
en agosto de 2026 esos tokens perdieron las operaciones sensibles, y hacia enero de 2027
pierden la publicación. Si el formulario de npm ya no te ofrece el toggle de bypass, **no es
un error tuyo**: es la deprecación.

### Lo que se gana: la procedencia

Publicando desde el CI, npm genera solo las **provenance attestations**: un sello
verificable de que ese tarball se construyó desde ese commit, por ese workflow. Aparece en
la página del paquete en npmjs.com y cualquiera lo puede comprobar.

Para este SDK no es cosmético. `arca-sdk` firma requests con **la clave privada del
certificado de ARCA de quien lo use**. Alguien que lo instala está metiendo este código en el
camino de sus credenciales fiscales, y **el paquete no incluye `src/`** (son diez archivos;
el código va compilado en `dist/`). Sin procedencia no tiene forma de comprobar que lo que
bajó de npm se corresponde con el fuente que puede leer en GitHub. Con procedencia, sí.

Se verifica así:

```bash
npm view arca-sdk@3.0.0 dist --json    # tiene que traer un campo `attestations`
```

> `signatures` **no es** procedencia: es la firma del registry y la lleva todo paquete.
> Lo que hay que buscar es `attestations`.

### Cómo se carga (npmjs.com → paquete `arca-sdk` → Settings)

En **Trusted Publisher**:

| Campo | Valor |
|---|---|
| Publisher | GitHub Actions |
| Label | opcional (`release.yml`) |
| Organization or user | `marcelaborgarello` |
| Repository | `arca-sdk` |
| Workflow filename | `release.yml` |
| Environment name | vacío |
| Allowed actions | **sin marcar** (ver abajo) |

Tres cosas que muerden acá:

- **"Allowed actions" se deja sin marcar, a propósito.** Esa casilla pregunta si el workflow
  puede publicar *directo*. Sin marcar, npm exige **publicación en dos pasos** (*staged
  publishing*): el CI sube el paquete pero queda en una antesala, sin ser público, y recién se
  publica cuando alguien lo confirma en npmjs.com. Es lo que npm recomienda, y es la red que
  hace que pushear un tag no sea irreversible: el tag dispara la subida, no la publicación.
- **El nombre del archivo es parte del acuerdo.** Si algún día se renombra
  `.github/workflows/release.yml`, hay que venir a actualizar esto o el publish falla.
- **Esta conexión no se puede editar después de creada**, sólo borrar y crear otra. Es un
  minuto, pero tenelo en cuenta antes de cambiar cualquiera de los campos de arriba.

Y en **Publishing access**, elegir la primera opción: *"Require two-factor authentication and
disallow bypass 2fa tokens (recommended)"*. La página aclara que **todas las opciones son
compatibles con trusted publishers**, y recomienda justamente combinar trusted publishing con
la opción más restrictiva de tokens.

Una vez cargado, **no se vuelve a tocar**: es configuración del paquete, no de cada
publicación. Queda guardada hasta que alguien la borre a mano.

## 3. Publicar

```bash
# 1. Versión y changelog ya commiteados, con package.json en la versión nueva
npm publish --dry-run    # no publica; lista los archivos. Deben ser 10.

# 2. El tag, que es el que dispara todo
git tag -a v3.0.0 -m "v3.0.0"
git push origin v3.0.0
```

Y después mirar la pestaña **Actions** del repo en GitHub, que es donde pasa. El workflow:

1. verifica que el tag (sin la `v`) sea igual a `version` de `package.json`;
2. corre `bun run lint` y `bun run test`;
3. corre `npm publish`, que a su vez dispara `prepublishOnly` (`build` + `test` otra vez).

### El segundo paso: confirmar en npmjs.com

Con el Trusted Publisher configurado sin *"allowed actions"* (ver §2), lo que hace el
workflow es **dejar la versión en la antesala de npm, no publicarla**. Todavía no la puede
instalar nadie.

El último paso es entrar a npmjs.com, al paquete `arca-sdk`, y **confirmar la publicación**.
Ahí se vuelve pública.

<!-- POR COMPLETAR: anotar el paso a paso exacto de esta pantalla (dónde aparece la versión
     en espera, qué dice el botón) la próxima vez que se publique, mientras pasa. Al
     2026-09-26 el mecanismo está entendido pero la pantalla no se vio nunca. -->

```bash
npm view arca-sdk version                  # confirmá que subió
npm view arca-sdk@3.0.0 dist --json        # y que traiga `attestations`
```

> **Una versión publicada en npm no se puede deshacer ni reemplazar.** Si subiste algo mal,
> la única salida es publicar otra versión encima. Por eso existe el paso de confirmación:
> mientras está en la antesala, todavía no pasó nada irreversible.

### Los tags ya no son opcionales

Antes eran un marcador y nada más. Ahora **el tag es el gatillo**: pushear `v3.0.0` es el
acto de publicar. Consecuencias prácticas:

- **No pushees un tag de versión "para marcar" nada.** Va a intentar publicar.
- El tag tiene que ir **después** del commit que sube la versión en `package.json`, no antes.
- Si el tag y `package.json` no coinciden, el workflow **falla en el primer paso y no
  publica**. Es la red a propósito: un `v3.0.0` con el `package.json` en 2.1.0 dejaría el tag
  de git y la versión de npm apuntando a cosas distintas, y eso no se deshace.

Si te equivocaste en el tag antes de que publique:

```bash
git tag -d v3.0.0                  # borrar local
git push origin :refs/tags/v3.0.0  # borrar en GitHub
```

Y si el workflow falló por otra razón y hay que reintentar sin mover el tag, se puede
relanzar a mano desde la pestaña Actions (el workflow declara `workflow_dispatch`).

## 4. Descifrar los errores

| Error | Qué significa en realidad |
|---|---|
| `El tag (X) no coincide con package.json (Y)` | Falló el primer paso del workflow, **no publicó nada**. Subí la versión en `package.json`, commiteá, borrá el tag y volvé a taggear. |
| El workflow no arranca al pushear el tag | El tag no empieza con `v` (el trigger es `v*`), o se pusheó el commit sin el tag. `git push origin v3.0.0`, no sólo `git push`. |
| `E404 Not Found - PUT` / `'arca-sdk@X' does not exist in this registry` | **No es que el paquete no exista.** npm devuelve 404 en vez de 401/403 para no revelar si un paquete privado existe. Es **autenticación fallida**: casi siempre el Trusted Publisher no está cargado, o apunta a otro repo o a otro nombre de archivo de workflow. Revisar §2. |
| `E403 ... Two-factor authentication or granular access token...` | El publish salió por el camino viejo (token) en vez de OIDC. Verificar que el workflow tenga `permissions: id-token: write` — sin eso no hay OIDC. |
| El paquete subió pero sin `attestations` | Se publicó a mano desde una máquina, no por el CI. La procedencia sólo la genera el publish por OIDC. |
| `E403 ... cannot publish over previously published version` | Esa versión ya existe. npm no permite republicar: subí la versión en `package.json`. |
| El workflow dice OK pero `npm view arca-sdk version` sigue mostrando la anterior | **No es un error: es lo esperado.** Falta el segundo paso, confirmar la publicación en npmjs.com. Ver §3. |
| `npm warn ... "repository.url" was normalized` | Cosmético. No es la causa de ningún fallo de publish. Se silencia con `npm pkg fix`. |

## 5. Contenido del paquete

El tarball debe tener 10 archivos: `dist/`, `README.md`, `CHANGELOG.md`, `LICENSE` y
`package.json`. Verificalo siempre con `npm publish --dry-run`. En la v2.0.0 pesaba ~160 kB
(eran ~122 kB en la v1.4.x; la diferencia es README y CHANGELOG, que crecieron). Lo que
importa es que sigan siendo **10 archivos**: si aparecen más, se coló algo.

Dos cosas que ya se corrigieron y conviene no volver a romper:

- **No dejes en la raíz ningún archivo que empiece con `README`** más allá de `README.md`.
  npm fuerza la inclusión de todo lo que matchee `README*`, **sin importar el campo `files`
  ni el `.npmignore`**. Ya pasó una vez con un `README.pdf` de 557 kB, que se colaba al
  paquete y era más de la mitad del peso. (Ese PDF y las herramientas que lo generaban se
  borraron el 2026-09-26: nada en el repo los enlazaba.)
- **`LICENSE` tiene que existir en la raíz.** `package.json` declara MIT y el README tiene el
  badge apuntando al archivo. Sin él, el badge da 404 en GitHub y el paquete se publica sin el
  texto de la licencia, lo que deja ambigua la concesión de derechos.

## Apéndice — publicar a mano (sólo si el CI está caído)

El camino viejo sigue funcionando y se documenta por si hay una urgencia, **pero pierde la
procedencia**, así que no es el camino normal:

```bash
bun run lint && bun run test && bun run build
npm publish --dry-run
bun publish              # imprime una URL: se autoriza con la llave (passkey) de npm
```

`bun publish` no pide token: abre una URL donde autorizás con la **llave (passkey)** de la
cuenta de npm, que en esta máquina está protegida con el PIN de Windows. Es seguro —la llave
no se puede copiar ni pescar por phishing, porque vive en el hardware y está atada al dominio
de npm— pero el paquete sale **sin `attestations`**, porque no lo construyó el CI.

> Nunca le pases un token de publish a un asistente ni lo pegues en una conversación. Con la
> llave directamente no hay nada que pegar, que es el punto.

Si se publica así, **anotarlo**: es una versión sin procedencia y conviene que quede dicho.
