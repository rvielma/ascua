---
titulo: Lo que queda fuera
descripcion: Lo que Ascua no hace a propósito, y por qué. No son cosas pendientes.
---

Cada cosa que un framework hace la paga quien lo usa: en bytes, en conceptos o
en comportamiento que no se ve. Estas se dejaron fuera después de pensarlas.

## Vistas con varias raíces

Una plantilla tiene un único elemento raíz. Es lo que permite que montar,
desmontar e hidratar sean operaciones sobre **un** nodo, sin fragmentos que
recordar ni rangos que mantener. Donde los fragmentos hacen falta —el contenido
que recibe un componente, una rama de `<Show>`— sí están.

## Insertar nodos con `${expr}`

Un hueco es siempre texto. Distinguir por el tipo del valor —un string es
texto, un nodo se inserta, un array se expande— exige adivinar la intención, y
abre la puerta a inyectar HTML sin querer. Para componer árboles, un
componente.

## JSX, hooks y Server Components

No se busca compatibilidad con el ecosistema de React. JSX obliga a
`className` y a un paso de transformación que ya existe aquí para otra cosa; los
hooks son la respuesta a un modelo de re-render que Ascua no tiene; y los Server
Components resuelven un problema —mezclar componentes de servidor y cliente en
un mismo árbol— que las [islas](/docs/ssr/) resuelven con menos maquinaria.

## Delegación de eventos

`on` pone un listener en cada nodo. La alternativa —uno en la raíz que mira de
dónde vino el click— se probó y se descartó con números: construir 1.000 filas
cuesta 1,7 ms con un listener cada una y 1,5 ms delegando; con 5.000, 9,5
contra 7,2.

Dos décimas de milisegundo en una tabla grande no pagan los bytes que añadiría
al runtime ni la semántica prestada: un `stopPropagation` que ya no para nada,
o eventos que no existen en el nodo donde se escribieron.

## Un contexto para compartir estado

No hay `Provider` ni `useContext`. Un signal es un valor: se comparte
exportándolo de un módulo o pasándolo por props, como cualquier otro. Lo que un
contexto añade —estado distinto por subárbol— se consigue pasando el signal a
ese subárbol.

## Un store con proxies

Un signal guarda una referencia, y cambiar un objeto por dentro no avisa. Los
stores que interceptan cada propiedad con un `Proxy` resuelven eso a costa de
que leer un campo tenga un coste escondido y de que el objeto deje de ser lo
que parece. Aquí se escribe un valor nuevo —`update((l) => [...l, x])`— o se
pone un signal en el campo que cambia.
