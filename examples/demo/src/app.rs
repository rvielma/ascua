//! Los componentes de la aplicación.
//!
//! Este módulo es **genérico sobre el backend**, así que el mismo código
//! produce el HTML en el servidor (`MemoryBackend`) y la interfaz viva en el
//! navegador (`WebBackend`). No hay una versión "de servidor" y otra "de
//! cliente" de nada.

use std::collections::HashSet;

use ascua::{component, create_memo, keyed_list, view, Backend, Children, Dom, Router, Signal};

#[derive(Clone)]
pub struct Tarea {
    pub id: u32,
    pub titulo: String,
}

pub const TITULOS: &[&str] = &[
    "Revisar el grafo reactivo",
    "Medir el tamaño del bundle",
    "Escribir el router",
    "Probar SSR",
    "Dormir",
];

/// Estado compartido por la aplicación. Se pasa explícitamente: no hay
/// contexto implícito ni inyección mágica.
#[derive(Clone, Copy)]
pub struct Estado {
    pub tareas: Signal<Vec<Tarea>>,
    pub hechas: Signal<HashSet<u32>>,
    pub siguiente_id: Signal<u32>,
    pub router: Router,
}

impl Estado {
    pub fn nuevo(router: Router) -> Self {
        let tareas = (1..=2)
            .map(|id| Tarea {
                id,
                titulo: TITULOS[(id as usize - 1) % TITULOS.len()].to_string(),
            })
            .collect();

        Self {
            tareas: Signal::new(tareas),
            hechas: Signal::new(HashSet::new()),
            siguiente_id: Signal::new(3),
            router,
        }
    }

    pub fn anadir(&self) {
        let id = self.siguiente_id.get();
        self.siguiente_id.set(id + 1);
        let titulo = TITULOS[(id as usize - 1) % TITULOS.len()].to_string();
        self.tareas.update(|lista| lista.push(Tarea { id, titulo }));
    }

    pub fn borrar(&self, id: u32) {
        self.tareas.update(|lista| lista.retain(|t| t.id != id));
        self.hechas.update(|hechas| {
            hechas.remove(&id);
        });
    }

    pub fn alternar(&self, id: u32) {
        self.hechas.update(|hechas| {
            if !hechas.insert(id) {
                hechas.remove(&id);
            }
        });
    }
}

/// Un enlace de navegación interna.
///
/// Es un `<a href>` de verdad —copiable, abrible en otra pestaña, visible para
/// un buscador— cuyo click intercepta el router para navegar sin recargar.
#[component]
pub fn Enlace<B: Backend>(dom: &Dom<B>, router: Router, to: String, texto: String) -> B::Node {
    let patron = to.clone();
    let enlace = view! { dom,
        <a aria-current={move || router.matches(&patron).then(|| "page".to_string())}>
            {texto}
            <style>r#"
                a { color: inherit; opacity: .55; text-decoration: none; }
                a:hover { opacity: 1; }
                a[aria-current="page"] { opacity: 1; color: var(--acento); }
            "#</style>
        </a>
    };

    router.link(dom, &enlace, &to);
    enlace
}

/// Cabecera con la navegación.
#[component]
pub fn Navegacion<B: Backend>(dom: &Dom<B>, router: Router) -> B::Node {
    view! { dom,
        <nav class="nav">
            <span class="marca">"Ascua"</span>
            <Enlace router={router} to="/" texto="Tareas"/>
            <Enlace router={router} to="/acerca/" texto="Acerca de"/>
            <style>r#"
                .nav { display: flex; gap: 1rem; align-items: baseline; }
                .marca { font-weight: 700; letter-spacing: .02em; }
            "#</style>
        </nav>
    }
}

/// Contador de pendientes. El memo solo cambia cuando cambia el número.
#[component]
pub fn Resumen<B: Backend>(dom: &Dom<B>, estado: Estado) -> B::Node {
    let pendientes = create_memo(move || {
        estado.tareas.with(|lista| {
            estado
                .hechas
                .with(|hechas| lista.iter().filter(|t| !hechas.contains(&t.id)).count())
        })
    });

    view! { dom,
        <p class="resumen">
            {move || match pendientes.get() {
                0 => "Todo hecho".to_string(),
                1 => "1 tarea pendiente".to_string(),
                n => format!("{n} tareas pendientes"),
            }}
            <style>r#"
                .resumen { margin: 0 0 1.5rem; opacity: .6; font-size: .9rem; }
            "#</style>
        </p>
    }
}

/// Envoltorio con estilo propio. `children` es un prop más: opcional, como
/// todo lo que lleva `#[prop(default)]`.
#[component]
pub fn Panel<B: Backend>(
    dom: &Dom<B>,
    titulo: String,
    #[prop(default)] children: Children<B>,
) -> B::Node {
    let panel = view! { dom,
        <section class="panel">
            <h2>{titulo}</h2>
            <style>r#"
                h2 { font-size: 1.4rem; margin: 0 0 .25rem; }
            "#</style>
        </section>
    };
    children.render_into(dom, &panel);
    panel
}

/// La aplicación entera.
pub fn app<B: Backend>(dom: &Dom<B>, estado: Estado) -> B::Node {
    let router = estado.router;

    view! { dom,
        <div class="app">
            <Navegacion router={router}/>

            <Show when={move || router.matches("/acerca")}
                  fallback={<Panel titulo="Tareas">
                      <div class="contenido">
                          <Resumen estado={estado}/>
                          <Show when={move || estado.tareas.with(Vec::is_empty)}
                                fallback={<ListaDeTareas estado={estado}/>}>
                              <p class="vacio">"No queda nada por hacer."</p>
                          </Show>
                          <div class="acciones">
                              <button id="anadir" on:click={move |_| estado.anadir()}>"Añadir tarea"</button>
                              <button id="rotar" on:click={move |_| estado.tareas.update(|lista| {
                                  if !lista.is_empty() { lista.rotate_right(1); }
                              })}>"Rotar"</button>
                          </div>
                      </div>
                  </Panel>}>
                <Panel titulo="Acerca de">
                    <p>"Esta página se renderiza en el servidor y se activa por islas."</p>
                    <p>"La lista de tareas es una isla; esta sección es HTML estático."</p>
                </Panel>
            </Show>

            <style>r#"
                .app { width: min(32rem, 100%); display: grid; gap: 2rem; }
                .vacio { opacity: .5; margin: 0 0 1.5rem; }
                .acciones { display: flex; gap: .5rem; }
            "#</style>
        </div>
    }
}

/// La lista con clave.
///
/// Es un componente aparte porque `keyed_list` necesita un elemento padre
/// donde anclar sus items, y aquí ese padre es el propio `<ul>`.
#[component]
pub fn ListaDeTareas<B: Backend>(dom: &Dom<B>, estado: Estado) -> B::Node {
    let lista = view! { dom,
        <ul class="lista">
            <style>r#"
                .lista { list-style: none; padding: 0; margin: 0 0 1.5rem; display: grid; gap: .5rem; }
            "#</style>
        </ul>
    };

    keyed_list(
        dom,
        &lista,
        move || estado.tareas.get(),
        |tarea: &Tarea| tarea.id,
        move |dom, tarea| {
            let id = tarea.id;
            let titulo = tarea.titulo.clone();
            view! { dom,
                <li class={move || if estado.hechas.with(|h| h.contains(&id)) { "hecha" } else { "pendiente" }}>
                    <button class="marcar" on:click={move |_| estado.alternar(id)}>
                        {move || if estado.hechas.with(|h| h.contains(&id)) { "✓" } else { "○" }}
                    </button>
                    <span class="titulo">{titulo}</span>
                    <button class="borrar" on:click={move |_| estado.borrar(id)}>"×"</button>
                    <style>r#"
                        li {
                            display: flex; align-items: center; gap: .75rem;
                            padding: .6rem .75rem; border-radius: 10px;
                            border: 1px solid #ffffff1a; background: #ffffff08;
                        }
                        li.hecha .titulo { opacity: .4; text-decoration: line-through; }
                        li.pendiente { border-left: 2px solid var(--acento); }
                        .titulo { flex: 1; }
                        .marcar, .borrar { padding: .25rem .6rem; }
                    "#</style>
                </li>
            }
        },
    );

    lista
}
