//! Renderizado en servidor e islas.

use ascua_dom::{
    island, mount_islands, render_to_string, Backend, Dom, IslandBuilder, MemoryBackend,
    ISLAND_ATTR,
};
use ascua_reactive::Signal;

#[test]
fn renderiza_a_html_sin_navegador() {
    let html = render_to_string(|dom| {
        let articulo = dom.element("article");
        dom.set_attr(&articulo, "class", "nota");

        let titulo = dom.element("h1");
        dom.append(&titulo, &dom.text("Ascua"));
        dom.append(&articulo, &titulo);

        let visitas = Signal::new(3);
        let p = dom.element("p");
        dom.append(
            &p,
            &dom.dynamic_text(move || format!("{} visitas", visitas.get())),
        );
        dom.append(&articulo, &p);

        articulo
    });

    assert_eq!(
        html,
        r#"<article class="nota"><h1>Ascua</h1><p>3 visitas</p></article>"#
    );
}

#[test]
fn una_isla_deja_marcadores_en_el_html() {
    let html = render_to_string(|dom| {
        let main = dom.element("main");
        let estatico = dom.element("p");
        dom.append(&estatico, &dom.text("Esto nunca cambia"));
        dom.append(&main, &estatico);

        let isla = island(dom, "contador", "7", |dom| {
            let boton = dom.element("button");
            dom.append(&boton, &dom.text("7"));
            boton
        });
        dom.append(&main, &isla);
        main
    });

    assert_eq!(
        html,
        "<main><p>Esto nunca cambia</p>\
         <ascua-island data-ascua-island=\"contador\" data-ascua-props=\"7\">\
         <button>7</button></ascua-island></main>",
        "el servidor renderiza el contenido de la isla, ya visible sin JS"
    );
}

#[test]
fn el_cliente_monta_solo_las_islas_registradas() {
    // Se simula la página servida construyéndola en un backend de memoria, y
    // luego se ejecuta sobre ella lo que haría el cliente.
    let dom = Dom::new(MemoryBackend::new());
    let pagina = dom.element("body");

    let estatico = dom.element("p");
    dom.append(&estatico, &dom.text("Contenido del servidor"));
    dom.append(&pagina, &estatico);

    let isla = island(&dom, "contador", "10", |dom| {
        let boton = dom.element("button");
        dom.append(&boton, &dom.text("10"));
        boton
    });
    dom.append(&pagina, &isla);

    let desconocida = island(&dom, "todavia-no-existe", "", |dom| {
        let p = dom.element("p");
        dom.append(&p, &dom.text("intacta"));
        p
    });
    dom.append(&pagina, &desconocida);

    let count = Signal::new(0);
    let constructores: Vec<(&str, IslandBuilder<MemoryBackend>)> = vec![(
        "contador",
        Box::new(move |dom: &Dom<MemoryBackend>, props: &str| {
            count.set(props.parse().unwrap_or(0));
            let boton = dom.element("button");
            dom.append(&boton, &dom.dynamic_text(move || count.get().to_string()));
            dom.on(&boton, "click", move |_| count.update(|c| *c += 1));
            boton
        }),
    )];

    let montajes = mount_islands(&dom, &constructores);
    assert_eq!(montajes.len(), 1, "solo se monta la isla registrada");

    // La isla registrada ahora es reactiva: su raíz es el botón que construyó
    // el constructor del cliente.
    dom.backend().dispatch(montajes[0].node(), "click");
    assert_eq!(
        count.get(),
        11,
        "los props del servidor llegaron al cliente"
    );

    let html = dom.backend().html(&pagina);
    assert!(html.contains("<button>11</button>"), "{html}");

    // ...y la que no tiene constructor se queda tal cual la dejó el servidor.
    assert!(
        html.contains("<ascua-island data-ascua-island=\"todavia-no-existe\"><p>intacta</p>"),
        "una isla sin constructor no debe tocarse: {html}"
    );
    assert!(html.contains("<p>Contenido del servidor</p>"));

    // El marcador sigue ahí: montar no borra la identidad de la isla.
    assert_eq!(
        dom.backend().query_all(&format!("[{ISLAND_ATTR}]")).len(),
        2
    );
}
