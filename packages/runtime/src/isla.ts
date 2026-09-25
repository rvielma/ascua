/**
 * Islas con props que no mienten.
 *
 * Los props de una isla viajan del servidor al cliente como texto, y ahí el
 * tipo que declara TypeScript deja de valer: `JSON.parse` devuelve `any`, y un
 * servidor desplegado aparte puede mandar otra forma. `defineIsland` une las
 * dos caras de la isla con un esquema: `tsc` comprueba que encaja con el
 * componente, y al hidratar se comprueba lo que llegó de verdad. Si no encaja,
 * la isla se queda como la dejó el servidor —estática— y el error dice dónde.
 *
 * El tipo sale del esquema, no al revés: no hay dos descripciones que puedan
 * contradecirse. Nada de esto viaja si no se importa.
 */

import { island } from "./dom.js";

// ---------------------------------------------------------------------------
// Standard Schema (https://standardschema.dev), copiado aquí para no depender
// de nada. Con él, un esquema de Zod o Valibot sirve igual que uno de `p`.

/** Un esquema que sigue Standard Schema v1: los de `p`, Zod, Valibot, ArkType… */
export interface StandardSchema<T = unknown> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (valor: unknown) => ResultadoEsquema<T> | Promise<ResultadoEsquema<T>>;
    readonly types?: { readonly input: unknown; readonly output: T } | undefined;
  };
}

type ResultadoEsquema<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: readonly Problema[] };

interface Problema {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
}

// ---------------------------------------------------------------------------
// Tipos.

/** Lo que produce un esquema. */
export type Infer<S> = S extends StandardSchema<infer T> ? T : never;

/** La forma de un objeto: sus campos y el esquema de cada uno. */
export type Shape = Record<string, StandardSchema>;

type Opcionales<F extends Shape> = {
  [K in keyof F]: undefined extends Infer<F[K]> ? K : never;
}[keyof F];

/** El objeto que describe una forma. Los campos que admiten `undefined` son opcionales. */
export type InferShape<F extends Shape> = Plano<
  { [K in Exclude<keyof F, Opcionales<F>>]: Infer<F[K]> } & {
    [K in Opcionales<F>]?: Infer<F[K]>;
  }
>;

type Plano<T> = { [K in keyof T]: T[K] } & {};

/** Los props de una isla: un esquema, o la forma de un objeto como atajo. */
type Props<S extends StandardSchema | Shape> = S extends StandardSchema
  ? Infer<S>
  : S extends Shape
    ? InferShape<S>
    : never;

// ---------------------------------------------------------------------------
// Los esquemas de `p`.

function esquema<T>(validate: (valor: unknown) => ResultadoEsquema<T>): StandardSchema<T> {
  return { "~standard": { version: 1, vendor: "ascua", validate } };
}

function fallo(esperado: string, valor: unknown): { issues: Problema[] } {
  const tipo = valor === null ? "null" : Array.isArray(valor) ? "array" : typeof valor;
  const muestra = tipo === "string" || tipo === "number" || tipo === "boolean" ? ` ${JSON.stringify(valor)}` : "";
  return { issues: [{ message: `se esperaba ${esperado}, llegó ${tipo}${muestra}` }] };
}

/** Valida con cualquier esquema, en síncrono: la hidratación no puede esperar. */
function validar<T>(esquema: StandardSchema<T>, valor: unknown): ResultadoEsquema<T> {
  const resultado = esquema["~standard"].validate(valor);
  return "then" in resultado
    ? { issues: [{ message: "el esquema es asíncrono, y al hidratar solo sirven los síncronos" }] }
    : resultado;
}

/** Los problemas de un campo, con el campo delante en la ruta. */
function bajo(clave: PropertyKey, problemas: readonly Problema[]): { issues: Problema[] } {
  return { issues: problemas.map((problema) => ({ ...problema, path: [clave, ...(problema.path ?? [])] })) };
}

function primitivo<T>(tipo: string): StandardSchema<T> {
  return esquema((valor) => (typeof valor === tipo ? { value: valor as T } : fallo(tipo, valor)));
}

/**
 * Esquemas para los props de una isla. Describen lo que cabe en JSON, que es
 * lo que viaja.
 *
 * ```ts
 * { inicial: p.number, etiqueta: p.optional(p.string) }
 * ```
 */
export const p = {
  string: primitivo<string>("string"),
  number: primitivo<number>("number"),
  boolean: primitivo<boolean>("boolean"),

  array<T>(elemento: StandardSchema<T>): StandardSchema<T[]> {
    return esquema((valor) => {
      if (!Array.isArray(valor)) return fallo("array", valor);
      const salida: T[] = [];
      for (let i = 0; i < valor.length; i++) {
        const resultado = validar(elemento, valor[i]);
        if (resultado.issues) return bajo(i, resultado.issues);
        salida.push(resultado.value);
      }
      return { value: salida };
    });
  },

  /** Un objeto. Lo que traiga de más se descarta. */
  object<F extends Shape>(forma: F): StandardSchema<InferShape<F>> {
    return esquema((valor) => {
      if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return fallo("object", valor);
      const salida: Record<string, unknown> = {};
      for (const clave in forma) {
        const campo = (valor as Record<string, unknown>)[clave];
        const resultado = validar(forma[clave]!, campo);
        if (resultado.issues) return bajo(clave, resultado.issues);
        if (resultado.value !== undefined || clave in valor) salida[clave] = resultado.value;
      }
      return { value: salida as InferShape<F> };
    });
  },

  /** Puede faltar. */
  optional<T>(interior: StandardSchema<T>): StandardSchema<T | undefined> {
    return esquema<T | undefined>((valor) => (valor === undefined ? { value: undefined } : validar(interior, valor)));
  },

  /** Puede ser `null`. */
  nullable<T>(interior: StandardSchema<T>): StandardSchema<T | null> {
    return esquema<T | null>((valor) => (valor === null ? { value: null } : validar(interior, valor)));
  },
};

// ---------------------------------------------------------------------------
// La isla.

/**
 * Una isla definida con `defineIsland`. Se usa como un componente —en el
 * servidor, o dentro de otra isla— y se registra en `hydrate`.
 */
export interface Island<P> {
  (props: P): HTMLElement;
  readonly nombre: string;
  /**
   * Para `hydrate`: lee los props que dejó el servidor y, si encajan, devuelve
   * cómo construir la isla. Si no encajan lo dice en la consola y devuelve
   * `undefined`, y la isla se queda estática.
   */
  readonly preparar: (props: string) => (() => Node) | undefined;
}

/**
 * Define una isla: su nombre, el esquema de sus props y el componente.
 *
 * ```ts
 * export const IslaContador = defineIsland("contador", { inicial: p.number }, Contador);
 *
 * // en la página, en el servidor
 * view`<IslaContador inicial=${3}/>`
 * // en el cliente
 * hydrate([IslaContador]);
 * ```
 *
 * Si el esquema no encaja con los props del componente, es un error de tipos.
 * Si lo que llega al cliente no encaja con el esquema —otra versión del
 * servidor, un dato que no era lo que decía ser—, la isla no se hidrata y
 * la consola dice qué campo falló.
 */
export function defineIsland<S extends StandardSchema | Shape>(
  nombre: string,
  esquema: S,
  componente: (props: Props<S>) => Node,
): Island<Props<S>> {
  const validador = ("~standard" in esquema ? esquema : p.object(esquema as Shape)) as StandardSchema<Props<S>>;

  const isla = ((props: Props<S>) =>
    island(nombre, () => componente(props), JSON.stringify(props))) as Island<Props<S>> & {
    nombre: string;
    preparar: Island<Props<S>>["preparar"];
  };
  isla.nombre = nombre;
  isla.preparar = (texto) => {
    let resultado: ResultadoEsquema<Props<S>>;
    try {
      resultado = validar(validador, JSON.parse(texto));
    } catch {
      resultado = { issues: [{ message: "los props no son JSON válido" }] };
    }
    if (resultado.issues) {
      const [problema] = resultado.issues;
      console.error(`[ascua] isla "${nombre}": ${describir(problema!)}. Se deja estática.`);
      return undefined;
    }
    const props = resultado.value;
    return () => componente(props);
  };
  return isla;
}

/** `lenguajes[2].año: se esperaba number, …` */
function describir(problema: Problema): string {
  let ruta = "";
  for (const tramo of problema.path ?? []) {
    const clave = typeof tramo === "object" ? tramo.key : tramo;
    ruta += typeof clave === "number" ? `[${clave}]` : `${ruta ? "." : ""}${String(clave)}`;
  }
  return ruta ? `${ruta}: ${problema.message}` : problema.message;
}
