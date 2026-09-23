//! El source map.
//!
//! Sin esto, un error en el navegador señala la línea del código generado
//! —`_$dtxt(...)`— y no la del archivo que alguien escribió. El compilador es
//! quien sabe de dónde viene cada línea, así que es quien lo emite.
//!
//! El mapa es **por líneas**, no por columnas. Lo que se copia sin tocar
//! —que es casi todo el archivo— señala su línea exacta; lo que sale del
//! compilador señala la línea del `view` que lo produjo. Basta para que un
//! stack trace y un punto de interrupción caigan donde tienen que caer, y
//! evita cargar el compilador con una contabilidad de columnas que nadie
//! mira.

/// De dónde viene un trozo de la salida.
pub enum Origen<'a> {
    /// Texto copiado del original: cada línea es la suya, contando desde
    /// `base`.
    Copiado(usize),
    /// Texto que produjo el compilador: todas sus líneas señalan a la misma.
    Generado(usize),
    /// Lo que salió de una plantilla que empieza en la línea `base`: la línea
    /// `n` del trozo viene de la línea `base + lineas[n]`.
    Plantilla { base: usize, lineas: &'a [usize] },
}

/// Añade un trozo a la salida y anota de dónde viene cada línea suya.
///
/// La primera línea del trozo continúa la última línea ya escrita, así que no
/// estrena entrada en el mapa: solo las que abren un salto de línea nuevo.
pub fn añadir(salida: &mut String, procedencia: &mut Vec<usize>, trozo: &str, origen: Origen) {
    if procedencia.is_empty() {
        procedencia.push(match origen {
            Origen::Copiado(base) | Origen::Generado(base) | Origen::Plantilla { base, .. } => base,
        });
    }

    for (indice, caracter) in trozo.char_indices() {
        salida.push(caracter);
        if caracter != '\n' {
            continue;
        }
        // Cuántos saltos llevamos dentro de este trozo.
        let saltos = trozo[..=indice].matches('\n').count();
        procedencia.push(match origen {
            Origen::Copiado(base) => base + saltos,
            Origen::Generado(linea) => linea,
            Origen::Plantilla { base, lineas } => {
                base + lineas.get(saltos).or(lineas.last()).copied().unwrap_or(0)
            }
        });
    }
}

/// El mapa de un archivo que no se tocó: cada línea es la suya.
#[must_use]
pub fn lineas_propias(fuente: &str) -> Vec<usize> {
    (0..fuente.matches('\n').count() + 1).collect()
}

/// Construye el source map v3, con el original dentro.
///
/// `sourcesContent` va incluido a propósito: así el navegador enseña el
/// TypeScript original aunque el archivo no esté servido en ninguna parte,
/// que es justo lo que pasa cuando el bundler ya lo transformó.
#[must_use]
pub fn construir(origen: &str, fuente: &str, procedencia: &[usize]) -> String {
    let mut mappings = String::new();
    let mut anterior = 0i64;

    for (indice, linea_origen) in procedencia.iter().enumerate() {
        if indice > 0 {
            mappings.push(';');
        }
        // Un segmento por línea: columna 0 de la salida ← columna 0 de la
        // línea de origen. Los tres últimos valores son diferencias respecto
        // al segmento anterior; el primero se reinicia en cada línea.
        vlq(0, &mut mappings);
        vlq(0, &mut mappings);
        let destino = i64::try_from(*linea_origen).unwrap_or(i64::MAX);
        vlq(destino - anterior, &mut mappings);
        vlq(0, &mut mappings);
        anterior = destino;
    }

    format!(
        "{{\"version\":3,\"sources\":[{}],\"sourcesContent\":[{}],\"names\":[],\"mappings\":{}}}",
        cadena_json(origen),
        cadena_json(fuente),
        cadena_json(&mappings)
    )
}

/// Base64 VLQ, la codificación de los source maps: seis bits por carácter, el
/// de menos peso para el signo y el más alto como «sigue».
fn vlq(valor: i64, salida: &mut String) {
    const DIGITOS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut resto = if valor < 0 {
        ((-valor) << 1) | 1
    } else {
        valor << 1
    };

    loop {
        let mut digito = resto & 0b1_1111;
        resto >>= 5;
        if resto > 0 {
            digito |= 0b10_0000;
        }
        let indice = usize::try_from(digito).unwrap_or(0);
        salida.push(char::from(DIGITOS[indice]));
        if resto == 0 {
            break;
        }
    }
}

/// Literal JSON, con lo justo escapado.
fn cadena_json(valor: &str) -> String {
    let mut salida = String::with_capacity(valor.len() + 2);
    salida.push('"');
    for c in valor.chars() {
        match c {
            '"' => salida.push_str("\\\""),
            '\\' => salida.push_str("\\\\"),
            '\n' => salida.push_str("\\n"),
            '\r' => salida.push_str("\\r"),
            '\t' => salida.push_str("\\t"),
            c if (c as u32) < 0x20 => salida.push_str(&format!("\\u{:04x}", c as u32)),
            c => salida.push(c),
        }
    }
    salida.push('"');
    salida
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decodificar(mappings: &str) -> Vec<usize> {
        // Lo justo para los tests: un segmento por línea, del que solo
        // interesa el tercer valor (la línea de origen, acumulada).
        let mut lineas = Vec::new();
        let mut acumulado = 0i64;
        for linea in mappings.split(';') {
            let valores = descodificar_segmento(linea);
            acumulado += valores[2];
            lineas.push(usize::try_from(acumulado).expect("línea negativa"));
        }
        lineas
    }

    fn descodificar_segmento(segmento: &str) -> Vec<i64> {
        const DIGITOS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut valores = Vec::new();
        let mut acumulado = 0i64;
        let mut desplazamiento = 0u32;

        for byte in segmento.bytes() {
            let digito = DIGITOS
                .iter()
                .position(|d| *d == byte)
                .expect("carácter fuera del alfabeto") as i64;
            acumulado += (digito & 0b1_1111) << desplazamiento;
            if digito & 0b10_0000 == 0 {
                let negativo = acumulado & 1 == 1;
                let valor = acumulado >> 1;
                valores.push(if negativo { -valor } else { valor });
                acumulado = 0;
                desplazamiento = 0;
            } else {
                desplazamiento += 5;
            }
        }
        valores
    }

    #[test]
    fn el_vlq_va_y_vuelve() {
        for valor in [0i64, 1, -1, 15, 16, -16, 1000, -1000, 123_456] {
            let mut texto = String::new();
            vlq(valor, &mut texto);
            assert_eq!(descodificar_segmento(&texto), vec![valor], "{valor}");
        }
    }

    #[test]
    fn un_archivo_sin_tocar_se_mapea_linea_a_linea() {
        let fuente = "uno\ndos\ntres\n";
        let mapa = construir("x.ts", fuente, &lineas_propias(fuente));
        let mappings = mapa
            .split("\"mappings\":\"")
            .nth(1)
            .and_then(|resto| resto.split('"').next())
            .expect("debería haber mappings");

        assert_eq!(decodificar(mappings), vec![0, 1, 2, 3]);
    }

    #[test]
    fn lo_generado_apunta_a_la_linea_de_su_plantilla() {
        let mut salida = String::new();
        let mut procedencia = Vec::new();

        añadir(
            &mut salida,
            &mut procedencia,
            "const a = 1;\n",
            Origen::Copiado(0),
        );
        añadir(
            &mut salida,
            &mut procedencia,
            "(() => {\n  x;\n})()",
            Origen::Generado(1),
        );
        añadir(
            &mut salida,
            &mut procedencia,
            ";\nfin\n",
            Origen::Copiado(1),
        );

        // Las tres líneas de lo generado señalan a la línea 1, y lo copiado
        // después sigue contando desde la suya: `;` cierra la línea 1, `fin`
        // es la 2 y el salto final abre la 3.
        assert_eq!(procedencia, vec![0, 1, 1, 1, 2, 3]);
    }

    #[test]
    fn el_original_viaja_dentro_del_mapa() {
        let fuente = "const saludo = \"hola\";\n";
        let mapa = construir("src/app.ts", fuente, &lineas_propias(fuente));
        assert!(mapa.contains("\"sources\":[\"src/app.ts\"]"), "{mapa}");
        assert!(mapa.contains("const saludo = \\\"hola\\\";"), "{mapa}");
        assert!(mapa.contains("\"version\":3"), "{mapa}");
    }
}
