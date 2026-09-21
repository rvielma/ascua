//! El router, probado sin navegador.

use std::cell::RefCell;
use std::rc::Rc;

use ascua_dom::{Dom, MemoryBackend};
use ascua_reactive::{create_effect, create_root};
use ascua_router::{MemoryHistory, Router};

#[test]
fn navegar_actualiza_la_ruta() {
    let (router, root) = create_root(|| Router::new(MemoryHistory::new("/")));

    assert_eq!(router.path(), "/");
    router.navigate("/tareas");
    assert_eq!(router.path(), "/tareas");
    assert!(router.matches("/tareas"));
    assert!(!router.matches("/"));

    root.dispose();
}

#[test]
fn la_ruta_es_reactiva() {
    let vistas = Rc::new(RefCell::new(Vec::new()));
    let registro = Rc::clone(&vistas);

    let (router, root) = create_root(move || {
        let router = Router::new(MemoryHistory::new("/"));
        create_effect(move || registro.borrow_mut().push(router.path()));
        router
    });

    router.navigate("/tareas");
    router.navigate("/tareas/7");

    assert_eq!(*vistas.borrow(), vec!["/", "/tareas", "/tareas/7"]);
    root.dispose();
}

#[test]
fn un_efecto_solo_despierta_cuando_cambia_lo_que_mira() {
    let veces = Rc::new(std::cell::Cell::new(0));
    let contador = Rc::clone(&veces);

    let (router, root) = create_root(move || {
        let router = Router::new(MemoryHistory::new("/"));
        // Mira solo si estamos en la sección de tareas, no la ruta exacta.
        create_effect(move || {
            let _ = router.matches("/tareas/*resto");
            contador.set(contador.get() + 1);
        });
        router
    });

    assert_eq!(veces.get(), 1);

    router.navigate("/tareas/1");
    assert_eq!(veces.get(), 2);

    router.navigate("/tareas/2");
    assert_eq!(
        veces.get(),
        3,
        "el signal de ruta cambió, así que el efecto corre"
    );
    root.dispose();
}

#[test]
fn el_boton_atras_del_navegador_actualiza_la_ruta() {
    let historial = Rc::new(MemoryHistory::new("/"));
    let (router, root) = {
        let historial_para_router = Rc::clone(&historial);
        create_root(move || Router::new(HistorialCompartido(historial_para_router)))
    };

    router.navigate("/tareas");
    router.navigate("/tareas/7");
    assert_eq!(router.path(), "/tareas/7");

    historial.back(); // el usuario pulsa "atrás"
    assert_eq!(
        router.path(),
        "/tareas",
        "una navegación externa también actualiza el signal"
    );
    root.dispose();
}

/// Adaptador para poder conservar una referencia al historial en el test.
struct HistorialCompartido(Rc<MemoryHistory>);

impl ascua_router::History for HistorialCompartido {
    fn path(&self) -> String {
        self.0.path()
    }
    fn push(&self, path: &str) {
        self.0.push(path);
    }
    fn replace(&self, path: &str) {
        self.0.replace(path);
    }
    fn listen(&self, callback: ascua_router::Oyente) {
        self.0.listen(callback);
    }
}

#[test]
fn un_enlace_navega_sin_recargar_la_pagina() {
    let dom = Dom::new(MemoryBackend::new());
    let body = dom.element("body");

    let (router, root) = create_root(|| Router::new(MemoryHistory::new("/")));

    let enlace = dom.element("a");
    dom.append(&enlace, &dom.text("Tareas"));
    router.link(&dom, &enlace, "/tareas");
    dom.append(&body, &enlace);

    assert_eq!(
        dom.backend().html(&body),
        r#"<body><a href="/tareas">Tareas</a></body>"#,
        "el enlace conserva su href: sigue siendo un enlace de verdad"
    );

    let cancelado = dom.backend().dispatch(&enlace, "click");

    assert!(
        cancelado,
        "el router debe cancelar la navegación del navegador"
    );
    assert_eq!(router.path(), "/tareas");
    root.dispose();
}

#[test]
fn replace_no_apila_entradas() {
    let historial = Rc::new(MemoryHistory::new("/"));
    let (router, root) = {
        let compartido = Rc::clone(&historial);
        create_root(move || Router::new(HistorialCompartido(compartido)))
    };

    router.navigate("/a");
    assert_eq!(historial.len(), 2);

    router.replace("/b");
    assert_eq!(historial.len(), 2, "replace sustituye, no apila");
    assert_eq!(router.path(), "/b");
    root.dispose();
}
