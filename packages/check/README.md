# @ascua/check

Los tipos de TypeScript, también **dentro de las plantillas** de
[Ascua](https://ascua.gitweave.run).

Para TypeScript, una plantilla es una cadena y sus huecos son `unknown`:
`<Tarjeta titulo=${42}/>` pasa aunque `titulo` sea un `string`. `ascua-check`
lo encuentra, con el error en tu archivo y en su línea:

```text
src/panel.ts:69:22 - error TS2322: Type 'number' is not assignable to type 'string'.

69             <Metrica etiqueta=${7} valor=${() => pesos(facturado())}/>
                        ~

✗ 1 error en 1 archivo
```

```sh
stil add -D @ascua/check      # o npm install -D @ascua/check
stil exec ascua-check         # o npx ascua-check
```

Comprueba los props de los componentes —los que faltan y los de otro tipo—,
los manejadores de eventos (`onclick` recibe un `MouseEvent`, `oninput` un
`Event`), los `ref` (`<input ref=${…}>` entrega un `HTMLInputElement`) y, de
paso, todo lo demás del proyecto, como `tsc`.

## Cómo funciona

Lo que sale del compilador de Ascua ya es TypeScript tipado: esa etiqueta se
convierte en `Tarjeta({ titulo: 42 })`. `ascua-check` copia el proyecto a
`.ascua-check/` con las plantillas compiladas, ejecuta **tu** `tsc` —el 5 o el
7— con un tsconfig que extiende el tuyo, y devuelve cada error a tu archivo con
el source map del compilador. Al terminar, borra la copia.

| Opción | Qué hace |
|---|---|
| `-p`, `--project RUTA` | El tsconfig. Por defecto, `tsconfig.json`. |
| `--conservar` | No borra `.ascua-check/`: se ve lo que comprobó `tsc`. |

Sale con `0` si no hay errores, `1` si los hay y `2` si no pudo comprobar.

## Licencia

MIT OR Apache-2.0
