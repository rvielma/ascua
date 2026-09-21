/**
 * El panel: lo que hay después de entrar.
 *
 * Aquí se juntan las cuatro cosas que un framework tiene que aguantar para
 * servir de algo: secciones que se sustituyen, una lista con clave que se
 * filtra y se ordena, cifras derivadas de los datos, y un dato que cambia
 * dentro de una fila sin reconstruir la fila.
 *
 * Cada pedido guarda su estado en un **signal propio**. Por eso avanzar un
 * pedido escribe en un nodo de texto y en un atributo, y ni la tabla ni las
 * demás filas se enteran.
 */

import { memo, signal, type Signal } from "@ascua/runtime";

import { Metrica, Tarjeta, Campo } from "./componentes.js";
import { pesos, siguienteEstado, type Estado, type Pedido } from "./datos.js";
import type { Sesion } from "./sesion.js";

interface Fila extends Omit<Pedido, "estado"> {
  estado: Signal<Estado>;
}

type Columna = "id" | "cliente" | "total";

export function Panel(props: { sesion: () => Sesion; onsalir: () => void; pedidos: Pedido[] }) {
  const filas = signal<Fila[]>(
    props.pedidos.map((pedido) => ({ ...pedido, estado: signal(pedido.estado) })),
  );

  const seccion = signal<"resumen" | "pedidos">("resumen");
  const busqueda = signal("");
  const columna = signal<Columna>("id");
  const soloPendientes = signal(false);

  const visibles = memo(() => {
    const texto = busqueda().trim().toLowerCase();
    const orden = columna();

    return filas()
      .filter((fila) => !soloPendientes() || fila.estado() === "pendiente")
      .filter(
        (fila) =>
          texto === "" ||
          `${fila.id} ${fila.cliente} ${fila.ciudad}`.toLowerCase().includes(texto),
      )
      // Copia antes de ordenar: `sort` muta, y mutar lo que devuelve un signal
      // es la forma más rápida de tener un bug que no se ve.
      .slice()
      .sort((a, b) =>
        orden === "total" ? b.total - a.total : orden === "cliente"
          ? a.cliente.localeCompare(b.cliente)
          : a.id - b.id,
      );
  });

  const facturado = memo(() => visibles().reduce((suma, fila) => suma + fila.total, 0));
  const pendientes = memo(() => filas().filter((fila) => fila.estado() === "pendiente").length);

  return view`
    <div class="panel">
      <header class="barra">
        <strong>Ascua</strong>
        <nav>
          <button
            class=${() => (seccion() === "resumen" ? "activa" : "")}
            onclick=${() => seccion.set("resumen")}>Resumen</button>
          <button
            class=${() => (seccion() === "pedidos" ? "activa" : "")}
            onclick=${() => seccion.set("pedidos")}>Pedidos</button>
        </nav>
        <div class="sesion">
          <span>${() => props.sesion().nombre}</span>
          <span class="rol">${() => props.sesion().rol}</span>
          <button class="salir" onclick=${props.onsalir}>Salir</button>
        </div>
      </header>

      <main>
        <Show when=${() => seccion() === "resumen"}>
          <div class="rejilla">
            <Tarjeta titulo="Estado de la cartera" nota=${() => `${visibles().length} pedidos`}>
              <div class="metricas">
                <Metrica etiqueta="Facturado" valor=${() => pesos(facturado())}/>
                <Metrica etiqueta="Pendientes" valor=${() => String(pendientes())}/>
                <Metrica etiqueta="Pedidos" valor=${() => String(filas().length)}/>
              </div>
            </Tarjeta>

            <Tarjeta titulo="Últimos movimientos">
              <ul class="movimientos">
                <For
                  each=${() => visibles().slice(0, 4)}
                  key=${(fila: Fila) => fila.id}
                  render=${(fila: Fila) => view`
                    <li>
                      <span>${fila.cliente}</span>
                      <span class="marca" data-estado=${() => fila.estado()}>${() => fila.estado()}</span>
                      <style>
                        li { display: flex; justify-content: space-between; align-items: center;
                             font-size: .88rem; }
                        .marca { font-size: .76rem; border: 1px solid var(--borde);
                                 border-radius: 999px; padding: .12rem .55rem;
                                 text-transform: capitalize; }
                        .marca[data-estado="pendiente"] { color: var(--aviso); }
                        .marca[data-estado="enviado"] { color: var(--acento); }
                        .marca[data-estado="entregado"] { color: var(--exito); }
                      </style>
                    </li>`}/>
              </ul>
            </Tarjeta>
          </div>

          <Else>
            <div class="rejilla">
              <Tarjeta titulo="Pedidos" nota=${() => `${visibles().length} de ${filas().length}`}>
                <div class="filtros">
                  <Campo
                    etiqueta="Buscar"
                    nombre="busqueda"
                    valor=${() => busqueda()}
                    oncambio=${(valor: string) => busqueda.set(valor)}/>

                  <label class="casilla">
                    <input
                      type="checkbox"
                      prop:checked=${() => soloPendientes()}
                      onchange=${(evento: Event) =>
                        soloPendientes.set((evento.target as HTMLInputElement).checked)}>
                    <span>Solo pendientes</span>
                  </label>

                  <button class="limpiar" onclick=${() => busqueda.set("")}>Limpiar</button>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th><button onclick=${() => columna.set("id")}>Nº</button></th>
                      <th><button onclick=${() => columna.set("cliente")}>Cliente</button></th>
                      <th>Ciudad</th>
                      <th class="derecha"><button onclick=${() => columna.set("total")}>Total</button></th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For
                      each=${() => visibles()}
                      key=${(fila: Fila) => fila.id}
                      render=${(fila: Fila) => view`
                        <tr>
                          <td class="numero">${String(fila.id)}</td>
                          <td>${fila.cliente}</td>
                          <td class="tenue">${fila.ciudad}</td>
                          <td class="derecha numero">${pesos(fila.total)}</td>
                          <td>
                            <button
                              class="marca"
                              data-estado=${() => fila.estado()}
                              onclick=${() => fila.estado.set(siguienteEstado(fila.estado()))}>
                              ${() => fila.estado()}
                            </button>
                          </td>
                          <style>
                            td { padding: .5rem .9rem .5rem 0; font-size: .88rem;
                                 border-bottom: 1px solid var(--borde); }
                            td:last-child { padding-right: 0; }
                            .numero { font-variant-numeric: tabular-nums; }
                            .derecha { text-align: right; }
                            .tenue { color: var(--tenue); }
                            .marca { font: inherit; font-size: .76rem; cursor: pointer;
                                     border: 1px solid var(--borde); border-radius: 999px;
                                     padding: .12rem .55rem; background: transparent;
                                     color: inherit; text-transform: capitalize; }
                            .marca[data-estado="pendiente"] { color: var(--aviso);
                              border-color: color-mix(in srgb, var(--aviso) 40%, transparent); }
                            .marca[data-estado="enviado"] { color: var(--acento);
                              border-color: color-mix(in srgb, var(--acento) 40%, transparent); }
                            .marca[data-estado="entregado"] { color: var(--exito);
                              border-color: color-mix(in srgb, var(--exito) 40%, transparent); }
                          </style>
                        </tr>`}/>
                  </tbody>
                </table>

                <Show when=${() => visibles().length === 0}>
                  <p class="vacio">Ningún pedido coincide con el filtro.</p>
                </Show>
              </Tarjeta>
            </div>
          </Else>
        </Show>
      </main>

      <style>
        .panel { min-height: 100dvh; display: grid; grid-template-rows: auto 1fr; }
        .barra { display: flex; align-items: center; gap: 1.25rem; padding: .7rem 1.1rem;
                 border-bottom: 1px solid var(--borde); background: var(--panel); }
        nav { display: flex; gap: .25rem; }
        nav button { font: inherit; font-size: .88rem; padding: .35rem .7rem; border: 0;
                     border-radius: 7px; background: transparent; color: var(--tenue);
                     cursor: pointer; }
        nav button.activa { background: var(--fondo); color: inherit; font-weight: 600; }
        .sesion { margin-left: auto; display: flex; align-items: center; gap: .6rem;
                  font-size: .85rem; }
        .rol { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em;
               color: var(--tenue); border: 1px solid var(--borde); border-radius: 999px;
               padding: .1rem .45rem; }
        .salir { font: inherit; font-size: .82rem; padding: .3rem .6rem; cursor: pointer;
                 border: 1px solid var(--borde); border-radius: 7px; background: transparent;
                 color: inherit; }
        main { padding: 1.25rem; }
        .rejilla { display: grid; gap: 1rem; max-width: 62rem; margin: 0 auto; }
        .metricas { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
                    gap: 1rem; }
        .movimientos { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
        .filtros { display: flex; align-items: end; gap: .9rem; flex-wrap: wrap;
                   margin-bottom: 1rem; }
        .casilla { display: flex; align-items: center; gap: .4rem; font-size: .85rem;
                   padding-bottom: .5rem; }
        .limpiar { font: inherit; font-size: .82rem; padding: .5rem .7rem; cursor: pointer;
                   border: 1px solid var(--borde); border-radius: 7px; background: transparent;
                   color: inherit; }
        table { width: 100%; border-collapse: collapse; font-size: .88rem; }
        th { text-align: left; font-weight: 600; font-size: .76rem; text-transform: uppercase;
             letter-spacing: .04em; color: var(--tenue); border-bottom: 1px solid var(--borde); }
        th { padding-right: .9rem; }
        th:last-child { padding-right: 0; }
        th button { font: inherit; color: inherit; background: transparent; border: 0;
                    padding: .4rem 0; cursor: pointer; text-transform: inherit;
                    letter-spacing: inherit; }
        th.derecha { text-align: right; }
        .vacio { margin: 1rem 0 0; font-size: .85rem; color: var(--tenue); }
      </style>
    </div>`;
}
