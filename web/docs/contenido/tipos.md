---
titulo: Tipos
descripcion: Los props de los componentes, los manejadores y los ref se comprueban con ascua-check, que devuelve cada error a tu archivo y a su línea.
---

## El problema

Para TypeScript, una plantilla es una cadena y lo que va en sus huecos es
`unknown`. Esto compila sin quejarse:

```ts
function Tarjeta(props: { titulo: string }) { … }

view`<main><Tarjeta titulo=${42}/></main>`;   // titulo es un string
```

El editor tampoco ayuda: dentro de una plantilla no hay autocompletado de
props ni errores en rojo.

## ascua-check

Lo que sale del compilador **sí es TypeScript tipado**: esa etiqueta se
convierte en `Tarjeta({ titulo: 42 })`, y ahí TypeScript encuentra el error por
su cuenta. `ascua-check` compila el proyecto, lo pasa por `tsc` y devuelve cada
error a tu archivo y a su línea:

```sh
stil add -D ascua-check
stil exec ascua-check
```

```text
src/panel.ts:69:22 - error TS2322: Type 'number' is not assignable to type 'string'.

69             <Metrica etiqueta=${7} valor=${() => pesos(facturado())}/>
                        ~

✗ 1 error en 1 archivo
```

Se usa como `tsc --noEmit`: en un script del `package.json` y en el CI.

```json
{
  "scripts": {
    "check": "ascua-check"
  }
}
```

## Qué comprueba

| En la plantilla | Qué se comprueba |
|---|---|
| `<Tarjeta titulo=${42}/>` | El tipo de cada prop. |
| `<Metrica etiqueta="x"/>` | Los props obligatorios que faltan. |
| `onclick=${(e: MouseEvent) => …}` | Que el manejador acepte el evento: un `click` es un `MouseEvent`, un `keydown` un `KeyboardEvent`. |
| `<input ref=${(n: HTMLInputElement) => …}>` | Que el `ref` reciba el elemento de su etiqueta. |
| `prop:value=${() => …}`, `class=${…}` | Que la expresión sea válida. |
| Todo lo demás del archivo | Lo mismo que `tsc`. |

Los errores de dentro de una plantilla caen **en la línea donde se escribió**
el elemento, el atributo o el prop, no en la del `view`: si una etiqueta ocupa
varias líneas, cada prop tiene la suya.

## Con qué TypeScript

Con el del proyecto, sea el 5 o el 7. `ascua-check` no usa la API de
TypeScript —cambia entre versiones, y en la 7 todavía no es estable—, sino el
binario `tsc` y su salida, que no cambian.

Tu `tsconfig.json` se respeta entero: `extends`, `include`, `paths` y las
opciones de comprobación. `ascua-check` le pide a `tsc` la configuración ya
resuelta y genera otra que la extiende y apunta a la copia compilada.

## Cómo funciona

1. `tsc --showConfig` resuelve tu configuración, con la lista exacta de
   archivos.
2. El proyecto se copia a `.ascua-check/`, con las plantillas compiladas y su
   source map.
3. Un tsconfig nuevo extiende el tuyo y apunta a la copia; los `paths` que
   señalaban a tu código se trasladan a su sitio en ella.
4. Se ejecuta tu `tsc`, y cada error vuelve a tu archivo: la línea, por el
   source map; la columna, buscando en tu línea lo mismo que señalaba el error.
5. La copia se borra. Con `--conservar` se queda, para ver qué comprobó `tsc`.

## En el editor

`ascua-ts-plugin` lleva lo mismo al editor, mientras escribes:

- los errores de tipos de las plantillas, **subrayados donde están**;
- **autocompletado de props** dentro de la etiqueta de un componente, con los
  obligatorios primero y sin los que ya escribiste;
- **ir a la definición** desde `<Tarjeta` hasta la función;
- la **firma del componente** al pasar por encima de su etiqueta;
- los errores de sintaxis de una plantilla, en su línea.

```sh
stil add -D ascua-ts-plugin
```

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "ascua-ts-plugin" }]
  }
}
```

> **Cuidado:** el editor tiene que usar **la versión de TypeScript del
> proyecto**. `tsserver` busca los plugins junto al TypeScript que ejecuta; con
> el que trae el editor no lo encuentra. En VS Code: *TypeScript: Select
> TypeScript Version → Use Workspace Version*.

Funciona con TypeScript 5 y 6, que son los que tienen `tsserver`. TypeScript 7,
el nativo, todavía no admite plugins: un proyecto que compila con él necesita
además `typescript@6` para el editor. `ascua-check` sirve con los tres.

## Lo que falta

- **Los atributos del HTML** no se autocompletan: los props de los
  componentes, sí.
- **La columna de un error** se encuentra buscando en tu línea el nombre que
  señala TypeScript: casi siempre es el prop exacto, y si no aparece, el
  subrayado empieza donde empieza la etiqueta.
