//! Hidratación: el cliente adopta los nodos del servidor en vez de rehacerlos.
//!
//! El montaje del "cliente" se ejecuta sobre el mismo árbol en memoria que
//! produjo el "servidor", que es justo lo que pasa en el navegador: los nodos
//! ya están ahí. Así se puede comprobar la propiedad que define la
//! hidratación —**identidad de los nodos**— sin navegador.

use std::rc::Rc;

use ascua_dom::{
    hydrate_islands, island, Backend, Dom, HydratingBackend, IslandBuilder, MemoryBackend, NodeRef,
};
use ascua_reactive::{create_root, Signal};

/// La página, escrita una sola vez y usada por servidor y cliente.
fn pagina<B: Backend>(dom: &Dom<B>, count: Signal<i32>) -> B::Node {
    let app = dom.element("div");
    dom.set_attr(&app, "class", "app");

    let titulo = dom.element("h1");
    dom.append(&titulo, &dom.text("Ascua"));
    dom.append(&app, &titulo);

    let parrafo = dom.element("p");
    dom.set_attr(&parrafo, "class", "contador");
    dom.append(&parrafo, &dom.dynamic_text(move || count.get().to_string()));
    dom.append(&app, &parrafo);

    let boton = dom.element("button");
    dom.append(&boton, &dom.text("+1"));
    dom.on(&boton, "click", move |_| count.update(|c| *c += 1));
    dom.append(&app, &boton);

    app
}

/// Renderiza la página como lo haría el servidor y devuelve el backend con el
/// árbol ya construido, listo para que el cliente lo encuentre.
fn servidor() -> (Rc<MemoryBackend>, NodeRef) {
    let backend = Rc::new(MemoryBackend::with_hydration_ids());
    let dom = Dom::from_rc(Rc::clone(&backend));

    let (raiz, root) = create_root(|| {
        let count = Signal::new(5);
        let cuerpo = dom.element("body");
        let isla = island(&dom, "app", "5", |dom| pagina(dom, count));
        dom.append(&cuerpo, &isla);
        cuerpo
    });
    // En el servidor no queda nada vivo: los efectos corrieron una vez.
    root.dispose();

    (backend, raiz)
}

#[test]
fn el_servidor_numera_los_elementos() {
    let (backend, raiz) = servidor();
    let html = backend.html(&raiz);

    assert!(
        html.contains(r#"<div data-ascua-h="0" class="app">"#),
        "dentro de la isla, la numeración empieza de cero: {html}"
    );
    assert!(
        html.contains(r#"<p data-ascua-h="2" class="contador">5</p>"#),
        "div=0, h1=1, p=2, button=3: el orden en que el codegen los crea: {html}"
    );
}

#[test]
fn hidratar_adopta_los_nodos_en_vez_de_crearlos() {
    let (backend, raiz) = servidor();

    // Los nodos concretos que dejó el servidor.
    let isla = backend.children(&raiz)[0];
    let app = backend.children(&isla)[0];
    let parrafo_servidor = backend.children(&app)[1];
    let boton_servidor = backend.children(&app)[2];

    let count = Signal::new(0);
    let islas: Vec<(&str, IslandBuilder<HydratingBackend<MemoryBackend>>)> = vec![(
        "app",
        Box::new(
            move |dom: &Dom<HydratingBackend<MemoryBackend>>, props: &str| {
                count.set(props.parse().unwrap_or(0));
                pagina(dom, count)
            },
        ),
    )];

    let (montajes, estadisticas) = hydrate_islands(Rc::clone(&backend), &islas);

    assert_eq!(montajes.len(), 1);
    assert_eq!(
        estadisticas.creados, 0,
        "no debería haber hecho falta crear ni un nodo: {estadisticas:?}"
    );
    assert!(estadisticas.adoptados >= 7, "{estadisticas:?}");

    // La prueba de que es hidratación y no un remontaje: el párrafo que ahora
    // alimenta el efecto es exactamente el nodo que escribió el servidor.
    let app_tras_hidratar = backend.children(&isla)[0];
    let parrafo_cliente = backend.children(&app_tras_hidratar)[1];
    assert_eq!(
        parrafo_cliente, parrafo_servidor,
        "el <p> del cliente debe ser el mismo nodo que el del servidor"
    );

    // Y está vivo: cambiar el signal actualiza ese nodo, sin reconstruirlo.
    count.set(42);
    assert_eq!(
        backend.html(&parrafo_servidor),
        r#"<p class="contador">42</p>"#,
        "el efecto quedó atado al nodo del servidor"
    );

    // El listener también se registró sobre el botón original.
    backend.dispatch(&boton_servidor, "click");
    assert_eq!(count.get(), 43);

    // Y los marcadores de hidratación ya no ensucian el documento.
    let html = backend.html(&raiz);
    assert!(!html.contains("data-ascua-h"), "{html}");
}

#[test]
fn el_html_final_coincide_con_el_del_servidor() {
    let (backend, raiz) = servidor();
    let html_servidor = backend.html(&raiz);

    let count = Signal::new(0);
    let islas: Vec<(&str, IslandBuilder<HydratingBackend<MemoryBackend>>)> = vec![(
        "app",
        Box::new(
            move |dom: &Dom<HydratingBackend<MemoryBackend>>, props: &str| {
                count.set(props.parse().unwrap_or(0));
                pagina(dom, count)
            },
        ),
    )];
    let _ = hydrate_islands(Rc::clone(&backend), &islas);

    let html_cliente = backend.html(&raiz);
    let esperado = regex_sin_ids(&html_servidor);

    assert_eq!(
        html_cliente, esperado,
        "hidratar no debe cambiar el documento"
    );
}

/// Quita los atributos de hidratación, que la hidratación elimina al adoptar.
fn regex_sin_ids(html: &str) -> String {
    let mut salida = String::new();
    let mut resto = html;
    while let Some(inicio) = resto.find(" data-ascua-h=\"") {
        salida.push_str(&resto[..inicio]);
        let tras_valor = &resto[inicio + " data-ascua-h=\"".len()..];
        let fin = tras_valor.find('"').map_or(tras_valor.len(), |p| p + 1);
        resto = &tras_valor[fin..];
    }
    salida.push_str(resto);
    salida
}

#[test]
fn si_el_html_no_encaja_se_construye_lo_que_falte() {
    // El servidor renderizó una página distinta de la que el cliente quiere:
    // la hidratación no debe romperse, solo crear lo que falta.
    let backend = Rc::new(MemoryBackend::with_hydration_ids());
    let dom = Dom::from_rc(Rc::clone(&backend));

    let (raiz, root) = create_root(|| {
        let cuerpo = dom.element("body");
        let isla = island(&dom, "app", "0", |dom| {
            // Solo un <section>, cuando el cliente espera todo el árbol.
            let section = dom.element("section");
            dom.append(&section, &dom.text("otra cosa"));
            section
        });
        dom.append(&cuerpo, &isla);
        cuerpo
    });
    root.dispose();

    let count = Signal::new(0);
    let islas: Vec<(&str, IslandBuilder<HydratingBackend<MemoryBackend>>)> = vec![(
        "app",
        Box::new(
            move |dom: &Dom<HydratingBackend<MemoryBackend>>, _props: &str| pagina(dom, count),
        ),
    )];

    let (montajes, estadisticas) = hydrate_islands(Rc::clone(&backend), &islas);

    assert_eq!(montajes.len(), 1);
    assert!(
        estadisticas.creados > 0,
        "lo que no encaja se crea: {estadisticas:?}"
    );

    // La aplicación funciona igual.
    count.set(9);
    let html = backend.html(&raiz);
    assert!(html.contains(r#"<p class="contador">9</p>"#), "{html}");
}

/// Una lista con clave: el caso que obliga a numerar también los marcadores,
/// porque el runtime los crea *antes* que los items pero en el HTML quedan
/// *después*.
fn lista<B: Backend>(dom: &Dom<B>, items: Signal<Vec<u32>>) -> B::Node {
    let ul = dom.element("ul");
    ascua_dom::keyed_list(
        dom,
        &ul,
        move || items.get(),
        |item: &u32| *item,
        |dom, item| {
            let li = dom.element("li");
            dom.append(&li, &dom.text(&item.to_string()));
            li
        },
    );
    ul
}

#[test]
fn una_lista_tambien_se_hidrata_entera() {
    let backend = Rc::new(MemoryBackend::with_hydration_ids());
    let dom = Dom::from_rc(Rc::clone(&backend));

    let (raiz, root) = create_root(|| {
        let items = Signal::new(vec![1, 2, 3]);
        let cuerpo = dom.element("body");
        let isla = island(&dom, "lista", "", |dom| lista(dom, items));
        dom.append(&cuerpo, &isla);
        cuerpo
    });
    root.dispose();

    let ul_servidor = backend.children(&backend.children(&raiz)[0])[0];
    let li_servidor = backend.children(&ul_servidor);
    let hijos_antes = li_servidor.len();

    let items = Signal::new(vec![1, 2, 3]);
    let islas: Vec<(&str, IslandBuilder<HydratingBackend<MemoryBackend>>)> = vec![(
        "lista",
        Box::new(move |dom: &Dom<HydratingBackend<MemoryBackend>>, _props: &str| lista(dom, items)),
    )];

    let (_montajes, estadisticas) = hydrate_islands(Rc::clone(&backend), &islas);

    assert_eq!(
        estadisticas.creados, 0,
        "ni los <li> ni el marcador de la lista deberían crearse de nuevo: {estadisticas:?}"
    );

    let hijos_despues = backend.children(&ul_servidor);
    assert_eq!(
        hijos_despues.len(),
        hijos_antes,
        "hidratar no puede dejar marcadores duplicados"
    );
    assert_eq!(
        hijos_despues, li_servidor,
        "los mismos nodos, en el mismo orden"
    );

    // Y la lista sigue viva: añadir un item lo coloca donde toca.
    items.update(|lista| lista.push(4));
    let html = backend.html(&ul_servidor);
    assert_eq!(
        html, "<ul><li>1</li><li>2</li><li>3</li><li>4</li><!----></ul>",
        "el marcador adoptado sigue haciendo de ancla al final"
    );
}
