# 🏁 Derrape Park — carreras de carros arcade 3D

Juego de carreras de carros en 3D que se juega en el navegador, en PC o en el móvil.
Usa el mismo estilo que [Remate Park](https://github.com/AlejandroEspinoPerez/Volleyball) y [Jonrón Park](https://github.com/AlejandroEspinoPerez/Baseball-Game): pilotos chibi con contorno, materiales toon y pistas hechas con primitivas de three.js.

**Jugar:** https://alejandroespinoperez.github.io/Carreras-Game/

## Modos

- **Carrera contra la PC**: elige pista, vueltas (1, 2, 3 o 5), rivales (3, 5 o 7) y dificultad.
- **En línea (hasta 6 pilotos)**: 🌐 Crear sala y compartir el código, el link o el QR; los amigos entran con 🔗 Unirme. La PC completa la parrilla hasta 4, 6 u 8 carros (o solo amigos). Si alguien se desconecta, la PC maneja su carro; si vuelve a entrar, lo recupera.
- **Copa**: las 5 pistas seguidas sumando puntos (10, 8, 6, 5, 4, 3, 2, 1).
- **Contrarreloj**: corre contra tu fantasma (tu mejor vuelta guardada) y bate tu récord.
- **Tu carro y tu piloto**: 6 carros con estadísticas distintas (Chispa, Rayo, Duna, Bala, Toro, Mula), pintura, franja, llantas, alerón, casco, piel, pelo, accesorio, llama del nitro y claxon. Se desbloquean más opciones al subir de nivel.

## Pistas

| | Pista | Cómo es |
|---|---|---|
| 🌳 | Parque Verde | Fácil, con una lomita y un salto |
| 🏖️ | Costa Playa | Rectas largas junto al mar y saltos en la arena |
| 🌃 | Ciudad Neón | De noche, curvas cerradas y paredes de neón |
| 🏜️ | Cañón Rojo | Subidas, bajadas y un gran salto |
| 🏔️ | Pico Nevado | Nieve resbalosa, horquilla y dos saltos |

## Cómo se juega

- **Derrape**: mantén DERRAPE mientras giras. Las chispas cambian de azul a naranja y a morado; al soltar sales con un turbo más largo cuanto mejor fue el derrape. Derrapando el carro gira mucho más cerrado a toda velocidad.
- **Nitro**: la barra se llena derrapando, yendo detrás de otro carro (rebufo), con los saltos y los trucos. Cada tercio es un nitro.
- **Saltos y trucos**: en el aire pulsa DERRAPE para dar una vuelta de campana; si caes bien, ganas turbo.
- **Salida perfecta**: acelera justo en el "1" del semáforo. Si aceleras antes de tiempo, el motor se ahoga.
- **Flechas naranjas** en el suelo: turbo gratis.

## Controles

| | PC | Móvil | Mando |
|---|---|---|---|
| Acelerar · frenar | W / ↑ · S / ↓ | ACELERAR (o "Acelerar: Solo") · FRENO | RT · LT |
| Girar | A D / ← → | Joystick o botones ◀ ▶ | Palanca |
| Derrapar · truco | Espacio | DERRAPE | A / RB |
| Nitro | Shift / N | NITRO | X / B |
| Cámara · mirar atrás | C · Q | 🎥 | Y · clic de palanca |
| Claxon · volver a la pista | H · R | — | — · Select |
| Pausa · pantalla completa · sonido | Esc · F · M | II · ⛶ | Start |

## Archivos

- `index.html`: pantallas, HUD y estilos.
- `game.js`: todo el juego (render, pistas, carros, física, IA, controles, modo en línea y sonido sintetizado). Usa three.js desde jsDelivr y PeerJS (con relevo MQTT de respaldo) para jugar en línea; no hay que instalar nada.

Para probarlo en local hace falta un servidor (los módulos ES no cargan con `file://`), por ejemplo:

```bash
npx http-server .
```

Con `?touch=1` en la URL se fuerza la interfaz táctil para probarla en el PC, y con `?relevo` el invitado entra por el servidor de relevo. En la consola, `window.__DP.ff(segundos)` adelanta la simulación.
