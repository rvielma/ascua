//! Suite de comportamiento del grafo reactivo.
//!
//! Cada test afirma una propiedad del modelo, no un detalle de implementación:
//! si algún día se reescribe el runtime, esta suite debe seguir pasando tal
//! cual. Todo corre sin DOM ni WASM.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use ascua_reactive::{
    batch, create_effect, create_memo, create_root, live_node_count, on_cleanup, untrack, Signal,
};

/// Par (lector, escritor) sobre el mismo almacenamiento compartido.
type Compartido<T> = (Rc<T>, Rc<T>);

/// Registro de lo que ha ido viendo un efecto, para afirmar *cuántas* veces
/// corrió y *con qué* valores.
fn registro<T: 'static>() -> Compartido<RefCell<Vec<T>>> {
    let log = Rc::new(RefCell::new(Vec::new()));
    let escritor = Rc::clone(&log);
    (log, escritor)
}

fn contador() -> Compartido<Cell<u32>> {
    let n = Rc::new(Cell::new(0));
    let escritor = Rc::clone(&n);
    (n, escritor)
}

#[test]
fn signal_guarda_lee_y_muta_en_el_sitio() {
    let (_, root) = create_root(|| {
        let items = Signal::new(vec![1, 2]);
        assert_eq!(items.get(), vec![1, 2]);

        items.update(|v| v.push(3));
        assert_eq!(items.with(Vec::len), 3);

        items.set(vec![9]);
        assert_eq!(items.get(), vec![9]);
    });
    root.dispose();
}

#[test]
fn el_efecto_corre_al_crearse_y_en_cada_cambio() {
    let (log, escritor) = registro::<i32>();

    let (count, root) = create_root(move || {
        let count = Signal::new(0);
        create_effect(move || escritor.borrow_mut().push(count.get()));
        count
    });

    count.set(1);
    count.set(2);

    assert_eq!(*log.borrow(), vec![0, 1, 2]);
    root.dispose();
}

#[test]
fn el_efecto_solo_reacciona_a_lo_que_lee() {
    let (n, escritor) = contador();

    let (signals, root) = create_root(move || {
        let leido = Signal::new(0);
        let ignorado = Signal::new(0);
        create_effect(move || {
            leido.get();
            escritor.set(escritor.get() + 1);
        });
        (leido, ignorado)
    });
    let (leido, ignorado) = signals;

    ignorado.set(1);
    assert_eq!(
        n.get(),
        1,
        "un signal que el efecto no lee no debe despertarlo"
    );

    leido.set(1);
    assert_eq!(n.get(), 2);
    root.dispose();
}

#[test]
fn el_memo_es_perezoso() {
    let (n, escritor) = contador();

    let (_, root) = create_root(move || {
        let count = Signal::new(1);
        let doble = create_memo(move || {
            escritor.set(escritor.get() + 1);
            count.get() * 2
        });
        assert_eq!(n.get(), 0, "crear un memo no debe ejecutarlo");

        assert_eq!(doble.get(), 2);
        assert_eq!(n.get(), 1, "se ejecuta en la primera lectura");

        assert_eq!(doble.get(), 2);
        assert_eq!(n.get(), 1, "una segunda lectura sin cambios no recalcula");

        count.set(5);
        assert_eq!(n.get(), 1, "invalidar no recalcula: nadie lo ha leído aún");

        assert_eq!(doble.get(), 10);
        assert_eq!(n.get(), 2);
    });
    root.dispose();
}

#[test]
fn el_memo_corta_la_propagacion_si_su_valor_no_cambia() {
    let (n, escritor) = contador();

    let (count, root) = create_root(move || {
        let count = Signal::new(0);
        let muchos = create_memo(move || count.get() > 2);
        create_effect(move || {
            muchos.get();
            escritor.set(escritor.get() + 1);
        });
        count
    });

    assert_eq!(n.get(), 1);

    count.set(1);
    count.set(2);
    assert_eq!(
        n.get(),
        1,
        "el booleano sigue siendo false: el efecto no corre"
    );

    count.set(3);
    assert_eq!(n.get(), 2, "ahora el booleano cambió");

    count.set(4);
    assert_eq!(n.get(), 2, "sigue siendo true");
    root.dispose();
}

#[test]
fn diamante_sin_glitch_ni_ejecucion_doble() {
    // a -> b -\
    //  \-> c --> efecto
    let (log, escritor) = registro::<(i32, i32)>();
    let (n, contador_ejecuciones) = contador();

    let (a, root) = create_root(move || {
        let a = Signal::new(1);
        let b = create_memo(move || a.get() + 1);
        let c = create_memo(move || a.get() * 10);
        create_effect(move || {
            contador_ejecuciones.set(contador_ejecuciones.get() + 1);
            escritor.borrow_mut().push((b.get(), c.get()));
        });
        a
    });

    a.set(2);

    assert_eq!(
        n.get(),
        2,
        "una escritura en 'a' debe producir UNA ejecución"
    );
    assert_eq!(
        *log.borrow(),
        vec![(2, 10), (3, 20)],
        "nunca debe verse un estado intermedio como (3, 10)"
    );
    root.dispose();
}

#[test]
fn las_dependencias_son_dinamicas() {
    let (log, escritor) = registro::<i32>();

    let (signals, root) = create_root(move || {
        let usar_a = Signal::new(true);
        let a = Signal::new(1);
        let b = Signal::new(10);
        create_effect(move || {
            let valor = if usar_a.get() { a.get() } else { b.get() };
            escritor.borrow_mut().push(valor);
        });
        (usar_a, a, b)
    });
    let (usar_a, a, b) = signals;

    b.set(20); // rama inactiva: no debe despertar al efecto
    assert_eq!(*log.borrow(), vec![1]);

    usar_a.set(false);
    assert_eq!(*log.borrow(), vec![1, 20]);

    a.set(2); // ahora es 'a' la rama inactiva
    assert_eq!(*log.borrow(), vec![1, 20]);

    b.set(30);
    assert_eq!(*log.borrow(), vec![1, 20, 30]);
    root.dispose();
}

#[test]
fn batch_agrupa_las_escrituras_en_una_sola_ejecucion() {
    let (log, escritor) = registro::<i32>();

    let (count, root) = create_root(move || {
        let count = Signal::new(0);
        create_effect(move || escritor.borrow_mut().push(count.get()));
        count
    });

    batch(|| {
        count.set(1);
        count.set(2);
        count.set(3);
    });

    assert_eq!(
        *log.borrow(),
        vec![0, 3],
        "solo el valor final llega al efecto"
    );
    root.dispose();
}

#[test]
fn untrack_lee_sin_suscribir() {
    let (n, escritor) = contador();

    let (signals, root) = create_root(move || {
        let trackeado = Signal::new(0);
        let oculto = Signal::new(0);
        create_effect(move || {
            trackeado.get();
            untrack(|| oculto.get());
            escritor.set(escritor.get() + 1);
        });
        (trackeado, oculto)
    });
    let (trackeado, oculto) = signals;

    oculto.set(1);
    assert_eq!(n.get(), 1);

    trackeado.set(1);
    assert_eq!(n.get(), 2);
    root.dispose();
}

#[test]
fn on_cleanup_corre_antes_de_cada_reejecucion_y_al_liberar() {
    let (log, escritor) = registro::<&'static str>();

    let (count, root) = create_root(move || {
        let count = Signal::new(0);
        create_effect(move || {
            count.get();
            let escritor = Rc::clone(&escritor);
            escritor.borrow_mut().push("run");
            on_cleanup(move || escritor.borrow_mut().push("cleanup"));
        });
        count
    });

    count.set(1);
    assert_eq!(*log.borrow(), vec!["run", "cleanup", "run"]);

    root.dispose();
    assert_eq!(*log.borrow(), vec!["run", "cleanup", "run", "cleanup"]);
}

#[test]
fn un_efecto_anidado_se_libera_con_su_padre() {
    let (n, escritor) = contador();

    let (signals, root) = create_root(move || {
        let padre = Signal::new(0);
        let hijo = Signal::new(0);
        create_effect(move || {
            padre.get();
            let escritor = Rc::clone(&escritor);
            create_effect(move || {
                hijo.get();
                escritor.set(escritor.get() + 1);
            });
        });
        (padre, hijo)
    });
    let (padre, hijo) = signals;

    assert_eq!(n.get(), 1);

    hijo.set(1);
    assert_eq!(n.get(), 2);

    // Al reejecutarse el padre, el hijo anterior se libera y se crea uno nuevo:
    // si el viejo siguiera vivo, la siguiente escritura contaría dos veces.
    padre.set(1);
    assert_eq!(n.get(), 3);

    hijo.set(2);
    assert_eq!(n.get(), 4, "solo debe quedar vivo un efecto hijo");
    root.dispose();
}

#[test]
fn liberar_la_raiz_deja_el_grafo_vacio() {
    let inicial = live_node_count();

    let (count, root) = create_root(|| {
        let count = Signal::new(0);
        let doble = create_memo(move || count.get() * 2);
        create_effect(move || {
            doble.get();
        });
        count
    });

    assert!(
        live_node_count() > inicial,
        "el árbol reactivo debe existir"
    );

    root.dispose();
    assert_eq!(
        live_node_count(),
        inicial,
        "liberar la raíz no puede dejar nodos huérfanos"
    );

    // El signal sobrevive como identificador, pero ya no resuelve: leerlo con la
    // API tolerante devuelve None en vez de apuntar a memoria ajena.
    assert_eq!(count.try_with(|v| *v), None);
}

#[test]
fn una_escritura_dentro_de_un_efecto_propaga_en_cascada() {
    let (log, escritor) = registro::<i32>();

    let (origen, root) = create_root(move || {
        let origen = Signal::new(1);
        let derivado = Signal::new(0);

        create_effect(move || derivado.set(origen.get() * 10));
        create_effect(move || escritor.borrow_mut().push(derivado.get()));

        origen
    });

    origen.set(2);

    assert_eq!(*log.borrow(), vec![10, 20]);
    root.dispose();
}

#[test]
fn se_pueden_leer_signals_dentro_de_la_lectura_de_otro() {
    // Regresión: `a.with(|x| b.with(|y| ...))` hacía panicar el `RefCell` del
    // grafo, porque la lectura exterior lo mantenía prestado y registrar la
    // dependencia de la interior necesitaba mutarlo. Lo destapó el demo del
    // navegador, no la suite: es el patrón más natural del mundo cuando un
    // signal guarda una colección.
    let (_, root) = create_root(|| {
        let lista = Signal::new(vec![1, 2, 3, 4]);
        let minimo = Signal::new(3);

        let cuantos =
            lista.with(|lista| minimo.with(|min| lista.iter().filter(|n| *n >= min).count()));
        assert_eq!(cuantos, 2);

        // Y el mismo signal anidado consigo mismo: son préstamos inmutables.
        let doble = lista.with(|a| lista.with(|b| a.len() + b.len()));
        assert_eq!(doble, 8);
    });
    root.dispose();
}

#[test]
fn una_lectura_anidada_tambien_crea_la_suscripcion() {
    let (n, escritor) = contador();

    let (signals, root) = create_root(move || {
        let externo = Signal::new(vec![1, 2]);
        let interno = Signal::new(10);
        create_effect(move || {
            externo.with(|lista| interno.with(|n| lista.len() + n));
            escritor.set(escritor.get() + 1);
        });
        (externo, interno)
    });
    let (externo, interno) = signals;

    assert_eq!(n.get(), 1);

    interno.set(20);
    assert_eq!(
        n.get(),
        2,
        "el signal leído por dentro debe quedar suscrito"
    );

    externo.update(|lista| lista.push(3));
    assert_eq!(n.get(), 3);
    root.dispose();
}
