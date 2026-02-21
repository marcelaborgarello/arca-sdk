# Guía de Contribución 🇦🇷

¡Qué bueno que quieras ayudar a mejorar `arca-sdk`! Para mantener la calidad del proyecto, seguimos un flujo de trabajo estándar de GitHub.

## 🚀 Flujo de Trabajo

1. **Fork**: Hacé un fork del repositorio a tu propia cuenta.
2. **Rama**: Creá una rama para tu mejora (`git checkout -b feat/mi-mejora`).
3. **Desarrollo**: Hacé tus cambios.
4. **Tests**: Verificá que todo siga funcionando con `bun test`.
5. **Lint**: Asegurate de que los tipos estén correctos con `bun run lint`.
6. **Push**: Subí los cambios a tu fork (`git push origin feat/mi-mejora`).
7. **Pull Request**: Abrí un PR desde GitHub hacia nuestra rama `main`.

## 🤖 CI/CD (GitHub Actions)

Al abrir un PR, se activará automáticamente un flujo de trabajo que:
- Validará los tipos (Lint).
- Verificará que el proyecto compile (Build).
- Correrá todos los tests unitarios.

**Nota**: Tu Pull Request solo será aceptado si el check de CI sale en verde ✅.

## 🛠️ Scripts Útiles

- `bun install`: Instalar dependencias.
- `bun run dev`: Modo desarrollo.
- `bun run build`: Compilar el proyecto.
- `bun test`: Correr tests.
- `bun run lint`: Verificar tipos de TypeScript.

¡Gracias por colaborar! 🚀
