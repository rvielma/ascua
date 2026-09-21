//! Compilador de templates de Ascua.
//!
//! Expone una sola macro, [`view!`], que traduce un template a las llamadas de
//! DOM que lo construyen y a un efecto reactivo por cada punto dinámico.
//!
//! El código generado usa rutas `::ascua::*`, así que se usa a través del crate
//! `ascua`, no directamente.

mod ast;
mod codegen;
mod component;
mod css;
mod parse;

use proc_macro::TokenStream;
use syn::{parse_macro_input, ItemFn};

use crate::ast::View;

/// Construye un árbol de DOM reactivo.
///
/// ```ignore
/// view! { dom,
///     <div class="contador">
///         <button on:click={move |_| count.update(|c| *c += 1)}>"+1"</button>
///         <span class={move || if count.get() > 9 { "alto" } else { "bajo" }}>
///             {move || count.get()}
///         </span>
///     </div>
/// }
/// ```
///
/// # La regla única
///
/// **Una closure es reactiva; cualquier otra expresión se evalúa una vez.**
///
/// - `{count.get()}` inserta el valor actual y no vuelve a mirarlo.
/// - `{move || count.get()}` crea un efecto: ese nodo sigue al signal.
///
/// La distinción es sintáctica a propósito: mirando el template se sabe qué
/// puede cambiar y qué no, sin conocer los tipos ni confiar en ninguna regla
/// implícita.
///
/// # Forma
///
/// - Primer argumento: el [`ascua::Dom`](../ascua/struct.Dom.html) sobre el que
///   construir, seguido de coma.
/// - Un único elemento raíz.
/// - Atributos: `name="literal"`, `name={expr}`, `name={move || ...}`.
///   Un atributo dinámico que devuelve `None` se quita del elemento.
/// - Eventos: `on:click={handler}`.
/// - Hijos: elementos, `"texto"`, `{expr}` o `{move || expr}`.
#[proc_macro]
pub fn view(input: TokenStream) -> TokenStream {
    let view = parse_macro_input!(input as View);
    codegen::generate(&view).into()
}

/// Declara un componente.
///
/// Convierte los parámetros de la función (después del `Dom`) en un struct de
/// props, para que `view!` pueda invocarla con atributos con nombre:
///
/// ```ignore
/// #[component]
/// fn Tarjeta<B: Backend>(dom: &Dom<B>, titulo: String, activa: bool) -> B::Node {
///     view! { dom, <div class="tarjeta">{titulo}</div> }
/// }
///
/// // en otro template:
/// view! { dom, <div><Tarjeta titulo="Hola" activa={true}/></div> }
/// ```
///
/// Genera un struct `TarjetaProps` con un campo por prop. El componente sigue
/// siendo una función normal, invocable a mano como
/// `Tarjeta(dom, TarjetaProps { .. })`.
///
/// Los props se pasan por valor y no son reactivos por sí mismos: para que un
/// prop cambie con el tiempo, pásale un `Signal` o una closure.
#[proc_macro_attribute]
pub fn component(_atributos: TokenStream, item: TokenStream) -> TokenStream {
    let function = parse_macro_input!(item as ItemFn);
    match component::expand(&function) {
        Ok(tokens) => tokens.into(),
        Err(error) => error.to_compile_error().into(),
    }
}
