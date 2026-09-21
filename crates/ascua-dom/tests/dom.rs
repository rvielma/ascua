//! Comportamiento del runtime DOM, verificado sobre el backend en memoria.
//!
//! Todo esto corre en Rust nativo: sin navegador, sin WASM, sin wasm-bindgen.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use ascua_dom::{keyed_list, Dom, MemoryBackend, NodeRef};
use ascua_reactive::{create_root, live_node_count, on_cleanup, Signal};

fn escenario() -> (Dom<MemoryBackend>, NodeRef) {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");
    (dom, body)
}

#[test]
fn el_texto_sigue_al_signal() {
    let (dom, body) = escenario();
    let count = Signal::new(0);

    let vista = dom.mount(&body, |dom| {
        let p = dom.element("p");
        let texto = dom.dynamic_text(move || format!("Clicks: {}", count.get()));
        dom.append(&p, &texto);
        p
    });

    assert_eq!(dom.backend().html(&body), "<body><p>Clicks: 0</p></body>");

    count.set(42);
    assert_eq!(dom.backend().html(&body), "<body><p>Clicks: 42</p></body>");

    vista.unmount();
    assert_eq!(dom.backend().html(&body), "<body></body>");
}

#[test]
fn un_atributo_reactivo_se_pone_y_se_quita() {
    let (dom, body) = escenario();
    let bloqueado = Signal::new(true);

    let _vista = dom.mount(&body, |dom| {
        let boton = dom.element("button");
        dom.bind_attr(&boton, "disabled", move || {
            bloqueado.get().then(String::new)
        });
        dom.set_attr(&boton, "class", "primario");
        boton
    });

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><button disabled="" class="primario"></button></body>"#
    );

    bloqueado.set(false);
    assert_eq!(
        dom.backend().html(&body),
        r#"<body><button class="primario"></button></body>"#,
        "devolver None debe quitar el atributo, no ponerlo vacío"
    );
}

#[test]
fn contador_end_to_end() {
    // El demo del MVP, sin navegador: click -> signal -> nodo de texto.
    let (dom, body) = escenario();
    let count = Signal::new(0);

    let vista = dom.mount(&body, move |dom| {
        let boton = dom.element("button");
        let texto = dom.dynamic_text(move || count.get().to_string());
        dom.append(&boton, &texto);
        dom.on(&boton, "click", move |_| count.update(|c| *c += 1));
        boton
    });

    let boton = *vista.node();
    assert_eq!(dom.backend().html(&body), "<body><button>0</button></body>");

    dom.backend().dispatch(&boton, "click");
    dom.backend().dispatch(&boton, "click");
    assert_eq!(dom.backend().html(&body), "<body><button>2</button></body>");
    assert_eq!(count.get(), 2);
}

#[test]
fn desmontar_libera_efectos_y_listeners() {
    let (dom, body) = escenario();
    let antes = live_node_count();

    let count = Signal::new(0);
    let ejecuciones = Rc::new(Cell::new(0));
    let contador = Rc::clone(&ejecuciones);

    let vista = dom.mount(&body, move |dom| {
        let p = dom.element("p");
        let texto = dom.dynamic_text(move || {
            contador.set(contador.get() + 1);
            count.get().to_string()
        });
        dom.append(&p, &texto);
        dom.on(&p, "click", move |_| count.update(|c| *c += 1));
        p
    });
    let parrafo = *vista.node();

    count.set(1);
    assert_eq!(ejecuciones.get(), 2);

    vista.unmount();

    count.set(2);
    assert_eq!(
        ejecuciones.get(),
        2,
        "tras desmontar, el efecto no puede seguir ejecutándose"
    );

    dom.backend().dispatch(&parrafo, "click");
    assert_eq!(
        count.get(),
        2,
        "el listener debe haberse quitado al desmontar"
    );

    assert_eq!(
        live_node_count(),
        antes + 1,
        "solo debe quedar vivo el signal creado fuera del montaje"
    );
}

// --- listas con clave ------------------------------------------------------

/// Monta una lista de números usando el propio número como clave, y devuelve
/// el signal de items junto al contador de renders.
fn lista_montada(
    dom: &Dom<MemoryBackend>,
    body: &NodeRef,
) -> (
    Signal<Vec<i32>>,
    Rc<Cell<usize>>,
    ascua_dom::Mount<MemoryBackend>,
) {
    let items = Signal::new(vec![1, 2, 3]);
    let renders = Rc::new(Cell::new(0));
    let contador = Rc::clone(&renders);

    let vista = dom.mount(body, move |dom| {
        let ul = dom.element("ul");
        keyed_list(
            dom,
            &ul,
            move || items.get(),
            |item| *item,
            move |dom, item| {
                contador.set(contador.get() + 1);
                let li = dom.element("li");
                let texto = dom.text(&item.to_string());
                dom.append(&li, &texto);
                li
            },
        );
        ul
    });

    (items, renders, vista)
}

#[test]
fn la_lista_inserta_borra_y_reordena() {
    let (dom, body) = escenario();
    let (items, renders, _vista) = lista_montada(&dom, &body);

    let html = |dom: &Dom<MemoryBackend>| {
        dom.backend()
            .html(&body)
            .replace("<!---->", "")
            .replace("<body><ul>", "")
            .replace("</ul></body>", "")
    };

    assert_eq!(html(&dom), "<li>1</li><li>2</li><li>3</li>");
    assert_eq!(renders.get(), 3);

    items.set(vec![1, 2, 3, 4]); // añadir al final
    assert_eq!(html(&dom), "<li>1</li><li>2</li><li>3</li><li>4</li>");
    assert_eq!(renders.get(), 4, "solo el item nuevo se renderiza");

    items.set(vec![0, 1, 2, 3, 4]); // añadir al principio
    assert_eq!(
        html(&dom),
        "<li>0</li><li>1</li><li>2</li><li>3</li><li>4</li>"
    );
    assert_eq!(renders.get(), 5);

    items.set(vec![0, 4, 2]); // borrar y reordenar a la vez
    assert_eq!(html(&dom), "<li>0</li><li>4</li><li>2</li>");
    assert_eq!(
        renders.get(),
        5,
        "reordenar mueve nodos existentes, no los reconstruye"
    );

    items.set(vec![2, 4, 0]); // invertir
    assert_eq!(html(&dom), "<li>2</li><li>4</li><li>0</li>");
    assert_eq!(renders.get(), 5);

    items.set(vec![]); // vaciar
    assert_eq!(html(&dom), "");
}

#[test]
fn la_lista_conserva_la_identidad_de_los_nodos_al_reordenar() {
    let (dom, body) = escenario();
    let items = Signal::new(vec![1, 2, 3]);
    let nodos: Rc<RefCell<Vec<(i32, NodeRef)>>> = Rc::new(RefCell::new(Vec::new()));
    let registro = Rc::clone(&nodos);

    let _vista = dom.mount(&body, move |dom| {
        let ul = dom.element("ul");
        keyed_list(
            dom,
            &ul,
            move || items.get(),
            |item| *item,
            move |dom, item| {
                let li = dom.element("li");
                registro.borrow_mut().push((*item, li));
                li
            },
        );
        ul
    });

    let iniciales = nodos.borrow().clone();
    items.set(vec![3, 1, 2]);

    assert_eq!(
        *nodos.borrow(),
        iniciales,
        "reordenar no debe crear nodos nuevos: el estado del DOM (foco, \
         scroll, un <input> a medio escribir) se conserva"
    );
}

#[test]
fn borrar_un_item_libera_su_scope() {
    let (dom, body) = escenario();
    let items = Signal::new(vec![1, 2, 3]);
    let limpiezas = Rc::new(RefCell::new(Vec::new()));
    let registro = Rc::clone(&limpiezas);

    let vista = dom.mount(&body, move |dom| {
        let ul = dom.element("ul");
        keyed_list(
            dom,
            &ul,
            move || items.get(),
            |item| *item,
            move |dom, item| {
                let li = dom.element("li");
                let item = *item;
                let registro = Rc::clone(&registro);
                on_cleanup(move || registro.borrow_mut().push(item));
                li
            },
        );
        ul
    });

    items.set(vec![1, 3]);
    assert_eq!(
        *limpiezas.borrow(),
        vec![2],
        "solo el item borrado se limpia"
    );

    vista.unmount();
    let mut restantes = limpiezas.borrow().clone();
    restantes.sort_unstable();
    assert_eq!(
        restantes,
        vec![1, 2, 3],
        "desmontar la lista limpia los items que quedaban"
    );
}

#[test]
fn la_lista_convive_con_hermanos_estaticos() {
    let (dom, body) = escenario();
    let items = Signal::new(vec![1]);

    let _vista = dom.mount(&body, move |dom| {
        let ul = dom.element("ul");

        let cabecera = dom.element("li");
        let texto = dom.text("cabecera");
        dom.append(&cabecera, &texto);
        dom.append(&ul, &cabecera);

        keyed_list(
            dom,
            &ul,
            move || items.get(),
            |item| *item,
            |dom, item| {
                let li = dom.element("li");
                let texto = dom.text(&item.to_string());
                dom.append(&li, &texto);
                li
            },
        );

        ul
    });

    items.set(vec![1, 2]);
    assert_eq!(
        dom.backend().html(&body),
        "<body><ul><li>cabecera</li><li>1</li><li>2</li><!----></ul></body>",
        "los items se insertan antes del marcador, después del hermano estático"
    );
}

#[test]
fn el_arbol_se_serializa_como_html() {
    let dom = Dom::new(MemoryBackend::new());
    let (html, root) = create_root(|| {
        let div = dom.element("div");
        dom.set_attr(&div, "class", "caja");
        let input = dom.element("input");
        dom.set_attr(&input, "value", r#"a & "b" < c"#);
        dom.append(&div, &input);
        let texto = dom.text("5 < 6 & 7");
        dom.append(&div, &texto);
        dom.backend().html(&div)
    });

    assert_eq!(
        html,
        r#"<div class="caja"><input value="a &amp; &quot;b&quot; &lt; c">5 &lt; 6 &amp; 7</div>"#,
        "los void elements no llevan cierre y el contenido se escapa"
    );
    root.dispose();
}

// --- contenido sustituible -------------------------------------------------

#[test]
fn el_contenido_dinamico_se_sustituye_al_cambiar_la_condicion() {
    let (dom, body) = escenario();
    let logueado = Signal::new(false);

    let _vista = dom.mount(&body, move |dom| {
        let div = dom.element("div");
        dom.dynamic_child(
            &div,
            move || logueado.get(),
            |dom, dentro| {
                let p = dom.element("p");
                let texto = dom.text(if *dentro { "Hola" } else { "Inicia sesión" });
                dom.append(&p, &texto);
                Some(p)
            },
        );
        div
    });

    assert_eq!(
        dom.backend().html(&body),
        "<body><div><p>Inicia sesión</p><!----></div></body>"
    );

    logueado.set(true);
    assert_eq!(
        dom.backend().html(&body),
        "<body><div><p>Hola</p><!----></div></body>"
    );
}

#[test]
fn el_contenido_dinamico_no_se_reconstruye_si_el_selector_no_cambia() {
    let (dom, body) = escenario();
    let count = Signal::new(0);
    let renders = Rc::new(Cell::new(0));
    let contador = Rc::clone(&renders);

    let _vista = dom.mount(&body, move |dom| {
        let div = dom.element("div");
        dom.dynamic_child(
            &div,
            move || count.get() > 2, // el selector es un booleano
            move |dom, _| {
                contador.set(contador.get() + 1);
                Some(dom.element("p"))
            },
        );
        div
    });

    assert_eq!(renders.get(), 1);

    count.set(1);
    count.set(2);
    assert_eq!(
        renders.get(),
        1,
        "el booleano no cambió: no se reconstruye nada"
    );

    count.set(3);
    assert_eq!(renders.get(), 2);
}

#[test]
fn sustituir_contenido_libera_el_scope_anterior() {
    let (dom, body) = escenario();
    let caso = Signal::new(1);
    let limpiezas = Rc::new(RefCell::new(Vec::new()));
    let registro = Rc::clone(&limpiezas);

    let _vista = dom.mount(&body, move |dom| {
        let div = dom.element("div");
        dom.dynamic_child(
            &div,
            move || caso.get(),
            move |dom, valor| {
                let valor = *valor;
                let registro = Rc::clone(&registro);
                on_cleanup(move || registro.borrow_mut().push(valor));
                Some(dom.element("p"))
            },
        );
        div
    });

    caso.set(2);
    assert_eq!(*limpiezas.borrow(), vec![1]);

    caso.set(3);
    assert_eq!(*limpiezas.borrow(), vec![1, 2]);
}

#[test]
fn el_contenido_dinamico_puede_no_mostrar_nada() {
    let (dom, body) = escenario();
    let visible = Signal::new(true);

    let _vista = dom.mount(&body, move |dom| {
        let div = dom.element("div");
        dom.dynamic_child(
            &div,
            move || visible.get(),
            |dom, mostrar| mostrar.then(|| dom.element("p")),
        );
        div
    });

    assert_eq!(
        dom.backend().html(&body),
        "<body><div><p></p><!----></div></body>"
    );

    visible.set(false);
    assert_eq!(dom.backend().html(&body), "<body><div><!----></div></body>");

    visible.set(true);
    assert_eq!(
        dom.backend().html(&body),
        "<body><div><p></p><!----></div></body>"
    );
}
