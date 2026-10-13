//! SVG en `view!`: dentro de un `<svg>` los elementos van al espacio de nombres
//! de SVG (en el navegador, un `<circle>` creado como HTML no se dibuja);
//! dentro de `<foreignObject>` se vuelve a HTML; y las etiquetas que solo
//! existen en SVG lo son aunque lleguen sueltas.

use ascua::{view, Backend, Dom, MemoryBackend, NodeRef, Signal};

/// `(etiqueta, es_svg)` de cada elemento del subárbol, en orden.
fn recorrer(backend: &MemoryBackend, node: &NodeRef, salida: &mut Vec<(String, bool)>) {
    if let Some(tag) = backend.tag_name(node) {
        salida.push((tag, backend.is_svg(node)));
    }
    for hijo in backend.children(node) {
        recorrer(backend, &hijo, salida);
    }
}

fn espacios(dom: &Dom<MemoryBackend>, raiz: &NodeRef) -> Vec<(String, bool)> {
    let mut salida = Vec::new();
    recorrer(dom.backend(), raiz, &mut salida);
    salida
}

fn par(tag: &str, svg: bool) -> (String, bool) {
    (tag.to_string(), svg)
}

#[test]
fn dentro_de_svg_todo_es_svg_y_foreign_object_vuelve_a_html() {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    let radio = Signal::new(4);
    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <div>
                <svg viewBox="0 0 24 24" width="24">
                    <a href="/inicio">
                        <circle cx="12" cy="12" r={move || radio.get().to_string()}/>
                    </a>
                    <foreignObject width="24" height="24">
                        <p>"texto"</p>
                    </foreignObject>
                </svg>
            </div>
        }
    });

    assert_eq!(
        espacios(&dom, &body),
        [
            par("body", false),
            par("div", false),
            par("svg", true),
            par("a", true),
            par("circle", true),
            par("foreignobject", true),
            par("p", false),
        ]
    );

    let html = dom.backend().html(&body);
    assert!(
        html.contains(r#"<circle cx="12" cy="12" r="4"></circle>"#),
        "{html}"
    );
    radio.set(6);
    assert!(dom.backend().html(&body).contains(r#"r="6""#));
}

#[test]
fn una_etiqueta_solo_de_svg_lo_es_aunque_llegue_suelta() {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    // Como en un componente o en el `render` de un `<For>`: el `view!` no ve
    // el `<svg>` que lo rodea.
    let _app = dom.mount(&body, |dom| view! { dom, <g><path d="M0 0L1 1"/></g> });
    assert_eq!(
        espacios(&dom, &body),
        [par("body", false), par("g", true), par("path", true)]
    );
}

#[test]
fn fuera_de_svg_a_sigue_siendo_html() {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    let _app = dom.mount(&body, |dom| view! { dom, <a href="/">"Inicio"</a> });
    assert_eq!(espacios(&dom, &body), [par("body", false), par("a", false)]);
}
