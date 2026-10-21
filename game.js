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

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle, color = '#fff') {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.color = color;
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
    ctx.fillStyle = this.enemy ? '#ff6b6b' : this.color;
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
    ctx.strokeStyle = '#fff';
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
// del menú y los iconos de vidas del HUD.

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
    fill: 'rgba(255, 190, 40, 0.28)',
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
    fill: 'rgba(150, 200, 255, 0.35)',
    flame: 'rgba(190, 220, 255, 0.8)',
    exhaust: [-11, 0],
    alpha: 0.75,
  },
];

const BOOST_STROKE = '#8ff3ff';      // color de la nave con el power-up "Velocidad"
const BOOST_FLAME = 'rgba(120, 230, 255, 0.9)';
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

// Dibuja la nave de una skin en el contexto actual, con el morro hacia +X.
function drawSkinShip(ctx, skin, thrusting, scale = 1, boosted = false) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.globalAlpha = skin.alpha;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.lineWidth   = scale >= 1 ? 1.5 * scale : 1.5 / scale;

  // Llama del propulsor (detrás del casco, para que salga por la popa)
  if (thrusting && Math.random() > 0.35) {
    const ex = skin.exhaust[0];
    const ey = skin.exhaust[1];
    const len = rand(6, 14);
    ctx.beginPath();
    ctx.moveTo(ex, ey - 4);
    ctx.lineTo(ex - len, ey);
    ctx.lineTo(ex, ey + 4);
    ctx.strokeStyle = boosted ? BOOST_FLAME : skin.flame;
    ctx.stroke();
  }

  ctx.strokeStyle = boosted ? BOOST_STROKE : skin.stroke;
  for (const poly of skin.hull) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++)
      ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
    if (skin.fill) {
      ctx.fillStyle = skin.fill;
      ctx.fill();
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() {
    this.shieldCharges = 0;   // cargas del escudo: solo se reinician al empezar partida
    this.reset();
  }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
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

  // Crea una bala en la nariz de la nave
  makeBullet() {
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    const triple = this.tripleTimer > 0 || this.burstLeft > 0;
    return new Bullet(ox, oy, this.angle, triple ? TRIPLE_COLOR : '#fff');
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

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(t * 0.6);   // gira lento
    ctx.strokeStyle = SHIELD_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 5);   // pulso
    for (let i = 0; i < this.shieldCharges; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, SHIELD_RADIUS, i * seg + gap, (i + 1) * seg - gap);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color = '#fff') {
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
    ctx.strokeStyle = this.color;
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
const TRIPLE_COLOR    = '#7cffb2';
const SHOOT_COOLDOWN  = 0.2;    // s entre ráfagas
const BURST_COUNT     = 3;      // disparos por ráfaga triple
const BURST_INTERVAL  = 0.07;   // s entre disparos de la ráfaga (~36 px de separación)

// ── Power-up (Escudo) ─────────────────────────────────────────────────────────
const SHIELD_MAX_CHARGES = 3;    // impactos que absorbe el escudo
const SHIELD_RADIUS      = 24;   // radio de la burbuja (px)
const SHIELD_COLOR       = '#7fd8ff';
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
  ctx.strokeStyle = SHIELD_COLOR;
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
  ctx.fillStyle = SHIELD_COLOR;
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
      speed:  'rgba(255, 216, 61, 0.45)',
      triple: 'rgba(124, 255, 178, 0.45)',
      shield: 'rgba(127, 216, 255, 0.45)',
    }[this.kind];

    ctx.save();
    ctx.strokeStyle = glow;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (this.kind === 'triple')      drawTrident(this.x, y, 9, TRIPLE_COLOR);
    else if (this.kind === 'shield') drawShieldIcon(this.x, y, 9);
    else                             drawBolt(this.x, y, 9, '#ffd83d');
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

function explode(x, y, count = 8, color = '#fff') {
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
        score += a.points;
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
          explode(a.x, a.y, 12, SHIELD_COLOR);  // absorbido: sin puntos y sin partirse
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
          explode(b.x, b.y, 6, SHIELD_COLOR);
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
        explode(p.x, p.y, 10, p.kind === 'shield' ? SHIELD_COLOR : '#fff');
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
  drawSkinShip(ctx, SKINS[skinIndex], false, 0.45);
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  // Indicadores de power-up activos
  let py = 50;
  if (ship && !ship.dead && ship.speedTimer > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8ff3ff';
    ctx.fillText(`VELOCIDAD ${ship.speedTimer.toFixed(1)}s`, 32, py);
    drawBolt(21, py - 5, 8, '#ffd83d');
    py += 24;
  }
  if (ship && !ship.dead && ship.tripleTimer > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = TRIPLE_COLOR;
    ctx.fillText(`TRIPLE ${ship.tripleTimer.toFixed(1)}s`, 32, py);
    drawTrident(21, py - 5, 8, TRIPLE_COLOR);
  }

  // Skin activa y pista para abrir el menú
  ctx.font = '13px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText(`SKIN  ${SKINS[skinIndex].name}`, 14, H - 14);
  ctx.textAlign = 'right';
  ctx.fillText('S: SKINS', W - 14, H - 14);

  // Indicador de cargas del escudo (en la misma fila, junto al nombre de la skin)
  if (ship) {
    ctx.textAlign = 'left';
    ctx.fillStyle = SHIELD_COLOR;
    ctx.fillText('ESCUDO', 150, H - 14);
    for (let i = 0; i < SHIELD_MAX_CHARGES; i++) {
      const x = 210 + i * 15;
      const y = H - 18;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      if (i < ship.shieldCharges) {
        ctx.fillStyle = SHIELD_COLOR;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(127, 216, 255, 0.35)';
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
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px monospace';
  ctx.fillText('ELEGIR SKIN', W / 2, 92);

  // Vista previa de la nave
  ctx.save();
  ctx.translate(W / 2, 210);
  ctx.rotate(Math.sin(animTime * 1.2) * 0.45);
  drawSkinShip(ctx, skin, true, 3);
  ctx.restore();

  // Flechas de navegación
  drawArrow(W / 2 - 150, 210, 12, -1, 'rgba(255,255,255,0.7)');
  drawArrow(W / 2 + 150, 210, 12,  1, 'rgba(255,255,255,0.7)');

  // Nombre y descripción de la skin
  ctx.fillStyle = '#fff';
  ctx.font = '24px monospace';
  ctx.fillText(skin.name, W / 2, 300);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
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
    ctx.fillStyle = i === skinIndex ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.fillText(s.name, x, 470);
    x += widths[i] + gap;
  });

  // Ayuda de controles
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('← →  CAMBIAR        ENTER / ESPACIO / ESC  VOLVER', W / 2, 520);
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
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

initGame();
requestAnimationFrame(loop);
