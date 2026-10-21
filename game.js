'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Temas (claro / oscuro) ─────────────────────────────────────────────────────
// El negro del espacio es el estado natural del juego, pero un tema claro
// ("modo día") puede resultar más cómodo en pantallas con mucha luz ambiente.
// El tema se alterna con la tecla D y se recuerda entre sesiones.

const THEMES = {
  dark: {
    id: 'dark',
    name: 'Oscuro',
    bg: '#000',                          // fondo del canvas
    page: '#000',                        // fondo de la página
    border: '#222',                      // borde del canvas
    fg: '#fff',                          // texto principal
    dim: 'rgba(255, 255, 255, 0.65)',    // texto secundario
    faint: 'rgba(255, 255, 255, 0.3)',   // texto terciario
    overlay: 'rgba(0, 0, 0, 0.78)',      // velo de los menús
    line: '#fff',                        // contornos de asteroides
    particle: '#fff',                    // partículas de explosión
    bullet: '#fff',                      // balas del jugador
    triple: '#7cffb2',                   // power-up "Triple shot"
    shield: '#7fd8ff',                   // power-up "Escudo"
    shieldFaint: 'rgba(127, 216, 255, 0.35)',
    speed: '#ffd83d',                    // power-up "Velocidad"
    speedGlow: 'rgba(255, 216, 61, 0.45)',
    tripleGlow: 'rgba(124, 255, 178, 0.45)',
    shieldGlow: 'rgba(127, 216, 255, 0.45)',
  },
  light: {
    id: 'light',
    name: 'Claro',
    bg: '#dde8f6',
    page: '#eef3fb',
    border: '#b9cbe4',
    fg: '#16233c',
    dim: 'rgba(22, 35, 60, 0.7)',
    faint: 'rgba(22, 35, 60, 0.4)',
    overlay: 'rgba(232, 240, 251, 0.9)',
    line: '#16233c',
    particle: '#16233c',
    bullet: '#16233c',
    triple: '#1a6f45',
    shield: '#0d5f88',
    shieldFaint: 'rgba(13, 95, 136, 0.35)',
    speed: '#7a5600',
    speedGlow: 'rgba(122, 86, 0, 0.45)',
    tripleGlow: 'rgba(26, 111, 69, 0.45)',
    shieldGlow: 'rgba(13, 95, 136, 0.45)',
  },
};

const THEME_KEY = 'asteroids.theme';  // clave del tema guardado en el navegador

function loadThemeId() {
  try {
    const id = localStorage.getItem(THEME_KEY);
    if (id && THEMES[id]) return id;
  } catch (e) {
    // sin almacenamiento disponible
  }
  // Sin preferencia guardada se sigue la del sistema operativo
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
      return 'light';
  } catch (e) {
    // sin matchMedia disponible
  }
  return 'dark';
}

let theme = THEMES[loadThemeId()];

function saveThemeId(id) {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch (e) {
    // sin almacenamiento disponible (p. ej. file:// bloqueado)
  }
}

// Aplica el tema al canvas, a la página y al resto de la interfaz
function applyTheme(id) {
  theme = THEMES[id] || THEMES.dark;
  document.body.style.background = theme.page;
  canvas.style.borderColor = theme.border;
  document.documentElement.style.colorScheme = theme.id;
}

function toggleTheme() {
  applyTheme(theme.id === 'dark' ? 'light' : 'dark');
  saveThemeId(theme.id);
  setToast(`TEMA: ${theme.name.toUpperCase()}`);
}

// Colores del power-up "Velocidad" según el tema activo
function boostStroke() { return theme.id === 'light' ? BOOST_STROKE_LIGHT : BOOST_STROKE; }
function boostFlame()  { return theme.id === 'light' ? BOOST_FLAME_LIGHT : BOOST_FLAME; }

// ── Bullet ────────────────────────────────────────────────────────────────────
const ENEMY_BULLET_COLOR = '#ff6b6b';   // color de los proyectiles enemigos

class Bullet {
  constructor(x, y, angle, color = null) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.color = color;     // null = color del tema
    this.enemy = false;   // true si es un proyectil enemigo (hoy no hay ninguno)
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = this.enemy ? ENEMY_BULLET_COLOR : (this.color || theme.bullet);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// ── Estrella fugaz ────────────────────────────────────────────────────────────
const STAR_TTL      = 12;   // s de vida antes de desaparecer sola
const STAR_BLINK    = 2;    // s de parpadeo previo a expirar
const STAR_SPEED    = 190;  // px/s (mucho más rápido que un asteroide normal)
const STAR_POINTS   = 250;  // puntos al destruirla
const STAR_INTERVAL = 18;   // s base entre apariciones
const STAR_MAX      = 1;    // estrellas simultáneas
const STAR_FADE_IN  = 0.4;  // s de materialización
const STAR_COLOR    = '#b388ff';

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.points = POINTS[size];
    this.isStar = false;
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Estrella fugaz (asteroide especial) ──────────────────────────────────────
class ShootingStar extends Asteroid {
  constructor(x, y) {
    super(x, y, 2);            // tamaño mediano (radio 30)
    this.isStar = true;
    this.points = STAR_POINTS;
    this.ttl  = STAR_TTL;
    this.age  = 0;

    const angle = rand(0, Math.PI * 2);
    const speed = STAR_SPEED + rand(-25, 25);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-2, 2);
  }

  update(dt) {
    super.update(dt);
    this.age += dt;
    this.ttl -= dt;
    // Desaparece sola al agotarse su tiempo de vida
    if (this.ttl <= 0) this.dead = true;
  }

  split() {
    return [];                 // no se parte al destruirla
  }

  draw() {
    // Parpadeo cuando está a punto de expirar
    if (this.ttl < STAR_BLINK && Math.floor(this.ttl * 8) % 2 === 0) return;

    // Se materializa al aparecer y se desvanece al expirar
    const alpha = Math.min(1, this.age / STAR_FADE_IN) *
                  Math.min(1, this.ttl / 1.5);

    // Estela en la dirección del movimiento
    ctx.save();
    ctx.strokeStyle = STAR_COLOR;
    ctx.lineCap     = 'round';
    for (let i = 1; i <= 3; i++) {
      const t = i * 0.09;
      ctx.globalAlpha = alpha * (0.7 - i * 0.16);
      ctx.lineWidth   = 3 - i * 0.7;
      ctx.beginPath();
      ctx.moveTo(this.x - this.vx * t, this.y - this.vy * t);
      ctx.lineTo(this.x - this.vx * (t + 0.09), this.y - this.vy * (t + 0.09));
      ctx.stroke();
    }
    ctx.restore();

    // Estrella de 5 puntas
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = STAR_COLOR;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 === 0) ? this.radius : this.radius * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Skins ─────────────────────────────────────────────────────────────────────
// Cada skin define su silueta (polígonos en coordenadas locales de la nave, con
// el morro hacia +X), el color del trazo, el relleno opcional y la llama del
// propulsor. El mismo renderizador sirve para la nave en juego, la vista previa
// del menú y los iconos de vidas del HUD. Las variantes "Light" son los colores
// equivalentes en el tema claro (si faltan, se usa el color principal).
// Dos campos opcionales ajustan el comportamiento: `scale` (tamaño propio de la
// skin, por defecto 1) y `pointsMultiplier` (puntos que rinde cada impacto).

function ellipsePoly(cx, cy, rx, ry, n = 12) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

const SKINS = [
  {
    id: 'classica',
    name: 'Clásica',
    desc: 'La nave original de la serie.',
    hull: [[[20, 0], [-12, -9], [-7, 0], [-12, 9]]],
    stroke: '#fff',
    strokeLight: '#16233c',
    fill: null,
    flame: 'rgba(255, 130, 0, 0.85)',
    exhaust: [-8, 0],
    alpha: 1,
  },
  {
    id: 'neon',
    name: 'Neón',
    desc: 'Brilla en la oscuridad del espacio.',
    hull: [[[20, 0], [-12, -9], [-7, 0], [-12, 9]]],
    stroke: '#3ff0ff',
    strokeLight: '#0b7285',
    fill: 'rgba(0, 70, 90, 0.55)',
    flame: 'rgba(255, 60, 200, 0.9)',
    exhaust: [-8, 0],
    alpha: 1,
  },
  {
    id: 'dorada',
    name: 'Dorada',
    desc: 'Doreada como el oro puro.',
    hull: [[[20, 0], [-12, -9], [-7, 0], [-12, 9]]],
    stroke: '#ffd24a',
    strokeLight: '#7a4f0d',
    fill: 'rgba(255, 190, 40, 0.28)',
    fillLight: 'rgba(122, 79, 13, 0.22)',
    flame: 'rgba(255, 245, 170, 0.9)',
    exhaust: [-8, 0],
    alpha: 1,
  },
  {
    id: 'delta',
    name: 'Delta',
    desc: 'Caza de alas en flecha.',
    hull: [[[22, 0], [0, 6], [-13, 12], [-5, 3], [-9, 0], [-5, -3], [-13, -12], [0, -6]]],
    stroke: '#ff5a4a',
    strokeLight: '#a93226',
    fill: 'rgba(220, 50, 50, 0.35)',
    flame: 'rgba(255, 240, 240, 0.9)',
    exhaust: [-14, 0],
    alpha: 1,
  },
  {
    id: 'ovni',
    name: 'OVNI',
    desc: 'Visitante de otro planeta.',
    hull: [
      ellipsePoly(2, 0, 16, 8, 12),
      [[-4, 0], [-3, -5], [1, -8], [6, -7], [9, -3], [9, 0]],
    ],
    stroke: '#8ff08a',
    strokeLight: '#256b28',
    fill: 'rgba(120, 220, 130, 0.85)',
    flame: 'rgba(200, 255, 200, 0.9)',
    exhaust: [-14, 0],
    alpha: 1,
  },
  {
    id: 'fantasma',
    name: 'Fantasma',
    desc: 'Se desliza entre los asteroides.',
    hull: [[[18, 0], [6, -8], [-4, -9], [-11, -5], [-9, 0], [-11, 5], [-4, 9], [6, 8]]],
    stroke: 'rgba(190, 220, 255, 0.9)',
    strokeLight: 'rgba(22, 35, 60, 0.85)',
    fill: 'rgba(150, 200, 255, 0.35)',
    fillLight: 'rgba(60, 110, 200, 0.25)',
    flame: 'rgba(190, 220, 255, 0.8)',
    flameLight: 'rgba(22, 35, 60, 0.7)',
    exhaust: [-11, 0],
    alpha: 0.75,
  },
  {
    id: 'morada',
    name: 'Morada',
    desc: 'Gigante y morada: dobla los puntos.',
    hull: [[[20, 0], [-12, -9], [-7, 0], [-12, 9]]],
    stroke: '#c084fc',
    strokeLight: '#6d28d9',
    fill: 'rgba(147, 51, 234, 0.3)',
    fillLight: 'rgba(109, 40, 217, 0.22)',
    flame: 'rgba(216, 180, 255, 0.9)',
    flameLight: 'rgba(109, 40, 217, 0.75)',
    exhaust: [-8, 0],
    alpha: 1,
    scale: 2,             // el doble de grande que la nave original
    pointsMultiplier: 2,  // a cambio recibe el doble de puntos
  },
  {
    id: 'avion',
    name: 'Avión',
    desc: 'Un avión de alas rectas surcando el espacio.',
    hull: [
      [
        [22, 0], [14, 3], [-1, 14], [-7, 13], [-2, 3], [-6, 3],
        [-11, 8], [-16, 7], [-13, 2.5], [-19, 2], [-19, -2], [-13, -2.5],
        [-16, -7], [-11, -8], [-6, -3], [-2, -3], [-7, -13], [-1, -14], [14, -3],
      ],
      ellipsePoly(12, 0, 4.5, 2, 8),
    ],
    stroke: '#ff9f43',
    strokeLight: '#b35400',
    fill: 'rgba(255, 159, 67, 0.28)',
    fillLight: 'rgba(179, 84, 0, 0.22)',
    flame: 'rgba(255, 226, 160, 0.9)',
    flameLight: 'rgba(200, 90, 10, 0.85)',
    exhaust: [-19, 0],
    alpha: 1,
  },
];

const BOOST_STROKE = '#8ff3ff';      // color de la nave con el power-up "Velocidad"
const BOOST_STROKE_LIGHT = '#0b7285';  // el mismo boost sobre el tema claro
const BOOST_FLAME = 'rgba(120, 230, 255, 0.9)';
const BOOST_FLAME_LIGHT = 'rgba(15, 95, 120, 0.9)';
const SKIN_KEY    = 'asteroids.skin'; // clave de la skin guardada en el navegador

const SKIN_REPEAT_DELAY = 0.35; // s hasta empezar a repetir manteniendo la flecha
const SKIN_REPEAT_RATE  = 0.12; // s entre repeticiones

function loadSkinIndex() {
  try {
    const id = localStorage.getItem(SKIN_KEY);
    const i = SKINS.findIndex(s => s.id === id);
    return i >= 0 ? i : 0;
  } catch (e) {
    return 0;   // sin almacenamiento disponible
  }
}

function saveSkinIndex(i) {
  try {
    localStorage.setItem(SKIN_KEY, SKINS[i].id);
  } catch (e) {
    // sin almacenamiento disponible (p. ej. file:// bloqueado)
  }
}

let skinIndex = loadSkinIndex();
let skinRepeat = 0;   // s hasta la siguiente repetición al mantener la flecha

function setSkin(i) {
  skinIndex = wrap(i, SKINS.length);
  saveSkinIndex(skinIndex);
}

// Colores de una skin adaptados al tema activo (trazo, relleno y llama)
function skinPalette(skin) {
  const light = theme.id === 'light';
  return {
    stroke: light && skin.strokeLight ? skin.strokeLight : skin.stroke,
    fill:   light && skin.fillLight   ? skin.fillLight   : skin.fill,
    flame:  light && skin.flameLight  ? skin.flameLight  : skin.flame,
  };
}

// Tamaño propio de cada skin (la "Morada" es el doble de grande)
function skinScale(skin) { return skin.scale || 1; }

// Puntos que rinde cada impacto con la skin activa (la "Morada" dobla los puntos)
function pointsMultiplier() { return SKINS[skinIndex].pointsMultiplier || 1; }

// Dibuja la nave de una skin en el contexto actual, con el morro hacia +X.
// Cada skin puede traer variantes para el tema claro (strokeLight, fillLight,
// flameLight); si faltan se usa el color principal. El parámetro `scale` se
// combina con el tamaño propio de la skin (skin.scale).
function drawSkinShip(ctx, skin, thrusting, scale = 1, boosted = false) {
  const s = scale * skinScale(skin);
  const { stroke, fill, flame } = skinPalette(skin);

  ctx.save();
  ctx.scale(s, s);
  ctx.globalAlpha = skin.alpha;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.lineWidth   = s >= 1 ? 1.5 * s : 1.5 / s;

  // Llama del propulsor (detrás del casco, para que salga por la popa)
  if (thrusting && Math.random() > 0.35) {
    const ex = skin.exhaust[0];
    const ey = skin.exhaust[1];
    const len = rand(6, 14);
    ctx.beginPath();
    ctx.moveTo(ex, ey - 4);
    ctx.lineTo(ex - len, ey);
    ctx.lineTo(ex, ey + 4);
    ctx.strokeStyle = boosted ? boostFlame() : flame;
    ctx.stroke();
  }

  ctx.strokeStyle = boosted ? boostStroke() : stroke;
  for (const poly of skin.hull) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++)
      ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ── Ship ──────────────────────────────────────────────────────────────────────
const SHIP_BASE_RADIUS = 12;   // radio de colisión de la nave original

class Ship {
  constructor() {
    this.shieldCharges = 0;   // cargas del escudo: solo se reinician al empezar partida
    this.reset();
  }

  // El radio de colisión crece con el tamaño propio de la skin activa
  get radius() { return SHIP_BASE_RADIUS * skinScale(SKINS[skinIndex]); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.speedTimer    = 0;   // s restantes de power-up "Velocidad"
    this.tripleTimer   = 0;   // s restantes de power-up "Triple shot"
    this.burstLeft     = 0;   // disparos pendientes de la ráfaga triple
    this.burstTimer    = 0;   // s hasta el siguiente disparo de la ráfaga
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.speedTimer    > 0) this.speedTimer    -= dt;
    if (this.tripleTimer   > 0) this.tripleTimer   -= dt;

    const ROT   = 3.5;   // rad/s
    const THRUST = 260;  // px/s²
    const DRAG   = 0.987;
    const boost  = this.speedTimer > 0 ? SPEED_MULTIPLIER : 1;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * boost * dt;
      this.vy += Math.sin(this.angle) * THRUST * boost * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = SHOOT_COOLDOWN;
    const shots = [this.makeBullet()];
    // Con "Triple shot" activo se programan 2 disparos más en la misma línea
    if (this.tripleTimer > 0) {
      this.burstLeft  = BURST_COUNT - 1;
      this.burstTimer = BURST_INTERVAL;
    }
    return shots;
  }

  // Crea una bala en la nariz de la nave (el morro crece con la skin activa)
  makeBullet() {
    const NOSE = 21 * skinScale(SKINS[skinIndex]);
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    const triple = this.tripleTimer > 0 || this.burstLeft > 0;
    return new Bullet(ox, oy, this.angle, triple ? theme.triple : null);
  }

  // Siguiente disparo de la ráfaga triple (null si no queda ninguno)
  nextBurstShot() {
    if (this.dead || this.burstLeft <= 0) {
      this.burstLeft  = 0;
      this.burstTimer = 0;
      return null;
    }
    const bullet = this.makeBullet();
    this.burstLeft--;
    this.burstTimer = BURST_INTERVAL;
    return bullet;
  }

  draw() {
    if (this.dead) return;
    this.drawShield();
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    drawSkinShip(ctx, SKINS[skinIndex], this.thrusting, 1, this.speedTimer > 0);
    ctx.restore();
  }

  // Burbuja protectora: un arco por cada carga disponible
  drawShield() {
    if (this.shieldCharges <= 0) return;
    const t = performance.now() / 1000;
    const seg = (Math.PI * 2) / SHIELD_MAX_CHARGES;
    const gap = 0.35;   // separación entre arcos
    // La burbuja envuelve la nave, por lo que crece con el tamaño de la skin
    const radius = SHIELD_RADIUS * skinScale(SKINS[skinIndex]);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(t * 0.6);   // gira lento
    ctx.strokeStyle = theme.shield;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 5);   // pulso
    for (let i = 0; i < this.shieldCharges; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, i * seg + gap, (i + 1) * seg - gap);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color = null) {
    this.x  = x;
    this.y  = y;
    this.color = color;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = this.color || theme.particle;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ── Power-up (Velocidad) ─────────────────────────────────────────────────────
const POWERUP_TTL      = 10;  // s en pantalla antes de expirar
const POWERUP_BLINK    = 2;   // s de parpadeo previo a expirar
const POWERUP_CHANCE   = 0.12; // probabilidad de soltar uno al destruir un asteroide
const SPEED_DURATION   = 5;   // s de efecto "Velocidad"
const SPEED_MULTIPLIER = 2;   // factor de velocidad de la nave con el power-up

// ── Power-up (Triple shot) ───────────────────────────────────────────────────
const TRIPLE_DURATION = 5;      // s de efecto "Triple shot"
const TRIPLE_CHANCE   = 0.10;   // probabilidad de soltar el tridente al destruir un asteroide
const SHOOT_COOLDOWN  = 0.2;    // s entre ráfagas
const BURST_COUNT     = 3;      // disparos por ráfaga triple
const BURST_INTERVAL  = 0.07;   // s entre disparos de la ráfaga (~36 px de separación)

// ── Power-up (Escudo) ─────────────────────────────────────────────────────────
const SHIELD_MAX_CHARGES = 3;    // impactos que absorbe el escudo
const SHIELD_RADIUS      = 24;   // radio de la burbuja (px)
const SHIELD_CHANCE      = 0.10; // prob. de soltarlo al destruir un asteroide

// Rayo (⚡) dibujado centrado en (x, y) con el tamaño dado
function drawBolt(x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 9, size / 9);
  ctx.beginPath();
  ctx.moveTo( 2, -9);
  ctx.lineTo(-4,  1);
  ctx.lineTo( 0,  1);
  ctx.lineTo(-2,  9);
  ctx.lineTo( 5, -1);
  ctx.lineTo( 1, -1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// Tridente (3 puntas) dibujado centrado en (x, y) con el tamaño dado
function drawTrident(x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 9, size / 9);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.6;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  // Asta
  ctx.moveTo(0, 9);
  ctx.lineTo(0, -4);
  // Puntas
  ctx.moveTo(-6, 4);
  ctx.lineTo(0, -8);
  ctx.lineTo(6, 4);
  ctx.stroke();
  ctx.restore();
}

// Escudo (hexágono con glifo) dibujado centrado en (x, y) con el tamaño dado
function drawShieldIcon(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 9, size / 9);
  ctx.strokeStyle = theme.shield;
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * 9;
    const py = Math.sin(a) * 9;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  // Glifo de escudo relleno
  ctx.fillStyle = theme.shield;
  ctx.beginPath();
  ctx.moveTo(-3.5, -3);
  ctx.lineTo( 3.5, -3);
  ctx.lineTo( 3.5,  0.5);
  ctx.quadraticCurveTo( 3.5, 4.5, 0, 5.5);
  ctx.quadraticCurveTo(-3.5, 4.5, -3.5, 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

class PowerUp {
  constructor(x, y, kind = 'speed') {
    this.x = x;
    this.y = y;
    this.kind = kind;           // 'speed' | 'triple' | 'shield'
    this.radius = 12;
    this.ttl  = POWERUP_TTL;
    this.bob  = rand(0, Math.PI * 2);
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x, W);
    this.y = wrap(this.y, H);
    this.bob += dt * 3;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo cuando está a punto de expirar
    if (this.ttl < POWERUP_BLINK && Math.floor(this.ttl * 8) % 2 === 0) return;

    const y = this.y + Math.sin(this.bob) * 2;
    const glow = {
      speed:  theme.speedGlow,
      triple: theme.tripleGlow,
      shield: theme.shieldGlow,
    }[this.kind];

    ctx.save();
    ctx.strokeStyle = glow;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (this.kind === 'triple')      drawTrident(this.x, y, 9, theme.triple);
    else if (this.kind === 'shield') drawShieldIcon(this.x, y, 9);
    else                             drawBolt(this.x, y, 9, theme.speed);
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerups;
let score, lives, level;
let starTimer;  // s hasta la próxima aparición de estrella fugaz
let state;      // 'playing' | 'dead' | 'gameover' | 'skins'
let prevState;  // estado al que se vuelve al cerrar el menú de skins
let deadTimer;
let animTime = 0;  // reloj de animación (vista previa del menú de skins)
let toast = '';    // aviso breve en pantalla (p. ej. el cambio de tema)
let toastTimer = 0;

const TOAST_DURATION = 1.6;  // s que dura el aviso

function setToast(text) {
  toast = text;
  toastTimer = TOAST_DURATION;
}

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function spawnStar() {
  const SAFE_DIST = 160;
  let x, y;
  do {
    x = rand(0, W);
    y = rand(0, H);
  } while (Math.hypot(x - ship.x, y - ship.y) < SAFE_DIST);
  asteroids.push(new ShootingStar(x, y));
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerups = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  starTimer = rand(6, 12);
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  powerups  = [];
  asteroids = asteroids.filter(a => !a.isStar);  // las estrellas fugaces no se heredan
  ship.reset();
  starTimer = rand(STAR_INTERVAL * 0.5, STAR_INTERVAL);
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8, color = null) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  animTime += dt;

  // El aviso en pantalla caduca en cualquier estado
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toast = '';
  }

  // Alternar el tema claro/oscuro (única lectura de la tecla por frame)
  if (pressed('KeyD')) toggleTheme();

  // Abrir o cerrar el menú de skins (única lectura de la tecla por frame)
  if (pressed('KeyS')) {
    if (state === 'skins') state = prevState;
    else { prevState = state; state = 'skins'; }
  }

  if (state === 'skins') {
    // Cambio de skin: una pulsación por flecha; mantenida, se repite sola
    const left  = pressed('ArrowLeft');
    const right = pressed('ArrowRight');
    if (left || right) {
      setSkin(skinIndex + (right ? 1 : -1));
      skinRepeat = SKIN_REPEAT_DELAY;
    } else if (keys['ArrowLeft'] || keys['ArrowRight']) {
      skinRepeat -= dt;
      if (skinRepeat <= 0) {
        setSkin(skinIndex + (keys['ArrowRight'] ? 1 : -1));
        skinRepeat = SKIN_REPEAT_RATE;
      }
    } else {
      skinRepeat = 0;
    }
    // Se leen siempre las tres teclas para no dejar pulsaciones pendientes
    const accept = pressed('Enter');
    const cancel = pressed('Escape');
    const fire   = pressed('Space');
    if (accept || cancel || fire) {
      state = prevState;
      skinRepeat = 0;
    }
    return;   // la partida queda pausada
  }

  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Ráfaga "Triple shot": disparos sucesivos en la misma línea de fuego
  if (ship.burstTimer > 0) {
    ship.burstTimer -= dt;
    if (ship.burstTimer <= 0) {
      const b = ship.nextBurstShot();
      if (b) bullets.push(b);
    }
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  particles.forEach(p => p.update(dt));
  powerups.forEach(p => p.update(dt));

  // Aparición periódica de estrella fugaz
  starTimer -= dt;
  if (starTimer <= 0) {
    starTimer = rand(STAR_INTERVAL * 0.8, STAR_INTERVAL * 1.2);
    if (asteroids.filter(a => a.isStar).length < STAR_MAX) spawnStar();
  }

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);
  powerups  = powerups.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += a.points * pointsMultiplier();
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        // Probabilidad de soltar un power-up (como máximo uno por asteroide)
        if (!a.isStar) {
          if (Math.random() < POWERUP_CHANCE)        powerups.push(new PowerUp(a.x, a.y, 'speed'));
          else if (Math.random() < TRIPLE_CHANCE)   powerups.push(new PowerUp(a.x, a.y, 'triple'));
          else if (Math.random() < SHIELD_CHANCE)    powerups.push(new PowerUp(a.x, a.y, 'shield'));
        }
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Nave vs asteroide (el escudo absorbe el impacto)
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (ship.shieldCharges > 0) {
          a.dead = true;
          ship.shieldCharges--;
          explode(a.x, a.y, 12, theme.shield);  // absorbido: sin puntos y sin partirse
        } else {
          killShip();
        }
        break;
      }
    }
    asteroids = asteroids.filter(a => !a.dead);
  }

  // Nave vs proyectil enemigo (el escudo absorbe el impacto)
  if (!ship.dead && ship.invincible <= 0) {
    for (const b of bullets) {
      if (!b.enemy || b.dead) continue;
      if (dist(b, ship) < ship.radius + b.radius) {
        b.dead = true;
        if (ship.shieldCharges > 0) {
          ship.shieldCharges--;
          explode(b.x, b.y, 6, theme.shield);
        } else {
          killShip();
        }
        break;
      }
    }
    bullets = bullets.filter(b => !b.dead);
  }

  // Nave vs power-up
  if (!ship.dead) {
    for (const p of powerups) {
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        if (p.kind === 'triple') {
          ship.tripleTimer = TRIPLE_DURATION;
        } else if (p.kind === 'shield') {
          ship.shieldCharges = SHIELD_MAX_CHARGES;   // recarga al máximo (no acumula)
        } else {
          ship.speedTimer = SPEED_DURATION;
        }
        explode(p.x, p.y, 10, p.kind === 'shield' ? theme.shield : null);
      }
    }
    powerups = powerups.filter(p => !p.dead);
  }

  // Nivel completado (las estrellas fugaces no bloquean el avance)
  if (!asteroids.some(a => !a.isStar)) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  // Los iconos del HUD mantienen siempre el mismo tamaño, sea cual sea la skin
  drawSkinShip(ctx, SKINS[skinIndex], false, 0.45 / skinScale(SKINS[skinIndex]));
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = theme.fg;
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  // Aviso del multiplicador de puntos de la skin activa (p. ej. la Morada)
  const mult = pointsMultiplier();
  if (mult > 1) {
    ctx.textAlign = 'center';
    ctx.fillStyle = skinPalette(SKINS[skinIndex]).stroke;
    ctx.fillText(`PUNTOS x${mult}`, W / 2, 46);
  }

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  // Indicadores de power-up activos
  let py = 50;
  if (ship && !ship.dead && ship.speedTimer > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = boostStroke();
    ctx.fillText(`VELOCIDAD ${ship.speedTimer.toFixed(1)}s`, 32, py);
    drawBolt(21, py - 5, 8, theme.speed);
    py += 24;
  }
  if (ship && !ship.dead && ship.tripleTimer > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.triple;
    ctx.fillText(`TRIPLE ${ship.tripleTimer.toFixed(1)}s`, 32, py);
    drawTrident(21, py - 5, 8, theme.triple);
  }

  // Skin activa, tema y pistas de teclado
  ctx.font = '13px monospace';
  ctx.fillStyle = theme.dim;
  ctx.textAlign = 'left';
  ctx.fillText(`SKIN  ${SKINS[skinIndex].name}`, 14, H - 14);
  ctx.textAlign = 'right';
  ctx.fillText('S: SKINS', W - 14, H - 14);
  ctx.fillStyle = theme.faint;
  ctx.fillText(`D: TEMA ${theme.name.toUpperCase()}`, W - 14, H - 30);

  // Indicador de cargas del escudo (en la misma fila, junto al nombre de la skin)
  if (ship) {
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.shield;
    ctx.fillText('ESCUDO', 150, H - 14);
    for (let i = 0; i < SHIELD_MAX_CHARGES; i++) {
      const x = 210 + i * 15;
      const y = H - 18;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      if (i < ship.shieldCharges) {
        ctx.fillStyle = theme.shield;
        ctx.fill();
      } else {
        ctx.strokeStyle = theme.shieldFaint;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}

// Flecha triangular apuntando a la derecha (dir = -1 la invierte)
function drawArrow(x, y, size, dir, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.beginPath();
  ctx.moveTo(-size, -size);
  ctx.lineTo( size,  0);
  ctx.lineTo(-size,  size);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawSkinMenu() {
  const skin = SKINS[skinIndex];

  // Fondo oscurecido
  ctx.fillStyle = theme.overlay;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = theme.fg;
  ctx.font = 'bold 28px monospace';
  ctx.fillText('ELEGIR SKIN', W / 2, 92);

  // Vista previa de la nave
  ctx.save();
  ctx.translate(W / 2, 210);
  ctx.rotate(Math.sin(animTime * 1.2) * 0.45);
  drawSkinShip(ctx, skin, true, 3);
  ctx.restore();

  // Flechas de navegación
  drawArrow(W / 2 - 150, 210, 12, -1, theme.dim);
  drawArrow(W / 2 + 150, 210, 12,  1, theme.dim);

  // Nombre y descripción de la skin
  ctx.fillStyle = theme.fg;
  ctx.font = '24px monospace';
  ctx.fillText(skin.name, W / 2, 300);

  ctx.fillStyle = theme.dim;
  ctx.font = '13px monospace';
  ctx.fillText(skin.desc, W / 2, 326);

  // Todas las skins, con la activa resaltada
  ctx.font = '13px monospace';
  const gap = 20;
  const widths = SKINS.map(s => ctx.measureText(s.name).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (SKINS.length - 1);
  let x = W / 2 - total / 2;
  SKINS.forEach((s, i) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = i === skinIndex ? theme.fg : theme.faint;
    ctx.fillText(s.name, x, 470);
    x += widths[i] + gap;
  });

  // Ayuda de controles
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.dim;
  ctx.fillText('← →  CAMBIAR        ENTER / ESPACIO / ESC  VOLVER', W / 2, 520);
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = theme.fg;
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = theme.dim;
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

// Aviso breve (p. ej. "TEMA: CLARO") que se desvanece al terminar
function drawToast() {
  if (!toast) return;
  const alpha = Math.min(1, toastTimer / 0.5);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.fg;
  ctx.font = 'bold 18px monospace';
  ctx.fillText(toast, W / 2, 64);
  ctx.restore();
}

function draw() {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  bullets.forEach(b => b.draw());
  powerups.forEach(p => p.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);

  if (state === 'skins')
    drawSkinMenu();

  drawToast();
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

applyTheme(theme.id);   // pinta la página con el tema elegido
initGame();
requestAnimationFrame(loop);
