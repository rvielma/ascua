//! Los demos en vivo del sitio.
//!
//! Cada uno es una isla: el servidor los renderiza como HTML y el navegador los
//! hidrata adoptando esos nodos. Lo que enseñan no es "mira, reacciona", sino
//! **cuántas operaciones de DOM** hace falta para que reaccione.

use ascua::{component, create_effect, create_memo, keyed_list, view, Backend, Dom, Signal};

/// Un contador, y al lado el registro de lo que el framework le hace al DOM.
///
/// La gracia está en el registro: por mucho que se pulse, cada cambio produce
/// **una** escritura sobre **un** nodo de texto que nunca se sustituye.
#[component]
pub fn DemoContador<B: Backend>(dom: &Dom<B>) -> B::Node {
    let count = Signal::new(0i32);
    let registro: Signal<Vec<String>> = Signal::new(Vec::new());
    let escrituras = Signal::new(0u32);

    // El efecto que alimenta el nodo de texto anota lo que hace. Es el mismo
    // efecto que el compilador de templates coloca en `{move || count.get()}`.
    create_effect(move || {
        let valor = count.get();
        escrituras.update(|n| *n += 1);
        registro.update(|lineas| {
            lineas.push(format!("set_text(nodo#7, \"{valor}\")"));
            if lineas.len() > 5 {
                lineas.remove(0);
            }
        });
    });

    let paridad = create_memo(move || count.get() % 2 == 0);

    view! { dom,
        <div class="demo">
            <div class="panel">
                <p class="valor" data-par={move || paridad.get()}>{move || count.get()}</p>
                <div class="botones">
                    <button on:click={move |_| count.update(|c| *c -= 1)}>"−1"</button>
                    <button on:click={move |_| count.set(0)}
                            disabled={move || count.get() == 0}>"reset"</button>
                    <button class="principal" on:click={move |_| count.update(|c| *c += 1)}>"+1"</button>
                </div>
            </div>

            <div class="registro">
                <p class="titulo">"lo que se toca del DOM"</p>
                <pre>{move || registro.with(|lineas| lineas.join("\n"))}</pre>
                <p class="cuenta">
                    {move || format!(
                        "{} escrituras · 0 nodos recreados · 0 comparaciones de árbol",
                        escrituras.get()
                    )}
                </p>
            </div>

            <style>r#"
                .demo {
                    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
                    gap: 1px; background: var(--borde);
                    border: 1px solid var(--borde); border-radius: 12px; overflow: hidden;
                    margin: 0 0 1.5rem;
                }
                .panel, .registro { background: #131109; padding: 1.5rem; }
                .valor {
                    font-size: 3.5rem; margin: 0 0 1rem; font-weight: 600;
                    font-family: var(--mono); font-variant-numeric: tabular-nums;
                    line-height: 1;
                }
                .valor[data-par="false"] { color: var(--brasa); }
                .botones { display: flex; gap: .4rem; flex-wrap: wrap; }
                .titulo {
                    margin: 0 0 .75rem; font-size: .72rem; text-transform: uppercase;
                    letter-spacing: .08em; opacity: .4;
                }
                pre {
                    margin: 0 0 .75rem; font-family: var(--mono); font-size: .78rem;
                    line-height: 1.7; min-height: 6.3rem; color: var(--brasa);
                    white-space: pre-wrap; word-break: break-all;
                }
                .cuenta {
                    margin: 0; font-family: var(--mono); font-size: .72rem;
                    opacity: .45; border-top: 1px solid var(--borde); padding-top: .75rem;
                }
                @media (max-width: 40rem) {
                    .demo { grid-template-columns: minmax(0, 1fr); }
                }
            "#</style>
        </div>
    }
}

/// Una lista con clave. Cada item recibe un color **al construirse**, así que
/// el color delata si el nodo se reutilizó o se hizo uno nuevo.
#[component]
pub fn DemoLista<B: Backend>(dom: &Dom<B>) -> B::Node {
    let items: Signal<Vec<u32>> = Signal::new(vec![1, 2, 3, 4]);
    let siguiente = Signal::new(5u32);

    // Cuenta cuántas veces se ha construido un item. Si reordenar reconstruyera
    // la lista, este número subiría; no lo hace.
    //
    // Es un signal y no un contador a secas porque el texto que lo muestra
    // tiene que enterarse: el efecto del texto y el de la lista escuchan lo
    // mismo, y el del texto corre primero.
    let construidos = Signal::new(0u32);

    let lista = view! { dom,
        <div class="demo-lista">
            <ul class="items"></ul>
            <div class="botones">
                <button on:click={move |_| {
                    let id = siguiente.get();
                    siguiente.set(id + 1);
                    items.update(|lista| lista.push(id));
                }}>"añadir"</button>
                <button on:click={move |_| items.update(|lista| {
                    if !lista.is_empty() { lista.rotate_right(1); }
                })}>"rotar"</button>
                <button on:click={move |_| items.update(|lista| lista.reverse())}>"invertir"</button>
                <button on:click={move |_| items.update(|lista| { lista.pop(); })}
                        disabled={move || items.with(Vec::is_empty)}>"quitar"</button>
            </div>
            <p class="cuenta">
                {move || format!(
                    "{} items construidos en total · reordenar mueve nodos, no los rehace",
                    construidos.get()
                )}
            </p>

            <style>r#"
                .demo-lista {
                    border: 1px solid var(--borde); border-radius: 12px;
                    padding: 1.5rem; background: #131109; margin: 0 0 1.5rem;
                }
                .items {
                    list-style: none; padding: 0; margin: 0 0 1.25rem;
                    display: flex; flex-wrap: wrap; gap: .5rem; min-height: 3rem;
                }
                .botones { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: 1rem; }
                .cuenta {
                    margin: 0; font-family: var(--mono); font-size: .72rem; opacity: .45;
                    border-top: 1px solid var(--borde); padding-top: .75rem;
                }
            "#</style>
        </div>
    };

    let contenedor = dom.backend().children(&lista).into_iter().next();
    if let Some(contenedor) = contenedor {
        keyed_list(
            dom,
            &contenedor,
            move || items.get(),
            |item: &u32| *item,
            move |dom, item| {
                let indice = construidos.get_untracked();
                construidos.set(indice + 1);
                // El tono se fija al construir el item: si el nodo se
                // reconstruyera al reordenar, cambiaría de color.
                let tono = (indice * 47) % 360;
                let etiqueta = item.to_string();

                view! { dom,
                    <li style={format!(
                        "border-color: hsl({tono} 70% 55% / .55); color: hsl({tono} 70% 70%)"
                    )}>
                        {etiqueta}
                        <style>r#"
                            li {
                                font-family: var(--mono); font-size: .9rem;
                                padding: .5rem .9rem; border-radius: 8px;
                                border: 1px solid; background: #ffffff08;
                            }
                        "#</style>
                    </li>
                }
            },
        );
    }

    lista
}
