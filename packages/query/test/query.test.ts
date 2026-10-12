/**
 * ascua-query contra el runtime de verdad.
 *
 * Lo que se comprueba es lo que una aplicación da por hecho de una caché:
 * que dos vistas no piden dos veces lo mismo, que una respuesta vieja no pisa
 * a una nueva, que un sondeo que trae lo mismo no repinta nada, y que una
 * actualización optimista se deshace si el servidor dice que no.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { effect, root, signal } from "ascua";
import {
  cancel,
  clearCache,
  configure,
  getData,
  invalidate,
  mutation,
  prefetch,
  remote,
  setData,
} from "../src/index.js";

/** Deja correr las promesas pendientes. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** Una promesa que se resuelve o rechaza a mano. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((a, b) => {
    resolver = a;
    rechazar = b;
  });
  return { promesa, resolver, rechazar };
}

/** Lo que cada test monta, para soltarlo al final. */
let soltar: (() => void)[] = [];

function montar<T>(fn: () => T): T {
  const [valor, liberar] = root(fn);
  soltar.push(liberar);
  return valor;
}

beforeEach(() => {
  configure({ retry: 0, retryDelay: () => 0, staleTime: 0, gcTime: 5 * 60_000, refetchOnFocus: true });
});

afterEach(() => {
  for (const s of soltar) s();
  soltar = [];
  clearCache();
  vi.useRealTimers();
});

describe("remote", () => {
  it("carga y expone datos y estado", async () => {
    const q = montar(() => remote({ key: () => ["users"], load: async () => ["ada", "grace"] }));
    expect(q.state()).toBe("loading");
    expect(q()).toBeUndefined();
    await flush();
    expect(q()).toEqual(["ada", "grace"]);
    expect(q.state()).toBe("ready");
    expect(q.updatedAt()).toBeGreaterThan(0);
  });

  it("dos vistas con la misma clave hacen una sola petición", async () => {
    const load = vi.fn(async () => 1);
    const a = montar(() => remote({ key: () => ["n"], load }));
    const b = montar(() => remote({ key: () => ["n"], load }));
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(a()).toBe(1);
    expect(b()).toBe(1);
  });

  it("la clave se compara por valor, sin importar el orden de las propiedades", async () => {
    const load = vi.fn(async () => "x");
    montar(() => remote({ key: () => ["f", { a: 1, b: 2 }], load }));
    montar(() => remote({ key: () => ["f", { b: 2, a: 1 }], load }));
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("con staleTime no recarga al volver a montarse", async () => {
    const load = vi.fn(async () => "tags");
    const [, liberar] = root(() => remote({ key: () => ["tags"], load, staleTime: 60_000 }));
    await flush();
    liberar();
    const q = montar(() => remote({ key: () => ["tags"], load, staleTime: 60_000 }));
    expect(q()).toBe("tags");
    expect(q.state()).toBe("ready");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("sin staleTime recarga al montarse, pero muestra lo que había mientras", async () => {
    let n = 0;
    const load = async () => ++n;
    const [, liberar] = root(() => remote({ key: () => ["c"], load }));
    await flush();
    liberar();
    const q = montar(() => remote({ key: () => ["c"], load }));
    expect(q()).toBe(1);
    expect(q.state()).toBe("loading");
    await flush();
    expect(q()).toBe(2);
  });

  it("una clave nula la desactiva", async () => {
    const id = signal<string | null>(null);
    const load = vi.fn(async (k: readonly [string, string]) => `mensajes de ${k[1]}`);
    const q = montar(() => remote({ key: () => (id() ? (["messages", id()!] as const) : null), load }));
    await flush();
    expect(q.state()).toBe("idle");
    expect(load).not.toHaveBeenCalled();
    id.set("c1");
    await flush();
    expect(q()).toBe("mensajes de c1");
  });

  it("sigue a la clave, y con keepPrevious no deja la pantalla en blanco", async () => {
    const page = signal(1);
    const peticiones: ReturnType<typeof diferida<string>>[] = [];
    const q = montar(() =>
      remote({
        key: () => ["list", page()] as const,
        load: () => {
          const d = diferida<string>();
          peticiones.push(d);
          return d.promesa;
        },
        keepPrevious: true,
      }),
    );
    peticiones[0]!.resolver("página 1");
    await flush();
    page.set(2);
    expect(q()).toBe("página 1");
    expect(q.placeholder()).toBe(true);
    expect(q.state()).toBe("loading");
    peticiones[1]!.resolver("página 2");
    await flush();
    expect(q()).toBe("página 2");
    expect(q.placeholder()).toBe(false);
  });

  it("sin keepPrevious, la clave nueva empieza vacía", async () => {
    const page = signal(1);
    const q = montar(() => remote({ key: () => ["p", page()], load: async (k) => `p${k[1]}` }));
    await flush();
    page.set(2);
    expect(q()).toBeUndefined();
    await flush();
    expect(q()).toBe("p2");
  });

  it("una respuesta vieja no pisa a una recarga más nueva", async () => {
    const peticiones: ReturnType<typeof diferida<string>>[] = [];
    const q = montar(() =>
      remote({
        key: () => ["r"],
        load: () => {
          const d = diferida<string>();
          peticiones.push(d);
          return d.promesa;
        },
      }),
    );
    void q.reload();
    peticiones[1]!.resolver("nueva");
    await flush();
    peticiones[0]!.resolver("vieja");
    await flush();
    expect(q()).toBe("nueva");
  });

  it("la carga recibe una señal que se dispara al recargar", async () => {
    const señales: AbortSignal[] = [];
    const q = montar(() =>
      remote({
        key: () => ["s"],
        load: (_k, { signal }) => {
          señales.push(signal);
          return new Promise<number>(() => {});
        },
      }),
    );
    void q.reload();
    expect(señales[0]!.aborted).toBe(true);
    expect(señales[1]!.aborted).toBe(false);
  });

  it("reintenta antes de dar error", async () => {
    let intentos = 0;
    const q = montar(() =>
      remote({
        key: () => ["flaky"],
        retry: 2,
        load: async () => {
          if (++intentos < 3) throw new Error("caído");
          return "ok";
        },
      }),
    );
    await vi.waitFor(() => expect(q()).toBe("ok"));
    expect(intentos).toBe(3);
  });

  it("agotados los reintentos, queda el error", async () => {
    const q = montar(() =>
      remote({
        key: () => ["roto"],
        retry: 1,
        load: async () => {
          throw new Error("500");
        },
      }),
    );
    await vi.waitFor(() => expect(q.state()).toBe("error"));
    expect((q.error() as Error).message).toBe("500");
    expect(q()).toBeUndefined();
  });

  it("select transforma lo cargado", async () => {
    const q = montar(() =>
      remote({ key: () => ["u"], load: async () => ({ users: [1, 2, 3] }), select: (d) => d.users.length }),
    );
    await flush();
    expect(q()).toBe(3);
  });

  it("un sondeo que trae lo mismo no despierta a nadie", async () => {
    let n = 0;
    const q = montar(() =>
      remote({ key: () => ["poll"], load: async () => ({ rows: [{ id: 1, name: "a" }], n: 1 }) }),
    );
    await flush();
    const primero = q();
    montar(() =>
      effect(() => {
        q();
        n++;
      }),
    );
    await q.reload();
    await flush();
    expect(q()).toBe(primero);
    expect(n).toBe(1);
  });

  it("si cambia una fila, las demás conservan su identidad", async () => {
    let version = 0;
    const q = montar(() =>
      remote({
        key: () => ["rows"],
        load: async () => [
          { id: 1, name: "a" },
          { id: 2, name: version++ === 0 ? "b" : "B" },
        ],
      }),
    );
    await flush();
    const [fila1, fila2] = q()!;
    await q.reload();
    expect(q()![0]).toBe(fila1);
    expect(q()![1]).not.toBe(fila2);
    expect(q()![1]!.name).toBe("B");
  });

  it("recarga cada `interval`, y un intervalo reactivo lo detiene", async () => {
    vi.useFakeTimers();
    const polling = signal(true);
    const load = vi.fn(async () => Date.now());
    montar(() => remote({ key: () => ["m"], load, interval: () => (polling() ? 5_000 : false) }));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(load).toHaveBeenCalledTimes(4);
    polling.set(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("al volver a la pestaña recarga lo caducado", async () => {
    const load = vi.fn(async () => "x");
    montar(() => remote({ key: () => ["f"], load }));
    await flush();
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("lo que nadie mira se borra pasado gcTime", async () => {
    vi.useFakeTimers();
    const [, liberar] = root(() => remote({ key: () => ["gc"], load: async () => "dato", gcTime: 1_000 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(getData(["gc"])).toBe("dato");
    liberar();
    await vi.advanceTimersByTimeAsync(999);
    expect(getData(["gc"])).toBe("dato");
    await vi.advanceTimersByTimeAsync(1);
    expect(getData(["gc"])).toBeUndefined();
  });
});

describe("la caché a mano", () => {
  it("invalidate recarga lo que se mira y caduca el resto", async () => {
    const users = vi.fn(async () => "users");
    const user4 = vi.fn(async () => "user 4");
    montar(() => remote({ key: () => ["users"], load: users, staleTime: 60_000 }));
    const [, liberar] = root(() => remote({ key: () => ["users", 4], load: user4, staleTime: 60_000 }));
    const otra = vi.fn(async () => "otra");
    montar(() => remote({ key: () => ["tags"], load: otra, staleTime: 60_000 }));
    await flush();
    liberar();

    await invalidate(["users"]);
    expect(users).toHaveBeenCalledTimes(2);
    expect(user4).toHaveBeenCalledTimes(1);
    expect(otra).toHaveBeenCalledTimes(1);

    // Lo invalidado sin vistas recarga al volver a montarse, aunque sea reciente.
    montar(() => remote({ key: () => ["users", 4], load: user4, staleTime: 60_000 }));
    await flush();
    expect(user4).toHaveBeenCalledTimes(2);
  });

  it("setData escribe como si hubiera llegado, y una vista fresca no recarga", async () => {
    setData(["tags"], ["a"]);
    const load = vi.fn(async () => ["b"]);
    const q = montar(() => remote({ key: () => ["tags"], load, staleTime: 60_000 }));
    expect(q()).toEqual(["a"]);
    expect(load).not.toHaveBeenCalled();
    setData<string[]>(["tags"], (old) => [...(old ?? []), "c"]);
    expect(q()).toEqual(["a", "c"]);
  });

  it("prefetch llena la caché antes de que la vista la pida", async () => {
    await prefetch(["p"], async () => 42, { staleTime: 60_000 });
    const load = vi.fn(async () => 0);
    const q = montar(() => remote({ key: () => ["p"], load, staleTime: 60_000 }));
    expect(q()).toBe(42);
    expect(load).not.toHaveBeenCalled();
  });

  it("cancel corta la carga en camino sin dejarla en `loading`", async () => {
    const q = montar(() => remote({ key: () => ["lenta"], load: () => new Promise<string>(() => {}) }));
    expect(q.state()).toBe("loading");
    await cancel(["lenta"]);
    expect(q.state()).toBe("idle");
  });
});

describe("mutation", () => {
  it("lleva su estado y espera a onSuccess", async () => {
    const recarga = diferida<void>();
    const m = mutation({
      run: async (n: number) => n * 2,
      onSuccess: () => recarga.promesa,
    });
    const r = m.mutateAsync(21);
    await flush();
    expect(m.pending()).toBe(true);
    recarga.resolver();
    expect(await r).toBe(42);
    expect(m.state()).toBe("success");
    expect(m.data()).toBe(42);
  });

  it("mutate no rechaza: el fallo queda en error()", async () => {
    const onError = vi.fn();
    const m = mutation({
      run: async () => {
        throw new Error("409");
      },
      onError,
    });
    m.mutate();
    await flush();
    expect(m.state()).toBe("error");
    expect((m.error() as Error).message).toBe("409");
    expect(onError).toHaveBeenCalledOnce();
    m.reset();
    expect(m.state()).toBe("idle");
  });

  it("una actualización optimista se ve al momento y se deshace si falla", async () => {
    type Comentarios = { comments: string[] };
    const clave = ["comments", "c1"] as const;
    let servidor = ["hola"];
    const q = montar(() =>
      remote({ key: () => clave, load: async (): Promise<Comentarios> => ({ comments: [...servidor] }) }),
    );
    await flush();

    const respuesta = diferida<void>();
    const add = mutation({
      run: async (texto: string) => {
        await respuesta.promesa;
        servidor = [...servidor, texto];
      },
      onMutate: async (texto) => {
        await cancel(clave);
        const prev = getData<Comentarios>(clave);
        setData<Comentarios>(clave, (old) => ({ comments: [...(old?.comments ?? []), texto] }));
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) setData(clave, ctx.prev);
      },
      onSettled: () => invalidate(clave),
    });

    // Va bien: se ve al momento y queda tras recargar.
    add.mutate("¿qué tal?");
    await flush();
    expect(q()!.comments).toEqual(["hola", "¿qué tal?"]);
    respuesta.resolver();
    await vi.waitFor(() => expect(add.state()).toBe("success"));
    expect(q()!.comments).toEqual(["hola", "¿qué tal?"]);

    // Falla: se ve al momento y se deshace.
    const falla = mutation({
      run: async (_texto: string) => {
        throw new Error("sin conexión");
      },
      onMutate: async (texto: string) => {
        await cancel(clave);
        const prev = getData<Comentarios>(clave);
        setData<Comentarios>(clave, (old) => ({ comments: [...(old?.comments ?? []), texto] }));
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) setData(clave, ctx.prev);
      },
    });
    falla.mutate("perdido");
    await vi.waitFor(() => expect(falla.state()).toBe("error"));
    expect(q()!.comments).toEqual(["hola", "¿qué tal?"]);
  });

  it("mutate(v, { onSuccess, onError }): los de la llamada, después de los de la mutación", async () => {
    const orden: string[] = [];
    const m = mutation({
      run: async (n: number) => {
        if (n < 0) throw new Error("negativo");
        return n + 1;
      },
      onSuccess: () => void orden.push("mutación ok"),
      onError: () => void orden.push("mutación error"),
    });

    m.mutate(1, {
      onSuccess: (data, v) => void orden.push(`llamada ok ${data} ${v}`),
      onSettled: (_d, e) => void orden.push(`llamada fin ${e === undefined}`),
    });
    await vi.waitFor(() => expect(m.state()).toBe("success"));
    expect(orden).toEqual(["mutación ok", "llamada ok 2 1", "llamada fin true"]);

    orden.length = 0;
    m.mutate(-1, { onError: (e) => void orden.push(`llamada error ${(e as Error).message}`) });
    await vi.waitFor(() => expect(m.state()).toBe("error"));
    expect(orden).toEqual(["mutación error", "llamada error negativo"]);
  });

  it("solo corren los de la última llamada", async () => {
    const primera = diferida<number>();
    const m = mutation({ run: (n: number) => (n === 1 ? primera.promesa : Promise.resolve(n)) });
    const vistos: number[] = [];
    m.mutate(1, { onSuccess: (d) => void vistos.push(d) });
    m.mutate(2, { onSuccess: (d) => void vistos.push(d) });
    primera.resolver(1);
    await vi.waitFor(() => expect(m.state()).toBe("success"));
    await flush();
    expect(vistos).toEqual([2]);
    expect(m.data()).toBe(2);
  });

  it("sin variables, los callbacks van en el segundo argumento", async () => {
    const m = mutation({ run: async () => "hecho" });
    const ok = vi.fn();
    m.mutate(undefined, { onSuccess: ok });
    await vi.waitFor(() => expect(ok).toHaveBeenCalledWith("hecho", undefined));
  });
});
