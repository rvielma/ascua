/**
 * Las invariantes del modelo reactivo.
 *
 * Son las mismas que verifica el núcleo en Rust del que viene esto. Si alguna
 * se rompe, el modelo dejó de ser correcto, por muy verde que esté el resto.
 */

import { describe, expect, it } from "vitest";

import {
  batch,
  effect,
  memo,
  onCleanup,
  onError,
  root,
  selector,
  signal,
  untrack,
} from "../src/reactivo.js";

describe("signal", () => {
  it("guarda, lee y deriva", () => {
    const [, liberar] = root(() => {
      const items = signal([1, 2]);
      expect(items()).toEqual([1, 2]);

      items.update((v) => [...v, 3]);
      expect(items()).toEqual([1, 2, 3]);

      items.set([9]);
      expect(items()).toEqual([9]);
    });
    liberar();
  });

  it("no avisa si el valor no cambió", () => {
    const visto: number[] = [];
    const [count, liberar] = root(() => {
      const count = signal(0);
      effect(() => visto.push(count()));
      return count;
    });

    count.set(0);
    count.set(1);
    count.set(1);

    expect(visto).toEqual([0, 1]);
    liberar();
  });
});

describe("effect", () => {
  it("corre al crearse y en cada cambio", () => {
    const visto: number[] = [];
    const [count, liberar] = root(() => {
      const count = signal(0);
      effect(() => visto.push(count()));
      return count;
    });

    count.set(1);
    count.set(2);

    expect(visto).toEqual([0, 1, 2]);
    liberar();
  });

  it("solo reacciona a lo que lee", () => {
    let veces = 0;
    const [signals, liberar] = root(() => {
      const leido = signal(0);
      const ignorado = signal(0);
      effect(() => {
        leido();
        veces++;
      });
      return { leido, ignorado };
    });

    signals.ignorado.set(1);
    expect(veces).toBe(1);

    signals.leido.set(1);
    expect(veces).toBe(2);
    liberar();
  });

  it("descubre sus dependencias en cada ejecución", () => {
    const visto: number[] = [];
    const [s, liberar] = root(() => {
      const usarA = signal(true);
      const a = signal(1);
      const b = signal(10);
      effect(() => visto.push(usarA() ? a() : b()));
      return { usarA, a, b };
    });

    s.b.set(20); // rama inactiva: no debe despertar al efecto
    expect(visto).toEqual([1]);

    s.usarA.set(false);
    expect(visto).toEqual([1, 20]);

    s.a.set(2); // ahora la rama inactiva es 'a'
    expect(visto).toEqual([1, 20]);

    s.b.set(30);
    expect(visto).toEqual([1, 20, 30]);
    liberar();
  });

  it("deja de correr al liberar su raíz", () => {
    let veces = 0;
    const [count, liberar] = root(() => {
      const count = signal(0);
      effect(() => {
        count();
        veces++;
      });
      return count;
    });

    count.set(1);
    expect(veces).toBe(2);

    liberar();
    count.set(2);
    expect(veces).toBe(2);
  });
});

describe("memo", () => {
  it("es perezoso", () => {
    let veces = 0;
    const [, liberar] = root(() => {
      const count = signal(1);
      const doble = memo(() => {
        veces++;
        return count() * 2;
      });

      expect(veces).toBe(0); // crear un memo no lo ejecuta

      expect(doble()).toBe(2);
      expect(veces).toBe(1);

      expect(doble()).toBe(2);
      expect(veces).toBe(1); // sin cambios, no recalcula

      count.set(5);
      expect(veces).toBe(1); // invalidar no recalcula: nadie lo ha leído

      expect(doble()).toBe(10);
      expect(veces).toBe(2);
    });
    liberar();
  });

  it("corta la propagación si su valor no cambia", () => {
    let veces = 0;
    const [count, liberar] = root(() => {
      const count = signal(0);
      const muchos = memo(() => count() > 2);
      effect(() => {
        muchos();
        veces++;
      });
      return count;
    });

    expect(veces).toBe(1);

    count.set(1);
    count.set(2);
    expect(veces).toBe(1); // el booleano sigue siendo false

    count.set(3);
    expect(veces).toBe(2);

    count.set(4);
    expect(veces).toBe(2); // sigue siendo true
    liberar();
  });
});

describe("grafo en diamante", () => {
  it("no produce glitches ni ejecuciones dobles", () => {
    const visto: Array<[number, number]> = [];
    let veces = 0;

    const [a, liberar] = root(() => {
      const a = signal(1);
      const b = memo(() => a() + 1);
      const c = memo(() => a() * 10);
      effect(() => {
        veces++;
        visto.push([b(), c()]);
      });
      return a;
    });

    a.set(2);

    expect(veces).toBe(2);
    expect(visto).toEqual([
      [2, 10],
      [3, 20],
    ]);
    liberar();
  });
});

describe("batch y untrack", () => {
  it("batch agrupa las escrituras en una sola ejecución", () => {
    const visto: number[] = [];
    const [count, liberar] = root(() => {
      const count = signal(0);
      effect(() => visto.push(count()));
      return count;
    });

    batch(() => {
      count.set(1);
      count.set(2);
      count.set(3);
    });

    expect(visto).toEqual([0, 3]);
    liberar();
  });

  it("untrack lee sin suscribir", () => {
    let veces = 0;
    const [s, liberar] = root(() => {
      const rastreado = signal(0);
      const oculto = signal(0);
      effect(() => {
        rastreado();
        untrack(() => oculto());
        veces++;
      });
      return { rastreado, oculto };
    });

    s.oculto.set(1);
    expect(veces).toBe(1);

    s.rastreado.set(1);
    expect(veces).toBe(2);
    liberar();
  });
});

describe("onCleanup", () => {
  it("corre antes de cada reejecución y al liberar", () => {
    const registro: string[] = [];
    const [count, liberar] = root(() => {
      const count = signal(0);
      effect(() => {
        count();
        registro.push("run");
        onCleanup(() => registro.push("cleanup"));
      });
      return count;
    });

    count.set(1);
    expect(registro).toEqual(["run", "cleanup", "run"]);

    liberar();
    expect(registro).toEqual(["run", "cleanup", "run", "cleanup"]);
  });

  it("libera los efectos anidados con su padre", () => {
    let veces = 0;
    const [s, liberar] = root(() => {
      const padre = signal(0);
      const hijo = signal(0);
      effect(() => {
        padre();
        effect(() => {
          hijo();
          veces++;
        });
      });
      return { padre, hijo };
    });

    expect(veces).toBe(1);

    s.hijo.set(1);
    expect(veces).toBe(2);

    s.padre.set(1); // reejecuta el padre: el hijo viejo debe morir
    expect(veces).toBe(3);

    s.hijo.set(2);
    expect(veces).toBe(4); // solo queda vivo un efecto hijo
    liberar();
  });
});

describe("cascadas", () => {
  it("una escritura dentro de un efecto propaga", () => {
    const visto: number[] = [];
    const [origen, liberar] = root(() => {
      const origen = signal(1);
      const derivado = signal(0);
      effect(() => derivado.set(origen() * 10));
      effect(() => visto.push(derivado()));
      return origen;
    });

    origen.set(2);
    expect(visto).toEqual([10, 20]);
    liberar();
  });

  it("detecta un ciclo en vez de colgar la pestaña", () => {
    expect(() => {
      root(() => {
        const a = signal(0);
        effect(() => a.set(a() + 1));
      });
    }).toThrow(/ciclo reactivo/);
  });
});

describe("onError", () => {
  it("se hace cargo de lo que falla dentro de su scope", () => {
    const recibidos: unknown[] = [];
    const paso = signal(0);

    const [, liberar] = root(() => {
      onError((error) => recibidos.push(error));
      effect(() => {
        if (paso() === 1) throw new Error("falló");
      });
    });

    // Sin manejador, esto habría salido por `set` y roto la cola.
    expect(() => paso.set(1)).not.toThrow();
    expect(recibidos).toHaveLength(1);
    expect((recibidos[0] as Error).message).toBe("falló");

    liberar();
  });

  it("sube hasta el primero que se ofrezca", () => {
    const fuera: unknown[] = [];
    const paso = signal(0);

    const [, liberar] = root(() => {
      onError((error) => fuera.push(error));
      // Un scope intermedio sin manejador: el error lo atiende el de arriba.
      effect(() => {
        effect(() => {
          if (paso() === 1) throw new Error("desde dentro");
        });
      });
    });

    paso.set(1);
    expect(fuera).toHaveLength(1);
    liberar();
  });

  it("sin nadie que se haga cargo, el error sigue su camino", () => {
    const paso = signal(0);
    const [, liberar] = root(() => {
      effect(() => {
        if (paso() === 1) throw new Error("sin red");
      });
    });

    expect(() => paso.set(1)).toThrow(/sin red/);
    liberar();
  });

  it("lo que falla al crear el efecto también se atiende", () => {
    const recibidos: unknown[] = [];
    const [, liberar] = root(() => {
      onError((error) => recibidos.push(error));
      effect(() => {
        throw new Error("al nacer");
      });
    });

    expect(recibidos).toHaveLength(1);
    liberar();
  });

  it("el manejador no queda enganchado al scope que se derrumbó", () => {
    const limpiezas: string[] = [];
    const paso = signal(0);

    const [, liberar] = root(() => {
      onError(() => {
        // Registrar una limpieza aquí no debe colgar del efecto que falló.
        onCleanup(() => limpiezas.push("del manejador"));
      });
      effect(() => {
        if (paso() === 1) throw new Error("x");
      });
    });

    paso.set(1);
    expect(limpiezas).toEqual([]);

    liberar();
    expect(limpiezas).toEqual(["del manejador"]);
  });
});

describe("selector", () => {
  it("un cambio despierta solo a la que se va y a la que llega", () => {
    const elegida = signal(1);
    const ejecuciones = new Map<number, number>();

    const [, liberar] = root(() => {
      const esLaElegida = selector(() => elegida());
      for (let id = 1; id <= 1000; id++) {
        effect(() => {
          esLaElegida(id);
          ejecuciones.set(id, (ejecuciones.get(id) ?? 0) + 1);
        });
      }
    });

    // Una vez cada una, al crearse.
    expect([...ejecuciones.values()].every((n) => n === 1)).toBe(true);

    elegida.set(500);
    const despertadas = [...ejecuciones].filter(([, n]) => n > 1).map(([id]) => id);
    expect(despertadas.sort((a, b) => a - b)).toEqual([1, 500]);

    liberar();
  });

  it("responde lo que toca", () => {
    const elegida = signal("b");
    const vistas: string[] = [];

    const [, liberar] = root(() => {
      const es = selector(() => elegida());
      for (const clave of ["a", "b", "c"]) {
        effect(() => {
          if (es(clave)) vistas.push(clave);
        });
      }
    });

    expect(vistas).toEqual(["b"]);
    elegida.set("c");
    expect(vistas).toEqual(["b", "c"]);
    liberar();
  });

  it("una fila que desaparece suelta su suscripción", () => {
    const elegida = signal(1);
    let ejecuciones = 0;
    const es = root(() => selector(() => elegida()))[0];

    const [, soltarFila] = root(() => {
      effect(() => {
        es(2);
        ejecuciones++;
      });
    });
    expect(ejecuciones).toBe(1);

    soltarFila();
    elegida.set(2);
    // Ya no está: pasar a elegirla no la despierta.
    expect(ejecuciones).toBe(1);
  });
});

