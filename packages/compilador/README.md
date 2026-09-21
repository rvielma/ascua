# @ascua/compilador

El compilador de plantillas de [Ascua](https://ascua.gitweave.run), como módulo
**WebAssembly**: un solo artefacto para Node, Bun, Deno y el navegador. Sin
binarios por plataforma —SWC publica una decena, esbuild veinte— y sin
`postinstall` que descargue nada.

```sh
stil add -D @ascua/compilador      # o npm install -D @ascua/compilador
```

```js
const { compilar_json } = require("@ascua/compilador");

const { code, css } = JSON.parse(compilar_json(fuente));
```

`compilar_json` recibe un archivo TypeScript, sustituye sus plantillas
`` view`…` `` por las llamadas de DOM que las construyen y devuelve el código y
el CSS que se extrajo de los `<style>`, ya scopeado. Lo que no es plantilla se
copia sin tocar: esto no transpila TypeScript.

En el navegador, el mismo .wasm con el envoltorio de `./web`:

```js
import init, { compilar_json } from "@ascua/compilador/web";

await init();
```

Es lo que hace funcionar el [playground](https://ascua.gitweave.run/playground/):
el compilador entero corriendo en la pestaña.

Normalmente no se llama a mano, sino a través de
[`@ascua/vite-plugin`](https://www.npmjs.com/package/@ascua/vite-plugin).

## Licencia

MIT OR Apache-2.0
