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
- Dos power-ups: «Velocidad» (⚡) y «Triple shot» (tridente)

## Power-up "Velocidad"

- Al destruir un asteroide hay un 12% de probabilidad de soltar un rayo ⚡
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

## Asteroide especial «estrella fugaz»

- Aparece periódicamente (cada ~18 s, nunca más de una a la vez) lejos de la nave
- Se mueve **mucho más rápido** que un asteroide normal (~190 px/s frente a los
  32 px/s de un asteroide grande) y **desaparece sola a los 12 s**
  (parpadea en los últimos 2 s y se desvanece al expirar)
- Es de tamaño mediano (radio 30) y tiene una estela violeta con 5 puntas
- Al destruirla **no se parte** en fragmentos y vale **250 puntos**
- Colisiona con la nave como un asteroide normal
- No bloquea el avance de nivel: si es lo último en pantalla, el nivel cambia igual
