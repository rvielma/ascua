---
titulo: Rendimiento
descripcion: Ascua frente a vanilla, Solid y React en las operaciones de js-framework-benchmark. A la par de Solid, y a la mitad del coste de React.
---

## El resultado

Tiempo de cada operación dividido por el de **vanilla** —el mismo DOM escrito a
mano— en la misma ronda. `1,00` es tan rápido como el código a mano; más bajo
es mejor.

| Operación | Ascua | Solid | React |
|---|---|---|---|
| Crear 1.000 filas | 1,16 | 1,04 | 1,29 |
| Reemplazar 1.000 | 1,20 | 1,09 | 1,55 |
| Actualizar 1 de cada 10 | 1,04 | 1,06 | 1,07 |
| Intercambiar dos filas | 1,29 | 1,26 | 13,94 |
| Quitar una fila | 1,31 | 1,22 | 1,72 |
| Crear 10.000 filas | 1,26 | 1,17 | 3,43 |
| Añadir 1.000 a 1.000 | 1,12 | 1,09 | 1,25 |
| Vaciar 1.000 filas | 1,60 | 1,24 | 2,26 |
| **Media geométrica** | **1,21** | **1,22** | **2,47** |

**Ascua queda a la par de Solid y cuesta la mitad que React.** La media
geométrica es la que usa js-framework-benchmark para resumir: una operación diez
veces más lenta no se compensa con diez que van un poco más rápido.

Donde más se nota la diferencia con React es en lo que un Virtual DOM hace peor:
intercambiar dos filas de mil —React mueve casi todas, Ascua mueve dos— y crear
diez mil.

Ascua 0.1.1, Solid 1.9.15, React 19.3.0. Chrome 153 en un Apple M3 con macOS
27, el 24 de septiembre de 2026. Los datos crudos, en milisegundos y por ronda,
están en [`benchmarks/resultados/`](https://github.com/rvielma/ascua/tree/main/benchmarks/resultados).

> **Nota:** «seleccionar una fila» no está en la tabla. Tarda alrededor de
> 0,1 ms en los cuatro, que es la resolución del reloj del navegador sin
> aislamiento de origen cruzado: los factores que salen ahí —1, 2 o 7— miden
> el redondeo, no la operación. En milisegundos, Ascua y vanilla dan 0,1;
> Solid, 0,2; React, 0,7.

## Qué se mide

Las operaciones de [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark),
sobre la misma tabla y los mismos datos para los cuatro: filas con un id y una
etiqueta de tres palabras al azar, un botón por operación y un enlace para
seleccionar o quitar cada fila.

Cada contendiente está escrito **como dice su documentación**, sin atajos que
un usuario no tomaría:

- **Ascua**: un signal por etiqueta, `<For>` con clave y
  [`selector`](/docs/reactividad/#selector-elegir-uno-entre-mil) para la fila
  elegida.
- **Solid**: `createSignal`, `<For>` y `createSelector`, como su versión en
  js-framework-benchmark.
- **React**: estado en un reducer y filas memoizadas con `memo`, como la suya.
- **Vanilla**: el DOM a mano, que es el suelo.

## Cómo se mide

El tiempo va **desde el click hasta que el DOM está actualizado y maquetado**:
tras la operación se deja correr lo que el framework haya programado y se fuerza
el layout leyendo `offsetHeight`. Entra el recálculo de estilos y la
maquetación; no entra el pintado. js-framework-benchmark sí lo incluye —mide
con trazas de Chrome—, así que **los números absolutos no son comparables con
los suyos, y los relativos sí**.

Después de cada vuelta se comprueba que el DOM quedó como debe. Si un framework
deja trabajo pendiente —React programa el suyo en una microtarea—, la
comprobación falla y no sale un número falso.

La máquina cambia de velocidad mientras se mide: temperatura, lo que haya
abierto. En esta máquina, dos pasadas seguidas llegaron a diferir un 30 %. Por
eso nada se compara entre pasadas:

- Cada **ronda** mide a los cuatro seguidos, rotando el orden.
- Cada tiempo se expresa como **factor sobre vanilla de esa misma ronda**: la
  deriva afecta a todos por igual y se cancela en el cociente.
- Por operación, 5 vueltas de calentamiento y 15 medidas; se toma la
  **mediana**. Entre rondas, la mediana de los factores.

## Reproducirlo

```sh
for d in vanilla ascua solid react; do
  (cd benchmarks/$d && stil install && stil exec vite build)
done
bash scripts/enlazar-paquetes.sh
python3 -m http.server 5191 --directory benchmarks
```

Y en `http://localhost:5191/`, el botón **correr**, o en la consola:

```js
await correr({ rondas: 3, vueltas: 15, calentamiento: 5 });
```

Tarda unos cinco minutos. Los resultados cambian de una máquina a otra; los
factores, bastante menos.

## Lo que no dice

Una tabla de mil filas es un caso concreto. Mide el coste de crear, mover y
quitar nodos, que es donde los frameworks se diferencian, pero no el arranque,
ni la memoria, ni cómo se comporta una aplicación de verdad con cien
componentes distintos. El tamaño, en cambio, se mide solo:
[2,23 kB](/docs/como-funciona/#lo-que-cuesta) de runtime frente a los ~45 kB de
React.
---
titulo: Rendimiento
descripcion: Ascua frente a vanilla, Solid y React en las operaciones de js-framework-benchmark. A la par de Solid, y a la mitad del coste de React.
---

## El resultado

Tiempo de cada operación dividido por el de **vanilla** —el mismo DOM escrito a
mano— en la misma ronda. `1,00` es tan rápido como el código a mano; más bajo
es mejor.

| Operación | Ascua | Solid | React |
|---|---|---|---|
| Crear 1.000 filas | 1,16 | 1,04 | 1,29 |
| Reemplazar 1.000 | 1,20 | 1,09 | 1,55 |
| Actualizar 1 de cada 10 | 1,04 | 1,06 | 1,07 |
| Intercambiar dos filas | 1,29 | 1,26 | 13,94 |
| Quitar una fila | 1,31 | 1,22 | 1,72 |
| Crear 10.000 filas | 1,26 | 1,17 | 3,43 |
| Añadir 1.000 a 1.000 | 1,12 | 1,09 | 1,25 |
| Vaciar 1.000 filas | 1,60 | 1,24 | 2,26 |
| **Media geométrica** | **1,21** | **1,22** | **2,47** |

**Ascua queda a la par de Solid y cuesta la mitad que React.** La media
geométrica es la que usa js-framework-benchmark para resumir: una operación diez
veces más lenta no se compensa con diez que van un poco más rápido.

Donde más se nota la diferencia con React es en lo que un Virtual DOM hace peor:
intercambiar dos filas de mil —React mueve casi todas, Ascua mueve dos— y crear
diez mil.

Ascua 0.1.1, Solid 1.9.15, React 19.3.0. Chrome 153 en un Apple M3 con macOS
27, el 24 de septiembre de 2026. Los datos crudos, en milisegundos y por ronda,
están en [`benchmarks/resultados/`](https://github.com/rvielma/ascua/tree/main/benchmarks/resultados).

> **Nota:** «seleccionar una fila» no está en la tabla. Tarda alrededor de
> 0,1 ms en los cuatro, que es la resolución del reloj del navegador sin
> aislamiento de origen cruzado: los factores que salen ahí —1, 2 o 7— miden
> el redondeo, no la operación. En milisegundos, Ascua y vanilla dan 0,1;
> Solid, 0,2; React, 0,7.

## Qué se mide

Las operaciones de [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark),
sobre la misma tabla y los mismos datos para los cuatro: filas con un id y una
etiqueta de tres palabras al azar, un botón por operación y un enlace para
seleccionar o quitar cada fila.

Cada contendiente está escrito **como dice su documentación**, sin atajos que
un usuario no tomaría:

- **Ascua**: un signal por etiqueta, `<For>` con clave y
  [`selector`](/docs/reactividad/#selector-elegir-uno-entre-mil) para la fila
  elegida.
- **Solid**: `createSignal`, `<For>` y `createSelector`, como su versión en
  js-framework-benchmark.
- **React**: estado en un reducer y filas memoizadas con `memo`, como la suya.
- **Vanilla**: el DOM a mano, que es el suelo.

## Cómo se mide

El tiempo va **desde el click hasta que el DOM está actualizado y maquetado**:
tras la operación se deja correr lo que el framework haya programado y se fuerza
el layout leyendo `offsetHeight`. Entra el recálculo de estilos y la
maquetación; no entra el pintado. js-framework-benchmark sí lo incluye —mide
con trazas de Chrome—, así que **los números absolutos no son comparables con
los suyos, y los relativos sí**.

Después de cada vuelta se comprueba que el DOM quedó como debe. Si un framework
deja trabajo pendiente —React programa el suyo en una microtarea—, la
comprobación falla y no sale un número falso.

La máquina cambia de velocidad mientras se mide: temperatura, lo que haya
abierto. En esta máquina, dos pasadas seguidas llegaron a diferir un 30 %. Por
eso nada se compara entre pasadas:

- Cada **ronda** mide a los cuatro seguidos, rotando el orden.
- Cada tiempo se expresa como **factor sobre vanilla de esa misma ronda**: la
  deriva afecta a todos por igual y se cancela en el cociente.
- Por operación, 5 vueltas de calentamiento y 15 medidas; se toma la
  **mediana**. Entre rondas, la mediana de los factores.

## Reproducirlo

```sh
for d in vanilla ascua solid react; do
  (cd benchmarks/$d && stil install && stil exec vite build)
done
bash scripts/enlazar-paquetes.sh
python3 -m http.server 5191 --directory benchmarks
```

Y en `http://localhost:5191/`, el botón **correr**, o en la consola:

```js
await correr({ rondas: 3, vueltas: 15, calentamiento: 5 });
```

Tarda unos cinco minutos. Los resultados cambian de una máquina a otra; los
factores, bastante menos.

## Lo que no dice

Una tabla de mil filas es un caso concreto. Mide el coste de crear, mover y
quitar nodos, que es donde los frameworks se diferencian, pero no el arranque,
ni la memoria, ni cómo se comporta una aplicación de verdad con cien
componentes distintos. El tamaño, en cambio, se mide solo:
[2,23 kB](/docs/como-funciona/#lo-que-cuesta) de runtime frente a los ~45 kB de
React.
