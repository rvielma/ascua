# Ascua para VS Code

Las plantillas de [Ascua](https://ascua.gitweave.run) en VS Code:

- **Colores dentro de `` view`…` ``** (y de `` html`…` ``): etiquetas,
  atributos, tus componentes, el CSS de `<style>` y cada `${…}` como
  TypeScript.
- **Errores de tipos, autocompletado e ir a la definición** dentro de las
  plantillas, con `ascua-ts-plugin` incluido: no hace falta añadirlo al
  `tsconfig.json` ni cambiar la versión de TypeScript del editor.

El plugin solo trabaja en los proyectos que dependen de `ascua` en su
`package.json`. En los demás —un `` html`…` `` de Lit, por ejemplo— no hace
nada.

## Instalar

Descarga el `.vsix` desde la [documentación](https://ascua.gitweave.run/docs/tipos/)
y:

```sh
code --install-extension ascua-vscode-0.1.0.vsix
```

O en VS Code: *Extensions → … → Install from VSIX…*

## Con qué TypeScript

Con el 5 y el 6, el que trae VS Code o el del proyecto. TypeScript 7, el
nativo, todavía no admite plugins: los colores siguen funcionando, los errores
de las plantillas los da `ascua-check`.

Si el proyecto ya declara `ascua-ts-plugin` en su `tsconfig.json`, se usa ese y
no el de la extensión.

## Licencia

MIT OR Apache-2.0
