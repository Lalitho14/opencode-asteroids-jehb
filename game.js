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
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
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
    ctx.fillStyle = this.enemy ? '#ff6b6b' : '#fff';
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
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.speedTimer    > 0) this.speedTimer    -= dt;

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
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    this.drawShield();
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const boosted = this.speedTimer > 0;
    ctx.strokeStyle = boosted ? '#8ff3ff' : '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = boosted ? 'rgba(120, 230, 255, 0.9)' : 'rgba(255, 130, 0, 0.85)';
      ctx.stroke();
    }

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

class PowerUp {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 12;
    this.type = 'speed';   // 'speed' | 'shield'
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

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 216, 61, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawBolt(this.x, y, 9, '#ffd83d');
  }
}

// ── Escudo ────────────────────────────────────────────────────────────────────
const SHIELD_MAX_CHARGES   = 3;    // impactos que absorbe el escudo
const SHIELD_RADIUS        = 24;   // radio de la burbuja (px)
const SHIELD_COLOR         = '#7fd8ff';
const SHIELD_PICKUP_CHANCE = 0.10; // prob. de soltarlo al destruir un asteroide

// Power-up "Escudo": hexágono cian con glifo de escudo
class ShieldPickup extends PowerUp {
  constructor(x, y) {
    super(x, y);
    this.type = 'shield';
  }

  draw() {
    // Parpadeo cuando está a punto de expirar
    if (this.ttl < POWERUP_BLINK && Math.floor(this.ttl * 8) % 2 === 0) return;

    const y = this.y + Math.sin(this.bob) * 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(127, 216, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, y, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.translate(this.x, y);
    ctx.strokeStyle = SHIELD_COLOR;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
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
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerups;
let score, lives, level;
let starTimer;  // s hasta la próxima aparición de estrella fugaz
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;

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
        // Probabilidad de soltar un power-up ("Velocidad" o "Escudo")
        if (!a.isStar && Math.random() < POWERUP_CHANCE)       powerups.push(new PowerUp(a.x, a.y));
        if (!a.isStar && Math.random() < SHIELD_PICKUP_CHANCE) powerups.push(new ShieldPickup(a.x, a.y));
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
        if (p.type === 'shield') {
          ship.shieldCharges = SHIELD_MAX_CHARGES;   // recarga al máximo (no acumula)
        } else {
          ship.speedTimer = SPEED_DURATION;
        }
        explode(p.x, p.y, 10, p.type === 'shield' ? SHIELD_COLOR : '#fff');
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
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
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

  // Indicador de power-up "Velocidad" activo
  if (ship && !ship.dead && ship.speedTimer > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8ff3ff';
    ctx.fillText(`VELOCIDAD ${ship.speedTimer.toFixed(1)}s`, 32, 50);
    drawBolt(21, 45, 8, '#ffd83d');
  }

  // Indicador de cargas del escudo (abajo a la izquierda)
  if (ship) {
    ctx.textAlign = 'left';
    ctx.fillStyle = SHIELD_COLOR;
    ctx.fillText('ESCUDO', 14, H - 18);
    for (let i = 0; i < SHIELD_MAX_CHARGES; i++) {
      const x = 82 + i * 15;
      const y = H - 22;
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
