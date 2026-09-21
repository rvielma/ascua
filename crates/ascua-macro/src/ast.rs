//! AST del template.
//!
//! Es deliberadamente pequeño. Todo lo que el parser acepta cabe en estas
//! cuatro formas, y todo lo que el codegen emite son llamadas al trait
//! `Backend`. Si algo no se puede expresar aquí, no compila: no hay puerta
//! trasera dinámica.

use syn::{Expr, ExprClosure, Ident, LitStr};

/// Un nodo del template.
pub enum Node {
    /// Las variantes compuestas van boxeadas: `Node` se mueve mucho durante el
    /// parseo y no interesa que mida lo que la mayor de ellas.
    Element(Box<Element>),
    /// `"texto literal"`
    Text(LitStr),
    /// `{expresión}` — se evalúa una vez, al construir.
    Static(Expr),
    /// `{move || expresión}` — se reevalúa cuando cambian los signals que lee.
    Dynamic(ExprClosure),
    /// `<Show when={...}>` — contenido que aparece y desaparece.
    Show(Box<Show>),
    /// `<For each={...} key={...} render={...}/>` — lista con clave.
    For(Box<For>),
    /// `<Tarjeta titulo="x"/>` — llamada a una función marcada con
    /// `#[component]`.
    Component(Box<Component>),
    /// `<style>"..."</style>` — se extrae en tiempo de compilación y no
    /// produce ningún nodo.
    Style(LitStr),
}

/// Uso de un componente. Los tags que empiezan por mayúscula son componentes;
/// los que empiezan por minúscula son elementos HTML. Es la misma convención
/// que usa Rust para distinguir tipos de valores, aplicada al template.
pub struct Component {
    pub name: Ident,
    pub props: Vec<(Ident, Expr)>,
    /// Hijos entre `<Tarjeta>` y `</Tarjeta>`. Llegan al componente como un
    /// prop `children`.
    pub children: Vec<Node>,
}

/// `<Show when={cond} fallback={<p>"no"</p>}> <p>"sí"</p> </Show>`
///
/// El `fallback` contiene template, no una expresión de Rust: es la rama
/// alternativa del mismo `if`, y se lee mejor escrita como marcado.
pub struct Show {
    pub when: Expr,
    pub child: Box<Node>,
    pub fallback: Option<Box<Node>>,
}

/// `<For each={items} key={|i| i.id} render={|dom, i| ...}/>`
pub struct For {
    pub each: Expr,
    pub key: Expr,
    pub render: Expr,
}

pub struct Element {
    pub tag: String,
    pub attributes: Vec<Attribute>,
    pub children: Vec<Node>,
}

pub struct Attribute {
    pub name: String,
    pub value: AttributeValue,
}

pub enum AttributeValue {
    /// `class="caja"`
    Literal(LitStr),
    /// `id={expr}` — se aplica una vez.
    Static(Expr),
    /// `class={move || ...}` — se reevalúa; `None` quita el atributo.
    Dynamic(ExprClosure),
    /// `on:click={move |ev| ...}`
    Event { event: String, handler: Expr },
}

/// Entrada completa de la macro: `view! { dom, <div/> }`.
pub struct View {
    pub dom: Expr,
    pub root: Node,
}

/// Nombre de variable generada para el nodo número `n`.
pub fn node_ident(n: usize) -> Ident {
    Ident::new(&format!("__ascua_n{n}"), proc_macro2::Span::call_site())
}
