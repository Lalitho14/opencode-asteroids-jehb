# Asteroids

Clon del clásico arcade **Asteroids** implementado en canvas HTML5 puro, sin dependencias ni bundler.

## Descripción

Nave espacial en un campo de asteroides con envolvimiento de bordes (el espacio es toroidal). Destruye asteroides para sumar puntos: los grandes se parten en medianos, los medianos en pequeños. Incluye power-ups especiales y tipos de asteroides únicos como la estrella fugaz.

## Tecnologías

- **HTML5 Canvas** — renderizado 2D
- **JavaScript (ES6+)** — lógica del juego en un solo archivo `game.js`
- Sin frameworks, sin bundler, sin dependencias

## Cómo correr

Abre `index.html` directamente en el navegador (doble clic), o usa un servidor local:

```bash
npx serve .
```

Luego visita `http://localhost:3000`.

## Controles

| Tecla     | Acción     |
| --------- | ---------- |
| `←` `→`   | Rotar nave |
| `↑`       | Propulsar  |
| `Espacio` | Disparar   |
| `S`       | Menú de skins |
| `D`       | Tema claro / oscuro |

## Puntuación

| Asteroide        | Puntos |
| ---------------- | ------ |
| Grande           | 20     |
| Mediano          | 50     |
| Pequeño          | 100    |
| Estrella fugaz   | 250    |

## Características

- 3 vidas con invencibilidad temporal al reaparecer (parpadeo)
- Asteroides se parten en fragmentos más pequeños al ser destruidos
- Partículas de explosión al destruir asteroides
- Tres power-ups: «Velocidad» (⚡), «Triple shot» (tridente) y «Escudo» (hexágono)
- Tema claro / oscuro conmutable con la tecla `D` (persistente)

## Skins de la nave

- Pulsa `S` para abrir el **menú de skins**: la partida se pausa y se muestra la
  nave en grande, con su nombre y descripción
- `←` `→` recorren las skins (manteniendo la flecha se repiten solas);
  `Enter`, `Espacio` o `Esc` vuelven al juego
- La skin elegida se guarda en el navegador, así que se recupera al recargar la
  página
- La nave en juego y los iconos de vidas usan siempre la skin activa

| Skin      | Descripción                          |
| --------- | ------------------------------------ |
| Clásica   | La nave original de la serie         |
| Neón      | Trazo cian y llama magenta           |
| Dorada    | Casco dorado                         |
| Delta     | Caza roja de alas en flecha          |
| OVNI      | Platillo verde con cúpula            |
| Fantasma  | Silueta translúcida azul             |

> Con el power-up "Velocidad" la nave se pinta de cian, sea cual sea la skin.

## Tema claro / oscuro

- Pulsa `D` para alternar entre el tema **oscuro** (el negro del espacio) y el
  tema **claro** (modo día)
- El tema se guarda en el navegador, así que se recupera al recargar la página
- Si no hay preferencia guardada, se respeta la del sistema operativo
  (`prefers-color-scheme`)
- Al cambiar, un aviso `TEMA: CLARO` / `TEMA: OSCURO` aparece unos segundos en
  el centro de la pantalla
- El HUD muestra el tema activo junto a la pista de teclado: `D: TEMA OSCURO`
- Cada skin trae su variante para el tema claro (trazo, relleno y llama), de
  modo que la nave se sigue viendo bien en los dos temas
- El cambio de tema se puede hacer en cualquier momento, también con el menú de
  skins abierto

## Power-up "Velocidad"

- Al destruir un asteroide hay un 12% de probabilidad de soltar un rayo ⚡
  (solo cae un power-up por asteroide: 12 % velocidad, 10 % triple shot, 10 % escudo)
- El rayo desaparece solo a los 10 s (parpadea en los últimos 2 s)
- Al recogerlo, la nave se mueve al **doble de velocidad** durante **5 segundos**
  (empuje y velocidad máxima duplicados); la nave y la llama se vuelven cian
- Recoger otro rayo reinicia el contador a 5 s (no se acumulan)

## Power-up «Triple shot»

- Al destruir un asteroide hay un 10% de probabilidad de soltar un **tridente**
  (a la vez que el 12% del rayo ⚡ de velocidad; solo cae un power-up por asteroide)
- El tridente desaparece solo a los 10 s (parpadea en los últimos 2 s)
- Al recogerlo, la nave dispara en **ráfaga triple** durante **5 segundos**:
  cada pulsación de `Espacio` lanza **3 disparos seguidos en la misma línea
  recta** (separados ~70 ms, unos 35–40 px entre balas), que salen en verde
- El tiempo entre ráfagas no cambia (sigue siendo de 0.2 s)
- Recoger otro tridente reinicia el contador a 5 s (no se acumulan)
- El efecto se pierde si la nave muere o al cambiar de nivel (igual que la velocidad)
- El HUD muestra `TRIPLE x.xs` con su icono mientras el efecto está activo

## Power-up "Escudo"

- Al destruir un asteroide normal hay un **10 % de probabilidad** de soltar un hexágono cian
  con glifo de escudo (las estrellas fugaces no sueltan power-ups)
- El escudo desaparece solo a los 10 s (parpadea en los últimos 2 s)
- Al recogerlo la nave gana una **burbuja de escudo con 3 cargas**: cada impacto de asteroide
  o de proyectil enemigo **absorbe el impacto y consume 1 carga**
- El asteroide absorbido se destruye **sin dar puntos y sin partirse** en fragmentos
  (el escudo no sirve para farmear puntuación); la estrella fugaz también se absorbe
- Cuando se agota la última carga la burbuja desaparece y la nave vuelve a morir ante los impactos
- Recoger otro escudo **recarga las cargas al máximo** (no se acumulan)
- Las cargas **se conservan** al cambiar de nivel y al reaparecer tras morir;
  se reinician a 0 al empezar una partida nueva
- La burbuja gira lentamente y late con la opacidad, dibujando **un arco por carga** disponible
- Indicador `ESCUDO` con 3 puntos (llenos = cargas disponibles) en la esquina inferior izquierda del HUD
- El escudo también absorbe los proyectiles marcados como enemigos: hoy no hay enemigos que
  disparen, pero la mecánica ya está lista y hace que la nave muera por ellos si no tiene cargas

> Los tres power-ups son excluyentes: al destruir un asteroide normal cae **como
> máximo uno** (12 % velocidad, 10 % triple shot, 10 % escudo).

## Asteroide especial «estrella fugaz»

- Aparece periódicamente (cada ~18 s, nunca más de una a la vez) lejos de la nave
- Se mueve **mucho más rápido** que un asteroide normal (~190 px/s frente a los
  32 px/s de un asteroide grande) y **desaparece sola a los 12 s**
  (parpadea en los últimos 2 s y se desvanece al expirar)
- Es de tamaño mediano (radio 30) y tiene una estela violeta con 5 puntas
- Al destruirla **no se parte** en fragmentos y vale **250 puntos**
- Colisiona con la nave como un asteroide normal
- No bloquea el avance de nivel: si es lo último en pantalla, el nivel cambia igual
