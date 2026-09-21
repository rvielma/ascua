//! El atributo `#[component]`.
//!
//! Rust no tiene argumentos con nombre, así que un componente con varios props
//! necesita un struct. Escribirlo a mano es repetitivo y se desincroniza con la
//! firma, así que se genera a partir de ella.
//!
//! ```text
//! #[component]                          struct TarjetaProps { titulo: String, abierta: bool }
//! fn Tarjeta<B: Backend>(          =>   struct TarjetaPropsBuilder<...> { ... }
//!     dom: &Dom<B>,                     fn Tarjeta<B: Backend>(
//!     titulo: String,                       dom: &Dom<B>,
//!     #[prop(default)] abierta: bool,       props: TarjetaProps,
//! ) -> B::Node { ... }                  ) -> B::Node {
//!                                           let TarjetaProps { titulo, abierta } = props;
//!                                           ...
//!                                       }
//! ```
//!
//! El componente sigue siendo una función normal, invocable a mano con el
//! struct de props. El builder existe para que `view!` pueda **omitir** los
//! props que tienen valor por defecto.
//!
//! # Por qué un builder con const generics
//!
//! Porque omitir un prop opcional tiene que compilar, y omitir uno obligatorio
//! **no**. Cada prop es un parámetro const booleano del builder que pasa a
//! `true` cuando se establece; los opcionales arrancan ya en `true`. El método
//! `build` solo existe cuando todos valen `true`, así que olvidar un prop
//! obligatorio es un error de compilación, no un fallo en ejecución.

use proc_macro2::{Ident, TokenStream};
use quote::{format_ident, quote};
use syn::{Expr, FnArg, GenericParam, Generics, ItemFn, Pat, Token, Type};

/// Un prop: su nombre, su tipo y qué hacer si no se pasa.
struct Campo {
    nombre: Ident,
    tipo: Type,
    /// `None` si es obligatorio. `Some(None)` para `Default::default()`, y
    /// `Some(Some(expr))` para un valor explícito.
    default: Option<Option<Expr>>,
}

impl Campo {
    fn es_opcional(&self) -> bool {
        self.default.is_some()
    }

    fn valor_inicial(&self) -> TokenStream {
        match &self.default {
            None => quote! { ::std::option::Option::None },
            Some(None) => {
                quote! { ::std::option::Option::Some(::std::default::Default::default()) }
            }
            Some(Some(expr)) => quote! { ::std::option::Option::Some(#expr) },
        }
    }
}

pub fn expand(function: &ItemFn) -> syn::Result<TokenStream> {
    let nombre = &function.sig.ident;
    let props_type = format_ident!("{}Props", nombre);
    let builder_type = format_ident!("{}PropsBuilder", nombre);

    let mut argumentos = function.sig.inputs.iter();
    let dom_arg = argumentos.next().ok_or_else(|| {
        syn::Error::new_spanned(
            &function.sig,
            "un componente recibe el Dom como primer parámetro: `dom: &Dom<B>`",
        )
    })?;

    let campos = parsear_campos(argumentos)?;

    let visibilidad = &function.vis;
    let generics = &function.sig.generics;
    let where_clause = &function.sig.generics.where_clause;
    let salida = &function.sig.output;
    let cuerpo = &function.block;
    let atributos = &function.attrs;

    // El struct de props solo lleva los parámetros genéricos que sus campos
    // mencionan: `Children<B>` obliga a que sea genérico, `titulo: String` no.
    let tipos_genericos = generics_usados(generics, &campos);
    let tipos: Vec<&GenericParam> = tipos_genericos.params.iter().collect();
    let nombres_tipos: Vec<TokenStream> = tipos_genericos
        .params
        .iter()
        .map(|param| match param {
            GenericParam::Type(t) => {
                let ident = &t.ident;
                quote! { #ident }
            }
            otro => quote! { #otro },
        })
        .collect();

    let declaraciones: Vec<TokenStream> = campos
        .iter()
        .map(|campo| {
            let nombre = &campo.nombre;
            let tipo = &campo.tipo;
            quote! { pub #nombre: #tipo }
        })
        .collect();
    let nombres: Vec<&Ident> = campos.iter().map(|campo| &campo.nombre).collect();

    let struct_generics = envolver(&nombres_tipos);
    let builder = generar_builder(
        visibilidad,
        &props_type,
        &builder_type,
        &campos,
        &tipos,
        &nombres_tipos,
    );

    Ok(quote! {
        /// Props generadas por `#[component]`.
        #visibilidad struct #props_type #tipos_genericos {
            #(#declaraciones),*
        }

        #builder

        #(#atributos)*
        #[allow(non_snake_case)]
        #visibilidad fn #nombre #generics (#dom_arg, props: #props_type #struct_generics) #salida
        #where_clause
        {
            let #props_type { #(#nombres),* } = props;
            #cuerpo
        }
    })
}

fn parsear_campos<'a>(argumentos: impl Iterator<Item = &'a FnArg>) -> syn::Result<Vec<Campo>> {
    let mut campos = Vec::new();

    for argumento in argumentos {
        let FnArg::Typed(typed) = argumento else {
            return Err(syn::Error::new_spanned(
                argumento,
                "un componente no puede recibir `self`",
            ));
        };
        let Pat::Ident(ident) = typed.pat.as_ref() else {
            return Err(syn::Error::new_spanned(
                &typed.pat,
                "cada prop debe ser un nombre simple, no un patrón",
            ));
        };

        let mut default = None;
        for atributo in &typed.attrs {
            if !atributo.path().is_ident("prop") {
                return Err(syn::Error::new_spanned(
                    atributo,
                    "el único atributo admitido en un prop es `#[prop(...)]`",
                ));
            }
            atributo.parse_nested_meta(|meta| {
                if !meta.path.is_ident("default") {
                    return Err(meta
                        .error("`#[prop(...)]` solo admite `default` o `default = <expresión>`"));
                }
                default = Some(if meta.input.peek(Token![=]) {
                    Some(meta.value()?.parse::<Expr>()?)
                } else {
                    None
                });
                Ok(())
            })?;
        }

        campos.push(Campo {
            nombre: ident.ident.clone(),
            tipo: (*typed.ty).clone(),
            default,
        });
    }

    Ok(campos)
}

fn generar_builder(
    visibilidad: &syn::Visibility,
    props_type: &Ident,
    builder_type: &Ident,
    campos: &[Campo],
    tipos: &[&GenericParam],
    nombres_tipos: &[TokenStream],
) -> TokenStream {
    let consts: Vec<Ident> = (0..campos.len())
        .map(|indice| format_ident!("__ASCUA_P{indice}"))
        .collect();
    let declaracion_consts: Vec<TokenStream> = consts
        .iter()
        .map(|nombre| quote! { const #nombre: bool })
        .collect();

    let campos_builder: Vec<TokenStream> = campos
        .iter()
        .map(|campo| {
            let nombre = &campo.nombre;
            let tipo = &campo.tipo;
            quote! { #nombre: ::std::option::Option<#tipo> }
        })
        .collect();

    let estado_inicial: Vec<TokenStream> = campos
        .iter()
        .map(|campo| {
            if campo.es_opcional() {
                quote! { true }
            } else {
                quote! { false }
            }
        })
        .collect();
    let valores_iniciales: Vec<TokenStream> = campos
        .iter()
        .map(|campo| {
            let nombre = &campo.nombre;
            let valor = campo.valor_inicial();
            quote! { #nombre: #valor }
        })
        .collect();

    // La *declaración* del struct necesita los bounds (`B: Backend`), no solo
    // los nombres: sus campos los exigen.
    let declaraciones_tipos: Vec<TokenStream> = tipos.iter().map(|t| quote! { #t }).collect();
    let generics_struct = envolver(&[declaraciones_tipos, declaracion_consts.clone()].concat());
    let solo_tipos = envolver(nombres_tipos);
    let declaracion_tipos = envolver(&tipos.iter().map(|t| quote! { #t }).collect::<Vec<_>>());
    let todos_true: Vec<TokenStream> = campos.iter().map(|_| quote! { true }).collect();

    let contexto = Contexto {
        visibilidad,
        builder_type,
        campos,
        consts: &consts,
        nombres_tipos,
        tipos,
    };
    let setters: Vec<TokenStream> = campos
        .iter()
        .enumerate()
        .map(|(indice, campo)| generar_setter(&contexto, indice, campo))
        .collect();

    let nombres: Vec<&Ident> = campos.iter().map(|campo| &campo.nombre).collect();
    let generics_completos = envolver(&[nombres_tipos, &todos_true].concat());

    // `build` existe siempre, pero solo se puede llamar cuando este trait está
    // implementado, que es únicamente en el estado completo. Se hace así, y no
    // restringiendo el impl, para poder explicar el error en castellano en vez
    // de dejar un "no method named build" con un tipo lleno de booleanos.
    let trait_completo = format_ident!("{}Completos", builder_type);
    let obligatorios: Vec<String> = campos
        .iter()
        .filter(|campo| !campo.es_opcional())
        .map(|campo| campo.nombre.to_string())
        .collect();
    let mensaje = format!(
        "faltan props obligatorios: este componente necesita {}",
        if obligatorios.is_empty() {
            "ninguno".to_string()
        } else {
            obligatorios.join(", ")
        }
    );
    let etiqueta = "a esta llamada le falta algún prop sin `#[prop(default)]`";
    let declaracion_completa = envolver(
        &[
            tipos.iter().map(|t| quote! { #t }).collect::<Vec<_>>(),
            declaracion_consts.clone(),
        ]
        .concat(),
    );
    let generics_cualquiera =
        envolver(&[nombres_tipos.to_vec(), consts_como_tokens(&consts)].concat());

    quote! {
        /// Builder de props generado por `#[component]`.
        ///
        /// Cada prop es un parámetro const que pasa a `true` al establecerlo;
        /// los opcionales empiezan ya en `true`. `build` solo existe cuando
        /// todos valen `true`.
        #[allow(non_camel_case_types)]
        #visibilidad struct #builder_type #generics_struct {
            #(#campos_builder),*
        }

        impl #declaracion_tipos #props_type #solo_tipos {
            /// Empieza a construir los props. Los que tengan `#[prop(default)]`
            /// se pueden omitir.
            #[allow(clippy::new_without_default)]
            #visibilidad fn builder() -> #builder_type<#(#nombres_tipos,)* #(#estado_inicial),*> {
                #builder_type {
                    #(#valores_iniciales),*
                }
            }
        }

        #(#setters)*

        /// Marca los estados del builder en los que están todos los props
        /// obligatorios.
        #[diagnostic::on_unimplemented(message = #mensaje, label = #etiqueta)]
        #[allow(non_camel_case_types)]
        #visibilidad trait #trait_completo {}

        impl #declaracion_tipos #trait_completo for #builder_type #generics_completos {}

        impl #declaracion_completa #builder_type #generics_cualquiera {
            /// Construye los props. Solo se puede llamar cuando están todos los
            /// obligatorios.
            #visibilidad fn build(self) -> #props_type #solo_tipos
            where
                Self: #trait_completo,
            {
                #props_type {
                    #(#nombres: match self.#nombres {
                        ::std::option::Option::Some(valor) => valor,
                        // Inalcanzable: el tipo garantiza que está puesto.
                        ::std::option::Option::None => ::std::unreachable!(
                            "prop sin valor pese a estar marcado como establecido"
                        ),
                    }),*
                }
            }
        }
    }
}

/// Lo que necesita saber un setter para generarse: el resto de campos y los
/// genéricos del builder al que pertenece.
struct Contexto<'a> {
    visibilidad: &'a syn::Visibility,
    builder_type: &'a Ident,
    campos: &'a [Campo],
    consts: &'a [Ident],
    nombres_tipos: &'a [TokenStream],
    tipos: &'a [&'a GenericParam],
}

fn generar_setter(contexto: &Contexto, indice: usize, campo: &Campo) -> TokenStream {
    let Contexto {
        visibilidad,
        builder_type,
        campos,
        consts,
        nombres_tipos,
        tipos,
    } = contexto;
    let nombre = &campo.nombre;
    let tipo = &campo.tipo;

    // Un prop obligatorio solo se puede establecer una vez: su impl exige que
    // esté en `false`. Uno opcional se puede sobrescribir, así que su impl
    // deja el parámetro libre.
    let params_impl: Vec<TokenStream> = consts
        .iter()
        .enumerate()
        .filter(|(posicion, _)| campo.es_opcional() || *posicion != indice)
        .map(|(_, nombre)| quote! { const #nombre: bool })
        .collect();

    let entrada: Vec<TokenStream> = consts
        .iter()
        .enumerate()
        .map(|(posicion, const_nombre)| {
            if posicion == indice && !campo.es_opcional() {
                quote! { false }
            } else {
                quote! { #const_nombre }
            }
        })
        .collect();

    let salida: Vec<TokenStream> = consts
        .iter()
        .enumerate()
        .map(|(posicion, const_nombre)| {
            if posicion == indice {
                quote! { true }
            } else {
                quote! { #const_nombre }
            }
        })
        .collect();

    let asignaciones: Vec<TokenStream> = campos
        .iter()
        .enumerate()
        .map(|(posicion, otro)| {
            let otro_nombre = &otro.nombre;
            if posicion == indice {
                quote! { #otro_nombre: ::std::option::Option::Some(valor) }
            } else {
                quote! { #otro_nombre: self.#otro_nombre }
            }
        })
        .collect();

    let declaracion = envolver(
        &[
            tipos.iter().map(|t| quote! { #t }).collect::<Vec<_>>(),
            params_impl,
        ]
        .concat(),
    );
    let tipo_entrada = envolver(&[nombres_tipos.to_vec(), entrada].concat());
    let tipo_salida = envolver(&[nombres_tipos.to_vec(), salida].concat());

    quote! {
        impl #declaracion #builder_type #tipo_entrada {
            #[allow(clippy::missing_const_for_fn)]
            #visibilidad fn #nombre(self, valor: #tipo) -> #builder_type #tipo_salida {
                #builder_type {
                    #(#asignaciones),*
                }
            }
        }
    }
}

fn consts_como_tokens(consts: &[Ident]) -> Vec<TokenStream> {
    consts.iter().map(|nombre| quote! { #nombre }).collect()
}

/// `<a, b, c>`, o nada si la lista está vacía.
fn envolver(partes: &[TokenStream]) -> TokenStream {
    if partes.is_empty() {
        quote! {}
    } else {
        quote! { <#(#partes),*> }
    }
}

/// Subconjunto de los genéricos de la función que aparecen en los tipos de los
/// props. Se compara por nombre sobre los tokens del campo, que es suficiente
/// para los casos reales (`Children<B>`, `Signal<T>`).
fn generics_usados(generics: &Generics, campos: &[Campo]) -> Generics {
    let texto: String = campos
        .iter()
        .map(|campo| {
            let tipo = &campo.tipo;
            quote! { #tipo }.to_string()
        })
        .collect();

    let mut usados = generics.clone();
    usados.where_clause = None;
    usados.params = generics
        .params
        .iter()
        .filter(|param| match param {
            GenericParam::Type(tipo) => contiene_identificador(&texto, &tipo.ident.to_string()),
            GenericParam::Lifetime(_) | GenericParam::Const(_) => false,
        })
        .cloned()
        .collect();
    usados
}

/// `true` si `nombre` aparece en `texto` como identificador completo y no como
/// parte de otro más largo (`B` sí en `Children < B >`, no en `Backend`).
fn contiene_identificador(texto: &str, nombre: &str) -> bool {
    texto
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .any(|palabra| palabra == nombre)
}
