"use strict";
/**
 * # ascua-ts-plugin
 *
 * Lleva al editor lo que `ascua-check` comprueba en la línea de comandos:
 * errores de tipos dentro de las plantillas, en rojo mientras se escribe, más
 * autocompletado de props, ir a la definición y el tipo de un componente al
 * pasar por encima.
 *
 * ```jsonc
 * // tsconfig.json
 * { "compilerOptions": { "plugins": [{ "name": "ascua-ts-plugin" }] } }
 * ```
 *
 * Los errores salen del mismo sitio que en `ascua-check`: el archivo se
 * compila, y TypeScript comprueba el resultado —que es TypeScript tipado—.
 * Para no rehacer el proyecto entero en cada tecla, el programa de la versión
 * compilada reutiliza todos los archivos del programa del editor menos el que
 * se está mirando.
 *
 * Es un plugin de `tsserver`: funciona con TypeScript 5 y 6, que son los que
 * usan los editores. TypeScript 7, el nativo, todavía no admite plugins; para
 * él está `ascua-check`.
 */

const { createRequire } = require("node:module");
const { join } = require("node:path");

const { enmascarar, etiquetaEn, lineasDeOrigen, plantillaEn } = require("./plantilla.js");

const PLANTILLA = /\b(?:view|html)`/;
/** Código propio para los errores de sintaxis de una plantilla. */
const ERROR_DE_PLANTILLA = 90001;

function init({ typescript: ts }) {
  function create(info) {
    const ls = info.languageService;
    const registrar = (mensaje) => info.project?.projectService?.logger?.info?.(`[ascua] ${mensaje}`);
    const compilar = localizarCompilador(info);
    if (!compilar) {
      registrar("no se encuentra ascua-compilador: el plugin no hace nada");
      return ls;
    }
    registrar("activo");

    /** Por archivo: el texto que se compiló y lo que salió, para no repetirlo. */
    const cache = new Map();

    const programa = () => ls.getProgram();

    // -------------------------------------------------------------------------
    // Diagnósticos

    function diagnosticosDePlantillas(nombre) {
      const prog = programa();
      const archivo = prog?.getSourceFile(nombre);
      if (!archivo || !PLANTILLA.test(archivo.text)) return [];

      const previo = cache.get(nombre);
      if (previo && previo.texto === archivo.text && previo.programa === prog) return previo.diagnosticos;

      let diagnosticos;
      try {
        diagnosticos = comprobar(prog, archivo);
      } catch (error) {
        diagnosticos = errorDeCompilacion(archivo, error);
      }
      cache.set(nombre, { texto: archivo.text, programa: prog, diagnosticos });
      return diagnosticos;
    }

    function comprobar(prog, archivo) {
      const salida = JSON.parse(compilar(archivo.text, archivo.fileName));
      const generado = salida.code;
      const origen = salida.map ? lineasDeOrigen(salida.map) : [];
      const lineasOriginales = archivo.text.split("\n");
      const lineasGeneradas = generado.split("\n");

      // Un programa igual al del editor, salvo este archivo, que va compilado.
      const opciones = prog.getCompilerOptions();
      const host = ts.createCompilerHost(opciones, true);
      const leer = host.getSourceFile.bind(host);
      host.getSourceFile = (nombre, idioma, ...resto) => {
        if (nombre === archivo.fileName) return ts.createSourceFile(nombre, generado, idioma, true);
        return prog.getSourceFile(nombre) ?? leer(nombre, idioma, ...resto);
      };
      const virtual = ts.createProgram({
        rootNames: prog.getRootFileNames(),
        options: opciones,
        host,
        oldProgram: prog,
      });
      const compilado = virtual.getSourceFile(archivo.fileName);
      if (!compilado) return [];

      const vistos = new Set();
      const resultado = [];
      for (const d of virtual.getSemanticDiagnostics(compilado)) {
        if (d.start === undefined) continue;
        const { line, character } = compilado.getLineAndCharacterOfPosition(d.start);
        const generada = lineasGeneradas[line] ?? "";
        const linea = origen[line] ?? 0;
        const escrita = lineasOriginales[linea] ?? "";

        // Lo copiado sin tocar ya lo informa TypeScript en el original, y el
        // import que añade el compilador no es de nadie.
        if (generada === escrita) continue;
        if (line === 0 && generada.includes('from "ascua"')) continue;

        // La columna: lo que señala el error, buscado en la línea original.
        const senalado = /^[\w$.]+/.exec(generada.slice(character))?.[0] ?? "";
        const donde = senalado ? escrita.indexOf(senalado) : -1;
        const columna = donde >= 0 ? donde : Math.max(0, escrita.search(/\S/));
        const largo = donde >= 0 ? senalado.length : Math.max(1, escrita.trimEnd().length - columna);
        const inicio = archivo.getPositionOfLineAndCharacter(linea, columna);

        const clave = `${inicio}:${d.code}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        resultado.push({
          file: archivo,
          start: inicio,
          length: largo,
          messageText: d.messageText,
          category: d.category,
          code: d.code,
          source: "ascua",
        });
      }
      return resultado;
    }

    function errorDeCompilacion(archivo, error) {
      const texto = String(error?.message ?? error);
      const partes = /^línea (\d+): (.*)$/s.exec(texto);
      const linea = partes ? Math.max(0, Number(partes[1]) - 1) : 0;
      const inicio = archivo.getPositionOfLineAndCharacter(Math.min(linea, archivo.getLineStarts().length - 1), 0);
      const fin = archivo.text.indexOf("\n", inicio);
      return [
        {
          file: archivo,
          start: inicio,
          length: (fin < 0 ? archivo.text.length : fin) - inicio,
          messageText: `Ascua: ${partes ? partes[2] : texto}`,
          category: ts.DiagnosticCategory.Error,
          code: ERROR_DE_PLANTILLA,
          source: "ascua",
        },
      ];
    }

    // -------------------------------------------------------------------------
    // Lo que hay bajo el cursor

    /** La etiqueta de la plantilla en `posicion`, si la hay. */
    function etiqueta(nombre, posicion) {
      const archivo = programa()?.getSourceFile(nombre);
      if (!archivo) return undefined;
      const nodo = plantillaEn(ts, archivo, posicion);
      if (!nodo) return undefined;
      const { inicio, texto } = enmascarar(ts, archivo, nodo);
      const encontrada = etiquetaEn(texto, posicion - inicio);
      return encontrada && { ...encontrada, nodo, inicioNombre: inicio + encontrada.inicioNombre };
    }

    /** El símbolo del componente con ese nombre, visible desde la plantilla. */
    function componente(nombre, nodo) {
      const checker = programa().getTypeChecker();
      let simbolo = checker
        .getSymbolsInScope(nodo, ts.SymbolFlags.Value | ts.SymbolFlags.Alias)
        .find((s) => s.name === nombre);
      if (simbolo && simbolo.flags & ts.SymbolFlags.Alias) simbolo = checker.getAliasedSymbol(simbolo);
      return simbolo;
    }

    /** El tipo de los props: el del primer parámetro del componente. */
    function tipoDeProps(simbolo, nodo) {
      const checker = programa().getTypeChecker();
      const firma = checker.getTypeOfSymbolAtLocation(simbolo, nodo).getCallSignatures()[0];
      const parametro = firma?.parameters[0];
      return parametro ? checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(parametro, nodo)) : undefined;
    }

    // -------------------------------------------------------------------------
    // El proxy

    const proxy = Object.create(null);
    for (const clave of Object.keys(ls)) {
      const original = ls[clave];
      proxy[clave] = (...argumentos) => original.apply(ls, argumentos);
    }

    proxy.getSemanticDiagnostics = (nombre) => {
      const base = ls.getSemanticDiagnostics(nombre);
      try {
        return base.concat(diagnosticosDePlantillas(nombre));
      } catch (error) {
        registrar(`diagnósticos: ${error?.stack ?? error}`);
        return base;
      }
    };

    proxy.getCompletionsAtPosition = (nombre, posicion, opciones, formato) => {
      const base = ls.getCompletionsAtPosition(nombre, posicion, opciones, formato);
      try {
        const aqui = etiqueta(nombre, posicion);
        if (!aqui?.esComponente || aqui.enNombre || aqui.enValor) return base;
        const simbolo = componente(aqui.nombre, aqui.nodo);
        const props = simbolo && tipoDeProps(simbolo, aqui.nodo);
        if (!props) return base;

        const checker = programa().getTypeChecker();
        const entradas = checker
          .getPropertiesOfType(props)
          .filter((p) => p.name !== "children" && !aqui.escritos.has(p.name))
          .map((p) => {
            const opcional = (p.flags & ts.SymbolFlags.Optional) !== 0;
            return {
              name: p.name,
              kind: ts.ScriptElementKind.memberVariableElement,
              kindModifiers: opcional ? "optional" : "",
              // Los obligatorios primero: son los que faltan.
              sortText: opcional ? "1" : "0",
              replacementSpan: { start: posicion - aqui.prefijo.length, length: aqui.prefijo.length },
            };
          });
        if (entradas.length === 0) return base;
        return {
          isGlobalCompletion: false,
          isMemberCompletion: true,
          isNewIdentifierLocation: false,
          entries: entradas,
        };
      } catch (error) {
        registrar(`completar: ${error?.stack ?? error}`);
        return base;
      }
    };

    const definicion = (nombre, posicion) => {
      const aqui = etiqueta(nombre, posicion);
      if (!aqui?.esComponente || !aqui.enNombre) return undefined;
      const simbolo = componente(aqui.nombre, aqui.nodo);
      const declaracion = simbolo?.declarations?.[0];
      if (!declaracion) return undefined;
      const destino = declaracion.name ?? declaracion;
      return {
        definitions: [
          {
            fileName: declaracion.getSourceFile().fileName,
            textSpan: { start: destino.getStart(), length: destino.getWidth() },
            kind: ts.ScriptElementKind.functionElement,
            name: aqui.nombre,
            containerKind: ts.ScriptElementKind.unknown,
            containerName: "",
          },
        ],
        textSpan: { start: aqui.inicioNombre, length: aqui.nombre.length },
      };
    };

    proxy.getDefinitionAndBoundSpan = (nombre, posicion) => {
      const base = ls.getDefinitionAndBoundSpan(nombre, posicion);
      if (base?.definitions?.length) return base;
      try {
        return definicion(nombre, posicion) ?? base;
      } catch (error) {
        registrar(`definición: ${error?.stack ?? error}`);
        return base;
      }
    };

    proxy.getDefinitionAtPosition = (nombre, posicion) => {
      const base = ls.getDefinitionAtPosition(nombre, posicion);
      if (base?.length) return base;
      try {
        return definicion(nombre, posicion)?.definitions ?? base;
      } catch {
        return base;
      }
    };

    proxy.getQuickInfoAtPosition = (nombre, posicion) => {
      const base = ls.getQuickInfoAtPosition(nombre, posicion);
      try {
        const aqui = etiqueta(nombre, posicion);
        if (!aqui?.esComponente || !aqui.enNombre) return base;
        const simbolo = componente(aqui.nombre, aqui.nodo);
        if (!simbolo) return base;
        const checker = programa().getTypeChecker();
        const tipo = checker.getTypeOfSymbolAtLocation(simbolo, aqui.nodo);
        const firma = tipo.getCallSignatures()[0];
        const texto = firma
          ? `${aqui.nombre}${checker.signatureToString(firma)}`
          : `${aqui.nombre}: ${checker.typeToString(tipo)}`;
        return {
          kind: ts.ScriptElementKind.functionElement,
          kindModifiers: "",
          textSpan: { start: aqui.inicioNombre, length: aqui.nombre.length },
          displayParts: [{ text: `(componente) ${texto}`, kind: "text" }],
          documentation: simbolo.getDocumentationComment(checker),
          tags: [],
        };
      } catch (error) {
        registrar(`hover: ${error?.stack ?? error}`);
        return base;
      }
    };

    return proxy;
  }

  return { create };
}

/** El compilador, buscado desde el proyecto y desde este paquete. */
function localizarCompilador(info) {
  const desde = [];
  const directorio = info.project?.getCurrentDirectory?.();
  if (directorio) desde.push(join(directorio, "package.json"));
  desde.push(__filename);
  for (const lugar of desde) {
    try {
      const wasm = createRequire(lugar)("ascua-compilador");
      return (codigo, archivo) => wasm.compilar_json(codigo, archivo);
    } catch {
      // Se prueba el siguiente.
    }
  }
  return undefined;
}

module.exports = init;
