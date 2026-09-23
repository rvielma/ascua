//! El parser de plantillas.
//!
//! Una plantilla es **HTML de verdad** con huecos. Nada de `className` ni
//! `onClick`: los atributos son los que ya conoce cualquiera que haya escrito
//! una página, y el marcado se puede copiar y pegar tal cual.
//!
//! ```text
//! view`<button class="grande" onclick=${saludar}>Hola ${() => nombre()}</button>`
//! ```
//!
//! Los huecos llegan aquí ya separados por el escáner, sustituidos por un
//! marcador que no puede aparecer en HTML (área de uso privado de Unicode).

/// Delimitadores del marcador de hueco: `\u{E000}` índice `\u{E001}`.
pub const ABRE: char = '\u{E000}';
pub const CIERRA: char = '\u{E001}';

/// Elementos HTML sin etiqueta de cierre.
const SIN_CIERRE: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track",
    "wbr",
];

#[derive(Debug, PartialEq)]
pub enum Nodo {
    Elemento(Elemento),
    /// Una etiqueta que empieza por mayúscula: `<Panel titulo="x"/>`.
    Componente(Componente),
    /// Texto literal del marcado.
    Texto(String),
    /// `${expr}` — se evalúa una vez, al construir.
    Estatico(String),
    /// `${() => expr}` — se reevalúa cuando cambia lo que lee.
    Dinamico(String),
}

/// Nombres de componente que resuelve el propio compilador.
pub const SHOW: &str = "Show";
pub const ELSE: &str = "Else";
pub const FOR: &str = "For";

/// `<Panel titulo=${t}>…</Panel>`
///
/// Los props se pasan **tal cual**: un literal es una cadena y un `${...}` es
/// la expresión, sea o no una closure. Quien recibe decide qué hacer con
/// ella; el compilador no envuelve nada a tus espaldas.
#[derive(Debug, PartialEq)]
pub struct Componente {
    pub nombre: String,
    pub props: Vec<Atributo>,
    pub hijos: Vec<Nodo>,
}

impl Componente {
    /// El valor de un prop, si está.
    #[must_use]
    pub fn prop(&self, nombre: &str) -> Option<&Valor> {
        self.props
            .iter()
            .find(|prop| prop.nombre == nombre)
            .map(|prop| &prop.valor)
    }
}

#[derive(Debug, PartialEq)]
pub struct Elemento {
    pub etiqueta: String,
    pub atributos: Vec<Atributo>,
    pub hijos: Vec<Nodo>,
}

#[derive(Debug, PartialEq)]
pub struct Atributo {
    pub nombre: String,
    pub valor: Valor,
}

#[derive(Debug, PartialEq)]
pub enum Valor {
    /// `class="caja"`
    Literal(String),
    /// `id=${expr}` — se aplica una vez.
    Estatico(String),
    /// `class=${() => ...}` — se reevalúa; `false`/`null` quitan el atributo.
    Dinamico(String),
    /// `prop:value=${() => ...}` — escribe la **propiedad** del nodo, no el
    /// atributo. Es lo que hace falta para `value` y `checked`, que en el DOM
    /// dejan de seguir a su atributo en cuanto el usuario los toca.
    Propiedad(String),
    /// `class:activa=${() => ...}` — pone y quita **esa** clase, sin tocar las
    /// demás. Escribir `class` entero obligaría a construir la lista a mano en
    /// cada cambio.
    Clase(String),
    /// `ref=${(nodo) => ...}` — le pasa el elemento recién creado a una
    /// función. Es la forma de quedarse con un nodo sin buscarlo después.
    Referencia(String),
    /// `onclick=${manejador}`
    Evento { evento: String, manejador: String },
}

#[derive(Debug)]
pub struct Error {
    pub mensaje: String,
    pub posicion: usize,
}

impl std::error::Error for Error {}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} (posición {})", self.mensaje, self.posicion)
    }
}

type Resultado<T> = Result<T, Error>;

/// Lo que sale de parsear una plantilla.
#[derive(Debug)]
pub struct Plantilla {
    pub raiz: Nodo,
    /// El contenido de los bloques `<style>`, ya fuera del árbol.
    pub css: String,
}

/// Parsea una plantilla ya marcada.
///
/// `expresiones` son los huecos en orden: el marcador con índice N se refiere
/// a `expresiones[N]`.
///
/// # Errors
/// Si el marcado está mal formado.
pub fn parsear(entrada: &str, expresiones: &[String]) -> Resultado<Plantilla> {
    let mut parser = Parser {
        chars: entrada.chars().collect(),
        posicion: 0,
        expresiones,
        css: String::new(),
    };

    parser.saltar_espacios();
    let raiz = parser.nodo()?;
    parser.saltar_espacios();

    if parser.posicion < parser.chars.len() {
        return Err(parser.error(
            "una plantilla tiene un único elemento raíz; envuelve el contenido en un elemento",
        ));
    }

    // `show` y `list` anclan su contenido con un marcador, y un marcador
    // necesita un padre donde vivir. Como raíz no hay dónde ponerlo.
    if let Nodo::Componente(componente) = &raiz {
        if matches!(componente.nombre.as_str(), SHOW | FOR | ELSE) {
            return Err(parser.error(&format!(
                "<{}> necesita un elemento donde anclarse; envuélvelo",
                componente.nombre
            )));
        }
    }
    Ok(Plantilla {
        raiz,
        css: parser.css,
    })
}

struct Parser<'a> {
    chars: Vec<char>,
    posicion: usize,
    expresiones: &'a [String],
    css: String,
}

impl Parser<'_> {
    fn error(&self, mensaje: &str) -> Error {
        Error {
            mensaje: mensaje.to_string(),
            posicion: self.posicion,
        }
    }

    fn actual(&self) -> Option<char> {
        self.chars.get(self.posicion).copied()
    }

    fn mirar(&self, adelanto: usize) -> Option<char> {
        self.chars.get(self.posicion + adelanto).copied()
    }

    fn saltar_espacios(&mut self) {
        while self.actual().is_some_and(char::is_whitespace) {
            self.posicion += 1;
        }
    }

    fn consumir(&mut self, esperado: char) -> Resultado<()> {
        if self.actual() == Some(esperado) {
            self.posicion += 1;
            Ok(())
        } else {
            Err(self.error(&format!("se esperaba `{esperado}`")))
        }
    }

    /// Un nodo: elemento, texto o hueco.
    fn nodo(&mut self) -> Resultado<Nodo> {
        match self.actual() {
            Some('<') => self.etiqueta(),
            Some(ABRE) => self.hueco(),
            Some(_) => Ok(Nodo::Texto(self.texto())),
            None => Err(self.error("plantilla vacía")),
        }
    }

    /// Texto literal hasta el próximo `<` o hueco.
    fn texto(&mut self) -> String {
        let inicio = self.posicion;
        while let Some(c) = self.actual() {
            if c == '<' || c == ABRE {
                break;
            }
            self.posicion += 1;
        }
        let crudo: String = self.chars[inicio..self.posicion].iter().collect();
        decodificar(&crudo)
    }

    /// `\u{E000}N\u{E001}` — un hueco `${...}`.
    fn hueco(&mut self) -> Resultado<Nodo> {
        let expresion = self.leer_hueco()?;
        Ok(if es_closure(&expresion) {
            Nodo::Dinamico(expresion)
        } else {
            Nodo::Estatico(expresion)
        })
    }

    fn leer_hueco(&mut self) -> Resultado<String> {
        self.consumir(ABRE)?;
        let inicio = self.posicion;
        while self.actual().is_some_and(|c| c != CIERRA) {
            self.posicion += 1;
        }
        let indice: usize = self.chars[inicio..self.posicion]
            .iter()
            .collect::<String>()
            .parse()
            .map_err(|_| self.error("marcador de hueco corrupto"))?;
        self.consumir(CIERRA)?;

        self.expresiones
            .get(indice)
            .cloned()
            .ok_or_else(|| self.error("marcador de hueco fuera de rango"))
    }

    /// Un elemento HTML o un componente.
    ///
    /// La inicial decide: **minúscula es HTML, mayúscula es componente**. Es
    /// la misma convención de la vía Rust, y la que ya usan React, Solid y
    /// Svelte, así que no hay nada nuevo que aprender.
    fn etiqueta(&mut self) -> Resultado<Nodo> {
        self.consumir('<')?;
        let etiqueta = self.nombre();
        if etiqueta.is_empty() {
            return Err(self.error("se esperaba el nombre de una etiqueta"));
        }
        let es_componente = etiqueta.starts_with(char::is_uppercase);

        let mut atributos = Vec::new();
        loop {
            self.saltar_espacios();
            match self.actual() {
                Some('>') | Some('/') | None => break,
                _ => atributos.push(self.atributo(es_componente)?),
            }
        }

        // <tag/>
        if self.actual() == Some('/') {
            self.posicion += 1;
            self.consumir('>')?;
            return self.terminar(etiqueta, atributos, Vec::new());
        }
        self.consumir('>')?;

        // El CSS no es marcado: se lee tal cual hasta </style> y se saca del
        // árbol. No genera ningún nodo ni deja nada en tiempo de ejecución.
        if !es_componente && etiqueta.eq_ignore_ascii_case("style") {
            self.estilo()?;
            return Ok(Nodo::Elemento(Elemento {
                etiqueta: String::new(),
                atributos: Vec::new(),
                hijos: Vec::new(),
            }));
        }

        if !es_componente && SIN_CIERRE.contains(&etiqueta.to_ascii_lowercase().as_str()) {
            return self.terminar(etiqueta, atributos, Vec::new());
        }

        let hijos = self.hijos(&etiqueta)?;
        self.consumir('<')?;
        self.consumir('/')?;
        let cierre = self.nombre();
        self.saltar_espacios();
        self.consumir('>')?;

        let coincide = if es_componente {
            cierre == etiqueta
        } else {
            cierre.eq_ignore_ascii_case(&etiqueta)
        };
        if !coincide {
            return Err(self.error(&format!("</{cierre}> no cierra <{etiqueta}>")));
        }

        self.terminar(etiqueta, atributos, hijos)
    }

    /// Construye el nodo ya cerrado, y valida los componentes del compilador.
    fn terminar(
        &self,
        etiqueta: String,
        atributos: Vec<Atributo>,
        hijos: Vec<Nodo>,
    ) -> Resultado<Nodo> {
        if etiqueta != SHOW {
            if let Some(Nodo::Componente(suelto)) = hijos
                .iter()
                .find(|hijo| matches!(hijo, Nodo::Componente(c) if c.nombre == ELSE))
            {
                return Err(self.error(&format!(
                    "<{}> es la otra rama de un <Show>, y aquí no hay ninguno",
                    suelto.nombre
                )));
            }
        }

        if !etiqueta.starts_with(char::is_uppercase) {
            return Ok(Nodo::Elemento(Elemento {
                etiqueta,
                atributos,
                hijos,
            }));
        }

        let componente = Componente {
            nombre: etiqueta,
            props: atributos,
            hijos,
        };
        self.validar(&componente)?;
        Ok(Nodo::Componente(componente))
    }

    /// Lo que el compilador sabe exigirle a `<Show>` y `<For>`.
    ///
    /// Se comprueba aquí y no al generar para que el error salga con la
    /// posición de la plantilla, y para que sea imposible emitir una llamada
    /// a `show` o `list` a la que le falte un argumento.
    fn validar(&self, componente: &Componente) -> Resultado<()> {
        match componente.nombre.as_str() {
            SHOW => {
                if componente.prop("when").is_none() {
                    return Err(self.error(
                        "<Show> necesita `when`, una closure que devuelva si el contenido se \
                         muestra: <Show when=${() => activo()}>",
                    ));
                }
                let ramas = componente
                    .hijos
                    .iter()
                    .filter(|hijo| matches!(hijo, Nodo::Componente(c) if c.nombre == ELSE))
                    .count();
                if ramas > 1 {
                    return Err(self.error("un <Show> tiene un solo <Else>"));
                }
                self.sin_regiones_sueltas(&componente.hijos)?;
            }
            FOR => {
                for obligatorio in ["each", "key", "render"] {
                    if componente.prop(obligatorio).is_none() {
                        return Err(self.error(&format!(
                            "<For> necesita `{obligatorio}`: <For each=${{() => items()}} \
                             key=${{(item) => item.id}} render=${{(item) => view`…`}}/>"
                        )));
                    }
                }
                if !componente.hijos.is_empty() {
                    return Err(self.error(
                        "el contenido de <For> va en `render`, que se ejecuta una vez por clave",
                    ));
                }
            }
            ELSE => self.sin_regiones_sueltas(&componente.hijos)?,
            _ => {}
        }
        Ok(())
    }

    /// Una rama de `<Show>` se construye y se inserta entera, así que sus
    /// nodos tienen que existir. `<Show>` y `<For>` no son nodos: son un
    /// marcador dentro de un padre. Anidarlos sin un elemento de por medio
    /// obligaría al compilador a inventarse un contenedor que nadie escribió.
    fn sin_regiones_sueltas(&self, hijos: &[Nodo]) -> Resultado<()> {
        for hijo in hijos {
            if let Nodo::Componente(componente) = hijo {
                if matches!(componente.nombre.as_str(), SHOW | FOR) {
                    return Err(self.error(&format!(
                        "un <{}> dentro de una rama necesita un elemento que lo contenga",
                        componente.nombre
                    )));
                }
            }
        }
        Ok(())
    }

    /// Lee el contenido de un `<style>` sin interpretarlo como HTML.
    fn estilo(&mut self) -> Resultado<()> {
        let inicio = self.posicion;
        while self.posicion < self.chars.len() {
            if self.actual() == Some('<') && self.mirar(1) == Some('/') {
                break;
            }
            self.posicion += 1;
        }
        let css: String = self.chars[inicio..self.posicion].iter().collect();

        if css.contains(ABRE) {
            return Err(self.error(
                "el CSS de un <style> se extrae en tiempo de compilación, así que no admite \
                 interpolaciones ${...}; para estilos que cambian, usa un atributo",
            ));
        }

        self.consumir('<')?;
        self.consumir('/')?;
        let cierre = self.nombre();
        self.saltar_espacios();
        self.consumir('>')?;
        if !cierre.eq_ignore_ascii_case("style") {
            return Err(self.error(&format!("</{cierre}> no cierra <style>")));
        }

        if !self.css.is_empty() {
            self.css.push('\n');
        }
        self.css.push_str(css.trim());
        Ok(())
    }

    fn hijos(&mut self, etiqueta: &str) -> Resultado<Vec<Nodo>> {
        let mut hijos = Vec::new();
        loop {
            match self.actual() {
                None => {
                    return Err(self.error(&format!("falta la etiqueta de cierre </{etiqueta}>")))
                }
                Some('<') if self.mirar(1) == Some('/') => return Ok(hijos),
                _ => {
                    let nodo = self.nodo()?;
                    // El <style> ya se guardó aparte: no produce nodo.
                    if matches!(&nodo, Nodo::Elemento(e) if e.etiqueta.is_empty()) {
                        continue;
                    }
                    // El texto que solo son espacios entre etiquetas no aporta
                    // nada y sí bytes: se descarta, como hace cualquier
                    // minificador de HTML.
                    if let Nodo::Texto(t) = &nodo {
                        if t.trim().is_empty() {
                            continue;
                        }
                    }
                    hijos.push(nodo);
                }
            }
        }
    }

    fn atributo(&mut self, es_componente: bool) -> Resultado<Atributo> {
        let mut nombre = self.nombre();
        if nombre.is_empty() {
            return Err(self.error("se esperaba el nombre de un atributo"));
        }
        self.saltar_espacios();

        if (nombre.starts_with("prop:") || nombre.starts_with("class:") || nombre == "ref")
            && self.actual() != Some('=')
        {
            return Err(self.error(&format!("`{nombre}` necesita un valor en ${{}}")));
        }

        // Atributo sin valor: `disabled`.
        if self.actual() != Some('=') {
            return Ok(Atributo {
                nombre,
                valor: Valor::Literal(String::new()),
            });
        }
        self.posicion += 1;
        self.saltar_espacios();

        let valor = match self.actual() {
            Some('"') | Some('\'') => Valor::Literal(self.literal()?),
            Some(ABRE) => {
                let expresion = self.leer_hueco()?;
                // A un componente los props le llegan tal cual: `onguardar` es
                // un prop suyo, no un listener del DOM.
                if es_componente {
                    Valor::Estatico(expresion)
                } else if let Some(clase) = nombre.strip_prefix("class:") {
                    nombre = clase.to_string();
                    Valor::Clase(expresion)
                } else if nombre == "ref" {
                    Valor::Referencia(expresion)
                } else if let Some(propiedad) = nombre.strip_prefix("prop:") {
                    nombre = propiedad.to_string();
                    Valor::Propiedad(expresion)
                } else if let Some(evento) = nombre.strip_prefix("on") {
                    // Los eventos son atributos `on*`, como en HTML.
                    Valor::Evento {
                        evento: evento.to_ascii_lowercase(),
                        manejador: expresion,
                    }
                } else if es_closure(&expresion) {
                    Valor::Dinamico(expresion)
                } else {
                    Valor::Estatico(expresion)
                }
            }
            _ => return Err(self.error("el valor de un atributo va entre comillas o en ${}")),
        };

        Ok(Atributo { nombre, valor })
    }

    fn literal(&mut self) -> Resultado<String> {
        let comilla = self
            .actual()
            .ok_or_else(|| self.error("literal sin abrir"))?;
        self.posicion += 1;
        let inicio = self.posicion;
        while self.actual().is_some_and(|c| c != comilla) {
            self.posicion += 1;
        }
        let valor: String = self.chars[inicio..self.posicion].iter().collect();
        self.consumir(comilla)?;
        Ok(decodificar(&valor))
    }

    /// Nombre de etiqueta o atributo: admite `-` y `:` como el HTML.
    fn nombre(&mut self) -> String {
        let inicio = self.posicion;
        while self
            .actual()
            .is_some_and(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == ':')
        {
            self.posicion += 1;
        }
        self.chars[inicio..self.posicion].iter().collect()
    }
}

/// Decodifica las entidades HTML del texto.
///
/// Esto es HTML, así que `&lt;` es un `<` que no abre una etiqueta. Sin esto,
/// escribir sobre HTML *dentro* de una plantilla sería imposible.
fn decodificar(texto: &str) -> String {
    if !texto.contains('&') {
        return texto.to_string();
    }

    let mut salida = String::with_capacity(texto.len());
    let mut resto = texto;

    while let Some(inicio) = resto.find('&') {
        salida.push_str(&resto[..inicio]);
        let tras_ampersand = &resto[inicio + 1..];

        let Some(fin) = tras_ampersand.find(';').filter(|fin| *fin <= 8) else {
            salida.push('&');
            resto = tras_ampersand;
            continue;
        };

        let entidad = &tras_ampersand[..fin];
        let decodificada = match entidad {
            "lt" => Some('<'),
            "gt" => Some('>'),
            "amp" => Some('&'),
            "quot" => Some('"'),
            "apos" | "#39" => Some('\''),
            "nbsp" => Some('\u{a0}'),
            numerica => numerica
                .strip_prefix('#')
                .and_then(|digitos| match digitos.strip_prefix(['x', 'X']) {
                    Some(hex) => u32::from_str_radix(hex, 16).ok(),
                    None => digitos.parse().ok(),
                })
                .and_then(char::from_u32),
        };

        match decodificada {
            Some(c) => {
                salida.push(c);
                resto = &tras_ampersand[fin + 1..];
            }
            None => {
                // No es una entidad conocida: el `&` es un `&` y ya está.
                salida.push('&');
                resto = tras_ampersand;
            }
        }
    }

    salida.push_str(resto);
    salida
}

/// ¿La expresión es una función flecha?
///
/// Es **la regla del framework**: una closure es reactiva, cualquier otra
/// expresión se evalúa una vez. Se decide mirando solo el principio, así que
/// es predecible: `() => x` y `n => x` sí; `f(() => x)` no, porque empieza por
/// `f`.
pub fn es_closure(expresion: &str) -> bool {
    let texto = expresion.trim_start();

    // `async () => ...`
    let texto = texto.strip_prefix("async").map_or(texto, str::trim_start);

    if let Some(resto) = texto.strip_prefix('(') {
        // `(...) => `: hay que saltar hasta el paréntesis que cierra.
        let mut profundidad = 1usize;
        for (indice, c) in resto.char_indices() {
            match c {
                '(' => profundidad += 1,
                ')' => {
                    profundidad -= 1;
                    if profundidad == 0 {
                        return resto[indice + 1..].trim_start().starts_with("=>");
                    }
                }
                _ => {}
            }
        }
        return false;
    }

    // `nombre => ...`
    let identificador: String = texto
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '$')
        .collect();
    if identificador.is_empty() {
        return false;
    }
    texto[identificador.len()..].trim_start().starts_with("=>")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsear_simple(entrada: &str, expresiones: &[&str]) -> Nodo {
        let expresiones: Vec<String> = expresiones.iter().map(|e| (*e).to_string()).collect();
        parsear(entrada, &expresiones)
            .expect("debería parsear")
            .raiz
    }

    #[test]
    fn distingue_closures_de_valores() {
        assert!(es_closure("() => count()"));
        assert!(es_closure("(ev) => algo(ev)"));
        assert!(es_closure("ev => algo(ev)"));
        assert!(es_closure("  async () => x"));
        assert!(!es_closure("count()"));
        assert!(!es_closure("f(() => x)"));
        assert!(!es_closure("\"texto\""));
        assert!(!es_closure("obj.prop"));
    }

    #[test]
    fn parsea_un_elemento_con_texto() {
        let nodo = parsear_simple("<p>Hola</p>", &[]);
        assert_eq!(
            nodo,
            Nodo::Elemento(Elemento {
                etiqueta: "p".into(),
                atributos: vec![],
                hijos: vec![Nodo::Texto("Hola".into())],
            })
        );
    }

    #[test]
    fn distingue_atributos_estaticos_dinamicos_y_eventos() {
        let nodo = parsear_simple(
            "<button class=\"base\" id=\u{E000}0\u{E001} data-x=\u{E000}1\u{E001} onclick=\u{E000}2\u{E001}/>",
            &["idFijo", "() => activo()", "manejar"],
        );

        let Nodo::Elemento(elemento) = nodo else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.atributos[0].valor, Valor::Literal("base".into()));
        assert_eq!(
            elemento.atributos[1].valor,
            Valor::Estatico("idFijo".into())
        );
        assert_eq!(
            elemento.atributos[2].valor,
            Valor::Dinamico("() => activo()".into())
        );
        assert_eq!(
            elemento.atributos[3].valor,
            Valor::Evento {
                evento: "click".into(),
                manejador: "manejar".into()
            }
        );
    }

    #[test]
    fn descarta_los_espacios_entre_etiquetas() {
        let nodo = parsear_simple("<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>", &[]);
        let Nodo::Elemento(elemento) = nodo else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.hijos.len(), 2);
    }

    #[test]
    fn los_elementos_sin_cierre_no_lo_necesitan() {
        let nodo = parsear_simple("<div><br><img src=\"x.png\"></div>", &[]);
        let Nodo::Elemento(elemento) = nodo else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.hijos.len(), 2);
    }

    #[test]
    fn decodifica_las_entidades_html() {
        let nodo = parsear_simple("<p>El &lt;style&gt; no deja nada &amp; punto</p>", &[]);
        let Nodo::Elemento(elemento) = nodo else {
            panic!("debería ser un elemento");
        };
        assert_eq!(
            elemento.hijos[0],
            Nodo::Texto("El <style> no deja nada & punto".into())
        );
    }

    #[test]
    fn decodifica_entidades_numericas_y_deja_el_resto() {
        let nodo = parsear_simple("<p>&#65;&#x42; 10 &amp 20 &desconocida;</p>", &[]);
        let Nodo::Elemento(elemento) = nodo else {
            panic!("debería ser un elemento");
        };
        assert_eq!(
            elemento.hijos[0],
            Nodo::Texto("AB 10 &amp 20 &desconocida;".into())
        );
    }

    #[test]
    fn extrae_el_css_y_lo_saca_del_arbol() {
        let plantilla = parsear(
            "<div><p>hola</p><style>.caja { color: red; }</style></div>",
            &[],
        )
        .expect("debería parsear");

        assert_eq!(plantilla.css, ".caja { color: red; }");
        let Nodo::Elemento(elemento) = plantilla.raiz else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.hijos.len(), 1, "el <style> no deja nodo");
    }

    #[test]
    fn rechaza_interpolaciones_dentro_del_css() {
        let entrada = format!("<div><style>.c {{ color: {ABRE}0{CIERRA}; }}</style></div>");
        let error = parsear(&entrada, &["rojo".into()]).expect_err("debería fallar");
        assert!(error.mensaje.contains("interpolaciones"), "{error}");
    }

    #[test]
    fn rechaza_una_plantilla_con_dos_raices() {
        let error = parsear("<p>a</p><p>b</p>", &[]).expect_err("debería fallar");
        assert!(error.mensaje.contains("único elemento raíz"), "{error}");
    }

    #[test]
    fn rechaza_un_cierre_que_no_corresponde() {
        let error = parsear("<div><p>a</div></p>", &[]).expect_err("debería fallar");
        assert!(error.mensaje.contains("no cierra"), "{error}");
    }

    #[test]
    fn la_inicial_distingue_elemento_de_componente() {
        let plantilla = parsear("<div><Panel/></div>", &[]).expect("debería parsear");
        let Nodo::Elemento(elemento) = plantilla.raiz else {
            panic!("debería ser un elemento");
        };
        let Nodo::Componente(componente) = &elemento.hijos[0] else {
            panic!("la mayúscula hace componente");
        };
        assert_eq!(componente.nombre, "Panel");
    }

    #[test]
    fn los_props_de_un_componente_no_se_interpretan() {
        let entrada = format!("<div><Aviso onguardar={ABRE}0{CIERRA}/></div>");
        let plantilla = parsear(&entrada, &["() => x()".into()]).expect("debería parsear");
        let Nodo::Elemento(elemento) = plantilla.raiz else {
            panic!("debería ser un elemento");
        };
        let Nodo::Componente(componente) = &elemento.hijos[0] else {
            panic!("debería ser un componente");
        };
        assert_eq!(
            componente.prop("onguardar"),
            Some(&Valor::Estatico("() => x()".into())),
            "en un componente `on*` no es un evento del DOM"
        );
    }

    #[test]
    fn el_cierre_de_un_componente_distingue_mayusculas() {
        let error = parsear("<div><Panel></panel></div>", &[]).expect_err("debería fallar");
        assert!(error.mensaje.contains("no cierra"), "{error}");
    }

    #[test]
    fn prop_escribe_la_propiedad_y_no_el_atributo() {
        let entrada = format!("<input prop:value={ABRE}0{CIERRA}>");
        let plantilla = parsear(&entrada, &["() => texto()".into()]).expect("debería parsear");
        let Nodo::Elemento(elemento) = plantilla.raiz else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.atributos[0].nombre, "value");
        assert_eq!(
            elemento.atributos[0].valor,
            Valor::Propiedad("() => texto()".into())
        );
    }

    #[test]
    fn class_y_ref_se_distinguen_de_un_atributo() {
        let entrada = format!("<li class:activa={ABRE}0{CIERRA} ref={ABRE}1{CIERRA}>x</li>");
        let plantilla =
            parsear(&entrada, &["() => x()".into(), "(n) => n".into()]).expect("debería parsear");
        let Nodo::Elemento(elemento) = plantilla.raiz else {
            panic!("debería ser un elemento");
        };

        assert_eq!(elemento.atributos[0].nombre, "activa");
        assert_eq!(
            elemento.atributos[0].valor,
            Valor::Clase("() => x()".into())
        );
        assert_eq!(elemento.atributos[1].nombre, "ref");
        assert_eq!(
            elemento.atributos[1].valor,
            Valor::Referencia("(n) => n".into())
        );
    }

    #[test]
    fn una_clase_sin_valor_lo_dice() {
        let error = parsear("<li class:activa>x</li>", &[]).expect_err("debería fallar");
        assert!(error.mensaje.contains("necesita un valor"), "{error}");
    }

    #[test]
    fn en_un_componente_class_y_ref_son_props_suyos() {
        let entrada = format!("<div><Fila ref={ABRE}0{CIERRA}/></div>");
        let plantilla = parsear(&entrada, &["(n) => n".into()]).expect("debería parsear");
        let Nodo::Elemento(elemento) = plantilla.raiz else {
            panic!("debería ser un elemento");
        };
        let Nodo::Componente(componente) = &elemento.hijos[0] else {
            panic!("debería ser un componente");
        };
        assert_eq!(
            componente.prop("ref"),
            Some(&Valor::Estatico("(n) => n".into())),
            "un componente no tiene nodo propio al que referirse"
        );
    }

    #[test]
    fn un_show_sin_when_lo_dice() {
        let error = parsear("<div><Show><p>a</p></Show></div>", &[]).expect_err("debería fallar");
        assert!(error.mensaje.contains("necesita `when`"), "{error}");
    }

    #[test]
    fn un_for_sin_render_lo_dice() {
        let entrada = format!("<ul><For each={ABRE}0{CIERRA} key={ABRE}1{CIERRA}/></ul>");
        let error = parsear(&entrada, &["() => x()".into(), "(i) => i.id".into()])
            .expect_err("debería fallar");
        assert!(error.mensaje.contains("`render`"), "{error}");
    }

    #[test]
    fn el_contenido_de_un_for_va_en_render() {
        let entrada =
            format!("<ul><For each={ABRE}0{CIERRA} key={ABRE}1{CIERRA} render={ABRE}2{CIERRA}><li>x</li></For></ul>");
        let error = parsear(
            &entrada,
            &["() => x()".into(), "(i) => i.id".into(), "(i) => i".into()],
        )
        .expect_err("debería fallar");
        assert!(error.mensaje.contains("va en `render`"), "{error}");
    }

    #[test]
    fn un_else_suelto_no_pasa() {
        let error = parsear("<div><Else><p>a</p></Else></div>", &[]).expect_err("debería fallar");
        assert!(error.mensaje.contains("otra rama de un <Show>"), "{error}");
    }

    #[test]
    fn una_region_no_puede_ser_la_raiz() {
        let entrada = format!("<Show when={ABRE}0{CIERRA}><p>a</p></Show>");
        let error = parsear(&entrada, &["() => x()".into()]).expect_err("debería fallar");
        assert!(
            error.mensaje.contains("dónde anclarse") || error.mensaje.contains("anclarse"),
            "{error}"
        );
    }

    #[test]
    fn una_region_dentro_de_una_rama_necesita_contenedor() {
        let entrada = format!(
            "<div><Show when={ABRE}0{CIERRA}><Show when={ABRE}1{CIERRA}><p>a</p></Show></Show></div>"
        );
        let error = parsear(&entrada, &["() => x()".into(), "() => y()".into()])
            .expect_err("debería fallar");
        assert!(
            error.mensaje.contains("elemento que lo contenga"),
            "{error}"
        );
    }
}
