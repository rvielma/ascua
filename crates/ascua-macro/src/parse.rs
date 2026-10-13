//! Parser del template.
//!
//! Escrito a mano sobre el lexer de Rust (`syn`), sin gramática generada: el
//! template es lo bastante pequeño como para leerse entero, que es el criterio
//! del proyecto.

use syn::braced;
use syn::ext::IdentExt;
use syn::parse::{Parse, ParseStream};
use syn::{Expr, Ident, LitStr, Token};

use crate::ast::{Attribute, AttributeValue, Component, Element, For, Node, Show, View};
use crate::mensajes::{self, msg};

impl Parse for View {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let dom: Expr = input.parse()?;
        input.parse::<Token![,]>()?;
        let root = input.parse::<Node>()?;
        if !input.is_empty() {
            return Err(input.error(msg!(
                "view! admite un único elemento raíz; envuelve el contenido en un elemento",
                "view! takes a single root element; wrap the content in an element",
            )));
        }
        match &root {
            Node::Show(_) | Node::For(_) => Err(input.error(msg!(
                "<Show> y <For> necesitan un elemento padre donde insertarse; \
                 envuélvelos en un elemento",
                "<Show> and <For> need a parent element to insert into; \
                 wrap them in an element",
            ))),
            _ => Ok(View { dom, root }),
        }
    }
}

impl Parse for Node {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        if input.peek(Token![<]) {
            return match peek_tag(input) {
                Some(tag) if tag == "Show" => Ok(Node::Show(Box::new(input.parse()?))),
                Some(tag) if tag == "For" => Ok(Node::For(Box::new(input.parse()?))),
                Some(tag) if tag == "style" => Ok(Node::Style(parse_style(input)?)),
                Some(tag) if empieza_en_mayuscula(&tag) => {
                    Ok(Node::Component(Box::new(input.parse()?)))
                }
                _ => Ok(Node::Element(Box::new(input.parse()?))),
            };
        }
        if input.peek(LitStr) {
            return Ok(Node::Text(input.parse()?));
        }
        if input.peek(syn::token::Brace) {
            let expr = parse_braced_expr(input)?;
            return Ok(match expr {
                Expr::Closure(closure) => Node::Dynamic(closure),
                other => Node::Static(other),
            });
        }
        Err(input.error(msg!(
            "se esperaba un elemento <tag>, un texto \"literal\" o una expresión {{ }}",
            "expected an element <tag>, a \"literal\" text or an expression {{ }}",
        )))
    }
}

fn empieza_en_mayuscula(tag: &str) -> bool {
    tag.chars().next().is_some_and(char::is_uppercase)
}

/// Mira el nombre del tag sin consumir nada, para decidir qué forma parsear.
fn peek_tag(input: ParseStream) -> Option<String> {
    let fork = input.fork();
    fork.parse::<Token![<]>().ok()?;
    fork.parse::<Ident>().ok().map(|ident| ident.to_string())
}

impl Parse for Element {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        input.parse::<Token![<]>()?;
        let tag = parse_name(input)?;

        let mut attributes = Vec::new();
        while !input.peek(Token![>]) && !input.peek(Token![/]) {
            attributes.push(input.parse::<Attribute>()?);
        }

        // <tag/> sin hijos.
        if input.peek(Token![/]) {
            input.parse::<Token![/]>()?;
            input.parse::<Token![>]>()?;
            return Ok(Element {
                tag,
                attributes,
                children: Vec::new(),
            });
        }

        input.parse::<Token![>]>()?;
        let children = parse_children(input, &tag)?;
        parse_closing_tag(input, &tag)?;

        Ok(Element {
            tag,
            attributes,
            children,
        })
    }
}

impl Parse for Show {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        input.parse::<Token![<]>()?;
        let tag = parse_name(input)?;

        let mut when: Option<Expr> = None;
        let mut fallback: Option<Box<Node>> = None;

        while !input.peek(Token![>]) {
            let name = parse_name(input)?;
            input.parse::<Token![=]>()?;
            match name.as_str() {
                "when" => when = Some(parse_braced_expr(input)?),
                "fallback" => {
                    let content;
                    braced!(content in input);
                    fallback = Some(Box::new(content.parse::<Node>()?));
                }
                otro => {
                    return Err(input.error(msg!(
                        "<Show> solo acepta `when` y `fallback`, no `{otro}`",
                        "<Show> only takes `when` and `fallback`, not `{otro}`",
                    )))
                }
            }
        }
        input.parse::<Token![>]>()?;

        let when = when.ok_or_else(|| {
            input.error(msg!(
                "<Show> necesita `when={{...}}`, una closure que devuelva bool",
                "<Show> needs `when={{...}}`, a closure that returns bool",
            ))
        })?;

        let mut children = parse_children(input, &tag)?;
        parse_closing_tag(input, &tag)?;

        if children.len() != 1 {
            return Err(input.error(msg!(
                "<Show> necesita exactamente un hijo (tiene {}); envuélvelos en un elemento",
                "<Show> needs exactly one child (it has {}); wrap them in an element",
                children.len()
            )));
        }

        Ok(Show {
            when,
            child: Box::new(children.remove(0)),
            fallback,
        })
    }
}

impl Parse for For {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        input.parse::<Token![<]>()?;
        parse_name(input)?;

        let mut each: Option<Expr> = None;
        let mut key: Option<Expr> = None;
        let mut render: Option<Expr> = None;

        while !input.peek(Token![/]) && !input.peek(Token![>]) {
            let name = parse_name(input)?;
            input.parse::<Token![=]>()?;
            let value = parse_braced_expr(input)?;
            match name.as_str() {
                "each" => each = Some(value),
                "key" => key = Some(value),
                "render" => render = Some(value),
                otro => {
                    return Err(input.error(msg!(
                        "<For> solo acepta `each`, `key` y `render`, no `{otro}`",
                        "<For> only takes `each`, `key` and `render`, not `{otro}`",
                    )))
                }
            }
        }

        input.parse::<Token![/]>()?;
        input.parse::<Token![>]>()?;

        let falta = |que: &str| {
            syn::Error::new(
                proc_macro2::Span::call_site(),
                msg!(
                    "<For> necesita `{que}={{...}}`",
                    "<For> needs `{que}={{...}}`"
                ),
            )
        };

        Ok(For {
            each: each.ok_or_else(|| falta("each"))?,
            key: key.ok_or_else(|| falta("key"))?,
            render: render.ok_or_else(|| falta("render"))?,
        })
    }
}

impl Parse for Component {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        input.parse::<Token![<]>()?;
        let name: Ident = input.parse()?;

        let mut props = Vec::new();
        while !input.peek(Token![/]) && !input.peek(Token![>]) {
            let prop: Ident = input.parse()?;
            input.parse::<Token![=]>()?;

            // Un literal de texto se convierte con `Into`, para que
            // `titulo="Hola"` funcione tanto si el prop es `String` como `&str`.
            let value = if input.peek(LitStr) {
                let literal: LitStr = input.parse()?;
                syn::parse_quote!(::std::convert::Into::into(#literal))
            } else {
                parse_braced_expr(input)?
            };
            props.push((prop, value));
        }

        // <Tarjeta>hijos</Tarjeta>: los hijos llegan como prop `children`.
        if input.peek(Token![>]) {
            input.parse::<Token![>]>()?;
            let tag = name.to_string();
            let children = parse_children(input, &tag)?;
            parse_closing_tag(input, &tag)?;
            return Ok(Component {
                name,
                props,
                children,
            });
        }

        input.parse::<Token![/]>()?;
        input.parse::<Token![>]>()?;
        Ok(Component {
            name,
            props,
            children: Vec::new(),
        })
    }
}

/// Lo que `bind:` sabe atar, como en el compilador de `.ascua`: `value`
/// (un `Signal<String>`, escucha `input`) y `checked` (un `Signal<bool>`,
/// escucha `change`).
const ENLAZABLES: &[&str] = &["value", "checked"];

impl Parse for Attribute {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let name = parse_name(input)?;

        // on:click={...}, prop:value={...}, bind:value={...}, class:…, style:…
        if input.peek(Token![:]) {
            input.parse::<Token![:]>()?;
            // Las variables de CSS empiezan por `--`: `style:--ancho={…}`.
            let event = if name == "style" && input.peek(Token![-]) {
                input.parse::<Token![-]>()?;
                input.parse::<Token![-]>()?;
                format!("--{}", parse_name(input)?)
            } else {
                parse_name(input)?
            };
            input.parse::<Token![=]>()?;
            let value = parse_braced_expr(input)?;
            return match name.as_str() {
                "on" => Ok(Attribute {
                    name: format!("on:{event}"),
                    value: AttributeValue::Event {
                        event,
                        handler: value,
                    },
                }),
                "prop" => Ok(Attribute {
                    name: format!("prop:{event}"),
                    value: AttributeValue::Prop { prop: event, value },
                }),
                "class" => Ok(Attribute {
                    name: format!("class:{event}"),
                    value: AttributeValue::Class {
                        class: event,
                        on: value,
                    },
                }),
                "style" => Ok(Attribute {
                    name: format!("style:{event}"),
                    value: AttributeValue::Style {
                        property: event,
                        value,
                    },
                }),
                "bind" if ENLAZABLES.contains(&event.as_str()) => Ok(Attribute {
                    name: format!("bind:{event}"),
                    value: AttributeValue::Bind {
                        prop: event,
                        signal: value,
                    },
                }),
                "bind" => Err(syn::Error::new(
                    input.span(),
                    msg!(
                        "`bind:{event}` no existe; se puede atar {}",
                        "`bind:{event}` does not exist; you can bind {}",
                        ENLAZABLES
                            .iter()
                            .map(|e| format!("`{e}`"))
                            .collect::<Vec<_>>()
                            .join(if mensajes::ingles() { " and " } else { " y " })
                    ),
                )),
                _ => Err(syn::Error::new(
                    input.span(),
                    msg!(
                        "prefijo de atributo desconocido: `{name}:`; \
                         los soportados son `on:`, `prop:`, `bind:`, `class:` y `style:`",
                        "unknown attribute prefix: `{name}:`; \
                         the supported ones are `on:`, `prop:`, `bind:`, `class:` and `style:`"
                    ),
                )),
            };
        }

        input.parse::<Token![=]>()?;

        if name == "ref" && input.peek(LitStr) {
            return Err(input.error(msg!(
                "`ref` recibe una referencia, no un texto: \
                 `let campo = ElementRef::new();` y `ref={{campo}}`",
                "`ref` takes a reference, not a text: \
                 `let field = ElementRef::new();` and `ref={{field}}`",
            )));
        }
        if input.peek(LitStr) {
            return Ok(Attribute {
                name,
                value: AttributeValue::Literal(input.parse()?),
            });
        }

        let expr = parse_braced_expr(input)?;
        if name == "ref" {
            return Ok(Attribute {
                name,
                value: AttributeValue::Ref(expr),
            });
        }
        let value = match expr {
            Expr::Closure(closure) => AttributeValue::Dynamic(closure),
            other => AttributeValue::Static(other),
        };
        Ok(Attribute { name, value })
    }
}

/// `<style>"..."</style>`. El CSS va como literal de cadena porque el lexer de
/// Rust no sabe leer CSS crudo: `#id`, `50%` o `.5rem` no son tokens válidos.
/// Con un literal, además, se puede usar `r#"..."#` sin escapar nada.
fn parse_style(input: ParseStream) -> syn::Result<LitStr> {
    input.parse::<Token![<]>()?;
    parse_name(input)?;
    input.parse::<Token![>]>()?;

    let css: LitStr = input.parse().map_err(|_| {
        input.error(msg!(
            "el contenido de <style> debe ser un literal de cadena: \
             <style>r#\"...css...\"#</style>",
            "the content of <style> must be a string literal: \
             <style>r#\"...css...\"#</style>",
        ))
    })?;

    parse_closing_tag(input, "style")?;
    Ok(css)
}

fn parse_children(input: ParseStream, tag: &str) -> syn::Result<Vec<Node>> {
    let mut children = Vec::new();
    loop {
        if input.peek(Token![<]) && input.peek2(Token![/]) {
            return Ok(children);
        }
        if input.is_empty() {
            return Err(input.error(msg!(
                "falta la etiqueta de cierre </{tag}>",
                "missing closing tag </{tag}>"
            )));
        }
        children.push(input.parse::<Node>()?);
    }
}

fn parse_closing_tag(input: ParseStream, tag: &str) -> syn::Result<()> {
    input.parse::<Token![<]>()?;
    input.parse::<Token![/]>()?;
    let closing = parse_name(input)?;
    input.parse::<Token![>]>()?;
    if closing != tag {
        return Err(syn::Error::new(
            input.span(),
            msg!(
                "</{closing}> no cierra <{tag}>",
                "</{closing}> does not close <{tag}>"
            ),
        ));
    }
    Ok(())
}

fn parse_braced_expr(input: ParseStream) -> syn::Result<Expr> {
    let content;
    braced!(content in input);
    let expr: Expr = content.parse()?;
    if !content.is_empty() {
        return Err(content.error(msg!(
            "se esperaba una sola expresión dentro de {{ }}",
            "expected a single expression inside {{ }}"
        )));
    }
    Ok(expr)
}

/// Nombres con guiones (`data-id`, `aria-label`). El lexer de Rust parte
/// `data-id` en tres tokens, así que hay que recomponerlo.
///
/// Se aceptan palabras reservadas de Rust (`type`, `for`, `loop`): en HTML son
/// nombres de atributo corrientes. `r#type` también vale y queda como `type`.
fn parse_name(input: ParseStream) -> syn::Result<String> {
    let mut name = Ident::parse_any(input)?.unraw().to_string();
    while input.peek(Token![-]) {
        input.parse::<Token![-]>()?;
        name.push('-');
        name.push_str(&Ident::parse_any(input)?.unraw().to_string());
    }
    Ok(name)
}
