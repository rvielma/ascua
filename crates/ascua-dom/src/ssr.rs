//! Renderizado en servidor e islas de hidratación.
//!
//! Renderizar en servidor no necesita un runtime aparte: es el mismo código de
//! componentes sobre otro [`Backend`]. [`MemoryBackend`] construye el árbol en
//! memoria y lo serializa, así que `render_to_string` cabe en unas pocas
//! líneas.
//!
//! # Islas
//!
//! Una página servida desde el servidor es HTML muerto: no hay efectos, no hay
//! listeners. Las **islas** son las regiones que sí se activan en el cliente.
//! El servidor las envuelve en un elemento marcado con su nombre, y el cliente
//! busca esos marcadores y monta cada una.
//!
//! Lo que hace el cliente es **montar**, no hidratar: reemplaza el contenido de
//! la isla por el árbol que construye. El HTML del servidor sigue cumpliendo su
//! función —primer pintado inmediato, contenido indexable, funciona sin JS—,
//! pero los nodos que ya existían no se reutilizan. La hidratación de verdad
//! (adoptar los nodos existentes en vez de reconstruirlos) exige que el
//! runtime pueda recorrer un árbol ya montado emparejándolo con el orden de
//! construcción; está pendiente, y esto es honesto sobre lo que hace hoy.

use ascua_reactive::create_root;

use crate::backend::Backend;
use crate::dom::{Dom, Mount};
use crate::memory::{MemoryBackend, NodeRef};

/// Atributo que marca una isla y guarda su nombre.
pub const ISLAND_ATTR: &str = "data-ascua-island";
/// Atributo con los props serializados que el cliente recibirá.
pub const ISLAND_PROPS_ATTR: &str = "data-ascua-props";

/// Renderiza un árbol a HTML, sin navegador y sin WASM.
///
/// El scope reactivo se libera al terminar: en el servidor los efectos se
/// ejecutan una vez para producir el HTML y no se quedan vivos.
///
/// ```
/// use ascua_dom::{render_to_string, Dom, MemoryBackend};
/// use ascua_reactive::Signal;
///
/// let html = render_to_string(|dom| {
///     let titulo = Signal::new("Ascua");
///     let h1 = dom.element("h1");
///     let texto = dom.dynamic_text(move || titulo.get().to_string());
///     dom.append(&h1, &texto);
///     h1
/// });
///
/// assert_eq!(html, "<h1>Ascua</h1>");
/// ```
pub fn render_to_string(build: impl FnOnce(&Dom<MemoryBackend>) -> NodeRef) -> String {
    let dom = Dom::new(MemoryBackend::new());
    let (nodo, root) = create_root(|| build(&dom));
    let html = dom.backend().html(&nodo);
    root.dispose();
    html
}

/// Como [`render_to_string`], pero numerando los elementos de cada isla para
/// que el cliente pueda **hidratarlas** en vez de reconstruirlas.
///
/// Los números van en un atributo que la hidratación quita al adoptar cada
/// nodo, así que no sobreviven en el documento final. Ver
/// [`crate::hydrate_islands`].
pub fn render_to_string_hydratable(build: impl FnOnce(&Dom<MemoryBackend>) -> NodeRef) -> String {
    let dom = Dom::new(MemoryBackend::with_hydration_ids());
    let (nodo, root) = create_root(|| build(&dom));
    let html = dom.backend().html(&nodo);
    root.dispose();
    html
}

/// Envuelve contenido en una isla: el servidor lo renderiza y el cliente lo
/// activa.
///
/// `props` viaja como texto en un atributo. No hay serializador: el formato lo
/// elige quien usa la isla —un número, un JSON hecho a mano, lo que sea— y el
/// constructor del cliente lo interpreta. Así el framework no arrastra una
/// dependencia de serialización que no todo el mundo necesita.
pub fn island<B: Backend>(
    dom: &Dom<B>,
    nombre: &str,
    props: &str,
    build: impl FnOnce(&Dom<B>) -> B::Node,
) -> B::Node {
    let contenedor = dom.element("ascua-island");
    dom.set_attr(&contenedor, ISLAND_ATTR, nombre);
    if !props.is_empty() {
        dom.set_attr(&contenedor, ISLAND_PROPS_ATTR, props);
    }

    // A partir de aquí la numeración de hidratación empieza de cero: el
    // cliente construirá exactamente este contenido y nada de lo que hay
    // fuera de la isla.
    dom.backend().begin_hydration_scope();
    let contenido = build(dom);
    dom.backend().end_hydration_scope();

    dom.append(&contenedor, &contenido);
    contenedor
}

/// Constructor del contenido de una isla en el cliente: recibe los props tal
/// como los dejó el servidor.
pub type IslandBuilder<B> = Box<dyn Fn(&Dom<B>, &str) -> <B as Backend>::Node>;

/// Activa en el cliente todas las islas presentes en el documento.
///
/// Devuelve un [`Mount`] por isla montada: conservarlos mantiene las islas
/// vivas, y soltarlos con `unmount` las apaga.
///
/// Las islas cuyo nombre no esté registrado se dejan intactas, que es lo que
/// permite desplegar el servidor y el cliente por separado sin que la página
/// se rompa.
pub fn mount_islands<B: Backend>(
    dom: &Dom<B>,
    constructores: &[(&str, IslandBuilder<B>)],
) -> Vec<Mount<B>> {
    let mut montajes = Vec::new();

    for contenedor in dom.backend().query_all(&format!("[{ISLAND_ATTR}]")) {
        let Some(nombre) = dom.backend().attribute(&contenedor, ISLAND_ATTR) else {
            continue;
        };
        let Some((_, constructor)) = constructores.iter().find(|(n, _)| *n == nombre) else {
            continue;
        };
        let props = dom
            .backend()
            .attribute(&contenedor, ISLAND_PROPS_ATTR)
            .unwrap_or_default();

        // Fuera el HTML del servidor: lo sustituye el árbol reactivo.
        for hijo in dom.backend().children(&contenedor) {
            dom.remove(&contenedor, &hijo);
        }

        montajes.push(dom.mount(&contenedor, |dom| constructor(dom, &props)));
    }

    montajes
}
