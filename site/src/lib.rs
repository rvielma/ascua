//! El sitio de Ascua, construido con Ascua.
//!
//! El texto llega como HTML desde el servidor. Este WASM solo hidrata las dos
//! islas de demo: adopta los nodos que ya están en la página en vez de
//! rehacerlos.

pub mod contenido;
pub mod demos;

use ascua::{hydrate_islands, Backend, Dom, HydratingBackend, IslandBuilder, WebBackend};
use wasm_bindgen::prelude::*;

use crate::demos::{DemoContador, DemoContadorProps, DemoLista, DemoListaProps};

#[wasm_bindgen(start)]
pub fn iniciar() -> Result<(), JsValue> {
    let backend = std::rc::Rc::new(WebBackend::from_window().map_err(JsValue::from_str)?);

    type Hidratante = HydratingBackend<WebBackend>;
    let islas: Vec<(&str, IslandBuilder<Hidratante>)> = vec![
        (
            "contador",
            Box::new(|dom: &Dom<Hidratante>, _: &str| {
                DemoContador(dom, DemoContadorProps::builder().build())
            }),
        ),
        (
            "lista",
            Box::new(|dom: &Dom<Hidratante>, _: &str| {
                DemoLista(dom, DemoListaProps::builder().build())
            }),
        ),
    ];

    let (montajes, estadisticas) = hydrate_islands(std::rc::Rc::clone(&backend), &islas);

    // El sitio predica sobre hidratación: que se pueda comprobar en la consola.
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

    std::mem::forget(montajes);
    Ok(())
}
