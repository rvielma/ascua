//! El contenido del sitio, escrito con Ascua.
//!
//! Este módulo es genérico sobre el backend, así que las mismas funciones
//! generan el HTML en el servidor y la interfaz viva en el navegador. Los
//! demos interactivos son islas: el texto del sitio se sirve como HTML y solo
//! esas regiones se activan.

use ascua::{component, view, Backend, Children, Dom};

use crate::demos::{DemoContador, DemoContadorProps, DemoLista, DemoListaProps};

pub const VERSION: &str = "0.1.0";

// ---------------------------------------------------------------------------
// Piezas reutilizables
// ---------------------------------------------------------------------------

/// Sección numerada, como en el resto de la familia.
#[component]
pub fn Seccion<B: Backend>(
    dom: &Dom<B>,
    numero: String,
    titulo: String,
    #[prop(default)] children: Children<B>,
) -> B::Node {
    let seccion = view! { dom,
        <section class="seccion">
            <h2>
                <span class="numero">{numero}</span>
                {titulo}
            </h2>
            <style>r#"
                .seccion { margin: 0 0 5rem; }
                h2 {
                    font-size: 1.5rem; margin: 0 0 1.5rem; font-weight: 600;
                    display: flex; align-items: baseline; gap: .75rem;
                }
                .numero {
                    font-family: var(--mono); font-size: .8rem; color: var(--brasa);
                    opacity: .8;
                }
            "#</style>
        </section>
    };
    children.render_into(dom, &seccion);
    seccion
}

/// Bloque de código. El contenido va tal cual, sin resaltado: el HTML que sale
/// del servidor es exactamente lo que se lee.
#[component]
pub fn Codigo<B: Backend>(dom: &Dom<B>, texto: String, #[prop(default)] pie: String) -> B::Node {
    view! { dom,
        <div class="bloque">
            <pre><code>{texto}</code></pre>
            <p class="pie">{pie}</p>
            <style>r#"
                .bloque { margin: 0 0 1.5rem; }
                pre {
                    margin: 0; padding: 1.1rem 1.25rem; overflow-x: auto;
                    background: #17150f; border: 1px solid var(--borde);
                    border-radius: 10px; font-size: .82rem; line-height: 1.6;
                }
                code { font-family: var(--mono); }
                .pie {
                    margin: .5rem 0 0; font-size: .78rem; opacity: .45;
                    font-family: var(--mono);
                }
                .pie:empty { display: none; }
            "#</style>
        </div>
    }
}

/// Párrafo de texto corrido.
#[component]
pub fn Parrafo<B: Backend>(dom: &Dom<B>, texto: String) -> B::Node {
    view! { dom,
        <p class="parrafo">
            {texto}
            <style>r#"
                .parrafo {
                    margin: 0 0 1.25rem; max-width: 62ch; line-height: 1.7;
                    color: var(--tenue);
                }
            "#</style>
        </p>
    }
}

// ---------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------

/// Un enlace de la cabecera.
///
/// Es un componente y no un `<a>` suelto porque el CSS de un template solo
/// alcanza a los elementos de ese template: un nodo creado a mano se quedaría
/// sin estilo.
#[component]
pub fn EnlaceNav<B: Backend>(
    dom: &Dom<B>,
    destino: &'static str,
    etiqueta: &'static str,
) -> B::Node {
    view! { dom,
        <a class="enlace" href={destino}>
            {etiqueta}
            <style>r#"
                .enlace {
                    color: inherit; opacity: .5; text-decoration: none;
                    font-size: .85rem;
                }
                .enlace:hover { opacity: 1; color: var(--brasa); }
            "#</style>
        </a>
    }
}

#[component]
pub fn Nav<B: Backend>(dom: &Dom<B>) -> B::Node {
    let nav = view! { dom,
        <nav class="nav">
            <a class="marca" href="#arriba">
                <span class="punto"></span>
                "Ascua"
            </a>
            <span class="version">{format!("v{VERSION}")}</span>
            <style>r#"
                .nav {
                    display: flex; align-items: center; gap: 1.5rem;
                    padding: 1.25rem 0; margin-bottom: 4rem;
                    border-bottom: 1px solid var(--borde); flex-wrap: wrap;
                }
                .marca {
                    font-weight: 600; letter-spacing: .01em; text-decoration: none;
                    color: inherit; display: flex; align-items: center; gap: .5rem;
                    margin-right: auto;
                }
                .punto {
                    width: .55rem; height: .55rem; border-radius: 50%;
                    background: var(--brasa);
                    box-shadow: 0 0 12px 1px rgba(226, 112, 58, .55);
                }
                .version {
                    font-family: var(--mono); font-size: .75rem; opacity: .35;
                    /* Va en el DOM junto a la marca, pero se lee al final. */
                    order: 9;
                }
            "#</style>
        </nav>
    };

    for (destino, etiqueta) in [
        ("#reactividad", "reactividad"),
        ("#templates", "templates"),
        ("#servidor", "servidor"),
        ("#comparativa", "comparativa"),
        ("#empezar", "empezar"),
    ] {
        let enlace = view! { dom, <EnlaceNav destino={destino} etiqueta={etiqueta}/> };
        dom.append(&nav, &enlace);
    }
    nav
}

#[component]
pub fn Hero<B: Backend>(dom: &Dom<B>) -> B::Node {
    view! { dom,
        <header class="hero" id="arriba">
            <h1>
                "React reconstruye un árbol entero para averiguar qué cambió."
            </h1>
            <p class="entrada">
                "Ascua ya lo sabe: cada dato conoce el nodo del DOM que le corresponde."
            </p>

            <div class="cifras">
                <span><b>"0"</b>" dependencias en el núcleo"</span>
                <span><b>"84"</b>" tests, ninguno necesita navegador"</span>
                <span><b>"160 KB"</b>" de WASM en el demo"</span>
                <span><b>"0"</b>" nodos recreados al hidratar"</span>
            </div>

            <style>r#"
                .hero { margin: 0 0 5rem; }
                h1 {
                    font-size: clamp(1.9rem, 4.2vw, 3rem); line-height: 1.12;
                    margin: 0 0 1.25rem; font-weight: 600; letter-spacing: -.02em;
                    max-width: 20ch;
                }
                .entrada {
                    font-size: 1.15rem; margin: 0 0 2.5rem; max-width: 52ch;
                    color: var(--tenue); line-height: 1.6;
                }
                .cifras {
                    display: flex; flex-wrap: wrap; gap: .6rem 2rem;
                    font-size: .85rem; color: var(--tenue);
                    padding-top: 1.75rem; border-top: 1px solid var(--borde);
                }
                .cifras b {
                    color: var(--brasa); font-family: var(--mono);
                    font-weight: 600; margin-right: .35rem;
                }
            "#</style>
        </header>
    }
}

// ---------------------------------------------------------------------------
// Tabla comparativa
// ---------------------------------------------------------------------------

#[component]
pub fn Fila<B: Backend>(
    dom: &Dom<B>,
    concepto: &'static str,
    ascua: &'static str,
    react: &'static str,
    svelte: &'static str,
    leptos: &'static str,
) -> B::Node {
    view! { dom,
        <tr>
            <td class="concepto">{concepto}</td>
            <td class="nuestra">{ascua}</td>
            <td>{react}</td>
            <td>{svelte}</td>
            <td>{leptos}</td>
            <style>r#"
                td {
                    text-align: center; padding: .7rem .9rem;
                    border-bottom: 1px solid var(--borde);
                    font-family: var(--mono); font-size: .8rem;
                }
                .concepto {
                    text-align: left; color: var(--tenue);
                    font-family: inherit; font-size: .85rem;
                }
                .nuestra { color: var(--brasa); }
            "#</style>
        </tr>
    }
}

#[component]
pub fn Comparativa<B: Backend>(dom: &Dom<B>) -> B::Node {
    let tabla = view! { dom,
        <div class="tabla">
            <table>
                <thead>
                    <tr>
                        <th>""</th><th>"Ascua"</th><th>"React"</th>
                        <th>"Svelte"</th><th>"Leptos"</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
            <style>r#"
                .tabla { overflow-x: auto; margin: 0 0 1.5rem; }
                table {
                    border-collapse: collapse; width: 100%; font-size: .85rem;
                    min-width: 34rem;
                }
                th {
                    text-align: center; padding: .7rem .9rem; font-weight: 500;
                    opacity: .5; font-size: .78rem;
                    border-bottom: 1px solid var(--borde);
                }
                th:first-child { text-align: left; }
            "#</style>
        </div>
    };

    let filas = [
        ("Actualiza el DOM", "directo", "diff", "directo", "directo"),
        ("Virtual DOM", "no", "sí", "no", "no"),
        ("Lenguaje", "Rust", "JS/TS", "JS/TS", "Rust"),
        ("Runtime en el bundle", "WASM", "~45 KB", "~2 KB", "WASM"),
        ("Deps del núcleo", "0", "—", "—", "varias"),
        ("SSR + hidratación", "sí", "sí", "sí", "sí"),
        ("CSS scoped", "build time", "no", "build time", "no"),
        ("Auditable de un tirón", "sí", "no", "no", "—"),
    ];

    if let Some(cuerpo) = dom
        .backend()
        .children(&dom.backend().children(&tabla)[0])
        .into_iter()
        .nth(1)
    {
        for (concepto, ascua, react, svelte, leptos) in filas {
            let fila = view! { dom,
                <Fila concepto={concepto} ascua={ascua} react={react}
                      svelte={svelte} leptos={leptos}/>
            };
            dom.append(&cuerpo, &fila);
        }
    }

    tabla
}

#[component]
pub fn Pie<B: Backend>(dom: &Dom<B>) -> B::Node {
    view! { dom,
        <footer class="pie">
            <p>{format!("Ascua v{VERSION} · MIT o Apache-2.0")}</p>
            <p class="lugar">"Escrito en Rust. Servido como HTML. Hidratado sin recrear un solo nodo."</p>
            <p class="lugar">"Santiago de Chile"</p>
            <style>r#"
                .pie {
                    border-top: 1px solid var(--borde); padding: 2.5rem 0 4rem;
                    font-size: .82rem; color: var(--tenue);
                }
                .pie p { margin: 0 0 .4rem; }
                .lugar { opacity: .45; }
            "#</style>
        </footer>
    }
}

// ---------------------------------------------------------------------------
// La página
// ---------------------------------------------------------------------------

/// Arma el sitio entero. Los demos van dentro de islas: el resto es HTML que
/// el navegador no vuelve a tocar.
pub fn pagina<B: Backend>(dom: &Dom<B>) -> B::Node {
    let raiz = view! { dom,
        <div class="pagina">
            <Nav/>
            <Hero/>
        </div>
    };

    seccion_problema(dom, &raiz);
    seccion_reactividad(dom, &raiz);
    seccion_templates(dom, &raiz);
    seccion_listas(dom, &raiz);
    seccion_servidor(dom, &raiz);
    seccion_comparativa(dom, &raiz);
    seccion_empezar(dom, &raiz);

    let pie = view! { dom, <Pie/> };
    dom.append(&raiz, &pie);
    raiz
}

fn seccion_problema<B: Backend>(dom: &Dom<B>, raiz: &B::Node) {
    let seccion = view! { dom,
        <div id="reactividad">
            <Seccion numero="01" titulo="El trabajo que nadie tenía que hacer">
                <Parrafo texto="Un framework con Virtual DOM responde a un cambio de estado reconstruyendo una representación del árbol y comparándola con la anterior para deducir qué tocar. El trabajo es proporcional al tamaño del árbol, no al del cambio."/>
                <Parrafo texto="Ascua establece la relación entre un dato y su nodo una sola vez, al compilar el template. A partir de ahí, cambiar el dato ejecuta la operación de DOM que le corresponde. No hay nada que deducir porque nada se olvidó."/>
            </Seccion>
        </div>
    };
    let isla = ascua::island(dom, "contador", "", |dom| view! { dom, <DemoContador/> });
    dom.append(&seccion, &isla);

    let nota = view! { dom,
        <Parrafo texto="Pulsa. Cada click produce una escritura sobre un nodo de texto que nunca se sustituye: ni un árbol recorrido, ni una comparación."/>
    };
    dom.append(&seccion, &nota);
    dom.append(raiz, &seccion);
}

fn seccion_reactividad<B: Backend>(dom: &Dom<B>, raiz: &B::Node) {
    let seccion = view! { dom,
        <div>
            <Seccion numero="02" titulo="Tres primitivas, y ninguna más">
                <Parrafo texto="Un Signal guarda un valor. Un Effect ejecuta código y observa qué signals lee mientras lo hace; cuando uno cambia, ese efecto —y solo ese— se reejecuta. Un Memo es un efecto que guarda lo que devuelve y no se lo pasa a nadie si no cambió."/>
                <Codigo texto={CODIGO_SIGNALS.to_string()}
                        pie="Nadie declaró las dependencias: se descubren al leer."/>
                <Parrafo texto="Las dependencias son bidireccionales, así que un grafo de Rc sería un grafo de ciclos, es decir, fugas. Los nodos viven en una arena y cada uno pertenece a un scope: liberar el scope libera su subárbol, sin recuento de referencias y sin recolector."/>
            </Seccion>
        </div>
    };
    dom.append(raiz, &seccion);
}

fn seccion_templates<B: Backend>(dom: &Dom<B>, raiz: &B::Node) {
    let seccion = view! { dom,
        <div id="templates">
            <Seccion numero="03" titulo="Una closure es reactiva; lo demás, no">
                <Codigo texto={CODIGO_VIEW.to_string()}
                        pie="La distinción es sintáctica, no de tipos."/>
                <Parrafo texto="Mirando el template se sabe qué puede cambiar, sin conocer los tipos ni confiar en ninguna regla implícita. El bloque style se extrae en tiempo de compilación: no deja ni un byte de runtime, solo un atributo en los elementos y un archivo CSS que recoge el build."/>
                <Codigo texto={CODIGO_GENERADO.to_string()}
                        pie="Esto es lo que genera el template de arriba. Se puede leer con cargo expand."/>
            </Seccion>
        </div>
    };
    dom.append(raiz, &seccion);
}

fn seccion_listas<B: Backend>(dom: &Dom<B>, raiz: &B::Node) {
    let seccion = view! { dom,
        <div>
            <Seccion numero="04" titulo="El único sitio con reconciliación">
                <Parrafo texto="Para texto y atributos no hay nada que comparar. Con una lista dinámica sí: no se puede saber de antemano qué le pasó a cada elemento. La diferencia con un VDOM es el alcance — esto compara una lista de claves, no un árbol, y solo cuando esa lista cambia."/>
            </Seccion>
        </div>
    };
    let isla = ascua::island(dom, "lista", "", |dom| view! { dom, <DemoLista/> });
    dom.append(&seccion, &isla);

    let nota = view! { dom,
        <Parrafo texto="Cada item recibe su color al construirse. Rota o invierte: los colores viajan con sus items porque son los mismos nodos, movidos. Eso es lo que conserva el foco, el scroll y lo que el usuario estuviera escribiendo."/>
    };
    dom.append(&seccion, &nota);
    dom.append(raiz, &seccion);
}

fn seccion_servidor<B: Backend>(dom: &Dom<B>, raiz: &B::Node) {
    let seccion = view! { dom,
        <div id="servidor">
            <Seccion numero="05" titulo="El servidor y el navegador, el mismo código">
                <Parrafo texto="El runtime habla con un trait Backend, no con web-sys. Renderizar en servidor es otro backend, no otro runtime: los mismos componentes producen el HTML en Rust nativo y la interfaz viva en WebAssembly."/>
                <Parrafo texto="Esta página es exactamente eso. Lo que estás leyendo llegó como HTML; solo los dos demos son islas que el navegador activa."/>
                <Codigo texto={CODIGO_SSR.to_string()}
                        pie="Cifras reales del demo del repositorio, medidas en el navegador."/>
                <Parrafo texto="Hidratar es adoptar, no rehacer. El servidor numera los elementos de cada isla en el orden en que el compilador los construye; el cliente construye en ese mismo orden y reclama cada nodo por su número. Los marcadores llevan el suyo dentro del comentario, porque los comentarios no admiten atributos."/>
            </Seccion>
        </div>
    };
    dom.append(raiz, &seccion);
}

fn seccion_comparativa<B: Backend>(dom: &Dom<B>, raiz: &B::Node) {
    let seccion = view! { dom,
        <div id="comparativa">
            <Seccion numero="06" titulo="Frente a los de siempre">
                <Comparativa/>
                <Parrafo texto="La columna que importa no es ninguna de estas: es si puedes leer el mecanismo entero en una sesión y repararlo sin esperar a que lo arregle otro. El núcleo reactivo son 600 líneas y cero dependencias."/>
            </Seccion>
        </div>
    };
    dom.append(raiz, &seccion);
}

fn seccion_empezar<B: Backend>(dom: &Dom<B>, raiz: &B::Node) {
    let seccion = view! { dom,
        <div id="empezar">
            <Seccion numero="07" titulo="Empezar">
                <Codigo texto={CODIGO_INSTALAR.to_string()} pie=""/>
                <Parrafo texto="Hace falta Rust con el target wasm32-unknown-unknown y wasm-bindgen-cli. El resto del pipeline es cargo: no hay bundler dueño de nada, y el resultado son un .wasm y un .html que se despliegan en cualquier hosting estático."/>
            </Seccion>
        </div>
    };
    dom.append(raiz, &seccion);
}

// ---------------------------------------------------------------------------
// Los ejemplos
// ---------------------------------------------------------------------------

const CODIGO_SIGNALS: &str = r#"let count = Signal::new(0);
let doble = create_memo(move || count.get() * 2);

create_effect(move || println!("doble = {}", doble.get()));

count.set(21);   // imprime "doble = 42"
count.set(21);   // no imprime nada: el memo no cambió"#;

const CODIGO_VIEW: &str = r##"view! { dom,
    <button on:click={move |_| count.update(|c| *c += 1)}>
        "Clicks: " {move || count.get()}
        <style>r#"
            button { border-radius: 8px; }
        "#</style>
    </button>
}

{count.get()}          // valor fijo, no vuelve a mirarlo
{move || count.get()}  // este nodo sigue al signal"##;

const CODIGO_GENERADO: &str = r#"let n0 = dom.element("button");
dom.set_attr(&n0, "data-ascua-98909ba2", "");
dom.on(&n0, "click", move |_| count.update(|c| *c += 1));

let n1 = dom.text("Clicks: ");
dom.append(&n0, &n1);

let n2 = dom.dynamic_text(move || count.get().to_string());
dom.append(&n0, &n2);   // el efecto captura n2: ya sabe su destino"#;

const CODIGO_SSR: &str = r#"// servidor, en Rust nativo
let html = render_to_string_hydratable(|dom| {
    island(dom, "app", "", |dom| app(dom, estado))
});

// navegador, en WASM
let (montajes, stats) = hydrate_islands(backend, &islas);
// Estadisticas { adoptados: 37, creados: 0 }"#;

const CODIGO_INSTALAR: &str = r#"[dependencies]
ascua = "0.1"

# y en el repositorio, el demo completo:
cd examples/demo
./build.sh                    # wasm del cliente + html del servidor
python3 -m http.server 8080"#;
