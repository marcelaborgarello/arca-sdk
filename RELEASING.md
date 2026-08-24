# Publicar una versión

Checklist para publicar `arca-sdk` en npm. Está escrito porque los errores que tira
npm son engañosos y cuestan más tiempo del que deberían.

## 1. Antes de commitear

```bash
bun run lint     # tsc --noEmit
bun test         # OJO: bun test, que es lo que corre el CI, no `vitest run`
bun run build
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

## 2. Autenticación en npm

Esta es la parte que siempre falla. La cuenta tiene 2FA activo en modo
*Authorization and Publishing*, y eso condiciona todo lo demás.

Verificá en qué modo está la cuenta:

```bash
npm profile get     # mirá la línea de two-factor auth
```

Si está en `auth-and-writes`, **`npm login` + `npm publish --otp=` no alcanza**. Desde
npm 9 el login es por navegador y la sesión web que genera no acepta OTP al publicar:
vas a seguir recibiendo un 403 aunque el código sea correcto. La vía que funciona es el
token granular.

### Token granular con bypass de 2FA (la que funciona)

En npmjs.com → **Access Tokens** → *Generate New Token* → **Granular Access Token**.
Ninguna de estas cuatro opciones viene marcada por defecto, y omitir cualquiera hace
fallar el publish:

1. Poné vencimiento (30-90 días).
2. En *Packages and scopes*, permiso **Read and write**. Si queda en *Read only*, el
   publish falla con **404** (no con un error de permisos, ver la tabla de abajo).
3. En *Select packages*, agregá **`arca-sdk`** explícitamente. Si la lista queda vacía,
   el token no tiene permiso sobre nada y también da 404.
4. Habilitá el **bypass de 2FA**. Sin esto el publish falla con **403**, aunque el token
   sea válido y tenga permiso de escritura.

Cerrá cualquier sesión previa, porque interfiere con el token:

```bash
npm logout
notepad ~/.npmrc     # C:\Users\<vos>\.npmrc en Windows
```

Dejá una sola línea, y borrá cualquier `_authToken` viejo:

```
//registry.npmjs.org/:_authToken=TU_TOKEN
```

Editalo con un editor y no con `echo >>`, para no dejar el token en el historial del
shell. Verificá que npm lo esté leyendo:

```bash
npm whoami                  # tiene que devolver tu usuario
npm config get userconfig   # confirmá que sea el .npmrc que editaste
```

> Un token con permiso de publish sobre `arca-sdk` permite subir una versión maliciosa
> de un paquete que instalan terceros. Si se filtra —en un chat, un log, una captura—
> revocalo de inmediato y generá otro.

> Un token con permiso de publish sobre `arca-sdk` permite subir una versión maliciosa
> de un paquete que instalan terceros. Si se filtra —en un chat, un log, una captura—
> revocalo de inmediato y generá otro.

## 3. Publicar

```bash
npm publish --dry-run    # revisá la lista de archivos del tarball
npm publish              # prepublishOnly corre build + test solo
```

Con el token de bypass no hace falta `--otp`.

Después:

```bash
git tag -a v1.4.0 -m "v1.4.0"
git push origin main --follow-tags
npm view arca-sdk version   # confirmá que subió
```

## 4. Descifrar los errores de npm

| Error | Qué significa en realidad |
|---|---|
| `E404 Not Found - PUT` | **No es que el paquete no exista.** npm devuelve 404 en vez de 401/403 para no revelar si un paquete privado existe. Es autenticación fallida o token sin permiso sobre el paquete. |
| `E403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required` | Estás autenticada, pero falta el segundo factor. **`--otp=` no lo resuelve si entraste con `npm login` por navegador**: esa sesión no acepta OTP al publicar. Usá un token granular con bypass de 2FA. |
| `EOTP` | El OTP que pasaste es inválido o venció. Los códigos duran 30 segundos. |
| `E403 ... cannot publish over previously published version` | Esa versión ya existe. npm no permite republicar: subí la versión en `package.json`. |
| `npm warn ... "repository.url" was normalized` | Cosmético. No es la causa de ningún fallo de publish. Se silencia con `npm pkg fix`. |

## 5. Deuda conocida del paquete

- **Falta el archivo `LICENSE`.** `package.json` declara MIT y el README tiene el badge,
  pero el archivo no existe: el badge da 404 en GitHub y el paquete se publica sin el
  texto de la licencia.
- **`README.pdf` se publica** (~557 kB, más de la mitad del peso del tarball). El campo
  `files` no lo filtra porque npm fuerza la inclusión de todo lo que matchee `README*`.
  Se resuelve renombrándolo a `docs/manual.pdf`.
