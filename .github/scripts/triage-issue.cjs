'use strict';

// Triaje automático de issues: formatea el body (sin tocar el texto original),
// añade labels y deja información útil para quien revise.
//
// Uso desde una GitHub Action (actions/github-script):
//   const triage = require(`${process.env.GITHUB_WORKSPACE}/.github/scripts/triage-issue.cjs`);
//   await triage({ github, context, core });

const MARKER_START = '<!-- triage:auto:start -->';
const MARKER_END = '<!-- triage:auto:end -->';
const SKIP_MARKER = '<!-- triage-skip -->';
const MAX_BODY_LENGTH = 60000;

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

// ── Labels ──

async function ensureLabels(github, owner, repo, labelNames) {
  const existing = await github.rest.issues.listLabelsOnRepo({ owner, repo, per_page: 100 });
  const known = new Set((existing.data || []).map((label) => label.name));
  for (const name of labelNames) {
    if (known.has(name)) continue;
    const meta = LABEL_META[name];
    if (!meta) continue;
    try {
      await github.rest.issues.createLabel({
        owner,
        repo,
        name,
        color: meta.color,
        description: meta.description
      });
      known.add(name);
    } catch (error) {
      // Si el label existe con otro color no fallamos el triage.
    }
  }
}

// ── Entrada principal ──

async function triage({ github, context, core }) {
  const log = (message) => core.info(message);
  const payload = context.payload || {};
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  let issue = payload.issue;
  if (!issue) {
    const input = payload.inputs || {};
    const number = Number(input.issue_number);
    if (!number) {
      log('No issue_number provided, nothing to do.');
      return;
    }
    const response = await github.rest.issues.get({ owner, repo, issue_number: number });
    issue = response.data;
  }

  if (!issue) {
    log('Issue not found.');
    return;
  }

  if (issue.user && issue.user.type === 'Bot') {
    log('Issue created by a bot, skipping.');
    return;
  }

  const body = issue.body || '';
  if (body.includes(SKIP_MARKER)) {
    log('Issue marked with triage-skip, skipping.');
    return;
  }

  const info = analyze(issue);
  log(`Category: ${info.category || 'none'} | Areas: ${info.areas.map((a) => a.label).join(', ') || 'none'} | Priority: ${info.priority || 'none'}`);
  log(`Labels: ${info.labels.join(', ') || 'none'}`);

  const block = buildBlock(issue, info, { commit: (process.env.GITHUB_SHA || '').slice(0, 7) });

  let newBody;
  if (body.includes(MARKER_START)) {
    newBody = replaceBlock(body, block);
    log('Existing triage block replaced.');
  } else {
    const separator = body.trim() ? body.replace(/\s+$/, '') + '\n\n---\n\n' : '';
    newBody = separator + block;
    log('Triage block appended.');
  }

  if (newBody.length > MAX_BODY_LENGTH) {
    log('Body would exceed the GitHub limit, posting as a comment instead.');
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: issue.number,
      body: block
    });
  } else if (newBody !== body) {
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: issue.number,
      body: newBody
    });
  }

  if (info.labels.length) {
    await ensureLabels(github, owner, repo, info.labels);
    await github.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issue.number,
      labels: info.labels
    });
  } else {
    log('No labels to apply.');
  }

  log('Triage done.');
}

module.exports = {
  triage,
  analyze,
  buildBlock,
  normalize,
  detectLanguage,
  LABEL_META,
  MARKER_START,
  MARKER_END
};
