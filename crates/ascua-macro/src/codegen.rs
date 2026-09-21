//! Codegen: del AST a operaciones de DOM.
//!
//! No se genera ninguna estructura intermedia en tiempo de ejecución: no hay
//! árbol de descripción, no hay objetos de "elemento virtual". El template se
//! convierte en la secuencia literal de llamadas que construyen el árbol, y en
//! un efecto por cada punto que lee un signal.
//!
//! Así, `<p>{move || count.get()}</p>` produce exactamente:
//!
//! ```text
//! let n0 = dom.element("p");
//! let n1 = dom.dynamic_text(move || count.get().to_string());
//! dom.append(&n0, &n1);
//! ```
//!
//! El efecto dentro de `dynamic_text` captura `n1`. Por eso una actualización
//! no necesita buscar nada: ya sabe su destino.

use proc_macro2::{Ident, TokenStream};
use quote::quote;

use crate::ast::{node_ident, Attribute, AttributeValue, Component, For, Node, Show, View};
use crate::css;

/// Estado del recorrido: el contador de variables y, si el template trae
/// `<style>`, el atributo de scope que hay que poner en cada elemento.
struct Generator {
    counter: usize,
    scope_attr: Option<String>,
}

pub fn generate(view: &View) -> TokenStream {
    let mut css_bruto = String::new();
    recolectar_css(&view.root, &mut css_bruto);

    let mut scope_attr = None;
    if !css_bruto.trim().is_empty() {
        let scope = css::scope_id(&css_bruto);
        let atributo = format!("data-ascua-{scope}");
        let css = css::scope_css(&css_bruto, &atributo);
        if let Err(error) = css::escribir(&scope, &css) {
            let mensaje = format!(
                "Ascua no pudo extraer el CSS de este template: {error}. \
                 Define ASCUA_CSS_DIR para elegir otro directorio de salida."
            );
            return quote! { ::std::compile_error!(#mensaje) };
        }
        scope_attr = Some(atributo);
    }

    let mut generator = Generator {
        counter: 0,
        scope_attr,
    };
    let mut statements = Vec::new();
    let root = generator.node(&view.root, &mut statements);
    let dom = &view.dom;

    quote! {
        {
            let __ascua_dom = &#dom;
            #(#statements)*
            #root
        }
    }
}

/// Junta el contenido de todos los `<style>` del template. Un `view!` anidado
/// dentro de una expresión (el `render` de un `<For>`, por ejemplo) tiene su
/// propio scope: aquí solo se ve lo que es marcado de *este* template.
fn recolectar_css(node: &Node, salida: &mut String) {
    match node {
        Node::Style(css) => {
            salida.push_str(&css.value());
            salida.push('\n');
        }
        Node::Element(element) => {
            for child in &element.children {
                recolectar_css(child, salida);
            }
        }
        Node::Show(show) => {
            recolectar_css(&show.child, salida);
            if let Some(fallback) = &show.fallback {
                recolectar_css(fallback, salida);
            }
        }
        Node::Component(component) => {
            for child in &component.children {
                recolectar_css(child, salida);
            }
        }
        Node::Text(_) | Node::Static(_) | Node::Dynamic(_) | Node::For(_) => {}
    }
}

impl Generator {
    fn next_ident(&mut self) -> Ident {
        let id = node_ident(self.counter);
        self.counter += 1;
        id
    }

    /// Emite un nodo que existe por sí mismo y devuelve su variable.
    ///
    /// `Show`, `For` y `style` no pasan por aquí: no producen un nodo propio.
    /// De eso se encarga [`Generator::child`].
    fn node(&mut self, node: &Node, statements: &mut Vec<TokenStream>) -> Ident {
        let id = self.next_ident();

        match node {
            Node::Text(literal) => {
                statements.push(quote! { let #id = __ascua_dom.text(#literal); });
            }
            Node::Static(expr) => {
                statements.push(quote! {
                    let #id = __ascua_dom.text(&::std::string::ToString::to_string(&(#expr)));
                });
            }
            Node::Dynamic(closure) => {
                statements.push(quote! {
                    let #id = __ascua_dom.dynamic_text({
                        let mut __ascua_f = #closure;
                        move || ::std::string::ToString::to_string(&__ascua_f())
                    });
                });
            }
            Node::Element(element) => {
                let tag = &element.tag;
                statements.push(quote! { let #id = __ascua_dom.element(#tag); });

                if let Some(atributo) = &self.scope_attr {
                    statements.push(quote! { __ascua_dom.set_attr(&#id, #atributo, ""); });
                }
                for attribute in &element.attributes {
                    statements.push(generate_attribute(&id, attribute));
                }
                for child in &element.children {
                    self.child(&id, child, statements);
                }
            }
            Node::Component(component) => {
                let call = self.component(component);
                statements.push(quote! { let #id = #call; });
            }
            // El parser ya rechaza estas formas sin padre; esto solo mantiene
            // el match exhaustivo.
            Node::Show(_) | Node::For(_) | Node::Style(_) => {
                statements.push(quote! {
                    let #id = ::std::compile_error!(
                        "<Show>, <For> y <style> necesitan un elemento donde insertarse. \
                         Si es hijo directo de un componente o la raíz del view!, \
                         envuélvelo en un elemento: <div><Show ...>...</Show></div>"
                    );
                });
            }
        }

        id
    }

    /// Emite un hijo dentro de `parent`, incluida su inserción.
    fn child(&mut self, parent: &Ident, node: &Node, statements: &mut Vec<TokenStream>) {
        match node {
            Node::Show(show) => {
                let tokens = self.show(parent, show);
                statements.push(tokens);
            }
            Node::For(each) => statements.push(generate_for(parent, each)),
            // El CSS ya se extrajo: aquí no queda nada que emitir.
            Node::Style(_) => {}
            otro => {
                let child = self.node(otro, statements);
                statements.push(quote! { __ascua_dom.append(&#parent, &#child); });
            }
        }
    }

    /// Un subárbol completo como expresión, para usarlo dentro de un closure
    /// de render. Reusa `__ascua_dom`, que ahí es el parámetro del closure.
    fn subtree(&mut self, node: &Node) -> TokenStream {
        let mut statements = Vec::new();
        let root = self.node(node, &mut statements);
        quote! {
            {
                #(#statements)*
                #root
            }
        }
    }

    fn show(&mut self, parent: &Ident, show: &Show) -> TokenStream {
        let when = &show.when;
        let child = self.subtree(&show.child);
        let fallback = match &show.fallback {
            Some(node) => {
                let subtree = self.subtree(node);
                quote! { ::std::option::Option::Some(#subtree) }
            }
            None => quote! { ::std::option::Option::None },
        };

        quote! {
            __ascua_dom.dynamic_child(
                &#parent,
                #when,
                move |__ascua_dom, __ascua_cond| {
                    if *__ascua_cond {
                        ::std::option::Option::Some(#child)
                    } else {
                        #fallback
                    }
                },
            );
        }
    }

    /// `<Tarjeta titulo="x"/>` se convierte en la llamada corriente
    /// `Tarjeta(dom, TarjetaProps { titulo: "x".into() })`. No hay registro de
    /// componentes ni despacho dinámico: es una función, y el compilador de
    /// Rust comprueba sus props como comprobaría cualquier otro struct.
    fn component(&mut self, component: &Component) -> TokenStream {
        let name = &component.name;
        let props_type = quote::format_ident!("{}Props", name);

        // Se construye con el builder y no con el struct literal: así los
        // props con `#[prop(default)]` se pueden omitir, y olvidar uno
        // obligatorio sigue siendo un error de compilación.
        let mut campos: Vec<TokenStream> = component
            .props
            .iter()
            .map(|(campo, valor)| quote! { .#campo(#valor) })
            .collect();

        // Los hijos no se construyen aquí: se empaquetan como una receta que el
        // componente ejecuta donde quiera dentro de su propio árbol. Como la
        // receta recibe el padre, los hijos pueden ser cualquier cosa del
        // template, incluidos <Show> y <For>.
        if !component.children.is_empty() {
            let padre = proc_macro2::Ident::new("__ascua_padre", proc_macro2::Span::call_site());
            let mut statements = Vec::new();
            for child in &component.children {
                self.child(&padre, child, &mut statements);
            }
            campos.push(quote! {
                .children(::ascua::Children::new(move |__ascua_dom, __ascua_destino| {
                    // El codegen trabaja con nodos por valor; clonar una
                    // referencia de nodo es solo copiar un identificador.
                    let #padre = ::std::clone::Clone::clone(__ascua_destino);
                    #(#statements)*
                }))
            });
        }

        quote! {
            #name(__ascua_dom, #props_type::builder() #(#campos)* .build())
        }
    }
}

fn generate_for(parent: &Ident, each: &For) -> TokenStream {
    let items = &each.each;
    let key = &each.key;
    let render = &each.render;
    quote! {
        ::ascua::keyed_list(__ascua_dom, &#parent, #items, #key, #render);
    }
}

fn generate_attribute(node: &Ident, attribute: &Attribute) -> TokenStream {
    let name = &attribute.name;
    match &attribute.value {
        AttributeValue::Literal(literal) => {
            quote! { __ascua_dom.set_attr(&#node, #name, #literal); }
        }
        AttributeValue::Static(expr) => quote! {
            if let ::std::option::Option::Some(__ascua_v) =
                ::ascua::IntoAttrValue::into_attr_value(#expr)
            {
                __ascua_dom.set_attr(&#node, #name, &__ascua_v);
            }
        },
        AttributeValue::Dynamic(closure) => quote! {
            __ascua_dom.bind_attr(&#node, #name, {
                let mut __ascua_f = #closure;
                move || ::ascua::IntoAttrValue::into_attr_value(__ascua_f())
            });
        },
        AttributeValue::Event { event, handler } => {
            quote! { __ascua_dom.on(&#node, #event, #handler); }
        }
    }
}
