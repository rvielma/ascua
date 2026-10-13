//! Lo que el runtime no escribe tal cual cuando llega por una expresión: una
//! URL `javascript:` y un `srcdoc` sin `sandbox`. Lo literal no se toca.

use ascua::{view, Dom, MemoryBackend, Signal};

fn html(construir: impl FnOnce(&Dom<MemoryBackend>) -> ascua::NodeRef + 'static) -> String {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    let _app = dom.mount(&body, construir);
    dom.backend().html(&body)
}

#[test]
fn una_url_javascript_por_expresion_se_bloquea() {
    let url = String::from("javascript:alert(document.cookie)");
    let salida = html(move |dom| view! { dom, <a href={url}>"Pagar"</a> });
    assert!(!salida.contains("alert"), "{salida}");
    assert!(salida.contains("javascript:throw"), "{salida}");
}

#[test]
fn reactiva_se_bloquea_cada_vez_y_lo_seguro_pasa() {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    let url = Signal::new(String::from("https://flow.cl/pay/1"));
    let _app = dom.mount(&body, move |dom| {
        view! { dom, <a href={move || url.get()}>"Pagar"</a> }
    });
    assert!(dom.backend().html(&body).contains("https://flow.cl/pay/1"));
    url.set(String::from("java\tscript:alert(1)"));
    assert!(dom.backend().html(&body).contains("javascript:throw"));
    url.set(String::from("/pagos?id=1"));
    assert!(dom.backend().html(&body).contains("/pagos?id=1"));
}

#[test]
fn lo_literal_no_se_toca() {
    let salida = html(|dom| view! { dom, <a href="javascript:void 0">"Nada"</a> });
    assert!(salida.contains("javascript:void 0"), "{salida}");
}

#[test]
fn srcdoc_sin_sandbox_no_se_escribe() {
    let pagina = String::from("<script>parent.document.cookie</script>");
    let salida = html(move |dom| view! { dom, <iframe srcdoc={pagina}></iframe> });
    assert!(!salida.contains("cookie"), "{salida}");
}

#[test]
fn srcdoc_con_sandbox_literal_se_escribe_aunque_vaya_despues() {
    let pagina = String::from("<p>hola</p>");
    let salida = html(move |dom| view! { dom, <iframe srcdoc={pagina} sandbox=""></iframe> });
    assert!(salida.contains("hola"), "{salida}");
}

#[test]
fn srcdoc_con_scripts_y_mismo_origen_no_se_escribe() {
    let pagina = String::from("<p>hola</p>");
    let salida = html(move |dom| {
        view! { dom, <iframe sandbox="allow-scripts allow-same-origin" srcdoc={pagina}></iframe> }
    });
    assert!(!salida.contains("hola"), "{salida}");
}
