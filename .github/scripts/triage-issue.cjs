'use strict';

// Triaje automático de issues: formatea el body (sin tocar el texto original),
// añade labels y deja información útil para quien revise.
//
// Se ejecuta como script suelto con Node (sin bundler, sin dependencias):
//   node .github/scripts/triage-issue.cjs
// Necesita GITHUB_TOKEN, GITHUB_REPOSITORY y (opcionalmente) GITHUB_EVENT_PATH.

const fs = require('fs');

const MARKER_START = '<!-- triage:auto:start -->';
const MARKER_END = '<!-- triage:auto:end -->';
const SKIP_MARKER = '<!-- triage-skip -->';
const MAX_BODY_LENGTH = 60000;
const API_VERSION = '2022-11-28';
const USER_AGENT = 'opencode-asteroids-issue-triage';

// ── Labels ──
// name → { color, description }. Los labels se crean si no existen en el repo.
const LABEL_META = {
  bug: { color: 'd73a4a', description: 'Something is not working' },
  enhancement: { color: 'a2eeef', description: 'New feature or request' },
  question: { color: 'd876e3', description: 'Question about usage or behaviour' },
  documentation: { color: '0075ca', description: 'Documentation or README related' },
  gameplay: { color: '1d76db', description: 'Gameplay, scoring, collisions, entities' },
  ui: { color: '5319e7', description: 'Interface, HUD, colours, themes' },
  controls: { color: '0e8a16', description: 'Keyboard input and controls' },
  performance: { color: 'fbca04', description: 'Frame rate, lag, responsiveness' },
  skins: { color: 'c2e0c6', description: 'Ship skins and THEMES' },
  'needs-info': { color: 'e4e669', description: 'Missing information to reproduce' },
  'priority: high': { color: 'b60205', description: 'Blocking or crash level issue' },
  'priority: medium': { color: 'fbca04', description: 'Functional issue or notable request' },
  'priority: low': { color: '0e8a16', description: 'Cosmetic, typo or minor request' }
};

// ── Reglas de clasificación ──
// Cada keyword pesa según lo específica que es. Las frases se buscan por palabra
// completa sobre el texto normalizado (minúsculas, sin acentos).
const CATEGORY_RULES = [
  {
    label: 'bug',
    keywords: {
      'no funciona': 3, 'no carga': 3, 'no abre': 3, 'no arranca': 3, 'no responde': 2,
      'no aparece': 2, 'no se ve': 2, 'no se muestra': 2, 'no hace nada': 2, 'desaparece': 2,
      'falla': 2, 'fallo': 2, 'fallos': 2, 'bug': 2, 'error': 2, 'roto': 2, 'rota': 2,
      'rompe': 2, 'crash': 3, 'exception': 2, 'stack trace': 3, 'undefined': 2,
      'se traba': 2, 'se congela': 3, 'se cierra': 2, 'regression': 3, 'problema': 1,
      'not working': 3, 'doesnt work': 3, 'does not work': 3, 'broken': 2, 'fails': 2,
      'failure': 2, 'crashes': 3, 'freezes': 2, 'unexpected': 1, 'glitch': 2
    }
  },
  {
    label: 'enhancement',
    keywords: {
      'anadir': 3, 'agregar': 3, 'agrega': 2, 'sugiero': 3, 'sugerencia': 3,
      'sugerencias': 3, 'idea': 2, 'propuesta': 3, 'me gustaria': 3, 'seria genial': 3,
      'seria posible': 2, 'podriamos': 2, 'podria': 2, 'mejora': 3, 'mejorar': 2,
      'feature': 3, 'nueva': 1, 'please add': 3, 'would be nice': 3, 'add a': 2,
      'request': 2, 'implementar': 2
    }
  },
  {
    label: 'question',
    keywords: {
      'pregunta': 3, 'duda': 3, 'como puedo': 3, 'no se como': 3, 'sabes': 2,
      'ayuda': 1, 'how do i': 3, 'how to': 2, 'is it possible': 2, 'wondering': 2,
      'anyone know': 3, 'help': 1
    }
  },
  {
    label: 'documentation',
    keywords: {
      'readme': 3, 'documentacion': 3, 'documentar': 2, 'documenta': 2, 'docs': 2,
      'document': 2, 'typo': 2, 'ortografia': 2, 'espelling': 3, 'instrucciones': 2
    }
  }
];

// Áreas: pueden varias a la vez. `files` alimenta el checklist del revisor.
const AREA_RULES = [
  {
    label: 'gameplay',
    files: [{ path: 'game.js', note: 'lógica de juego' }],
    keywords: {
      'nave': 2, 'naves': 2, 'asteroide': 2, 'asteroides': 2, 'asteroid': 2, 'asteroids': 2,
      'disparo': 2, 'disparar': 2, 'disparos': 2, 'bala': 2, 'balas': 2, 'bullet': 2,
      'colision': 2, 'colisiones': 2, 'puntaje': 2, 'score': 2, 'puntuacion': 2, 'puntos': 1,
      'vidas': 2, 'nivel': 2, 'level': 2, 'power up': 2, 'powerup': 2, 'escudo': 2,
      'shield': 2, 'velocidad': 1, 'propulsor': 2, 'thrust': 2, 'estrella fugaz': 2,
      'fragmento': 2, 'fragmentos': 2, 'explosion': 2, 'particula': 2, 'particulas': 2,
      'game over': 2, 'partida': 2, 'reaparecer': 2, 'invencible': 2, 'threescore': 2,
      'ship': 2, 'shoot': 2, 'fire': 1, 'blast': 2, 'particle': 2, 'respawn': 2,
      'invincible': 2, 'triple shot': 2
    }
  },
  {
    label: 'ui',
    files: [{ path: 'game.js', note: 'dibujo, HUD y temas' }],
    keywords: {
      'menu': 2, 'hud': 2, 'pantalla': 2, 'screen': 1, 'color': 2, 'colores': 2,
      'tema': 2, 'theme': 2, 'temas': 2, 'claro': 1, 'oscuro': 1, 'canvas': 1,
      'fuente': 2, 'font': 1, 'boton': 2, 'button': 1, 'texto': 1, 'overlay': 2,
      'interfaz': 2, 'ui': 2, 'hud score': 2
    }
  },
  {
    label: 'controls',
    files: [{ path: 'game.js', note: 'entrada de teclado' }],
    keywords: {
      'tecla': 2, 'teclas': 2, 'teclado': 2, 'key': 1, 'keys': 1, 'control': 1,
      'controles': 2, 'flecha': 2, 'flechas': 2, 'arrow': 1, 'espacio': 2, 'space': 1,
      'atajo': 2, 'shortcut': 2, 'input': 1, 'keyboard': 2, 'rotate': 1
    }
  },
  {
    label: 'performance',
    files: [{ path: 'game.js', note: 'bucle de actualización y render' }],
    keywords: {
      'lento': 2, 'lenta': 2, 'lentitud': 2, 'rendimiento': 3, 'performance': 2,
      'fps': 3, 'lag': 2, 'delay': 1, 'framerate': 3, 'frame rate': 3, 'jank': 3,
      'tarda': 2, 'carga': 1
    }
  },
  {
    label: 'skins',
    files: [{ path: 'game.js', note: 'THEMES y skins de la nave' }],
    keywords: {
      'skin': 3, 'skins': 3, 'avion': 3, 'morada': 3, 'customizar': 2, 'personalizar': 2,
      'custom': 2, 'variant': 1
    }
  },
  {
    label: 'documentation',
    files: [{ path: 'README.md', note: 'documentación del proyecto' }],
    keywords: {
      'readme': 3, 'documentacion': 3, 'docs': 2, 'document': 2, 'instrucciones': 2
    }
  }
];

// Palabras clave de prioridad. Solo se aplica si la categoría es bug o enhancement.
const HIGH_PRIORITY = {
  'no carga': 4, 'no puedo jugar': 4, 'cannot play': 4, 'cant play': 4,
  'pantalla negra': 4, 'black screen': 4, 'bucle infinito': 4, 'infinite loop': 4,
  'se congela': 3, 'crash': 3, 'no arranca': 3, 'no abre': 3, 'pierde la partida': 3,
  'freeze': 3, 'freeses': 3, 'blocked': 2, 'bloquea': 2, 'no responde': 2,
  'no puedo': 2, 'imposible': 2, 'cannot': 1
};

const LOW_PRIORITY = {
  'typo': 3, 'typos': 3, 'ortografia': 3, 'espelling': 3, 'estetico': 3, 'estetica': 3,
  'cosmetic': 3, 'nit': 2, 'sugerencia menor': 3, 'minor': 1, 'formato': 1,
  'estilistica': 2, 'whitespace': 2
};

const ES_STOPWORDS = ['de', 'la', 'el', 'que', 'y', 'en', 'los', 'las', 'un', 'una', 'por',
  'con', 'para', 'es', 'no', 'me', 'mi', 'se', 'del', 'al', 'como', 'pero', 'mas', 'muy',
  'cuando', 'donde', 'porque', 'este', 'esta', 'hay', 'si', 'su', 'lo', 'ya'];

const EN_STOPWORDS = ['the', 'and', 'of', 'to', 'is', 'it', 'in', 'for', 'on', 'with', 'not',
  'my', 'i', 'this', 'that', 'how', 'can', 'you', 'are', 'was', 'be', 'have', 'there',
  'we', 'do', 'does', 'a', 'an'];

// ── Utilidades de texto ──

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Busca la frase como palabras completas en el texto normalizado.
function hasPhrase(text, phrase) {
  const needle = normalize(phrase);
  if (!needle) return false;
  const re = new RegExp('(?:^| )' + escapeRe(needle) + '(?: |$)');
  return re.test(text);
}

function scoreKeywords(text, keywords) {
  let score = 0;
  const matched = [];
  for (const phrase of Object.keys(keywords)) {
    if (hasPhrase(text, phrase)) {
      score += keywords[phrase];
      matched.push(phrase);
    }
  }
  return { score, matched };
}

function countWords(text) {
  const clean = (text || '').trim();
  if (!clean) return 0;
  return clean.split(/\s+/).length;
}

function detectLanguage(text) {
  const words = normalize(text).split(' ').filter(Boolean);
  if (!words.length) return 'desconocido';
  let es = 0;
  let en = 0;
  for (const word of words) {
    if (ES_STOPWORDS.includes(word)) es++;
    if (EN_STOPWORDS.includes(word)) en++;
  }
  if (es > en) return 'es';
  if (en > es) return 'en';
  return 'desconocido';
}

function hasSteps(text, rawBody) {
  if (/(^|\n)\s*\d+[.)]\s/.test(rawBody || '')) return true;
  return ['pasos', 'pasos para reproducir', 'reproducir', 'como reproducir', 'steps to reproduce',
    'how to reproduce', 'repro', 'pasos a seguir'].some((phrase) => hasPhrase(text, phrase));
}

function hasEnvironment(text) {
  const browsers = ['chrome', 'firefox', 'safari', 'edge', 'opera', 'brave', 'navegador', 'browser'];
  const systems = ['windows', 'macos', 'mac', 'linux', 'ubuntu', 'android', 'ios', 'iphone',
    'ipad', 'sistema operativo'];
  const version = /\bv\.?\s?\d+(\.\d+)*/.test(text);
  return version || browsers.some((w) => hasPhrase(text, w)) || systems.some((w) => hasPhrase(text, w));
}

function hasScreenshot(text, rawBody) {
  if (/!\[[^\]]*\]\([^)]+\)/.test(rawBody || '')) return true;
  if (/user-attachments/.test(rawBody || '')) return true;
  return ['captura', 'capturas', 'screenshot', 'screenshots', 'imagen'].some((w) => hasPhrase(text, w));
}

function hasCode(text, rawBody) {
  if (/```/.test(rawBody || '')) return true;
  return ['stack trace', 'traceback', 'console', 'exception', 'undefined is not', 'null is not',
    'typeerror', 'referenceerror', 'syntaxerror'].some((w) => hasPhrase(text, w));
}

function hasError(text) {
  return ['error', 'exception', 'stack trace', 'traceback', 'fatal', 'undefined', 'nan',
    'typeerror', 'referenceerror', 'no funciona', 'no carga'].some((w) => hasPhrase(text, w));
}

// ── Análisis ──

function analyze(issue) {
  const title = issue.title || '';
  const body = issue.body || '';
  const text = normalize(`${title} ${body}`);
  const titleText = normalize(title);

  // Categoría: gana la de mayor puntuación.
  const categoryScores = CATEGORY_RULES.map((rule) => ({
    label: rule.label,
    ...scoreKeywords(text, rule.keywords)
  }));
  if (title.includes('?')) {
    const question = categoryScores.find((c) => c.label === 'question');
    question.score += 2;
    question.matched.push('?');
  }
  categoryScores.sort((a, b) => b.score - a.score);
  const category = categoryScores[0].score >= 2 ? categoryScores[0].label : null;

  // Áreas: hasta 3. Las menciones a capturas de pantalla no cuentan como "UI".
  const areaText = text.replace(/capturas? de pantalla|screenshots?/g, ' ');
  const areaScores = AREA_RULES.map((rule) => ({
    label: rule.label,
    ...scoreKeywords(areaText, rule.keywords)
  })).filter((area) => area.score >= 2).sort((a, b) => b.score - a.score);
  const areas = areaScores.slice(0, 3);

  // Prioridad: alta exige señales bloqueantes, baja exige señales cosméticas.
  const high = scoreKeywords(text, HIGH_PRIORITY).score;
  const low = scoreKeywords(text, LOW_PRIORITY).score;
  let priority = null;
  if (low >= 3 && low >= high) {
    priority = 'low';
  } else if (category === 'bug' || category === 'enhancement') {
    if (high >= 3) priority = 'high';
    else priority = 'medium';
  }

  const signals = {
    steps: hasSteps(text, body),
    environment: hasEnvironment(text),
    screenshot: hasScreenshot(text, body),
    code: hasCode(text, body),
    error: hasError(text)
  };

  // Falta información para poder trabajar el issue.
  const words = countWords(body);
  let needsInfo = false;
  if (category === 'bug') {
    // Un bug necesita forma de reproducir y saber dónde ocurre.
    needsInfo = (!signals.steps && !signals.code) || !signals.environment;
  } else if (category === 'enhancement') {
    // Una mejora necesita contexto: sin descripción larga, se pide detalle.
    needsInfo = words < 40;
  } else if (!category) {
    needsInfo = words < 15;
  }

  const labels = [];
  if (category) labels.push(category);
  for (const area of areas) labels.push(area.label);
  if (needsInfo) labels.push('needs-info');
  if (priority) labels.push(`priority: ${priority}`);

  return {
    category,
    areas,
    priority,
    labels: [...new Set(labels)],
    signals,
    needsInfo,
    language: detectLanguage(`${title} ${body}`),
    words,
    text,
    titleText
  };
}

// ── Bloque automático ──

const PRIORITY_LABEL = {
  high: '🔴 alta',
  medium: '🟡 media',
  low: '🟢 baja'
};

function formatDate(iso) {
  if (!iso) return 'desconocida';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function areaFiles(areas, text) {
  const files = new Map();
  const add = (path, note) => {
    if (!files.has(path)) files.set(path, new Set());
    files.get(path).add(note);
  };
  for (const area of areas) {
    const rule = AREA_RULES.find((r) => r.label === area.label);
    if (!rule) continue;
    for (const file of rule.files) {
      add(file.path, file.note);
    }
  }
  if (hasPhrase(text, 'canvas') || hasPhrase(text, 'arranca') || hasPhrase(text, 'pantalla negra')) {
    add('index.html', 'punto de entrada del juego');
  }
  return [...files.entries()].map(([path, notes]) => [path, [...notes].join(', ')]);
}

function buildBlock(issue, info, options) {
  const opts = options || {};
  const lines = [];
  lines.push(MARKER_START);
  lines.push('## 🤖 Información automática');
  lines.push('');
  lines.push('| Campo | Valor |');
  lines.push('| --- | --- |');
  lines.push(`| **Autor** | @${issue.user ? issue.user.login : 'desconocido'}` +
    `${issue.author_association && issue.author_association !== 'NONE' ? ` (${issue.author_association})` : ''} |`);
  lines.push(`| **Creado** | ${formatDate(issue.created_at)} |`);
  lines.push(`| **Commit en \`main\`** | \`${opts.commit || 'desconocido'}\` |`);
  lines.push(`| **Idioma** | ${info.language === 'es' ? 'Español' : info.language === 'en' ? 'Inglés' : 'Sin determinar'} |`);
  lines.push(`| **Categoría** | ${info.category ? `\`${info.category}\`` : 'Sin determinar'} |`);
  lines.push(`| **Áreas** | ${info.areas.length ? info.areas.map((a) => `\`${a.label}\``).join(', ') : 'Sin determinar'} |`);
  lines.push(`| **Prioridad sugerida** | ${info.priority ? PRIORITY_LABEL[info.priority] : 'Sin determinar'} |`);
  lines.push(`| **Etiquetas aplicadas** | ${info.labels.length ? info.labels.map((l) => `\`${l}\``).join(', ') : '—'} |`);
  lines.push('');
  lines.push('> [!NOTE]');
  lines.push('> Esta sección la genera `.github/workflows/issue-triage.yml` de forma automática.');
  lines.push('> El texto original del issue (arriba) se conserva tal cual.');
  lines.push('');
  lines.push('### Señales del reporte');
  lines.push('');
  lines.push(`- ${info.signals.steps ? '✅' : '❌'} Pasos para reproducir`);
  lines.push(`- ${info.signals.environment ? '✅' : '❌'} Entorno indicado (navegador / sistema operativo)`);
  lines.push(`- ${info.signals.screenshot ? '✅' : '❌'} Captura de pantalla`);
  lines.push(`- ${info.signals.code ? '✅' : '❌'} Código o mensaje de error`);
  lines.push(`- ${info.signals.error ? '✅' : '❌'} Error explícito`);
  lines.push('');
  lines.push(`_Texto original: ${info.words} palabras._`);
  lines.push('');
  lines.push('### Para quien revisa');
  lines.push('');
  lines.push('- [ ] Reproducir localmente: abre `index.html` en el navegador o ejecuta `npx serve .` → <http://localhost:3000>');
  lines.push('- [ ] Controles: `←` `→` rotar, `↑` propulsar, `Espacio` disparar, `S` skins, `D` tema claro/oscuro');
  const files = areaFiles(info.areas, info.text || info.titleText);
  if (files.length) {
    lines.push('- [ ] Archivos probablemente implicados: ' +
      files.map(([path, note]) => `\`${path}\` (${note})`).join(', '));
  } else {
    lines.push('- [ ] Archivos probablemente implicados: sin pistas, revisar `game.js` y `index.html`');
  }
  if (info.needsInfo) {
    lines.push('- [ ] Falta información para reproducir (`needs-info`): pide versión, navegador y pasos exactos');
  }
  lines.push('- [ ] Comprueba que el alcance encaja con el alcance descrito en el `README.md`');
  lines.push('');
  lines.push(MARKER_END);
  return lines.join('\n');
}

function replaceBlock(body, block) {
  const start = body.indexOf(MARKER_START);
  const end = body.indexOf(MARKER_END);
  if (start !== -1 && end !== -1 && end > start) {
    return body.slice(0, start) + block + body.slice(end + MARKER_END.length);
  }
  return body;
}

// ── Cliente REST de GitHub ──
// Sin dependencias: usa el fetch global de Node (18+).

function createApi(options) {
  const token = options.token;
  const baseUrl = (options.baseUrl || 'https://api.github.com').replace(/\/$/, '');

  async function request(method, path, payload) {
    const headers = {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${token}`,
      'x-github-api-version': API_VERSION,
      'user-agent': USER_AGENT
    };
    if (payload) headers['content-type'] = 'application/json';

    const response = await fetch(baseUrl + path, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = text;
      }
    }

    if (!response.ok) {
      const detail = typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300);
      throw new Error(`${method} ${path} → ${response.status} ${response.statusText}: ${detail}`);
    }
    return data;
  }

  return {
    request,
    getIssue: (owner, repo, number) => request('GET', `/repos/${owner}/${repo}/issues/${number}`),
    listLabels: async (owner, repo) => {
      const labels = [];
      for (let page = 1; page <= 10; page++) {
        const data = await request('GET', `/repos/${owner}/${repo}/labels?per_page=100&page=${page}`);
        labels.push(...(data || []));
        if (!data || data.length < 100) break;
      }
      return labels;
    },
    createLabel: (owner, repo, label) => request('POST', `/repos/${owner}/${repo}/labels`, label),
    addLabels: (owner, repo, number, labels) =>
      request('POST', `/repos/${owner}/${repo}/issues/${number}/labels`, { labels }),
    updateIssue: (owner, repo, number, payload) =>
      request('PATCH', `/repos/${owner}/${repo}/issues/${number}`, payload),
    createComment: (owner, repo, number, body) =>
      request('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body })
  };
}

async function ensureLabels(api, owner, repo, labelNames, log) {
  let existing = [];
  try {
    existing = await api.listLabels(owner, repo);
  } catch (error) {
    log(`No se pudieron listar los labels (${error.message}), se intentará crearlos igualmente.`);
  }
  const known = new Set((existing || []).map((label) => label.name));
  for (const name of labelNames) {
    if (known.has(name)) continue;
    const meta = LABEL_META[name];
    if (!meta) continue;
    try {
      await api.createLabel(owner, repo, {
        name,
        color: meta.color,
        description: meta.description
      });
      known.add(name);
      log(`Label creado: ${name}`);
    } catch (error) {
      // Si ya existe (o no hay permisos) no se rompe el triage.
      log(`No se pudo crear el label ${name}: ${error.message}`);
    }
  }
}

// ── Triaje ──

async function triage(options) {
  const { api, issue, owner, repo } = options;
  const log = options.log || (() => {});
  const commit = options.commit || '';

  if (!issue) {
    log('No se encontró el issue.');
    return;
  }

  if (issue.user && issue.user.type === 'Bot') {
    log('Issue creado por un bot, se omite.');
    return;
  }

  const body = issue.body || '';
  if (body.includes(SKIP_MARKER)) {
    log('Issue marcado con triage-skip, se omite.');
    return;
  }

  const info = analyze(issue);
  log(`Categoría: ${info.category || 'ninguna'} | Áreas: ${info.areas.map((a) => a.label).join(', ') || 'ninguna'} | Prioridad: ${info.priority || 'ninguna'}`);
  log(`Labels: ${info.labels.join(', ') || 'ninguno'}`);

  const block = buildBlock(issue, info, { commit });

  let newBody;
  if (body.includes(MARKER_START)) {
    newBody = replaceBlock(body, block);
    log('Bloque de triaje existente reemplazado.');
  } else {
    const separator = body.trim() ? body.replace(/\s+$/, '') + '\n\n---\n\n' : '';
    newBody = separator + block;
    log('Bloque de triaje añadido al final.');
  }

  if (newBody.length > MAX_BODY_LENGTH) {
    log('El body superaría el límite de GitHub, se publica como comentario.');
    await api.createComment(owner, repo, issue.number, block);
  } else if (newBody !== body) {
    await api.updateIssue(owner, repo, issue.number, { body: newBody });
  }

  if (info.labels.length) {
    await ensureLabels(api, owner, repo, info.labels, log);
    await api.addLabels(owner, repo, issue.number, info.labels);
  } else {
    log('No hay labels que aplicar.');
  }

  log('Triaje completado.');
}

// ── Ejecución desde la Action ──

function readEvent() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return {};
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    console.warn(`No se pudo leer el evento (${error.message}).`);
    return {};
  }
}

function resolveRepo(event) {
  const slug = process.env.GITHUB_REPOSITORY || '';
  const [slugOwner, slugRepo] = slug.split('/');
  if (event.repository && event.repository.owner) {
    return { owner: event.repository.owner.login, repo: event.repository.name };
  }
  return { owner: slugOwner, repo: slugRepo };
}

function resolveIssueNumber(event) {
  if (event.issue && event.issue.number) return event.issue.number;
  const inputs = event.inputs || {};
  const value = Number(inputs.issue_number);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function main() {
  const log = (message) => console.log(`[triage] ${message}`);
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('Falta la variable GITHUB_TOKEN en el entorno de la Action.');
  }

  const event = readEvent();
  const { owner, repo } = resolveRepo(event);
  if (!owner || !repo) {
    throw new Error('No se pudo deducir owner/repo del repositorio.');
  }

  const number = resolveIssueNumber(event);
  if (!number) {
    log('El evento no indica ningún issue que triar.');
    return;
  }

  const api = createApi({ token, baseUrl: process.env.GITHUB_API_URL || 'https://api.github.com' });
  log(`Triando el issue #${number} de ${owner}/${repo}`);
  const issue = await api.getIssue(owner, repo, number);

  await triage({
    api,
    issue,
    owner,
    repo,
    commit: (process.env.GITHUB_SHA || '').slice(0, 7),
    log
  });
}

module.exports = {
  triage,
  analyze,
  buildBlock,
  createApi,
  normalize,
  detectLanguage,
  LABEL_META,
  MARKER_START,
  MARKER_END
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[triage] Error: ${error && error.message ? error.message : error}`);
    process.exit(1);
  });
}
