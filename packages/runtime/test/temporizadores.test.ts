/**
 * `timeout` e `interval`: `setTimeout` y `setInterval` atados al scope.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { effect, interval, onError, root, signal, timeout, withScope } from "../src/reactivo.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("timeout", () => {
  it("se dispara una vez", () => {
    const veces = signal(0);
    root(() => timeout(100, () => veces.update((n) => n + 1)));
    vi.advanceTimersByTime(500);
    expect(veces()).toBe(1);
  });

  it("no se dispara si el scope se libera antes", () => {
    const aviso = signal<string | null>("guardado");
    const [, liberar] = root(() => timeout(3000, () => aviso.set(null)));
    liberar();
    vi.advanceTimersByTime(5000);
    expect(aviso()).toBe("guardado");
  });

  it("cancel() lo cancela, y es inofensivo si ya corrió: así se hace un debounce", () => {
    const guardados: string[] = [];
    root(() => {
      let pendiente = timeout(0, () => {});
      for (const texto of ["h", "ho", "hol", "hola"]) {
        pendiente.cancel();
        pendiente = timeout(300, () => guardados.push(texto));
        vi.advanceTimersByTime(100);
      }
      vi.advanceTimersByTime(300);
      pendiente.cancel();
    });
    expect(guardados).toEqual(["hola"]);
  });
});

describe("interval", () => {
  it("se repite hasta que el scope se libera", () => {
    const segundos = signal(0);
    const [, liberar] = root(() => interval(1000, () => segundos.update((s) => s + 1)));
    vi.advanceTimersByTime(3500);
    expect(segundos()).toBe(3);
    liberar();
    vi.advanceTimersByTime(3000);
    expect(segundos()).toBe(3);
  });

  it("lo que escribe sale en un solo lote", () => {
    const a = signal(0);
    const b = signal(0);
    const vistos: number[] = [];
    root(() => {
      effect(() => vistos.push(a() + b()));
      interval(10, () => {
        a.update((n) => n + 1);
        b.update((n) => n + 1);
      });
    });
    vi.advanceTimersByTime(10);
    expect(vistos).toEqual([0, 2]);
  });

  it("un error va al onError de su scope", () => {
    const errores: unknown[] = [];
    root(() => {
      onError((error) => errores.push(error));
      interval(10, () => {
        throw new Error("falló");
      });
    });
    vi.advanceTimersByTime(25);
    expect(errores).toHaveLength(2);
  });
});

describe("fuera de scope", () => {
  it("sin scope no se cancela solo: por eso, en un manejador, onCleanup", () => {
    let corrio = false;
    const [, liberar] = root(() => {});
    withScope(null, () => timeout(100, () => (corrio = true)));
    liberar();
    vi.advanceTimersByTime(200);
    expect(corrio).toBe(true);
  });
});
