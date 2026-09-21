//! Cliente: hidrata las islas de la página que llegó del servidor.
//!
//! El HTML ya está pintado cuando este WASM arranca. Lo que hace es reconstruir
//! el árbol reactivo **adoptando los nodos que ya existen**: el `<li>` que
//! escribió el servidor es el mismo `<li>` al que queda atado el efecto. No se
//! reemplaza nada, así que no hay parpadeo ni se pierde el estado del DOM.

pub mod app;

use ascua::{
    hydrate_islands, Backend, Dom, HydratingBackend, IslandBuilder, MemoryHistory, Router,
    WebBackend, WebHistory,
};
use wasm_bindgen::prelude::*;

use crate::app::{app, Estado};

#[wasm_bindgen(start)]
pub fn iniciar() -> Result<(), JsValue> {
    let backend = std::rc::Rc::new(WebBackend::from_window().map_err(JsValue::from_str)?);

    type Backend_ = HydratingBackend<WebBackend>;

    let islas: Vec<(&str, IslandBuilder<Backend_>)> = vec![(
        "app",
        Box::new(|dom: &Dom<Backend_>, _props: &str| {
            // Si por lo que sea no hay barra de direcciones, la aplicación
            // sigue funcionando con un historial en memoria.
            let router = match WebHistory::from_window() {
                Ok(history) => Router::new(history),
                Err(_) => Router::new(MemoryHistory::new("/")),
            };
            app(dom, Estado::nuevo(router))
        }),
    )];

    let (montajes, estadisticas) = hydrate_islands(std::rc::Rc::clone(&backend), &islas);

    // Deja constancia en el documento de cuánto se adoptó y cuánto hubo que
    // construir. Sirve para comprobar de un vistazo que la hidratación está
    // funcionando de verdad.
    if let Some(cuerpo) = backend.query_selector("body") {
        backend.set_attribute(
            &cuerpo,
            "data-hidratacion",
            &format!(
                "adoptados={} creados={}",
                estadisticas.adoptados, estadisticas.creados
            ),
        );
    }

    // Las islas viven mientras viva la página.
    std::mem::forget(montajes);
    Ok(())
}
