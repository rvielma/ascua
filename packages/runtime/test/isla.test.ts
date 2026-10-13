/**
 * `defineIsland`: los props de una isla se comprueban al hidratar.
 *
 * Cada test renderiza en el servidor, mete el HTML en el documento y lo
 * hidrata. Cuando los props no encajan, lo que se comprueba es que la isla
 * siga siendo **exactamente** lo que escribió el servidor y que no quede nada
 * atado a ella.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ISLAND_PROPS_ATTR, append, dynamicText, element, hydrate, on, text } from "../src/dom.js";
import { defineIsland, p, serializeProps, type StandardSchema } from "../src/isla.js";
import { signal } from "../src/reactivo.js";
import { renderToString } from "../src/server.js";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function Contador(props: { inicial: number }) {
  const cuenta = signal(props.inicial);
  const boton = element("button");
  on(boton, "click", () => cuenta.update((c) => c + 1));
  append(boton, dynamicText(() => cuenta()));
  return boton;
}

const IslaContador = defineIsland("contador", { inicial: p.number }, Contador);

/** Renderiza en el servidor y deja el HTML en el documento, como el navegador. */
function servir(construir: () => Node): HTMLElement {
  document.body.innerHTML = renderToString(construir);
  return document.body.firstElementChild as HTMLElement;
}

/** Sustituye los props que escribió el servidor, como haría otra versión suya. */
function conProps(isla: HTMLElement, props: string): void {
  isla.setAttribute(ISLAND_PROPS_ATTR, props);
}

function capturarErrores(): string[] {
  const errores: string[] = [];
  vi.spyOn(console, "error").mockImplementation((mensaje: string) => errores.push(mensaje));
  return errores;
}

describe("defineIsland", () => {
  it("se hidrata adoptando el HTML cuando los props encajan", () => {
    const isla = servir(() => IslaContador({ inicial: 3 }));
    const boton = isla.querySelector("button")!;

    const { adopted, created } = hydrate([IslaContador]);
    expect(created).toBe(0);
    expect(adopted).toBeGreaterThan(0);

    boton.click();
    expect(isla.querySelector("button")).toBe(boton);
    expect(boton.textContent).toBe("4");
  });

  it("se renderiza igual que island() en el servidor", () => {
    const html = renderToString(() => IslaContador({ inicial: 3 }));
    expect(html).toContain('data-ascua-island="contador"');
    expect(html).toContain(`data-ascua-props="{&quot;inicial&quot;:3}"`);
  });

  it("se queda estática si un prop llega con otro tipo", () => {
    const errores = capturarErrores();
    const isla = servir(() => IslaContador({ inicial: 5 }));
    // El servidor lo sacó de un query string y nadie lo convirtió.
    conProps(isla, '{"inicial":"5"}');
    const antes = isla.outerHTML;

    const { adopted, created } = hydrate([IslaContador]);
    expect(adopted + created).toBe(0);

    // Sin hidratar, el click no hace nada: no hay "51".
    isla.querySelector("button")!.click();
    expect(isla.outerHTML).toBe(antes);
    expect(errores).toEqual(['[ascua] isla "contador": inicial: se esperaba number, llegó string "5". Se deja estática.']);
  });

  it("se queda estática si el servidor es de otra versión", () => {
    const errores = capturarErrores();
    const isla = servir(() => IslaContador({ inicial: 5 }));
    // El servidor v2 renombró el prop; este cliente es el v1.
    conProps(isla, '{"valor":5}');
    const antes = isla.outerHTML;

    hydrate([IslaContador]);
    expect(isla.outerHTML).toBe(antes);
    expect(errores[0]).toContain("inicial: se esperaba number, llegó undefined");
  });

  it("se queda estática si los props no son JSON", () => {
    const errores = capturarErrores();
    const isla = servir(() => IslaContador({ inicial: 5 }));
    conProps(isla, "{inicial:5");

    hydrate([IslaContador]);
    expect(errores[0]).toContain("los props no son JSON válido");
  });

  it("no toca las demás islas de la página", () => {
    capturarErrores();
    document.body.innerHTML = renderToString(() => {
      const div = element("div");
      append(div, IslaContador({ inicial: 1 }), IslaContador({ inicial: 10 }));
      return div;
    });
    const [rota, sana] = Array.from(document.querySelectorAll<HTMLElement>("ascua-island"));
    conProps(rota!, '{"inicial":null}');

    hydrate([IslaContador]);
    rota!.querySelector("button")!.click();
    sana!.querySelector("button")!.click();
    expect(rota!.textContent).toBe("1");
    expect(sana!.textContent).toBe("11");
  });

  it("toma el nombre de la definición: no hay dos textos que puedan diferir", () => {
    const isla = servir(() => IslaContador({ inicial: 0 }));
    expect(IslaContador.name).toBe("contador");
    hydrate([IslaContador]);
    isla.querySelector("button")!.click();
    expect(isla.textContent).toBe("1");
  });
});

describe("props ricas", () => {
  interface Agenda {
    desde: Date;
    enlace: URL;
    total: bigint;
    plazas: Map<string, number>;
    etiquetas: Set<string>;
  }

  /** Pinta lo que recibió, para comprobar los tipos en el cliente. */
  function Vista(props: Agenda) {
    const div = element("div");
    const desc = [
      props.desde instanceof Date && props.desde.toISOString(),
      props.enlace instanceof URL && props.enlace.hostname,
      typeof props.total === "bigint" && String(props.total + 1n),
      props.plazas instanceof Map && props.plazas.get("sala"),
      props.etiquetas instanceof Set && [...props.etiquetas].join("+"),
    ].join(" ");
    append(div, text(desc));
    return div;
  }

  const IslaAgenda = defineIsland(
    "agenda",
    {
      desde: p.date,
      enlace: p.url,
      total: p.bigint,
      plazas: p.map(p.string, p.number),
      etiquetas: p.set(p.string),
    },
    Vista,
  );

  const datos: Agenda = {
    desde: new Date("2026-10-13T10:30:00.000Z"),
    enlace: new URL("https://asiste.run/citas"),
    total: 9007199254740993n,
    plazas: new Map([["sala", 4]]),
    etiquetas: new Set(["urgente", "control"]),
  };

  it("viajan del servidor al cliente con su tipo", () => {
    const isla = servir(() => IslaAgenda(datos));
    // En el servidor se pintó con los valores ricos.
    const esperado = "2026-10-13T10:30:00.000Z asiste.run 9007199254740994 4 urgente+control";
    expect(isla.textContent).toBe(esperado);
    // Al hidratar, el cliente reconstruye cada tipo desde el JSON.
    const { created } = hydrate([IslaAgenda]);
    expect(created).toBe(0);
    document.body.innerHTML = "";
    const props = JSON.parse(serializeProps(datos));
    const reconstruida = IslaAgenda.prepare(JSON.stringify(props))!();
    expect((reconstruida as HTMLElement).textContent).toBe(esperado);
  });

  it("serializeProps escribe lo que JSON no sabe", () => {
    expect(JSON.parse(serializeProps(datos))).toEqual({
      desde: "2026-10-13T10:30:00.000Z",
      enlace: "https://asiste.run/citas",
      total: "9007199254740993",
      plazas: [["sala", 4]],
      etiquetas: ["urgente", "control"],
    });
    // Sin el reemplazo, un bigint rompe el render.
    expect(() => JSON.stringify({ total: 1n })).toThrow();
  });

  it("lo que no encaja deja la isla estática y dice dónde", () => {
    const errores = capturarErrores();
    const isla = servir(() => IslaAgenda(datos));
    conProps(isla, serializeProps({ ...datos, plazas: [["sala", "cuatro"]] }));
    hydrate([IslaAgenda]);
    expect(errores[0]).toContain("plazas[0]: se esperaba number");

    conProps(isla, serializeProps({ ...datos, desde: "ayer" }));
    hydrate([IslaAgenda]);
    expect(errores[1]).toContain("desde: se esperaba una fecha válida");
  });
});

describe("p", () => {
  const validar = <T>(esquema: StandardSchema<T>, valor: unknown) => esquema["~standard"].validate(valor);

  it("señala la ruta del campo que falló", () => {
    const Lista = defineIsland(
      "lista",
      { lenguajes: p.array(p.object({ nombre: p.string, año: p.number })) },
      (props) => text(props.lenguajes.map((l) => l.nombre).join()),
    );
    const errores = capturarErrores();
    const isla = servir(() => Lista({ lenguajes: [] }));
    conProps(isla, '{"lenguajes":[{"nombre":"C","año":1972},{"nombre":"Lisp","año":"1958"}]}');

    hydrate([Lista]);
    expect(errores[0]).toContain('lenguajes[1].año: se esperaba number, llegó string "1958"');
  });

  it("descarta los campos que no están en la forma", () => {
    expect(validar(p.object({ a: p.number }), { a: 1, b: 2 })).toEqual({ value: { a: 1 } });
  });

  it("admite que falte un campo opcional, y null donde es nullable", () => {
    const esquema = p.object({ a: p.optional(p.string), b: p.nullable(p.number) });
    expect(validar(esquema, { b: null })).toEqual({ value: { b: null } });
    expect(validar(esquema, { a: 1, b: null })).toHaveProperty("issues");
    expect(validar(esquema, {})).toHaveProperty("issues");
  });

  it("distingue array, null y object en el mensaje", () => {
    const problema = (valor: unknown) => (validar(p.object({}), valor) as { issues: { message: string }[] }).issues[0]!.message;
    expect(problema([])).toBe("se esperaba object, llegó array");
    expect(problema(null)).toBe("se esperaba object, llegó null");
  });
});

describe("Standard Schema", () => {
  /** Un esquema ajeno, como los de Zod o Valibot: convierte el texto en fecha. */
  const fecha: StandardSchema<Date> = {
    "~standard": {
      version: 1,
      vendor: "prueba",
      validate: (valor) =>
        typeof valor === "string" && !Number.isNaN(Date.parse(valor))
          ? { value: new Date(valor) }
          : { issues: [{ message: "no es una fecha" }] },
    },
  };

  it("acepta un esquema ajeno, también dentro de p.object, con su transformación", () => {
    let recibida: Date | undefined;
    const Isla = defineIsland("fecha", { cuando: fecha }, (props) => {
      recibida = props.cuando;
      return text("");
    });
    // En el servidor el componente recibe la fecha; viaja como texto.
    servir(() => Isla({ cuando: new Date("2026-09-25") }));
    recibida = undefined;

    hydrate([Isla]);
    expect(recibida).toBeInstanceOf(Date);
    expect(recibida!.toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("deja estática la isla si el esquema es asíncrono", () => {
    const errores = capturarErrores();
    const asincrono: StandardSchema<{ inicial: number }> = {
      "~standard": { version: 1, vendor: "prueba", validate: async (valor) => ({ value: valor as { inicial: number } }) },
    };
    const Isla = defineIsland("contador", asincrono, Contador);
    servir(() => Isla({ inicial: 1 }));

    hydrate([Isla]);
    expect(errores[0]).toContain("el esquema es asíncrono");
  });
});

describe("tipos", () => {
  // Estas líneas no se ejecutan: lo que importa es que `tsc` las rechace.
  it("el esquema tiene que encajar con los props del componente", () => {
    const comprobar = () => {
      // @ts-expect-error: el esquema dice string, el componente espera number.
      defineIsland("contador", { inicial: p.string }, Contador);
      // @ts-expect-error: al esquema le falta un prop que el componente necesita.
      defineIsland("contador", {}, Contador);
      // @ts-expect-error: en el servidor, los props se comprueban contra el esquema.
      IslaContador({ inicial: "5" });
    };
    expect(comprobar).toBeTypeOf("function");
  });
});
