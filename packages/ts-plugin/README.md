# @ascua/ts-plugin

Las plantillas de [Ascua](https://ascua.gitweave.run), entendidas por el
editor:

- **Errores de tipos en rojo** mientras escribes: un prop de otro tipo, uno
  obligatorio que falta, un manejador que no acepta su evento. Subrayado donde
  está, no en el `view`.
- **Autocompletado de props** dentro de la etiqueta de un componente: los que
  faltan primero, sin los que ya escribiste.
- **Ir a la definición** desde `<Tarjeta` hasta la función `Tarjeta`.
- **La firma del componente** al pasar por encima de su etiqueta.
- **Los errores de sintaxis** de una plantilla —una etiqueta sin cerrar—, en su
  línea.

```sh
stil add -D @ascua/ts-plugin      # o npm install -D @ascua/ts-plugin
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [{ "name": "@ascua/ts-plugin" }]
  }
}
```

**Y en el editor, la versión de TypeScript del proyecto.** `tsserver` busca
los plugins junto al TypeScript que ejecuta, así que tiene que ser el del
`node_modules` del proyecto. En VS Code: *TypeScript: Select TypeScript Version
→ Use Workspace Version*.

## Con qué TypeScript

Con el 5 y el 6, que son los que tienen `tsserver`. TypeScript 7, el nativo,
todavía no admite plugins: si el proyecto lo usa para compilar, el editor
necesita además un `typescript@6` para el language service. En la línea de
comandos y en el CI, `ascua-check` funciona con cualquiera de los tres.

## Cómo funciona

Lo que sale del compilador de Ascua ya es TypeScript tipado: `<Tarjeta
titulo=${42}/>` se convierte en `Tarjeta({ titulo: 42 })`. El plugin compila el
archivo abierto, lo comprueba en un programa que reutiliza todos los demás
archivos del editor y devuelve cada error a su sitio con el source map del
compilador. El autocompletado y la definición salen del checker de TypeScript
sobre el archivo original: el componente está en scope y su primer parámetro
dice qué props acepta.

## Licencia

MIT OR Apache-2.0
