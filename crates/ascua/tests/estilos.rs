//! CSS scoped: extracción en tiempo de compilación.
//!
//! El bloque `<style>` no produce nada en runtime. Lo que se comprueba aquí es
//! su efecto observable: los elementos del template llevan el atributo de
//! scope, y el CSS reescrito aparece en el directorio de salida.

use std::path::PathBuf;

use ascua::{view, Dom, MemoryBackend, Signal};

fn directorio_css() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("ascua-css")
}

#[test]
fn los_elementos_del_template_llevan_el_atributo_de_scope() {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    let activo = Signal::new(true);

    let _app = dom.mount(&body, move |dom| {
        view! { dom,
            <article class="nota">
                <h1>"Título"</h1>
                <p class={move || if activo.get() { "activa" } else { "inactiva" }}>"Cuerpo"</p>
                <style>r#"
                    .nota { border: 1px solid; }
                    .nota h1 { font-size: 2rem; }
                    p:hover { opacity: .5; }
                "#</style>
            </article>
        }
    });

    let html = dom.backend().html(&body);

    assert!(
        !html.contains("<style"),
        "el bloque <style> no debe llegar al DOM: {html}"
    );

    let atributo = html
        .split("data-ascua-")
        .nth(1)
        .and_then(|resto| resto.split('=').next())
        .expect("debería haber un atributo de scope en el HTML");
    let atributo = format!("data-ascua-{atributo}");

    assert_eq!(
        html.matches(&atributo).count(),
        3,
        "los tres elementos del template deben llevar el scope: {html}"
    );

    // Y el CSS reescrito está en disco, listo para que el build lo recoja.
    let scope = atributo.trim_start_matches("data-ascua-");
    let css = std::fs::read_to_string(directorio_css().join(format!("{scope}.css")))
        .expect("la macro debería haber escrito el CSS extraído");

    assert!(css.contains(&format!(".nota[{atributo}]")), "{css}");
    assert!(css.contains(&format!(".nota h1[{atributo}]")), "{css}");
    assert!(
        css.contains(&format!("p[{atributo}]:hover")),
        "el atributo va antes de la pseudo-clase: {css}"
    );
}

#[test]
fn un_template_sin_estilos_no_lleva_atributo() {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");

    let _app = dom.mount(&body, |dom| {
        view! { dom, <p class="normal">"Sin estilos"</p> }
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><p class="normal">Sin estilos</p></body>"#
    );
}
