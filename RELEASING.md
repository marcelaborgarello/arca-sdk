# Publicar una versión

Checklist para publicar `arca-sdk` en npm. Está escrito porque los errores que tira
npm son engañosos y cuestan más tiempo del que deberían.

## TL;DR — se publica sola con un tag

```bash
git tag -a v2.0.0 -m "v2.0.0"
git push origin --tags
```

El workflow `.github/workflows/release.yml` hace el resto: lint, tests, build y
`npm publish` con **trusted publishing (OIDC)**. No hay token que crear, pegar ni
revocar. Mirás el resultado en la pestaña *Actions*.

Requiere haber configurado el trusted publisher **una sola vez** en npmjs.com (§2).

> ### ⚠️ El método viejo (token con bypass de 2FA) está siendo apagado
>
> Hasta mediados de 2026 esto se publicaba con un **Granular Access Token con bypass
> de 2FA**. npm [lo deprecó](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/):
>
> - **Agosto 2026**: esos tokens ya no pueden hacer operaciones sensibles de cuenta,
>   paquete ni organización — **incluido crear tokens**.
> - **~Enero 2027**: pierden la publicación directa. Quedan sólo para leer paquetes
>   privados y *stagear* publicaciones que después aprueba una persona con 2FA.
>
> O sea: si el formulario de npm ya no te ofrece el toggle de bypass, o el token que
> generás no publica, **no es un error tuyo**. Es la deprecación. Usá OIDC.

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

## 2. Configurar trusted publishing (una sola vez)

Se hace una vez por paquete. Después no se toca más.

En npmjs.com → paquete **arca-sdk** → *Settings* → **Trusted Publisher** → GitHub Actions:

| Campo | Valor |
|---|---|
| Organization or user | `marcelaborgarello` |
| Repository | `arca-sdk` |
| Workflow filename | `release.yml` |
| Environment name | *(vacío)* |

**Sólo el nombre del archivo**, no la ruta: `release.yml`, no `.github/workflows/release.yml`.
Si no coincide exactamente con el archivo del repo, npm rechaza el OIDC y el publish
falla — y el error no dice que el problema sea ese.

### Allowed actions: ojo con esto

Las configuraciones creadas **después del 03/09/2026** vienen con `npm stage publish`
marcado y el publish directo **desactivado**. Con eso, el workflow deja la versión
*preparada* pero no publicada hasta que una persona la aprueba con 2FA.

- Si querés que el tag publique solo → marcá también **`npm publish`**.
- Si preferís aprobar a mano cada release (más seguro para una librería que instalan
  terceros) → dejalo como viene y cambiá el paso final del workflow a
  `npm stage publish`.

Las dos opciones son válidas. La segunda agrega un clic y evita publicar una major por
accidente desde un tag mal puesto.

### Por qué ya no hay token

El método anterior era un **Granular Access Token con bypass de 2FA**. npm
[lo deprecó en julio de 2026](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/):
desde agosto esos tokens no pueden hacer operaciones sensibles, y hacia enero de 2027
pierden la publicación directa.

Con OIDC no hay credencial de larga vida: GitHub firma un token efímero para esa
corrida específica, atado a este repo y a este workflow. No se puede extraer de un log
ni reutilizar. De yapa, npm publica las **provenance attestations** solo — el paquete
queda con el sello de "verificado" en npmjs.com, sin pasarle `--provenance`.

> Nunca le pases un token de publish a un asistente ni lo pegues en una conversación.
> Con trusted publishing directamente no hay token que pasar, que es el punto.

### Si necesitás publicar a mano igual

Queda como plan B mientras el token viejo siga andando (hasta ~enero 2027). Requiere
`npm profile get` en modo que acepte OTP, y en la práctica es lo que dejó de funcionar.
Preferí el workflow.

## 3. Publicar

Antes, un último control local del contenido del tarball:

```bash
npm publish --dry-run    # no publica; sólo lista los archivos. Deben ser 10.
```

Y después, todo el release es esto:

```bash
git tag -a v2.0.0 -m "v2.0.0"
git push origin --tags
```

El tag dispara `release.yml`, que verifica que el tag coincida con `package.json`,
corre lint y tests, y publica. Seguilo desde la pestaña *Actions*.

```bash
npm view arca-sdk version   # confirmá que subió
```

> Si el workflow falla, arreglá y volvé a correrlo desde *Actions* con **Run workflow**
> — no hace falta mover el tag. Si el tag quedó mal puesto:
> `git tag -d v2.0.0 && git push origin :refs/tags/v2.0.0`, y lo creás de nuevo.
> Eso se puede deshacer; una versión publicada en npm, no.

## 4. Descifrar los errores de npm

| Error | Qué significa en realidad |
|---|---|
| `E404 Not Found - PUT` / `'arca-sdk@X' does not exist in this registry` | **No es que el paquete no exista.** npm devuelve 404 en vez de 401/403 para no revelar si un paquete privado existe. Es autenticación fallida o token sin permiso. Desde agosto de 2026, la causa más probable es un token con bypass de 2FA, que ya no sirve: usá el workflow con OIDC. |
| `E403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required` | Estás autenticada, pero falta el segundo factor. **`--otp=` no lo resuelve si entraste con `npm login` por navegador**: esa sesión no acepta OTP al publicar. El bypass de 2FA que pedía este mensaje está deprecado — la salida es trusted publishing. |
| El formulario de npm no muestra el toggle de bypass de 2FA | No es tu navegador ni tu cuenta. npm lo está retirando (deprecado en julio de 2026). Configurá trusted publishing (§2). |
| El workflow corre pero npm rechaza el OIDC | El *Workflow filename* del trusted publisher no coincide con el archivo real. Tiene que ser `release.yml` a secas, sin la ruta. |
| El workflow dice OK pero el paquete no aparece publicado | La configuración quedó sólo con `npm stage publish`: la versión está preparada esperando aprobación con 2FA en npmjs.com. Ver §2, *Allowed actions*. |
| `EOTP` | El OTP que pasaste es inválido o venció. Los códigos duran 30 segundos. |
| `E403 ... cannot publish over previously published version` | Esa versión ya existe. npm no permite republicar: subí la versión en `package.json`. |
| `npm warn ... "repository.url" was normalized` | Cosmético. No es la causa de ningún fallo de publish. Se silencia con `npm pkg fix`. |

## 5. Contenido del paquete

El tarball debe tener 10 archivos: `dist/`, `README.md`, `CHANGELOG.md`, `LICENSE` y
`package.json`. Verificalo siempre con `npm publish --dry-run`. En la v2.0.0 pesaba
~160 kB (eran ~122 kB en la v1.4.x; la diferencia es README y CHANGELOG, que crecieron).
Lo que importa es que sigan siendo **10 archivos**: si aparecen más, se coló algo.

Dos cosas que ya se corrigieron y conviene no volver a romper:

- **No dejes un PDF que empiece con `README` en la raíz.** npm fuerza la inclusión de
  todo lo que matchee `README*`, sin importar el campo `files` ni el `.npmignore`. El
  manual en PDF vive en `docs/manual.pdf` justamente por eso; si regenerás el PDF con
  `md-to-pdf`, mandá la salida ahí y no a `README.pdf` (pesaba 557 kB, más de la mitad
  del paquete).
- **`LICENSE` tiene que existir en la raíz.** `package.json` declara MIT y el README
  tiene el badge apuntando al archivo. Sin él, el badge da 404 en GitHub y el paquete se
  publica sin el texto de la licencia, lo que deja ambigua la concesión de derechos.
