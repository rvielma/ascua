//! Componentes: `#[component]` y su uso desde `view!`.

use ascua::{component, view, Backend, Children, Dom, MemoryBackend, NodeRef, Signal};

fn escenario() -> (Dom<MemoryBackend>, NodeRef) {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    (dom, body)
}

#[component]
fn Etiqueta<B: Backend>(dom: &Dom<B>, texto: String, tono: &'static str) -> B::Node {
    view! { dom,
        <span class={tono}>{texto}</span>
    }
}

#[component]
fn Contador<B: Backend>(dom: &Dom<B>, valor: Signal<i32>, paso: i32) -> B::Node {
    view! { dom,
        <button on:click={move |_| valor.update(|v| *v += paso)}>
            {move || valor.get()}
        </button>
    }
}

#[test]
fn un_componente_recibe_props_por_nombre() {
    let (dom, body) = escenario();

    let _app = dom.mount(&body, |dom| {
        view! { dom,
            <div>
                <Etiqueta texto="Listo" tono={"exito"}/>
                <Etiqueta texto="Falló" tono={"error"}/>
            </div>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><div><span class="exito">Listo</span><span class="error">Falló</span></div></body>"#
    );
}

#[test]
fn un_componente_puede_ser_reactivo_via_signals() {
    let (dom, body) = escenario();
    let total = Signal::new(0);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <div>
                <Contador valor={total} paso={1}/>
                <Contador valor={total} paso={10}/>
            </div>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        "<body><div><button>0</button><button>0</button></div></body>"
    );

    let botones = dom.backend().children(&dom.backend().children(&body)[0]);
    dom.backend().dispatch(&botones[1], "click");

    assert_eq!(total.get(), 10);
    assert_eq!(
        dom.backend().html(&body),
        "<body><div><button>10</button><button>10</button></div></body>",
        "los dos componentes comparten el signal, cada uno con su propio efecto"
    );
}

#[test]
fn un_componente_es_una_funcion_normal() {
    // Sin pasar por view!: la macro no esconde nada que no se pueda escribir
    // a mano.
    let (dom, body) = escenario();

    let _app = dom.mount(&body, |dom| {
        Etiqueta(
            dom,
            EtiquetaProps {
                texto: "Directo".to_string(),
                tono: "neutro",
            },
        )
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><span class="neutro">Directo</span></body>"#
    );
}

#[component]
fn Tarjeta<B: Backend>(dom: &Dom<B>, titulo: String, children: Children<B>) -> B::Node {
    let seccion = view! { dom,
        <section class="tarjeta">
            <h2>{titulo}</h2>
        </section>
    };
    children.render_into(dom, &seccion);
    seccion
}

#[test]
fn un_componente_recibe_sus_hijos() {
    let (dom, body) = escenario();

    let _app = dom.mount(&body, |dom| {
        view! { dom,
            <main>
                <Tarjeta titulo="Resumen">
                    <p>"Primera línea"</p>
                    <p>"Segunda línea"</p>
                </Tarjeta>
            </main>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        "<body><main><section class=\"tarjeta\"><h2>Resumen</h2>\
         <p>Primera línea</p><p>Segunda línea</p></section></main></body>"
    );
}

#[test]
fn los_hijos_de_un_componente_siguen_siendo_reactivos() {
    let (dom, body) = escenario();
    let count = Signal::new(0);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <main>
                <Tarjeta titulo="Contador">
                    <p>{move || count.get()}</p>
                </Tarjeta>
            </main>
        }
    });

    count.set(4);
    assert_eq!(
        dom.backend().html(&body),
        "<body><main><section class=\"tarjeta\"><h2>Contador</h2><p>4</p></section></main></body>",
        "los hijos se construyen dentro del componente, con sus efectos intactos"
    );
}

#[test]
fn un_componente_acepta_control_de_flujo_entre_sus_hijos() {
    // Antes esto no compilaba: <Show> necesita un elemento donde anclar su
    // marcador, y los hijos de un componente no tenían padre hasta que se
    // construían.
    let (dom, body) = escenario();
    let expandido = Signal::new(false);
    let items = Signal::new(vec![1, 2]);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <main>
                <Tarjeta titulo="Detalles">
                    <p>"Siempre visible"</p>
                    <Show when={move || expandido.get()}>
                        <ul>
                            <For each={move || items.get()}
                                 key={|item: &i32| *item}
                                 render={|dom, item: &i32| view! { dom, <li>{*item}</li> }}/>
                        </ul>
                    </Show>
                </Tarjeta>
            </main>
        }
    });

    let sin_marcadores =
        |dom: &Dom<MemoryBackend>| dom.backend().html(&body).replace("<!---->", "");

    assert_eq!(
        sin_marcadores(&dom),
        "<body><main><section class=\"tarjeta\"><h2>Detalles</h2>\
         <p>Siempre visible</p></section></main></body>"
    );

    expandido.set(true);
    assert_eq!(
        sin_marcadores(&dom),
        "<body><main><section class=\"tarjeta\"><h2>Detalles</h2>\
         <p>Siempre visible</p><ul><li>1</li><li>2</li></ul></section></main></body>",
        "el <Show> y el <For> viven dentro del componente, anclados a su árbol"
    );

    items.update(|lista| lista.push(3));
    assert!(dom.backend().html(&body).contains("<li>3</li>"));
}

// --- props opcionales ------------------------------------------------------

#[component]
fn Aviso<B: Backend>(
    dom: &Dom<B>,
    texto: String,
    #[prop(default)] cerrable: bool,
    #[prop(default = "info".to_string())] tono: String,
    #[prop(default)] children: Children<B>,
) -> B::Node {
    let aviso = view! { dom,
        <div class={tono} data-cerrable={cerrable}>
            <p>{texto}</p>
        </div>
    };
    children.render_into(dom, &aviso);
    aviso
}

#[test]
fn los_props_con_default_se_pueden_omitir() {
    let (dom, body) = escenario();

    let _app = dom.mount(&body, |dom| {
        view! { dom,
            <main>
                <Aviso texto="Solo lo imprescindible"/>
            </main>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><main><div class="info"><p>Solo lo imprescindible</p></div></main></body>"#,
        "tono toma su valor por defecto y cerrable=false quita el atributo"
    );
}

#[test]
fn los_props_con_default_se_pueden_sobrescribir_en_cualquier_orden() {
    let (dom, body) = escenario();

    let _app = dom.mount(&body, |dom| {
        view! { dom,
            <main>
                <Aviso tono="error" cerrable={true} texto="Algo falló">
                    <button>"Cerrar"</button>
                </Aviso>
            </main>
        }
    });

    assert_eq!(
        dom.backend().html(&body),
        "<body><main><div class=\"error\" data-cerrable=\"\"><p>Algo falló</p>\
         <button>Cerrar</button></div></main></body>",
        "el orden de los props no importa, y los hijos también son un prop opcional"
    );
}

#[test]
fn un_componente_con_props_opcionales_sigue_siendo_una_funcion() {
    let (dom, body) = escenario();

    let _app = dom.mount(&body, |dom| {
        // El builder es público: se puede usar sin pasar por la macro.
        Aviso(
            dom,
            AvisoProps::builder()
                .texto("Directo".to_string())
                .tono("exito".to_string())
                .build(),
        )
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><div class="exito"><p>Directo</p></div></body>"#
    );
}
