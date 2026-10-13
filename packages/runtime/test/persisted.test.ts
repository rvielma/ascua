/**
 * `persisted`: un signal guardado en `localStorage` que nunca tira la página,
 * falle como falle el almacén.
 */

import { describe, expect, it } from "vitest";

import { persisted } from "../src/persisted.js";
import { effect, root } from "../src/reactivo.js";

/** Un `Storage` en memoria que puede fallar al leer o al escribir. */
function storage({ failRead = false, failWrite = false } = {}): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem(key: string) {
      if (failRead) throw new DOMException("blocked", "SecurityError");
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (failWrite) throw new DOMException("full", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("persisted", () => {
  it("guarda con su versión y lo lee al volver", () => {
    const s = storage();
    const theme = persisted("app:theme", "light", { storage: s });
    expect(theme()).toBe("light");
    theme.set("dark");
    expect(s.getItem("app:theme")).toBe('{"v":1,"d":"dark"}');
    expect(theme.saved()).toBe(true);

    expect(persisted("app:theme", "light", { storage: s })()).toBe("dark");
  });

  it("es un signal: avisa al cambiar, y update y peek funcionan", () => {
    const count = persisted("n", 0, { storage: storage() });
    const seen: number[] = [];
    root(() => effect(() => seen.push(count())));
    count.update((n) => n + 1);
    count.set(5);
    expect(seen).toEqual([0, 1, 5]);
    expect(count.peek()).toBe(5);
  });

  it("otra versión, JSON roto o un valor que no valida: vale el inicial", () => {
    const s = storage();
    s.setItem("a", '{"v":1,"d":3}');
    expect(persisted("a", 0, { storage: s, version: 2 })()).toBe(0);
    s.setItem("b", "{roto");
    expect(persisted("b", 0, { storage: s })()).toBe(0);
    s.setItem("c", '{"v":1,"d":"tres"}');
    const isNumber = (v: unknown): v is number => typeof v === "number";
    expect(persisted("c", 0, { storage: s, validate: isNumber })()).toBe(0);
  });

  it("si el almacén lanza al leer, arranca con el inicial", () => {
    expect(persisted("x", 7, { storage: storage({ failRead: true }) })()).toBe(7);
  });

  it("si lanza al escribir, sigue en memoria y saved() lo dice", () => {
    const value = persisted("x", 1, { storage: storage({ failWrite: true }) });
    value.set(2);
    expect(value()).toBe(2);
    expect(value.saved()).toBe(false);
  });

  it("sin almacén funciona en memoria", () => {
    const value = persisted("x", 1, { storage: null });
    value.set(2);
    expect(value()).toBe(2);
    expect(value.saved()).toBe(false);
  });

  it("con sync sigue a otra pestaña, y deja de hacerlo con el scope", () => {
    const s = storage();
    const [value, dispose] = root(() => persisted("k", "a", { storage: s, sync: true }));
    const fromOtherTab = (key: string | null, newValue: string | null) =>
      window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue, storageArea: s }));

    fromOtherTab("k", '{"v":1,"d":"b"}');
    expect(value()).toBe("b");
    fromOtherTab("otra", '{"v":1,"d":"c"}');
    expect(value()).toBe("b");
    fromOtherTab(null, null);
    expect(value()).toBe("a");

    dispose();
    fromOtherTab("k", '{"v":1,"d":"d"}');
    expect(value()).toBe("a");
  });
});
