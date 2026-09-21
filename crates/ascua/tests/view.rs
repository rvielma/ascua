//! Comportamiento de la macro `view!`.
//!
//! Se verifica el resultado observable —el HTML que produce y cómo reacciona—
//! no el código generado: el codegen puede cambiar mientras estas aserciones
//! sigan siendo ciertas.

use ascua::{view, Backend, Dom, MemoryBackend, NodeRef, Signal};

fn escenario() -> (Dom<MemoryBackend>, NodeRef) {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    (dom, body)
}

#[test]
fn construye_elementos_anidados_y_texto() {
    let (dom, body) = escenario();

    let _app = dom.mount(&body, |dom| {
        view! { dom,
            <div class="tarjeta">
                <h1>"Ascua"</h1>
                <p>"Sin Virtual DOM."</p>
                <hr/>
            </div>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><div class="tarjeta"><h1>Ascua</h1><p>Sin Virtual DOM.</p><hr></div></body>"#
    );
}

#[test]
fn una_closure_es_reactiva_y_una_expresion_no() {
    let (dom, body) = escenario();
    let count = Signal::new(0);

    let _app = dom.mount(&body, |dom| {
        view! { dom,
            <div>
                <span id="vivo">{move || count.get()}</span>
                <span id="fijo">{count.get()}</span>
            </div>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><div><span id="vivo">0</span><span id="fijo">0</span></div></body>"#
    );

    count.set(7);
    assert_eq!(
        dom.backend().html(&body),
        r#"<body><div><span id="vivo">7</span><span id="fijo">0</span></div></body>"#,
        "solo el nodo atado a una closure sigue al signal"
    );
}

#[test]
fn los_atributos_aceptan_literal_expresion_y_closure() {
    let (dom, body) = escenario();
    let activo = Signal::new(true);
    let numero = 3;

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <button
                class="base"
                data-indice={numero}
                aria-label={move || if activo.get() { "activo" } else { "inactivo" }}
                disabled={move || activo.get()}
            >
                "Pulsar"
            </button>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><button class="base" data-indice="3" aria-label="activo" disabled="">Pulsar</button></body>"#
    );

    activo.set(false);
    assert_eq!(
        dom.backend().html(&body),
        r#"<body><button class="base" data-indice="3" aria-label="inactivo">Pulsar</button></body>"#,
        "un atributo dinámico que da None (aquí, false) se quita del elemento"
    );
}

#[test]
fn contador_completo() {
    // El entregable del MVP: click -> signal -> nodo de texto. Sin navegador.
    let (dom, body) = escenario();
    let count = Signal::new(0);

    let app = dom.mount(&body, move |dom| {
        view! { dom,
            <div class="contador">
                <button on:click={move |_| count.update(|c| *c += 1)}>"+1"</button>
                <span class={move || if count.get() > 2 { "alto" } else { "bajo" }}>
                    {move || count.get()}
                </span>
            </div>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><div class="contador"><button>+1</button><span class="bajo">0</span></div></body>"#
    );

    let boton = dom.backend().children(app.node())[0];
    for _ in 0..3 {
        dom.backend().dispatch(&boton, "click");
    }

    assert_eq!(count.get(), 3);
    assert_eq!(
        dom.backend().html(&body),
        r#"<body><div class="contador"><button>+1</button><span class="alto">3</span></div></body>"#,
        "el click actualiza el texto y la clase, cada uno por su propio efecto"
    );
}

#[test]
fn desmontar_una_vista_detiene_sus_efectos() {
    let (dom, body) = escenario();
    let count = Signal::new(0);

    let app = dom.mount(&body, |dom| {
        view! { dom, <p>{move || count.get()}</p> }
    });

    count.set(1);
    assert_eq!(dom.backend().html(&body), "<body><p>1</p></body>");

    app.unmount();
    count.set(2);
    assert_eq!(dom.backend().html(&body), "<body></body>");
}

#[test]
fn el_texto_se_escapa_al_serializar() {
    let (dom, body) = escenario();
    let peligro = Signal::new("<script>alert(1)</script>".to_string());

    let _app = dom.mount(&body, move |dom| {
        view! { dom, <p>{move || peligro.get()}</p> }
    });

    assert_eq!(
        dom.backend().html(&body),
        "<body><p>&lt;script>alert(1)&lt;/script></p></body>",
        "el contenido dinámico es texto, nunca marcado"
    );
}

// --- control de flujo ------------------------------------------------------

/// Quita el marcador de posición para comparar el HTML de forma legible.
fn limpio(dom: &Dom<MemoryBackend>, body: &NodeRef) -> String {
    dom.backend().html(body).replace("<!---->", "")
}

#[test]
fn show_muestra_y_oculta_contenido() {
    let (dom, body) = escenario();
    let visible = Signal::new(false);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <div>
                <Show when={move || visible.get()}>
                    <p class="aviso">"Atención"</p>
                </Show>
            </div>
        }
    });

    assert_eq!(limpio(&dom, &body), "<body><div></div></body>");

    visible.set(true);
    assert_eq!(
        limpio(&dom, &body),
        r#"<body><div><p class="aviso">Atención</p></div></body>"#
    );

    visible.set(false);
    assert_eq!(limpio(&dom, &body), "<body><div></div></body>");
}

#[test]
fn show_con_fallback_alterna_entre_dos_ramas() {
    let (dom, body) = escenario();
    let dentro = Signal::new(false);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <div>
                <Show when={move || dentro.get()} fallback={<a href="/login">"Entrar"</a>}>
                    <span>"Hola"</span>
                </Show>
            </div>
        }
    });

    assert_eq!(
        limpio(&dom, &body),
        r#"<body><div><a href="/login">Entrar</a></div></body>"#
    );

    dentro.set(true);
    assert_eq!(
        limpio(&dom, &body),
        "<body><div><span>Hola</span></div></body>"
    );
}

#[test]
fn el_contenido_de_show_es_reactivo_por_dentro() {
    let (dom, body) = escenario();
    let visible = Signal::new(true);
    let count = Signal::new(0);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <div>
                <Show when={move || visible.get()}>
                    <p>{move || count.get()}</p>
                </Show>
            </div>
        }
    });

    count.set(5);
    assert_eq!(limpio(&dom, &body), "<body><div><p>5</p></div></body>");

    // Al ocultar y volver a mostrar, el contenido se reconstruye con el valor
    // actual y sus bindings vuelven a funcionar.
    visible.set(false);
    count.set(9);
    visible.set(true);
    assert_eq!(limpio(&dom, &body), "<body><div><p>9</p></div></body>");

    count.set(10);
    assert_eq!(limpio(&dom, &body), "<body><div><p>10</p></div></body>");
}

#[derive(Clone, PartialEq)]
struct Tarea {
    id: u32,
    titulo: String,
}

#[test]
fn for_renderiza_una_lista_con_clave() {
    let (dom, body) = escenario();
    let tareas = Signal::new(vec![
        Tarea {
            id: 1,
            titulo: "Diseñar".into(),
        },
        Tarea {
            id: 2,
            titulo: "Construir".into(),
        },
    ]);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <ul class="tareas">
                <For
                    each={move || tareas.get()}
                    key={|tarea: &Tarea| tarea.id}
                    render={|dom, tarea: &Tarea| view! { dom, <li>{tarea.titulo.clone()}</li> }}
                />
            </ul>
        }
    });

    assert_eq!(
        limpio(&dom, &body),
        r#"<body><ul class="tareas"><li>Diseñar</li><li>Construir</li></ul></body>"#
    );

    tareas.update(|t| {
        t.push(Tarea {
            id: 3,
            titulo: "Enviar".into(),
        })
    });
    assert_eq!(
        limpio(&dom, &body),
        r#"<body><ul class="tareas"><li>Diseñar</li><li>Construir</li><li>Enviar</li></ul></body>"#
    );

    tareas.update(|t| t.retain(|tarea| tarea.id != 2));
    assert_eq!(
        limpio(&dom, &body),
        r#"<body><ul class="tareas"><li>Diseñar</li><li>Enviar</li></ul></body>"#
    );
}

#[test]
fn for_y_show_se_combinan() {
    let (dom, body) = escenario();
    let tareas = Signal::new(vec![Tarea {
        id: 1,
        titulo: "Única".into(),
    }]);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <section>
                <Show when={move || tareas.with(Vec::is_empty)}
                      fallback={<ul><For each={move || tareas.get()}
                                         key={|t: &Tarea| t.id}
                                         render={|dom, t: &Tarea| view! { dom, <li>{t.titulo.clone()}</li> }}/></ul>}>
                    <p class="vacio">"No hay tareas"</p>
                </Show>
            </section>
        }
    });

    assert_eq!(
        limpio(&dom, &body),
        "<body><section><ul><li>Única</li></ul></section></body>"
    );

    tareas.set(vec![]);
    assert_eq!(
        limpio(&dom, &body),
        r#"<body><section><p class="vacio">No hay tareas</p></section></body>"#
    );
}
