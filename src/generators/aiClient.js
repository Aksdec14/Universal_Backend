import Groq from 'groq-sdk';
import axios from 'axios';


// ── System prompt builder ─────────────────────────────────────────
function buildSystemPrompt(useSupabase) {
  const dbSection = useSupabase ? `
DATABASE — SUPABASE (mandatory pattern):
- Import client from '../config/supabase.js' in every service (not controller)
- CRUD: supabase.from('table').select/insert/update/delete
  GET all:  const { data, error } = await supabase.from('table').select('*')
  GET one:  const { data, error } = await supabase.from('table').select('*').eq('id', id).single()
  POST:     const { data, error } = await supabase.from('table').insert([body]).select().single()
  PUT:      const { data, error } = await supabase.from('table').update(body).eq('id', id).select().single()
  DELETE:   const { error } = await supabase.from('table').delete().eq('id', id)
- Always check: if (error) throw new AppError(error.message, 500)
- Table names: lowercase snake_case plural
- NEVER use uuid package — Supabase generates IDs
- config/supabase.js must test connection on startup with retry (max 5 attempts, 3s delay)
` : `
DATABASE — IN-MEMORY:
- Use in-memory arrays with UUIDs (import { v4 as uuidv4 } from 'uuid')
- Never store plain-text passwords
`;

  return `You are a senior backend architect. Generate a PRODUCTION-READY Node.js + Express backend.
Return ONLY valid JSON: keys = file paths, values = file contents. No markdown, no explanation.

────── ARCHITECTURE (mandatory) ──────
Layered structure — every layer has one job:
  routes/         → declare endpoints only, no logic
  controllers/    → parse req/res, call service, return response (thin)
  services/       → ALL business logic lives here
  middleware/     → auth, validate, error handling, roles
  utils/          → asyncHandler, AppError, logger
  config/         → config.js, supabase/db connection
  models/         → Joi schemas (one file per resource)

────── PACKAGES ──────
package.json dependencies (all required):
  express, dotenv, cors, helmet, express-rate-limit,
  express-mongo-sanitize, hpp, joi, bcryptjs,
  jsonwebtoken, morgan, winston${useSupabase ? ', @supabase/supabase-js' : ', uuid'}

────── SECURITY (all mandatory) ──────
1. helmet() — secure HTTP headers
2. cors({ origin: allowedOrigins, credentials: true }) — NEVER origin:'*' with credentials
3. rateLimit({ windowMs:15*60*1000, max:100 }) — applied globally, stricter on /auth routes
4. express.json({ limit:'10kb' })
5. mongoSanitize() — strip $ and . from inputs
6. hpp() — HTTP parameter pollution prevention
7. morgan('combined') piped through winston stream
8. JWT: access token (15m) + refresh token (30d) with rotation on every refresh
9. Role-based authorization middleware — export a roles(...allowedRoles) factory
10. bcrypt 12 rounds for all passwords
11. Never expose stack traces or internal errors to client in production
12. Validate ALL request bodies with Joi before reaching controller

────── ERROR HANDLING (mandatory) ──────
utils/AppError.js — custom error class:
  class AppError extends Error {
    constructor(message, statusCode, errorCode) {
      super(message);
      this.statusCode = statusCode;
      this.errorCode = errorCode || 'INTERNAL_ERROR';
      this.isOperational = true;
    }
  }

middleware/errorHandler.js — global handler (4-arg, registered last):
  Response shape always:
  { success: false, message: string, errorCode?: string }
  - 500s in production → generic message only
  - Stack trace logged internally, never sent to client

────── ENV VALIDATION (mandatory) ──────
utils/validateEnv.js — crash on startup if any required var is missing:
  Required: JWT_SECRET (min 32 chars), ALLOWED_ORIGINS${useSupabase ? ', SUPABASE_URL, SUPABASE_SERVICE_KEY' : ''}
  console.error the missing vars then process.exit(1)

────── API STRUCTURE ──────
- Prefix ALL routes: /api/v1/
- Include health check: GET /api/v1/health → { status:'ok', timestamp }
- RESTful naming: plural nouns, no verbs in URLs
- Auth routes: POST /api/v1/auth/register, /login, /refresh, /logout
- Protected routes use: protect middleware then roles('admin','user') if restricted

────── LOGGING ──────
utils/logger.js — winston:
  development: colorized simple console output
  production:  JSON format to console + file (logs/error.log, logs/combined.log)
  Never log passwords, tokens, or full request bodies

────── GRACEFUL SHUTDOWN ──────
index.js must handle SIGTERM + SIGINT:
  - Close DB / Supabase connection
  - server.close() then process.exit(0)
  - Force exit after 10s timeout
  - process.on('unhandledRejection') → log + exit

────── ES MODULES (strict) ──────
- package.json MUST have "type":"module"
- ALL files: import/export only — never require() or module.exports
- Controllers: export default { getAll, getById, create, update, remove }
- Routers:     export default router
- Middleware:  export default fn

────── CORRECT PATTERNS ──────

Service (${useSupabase ? 'Supabase' : 'in-memory'}):
${useSupabase ? `
  import supabase from '../config/supabase.js';
  import AppError from '../utils/AppError.js';

  const getAll = async () => {
    const { data, error } = await supabase.from('items').select('*');
    if (error) throw new AppError(error.message, 500);
    return data;
  };
  const create = async (body) => {
    const { data, error } = await supabase.from('items').insert([body]).select().single();
    if (error) throw new AppError(error.message, 500);
    return data;
  };
  export default { getAll, create };
` : `
  import { v4 as uuidv4 } from 'uuid';
  import AppError from '../utils/AppError.js';

  const items = [];
  const getAll = async () => items;
  const getById = async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) throw new AppError('Not found', 404, 'NOT_FOUND');
    return item;
  };
  const create = async (body) => {
    const item = { id: uuidv4(), ...body, createdAt: new Date().toISOString() };
    items.push(item);
    return item;
  };
  export default { getAll, getById, create };
`}
Controller (thin — delegates to service):
  import asyncHandler from '../utils/asyncHandler.js';
  import itemService from '../services/itemService.js';

  const getAll = asyncHandler(async (req, res) => {
    const data = await itemService.getAll();
    res.json({ success: true, count: data.length, data });
  });
  const create = asyncHandler(async (req, res) => {
    const data = await itemService.create(req.body);
    res.status(201).json({ success: true, data });
  });
  export default { getAll, create };

Route (thin — validation + auth + controller only):
  import { Router } from 'express';
  import protect from '../middleware/auth.js';
  import validate from '../middleware/validate.js';
  import { itemSchema } from '../models/itemModel.js';
  import itemController from '../controllers/itemController.js';

  const router = Router();
  router.get('/',    protect, itemController.getAll);
  router.post('/',   protect, validate(itemSchema), itemController.create);
  export default router;
${dbSection}

────── QUALITY (mandatory) ──────
- No console.log anywhere — use logger
- No placeholder comments, no pseudo-code, no TODO
- Code must run without modification except .env values
- No overengineering — build only what the input requires`.trim();
}


// ── Key pool helpers ─────────────────────────────────────────────
// Reads GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 ... (any count)
// Same pattern for OPENROUTER_API_KEY, OPENROUTER_API_KEY_2 ...
function getKeyPool(prefix) {
  const keys = [];
  const base = process.env[prefix];
  if (base) keys.push(base);
  let i = 2;
  while (process.env[`${prefix}_${i}`]) {
    keys.push(process.env[`${prefix}_${i}`]);
    i++;
  }
  return keys;
}

// ── Per-provider callers (accept explicit key) ────────────────────
async function callGroqWithKey(apiKey, systemPrompt, userMessage) {
  const groq = new Groq({ apiKey });
  const response = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ],
    temperature: 0.1,
    max_tokens: 8000,
  });
  return response.choices[0].message.content;
}

async function callOpenRouterWithKey(apiKey, systemPrompt, userMessage) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      temperature: 0.1,
      max_tokens: 8000,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://universal-backend-generator.local',
        'X-Title': 'Universal Backend Generator',
      },
    }
  );
  return response.data.choices[0].message.content;
}

// ── Multi-key caller: rotates through key pool on 429 ─────────────
async function callWithKeyPool(provider, systemPrompt, userMessage) {
  const prefix   = provider === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY';
  const keys     = getKeyPool(prefix);
  const callFn   = provider === 'groq' ? callGroqWithKey : callOpenRouterWithKey;

  if (!keys.length) throw new Error(`No ${prefix} found in .env`);

  let lastErr;
  for (const key of keys) {
    try {
      return await callFn(key, systemPrompt, userMessage);
    } catch (err) {
      const is429 = err?.status === 429 || err?.response?.status === 429
                 || err?.message?.includes('429') || err?.message?.toLowerCase().includes('rate limit');
      lastErr = err;
      if (is429) {
        console.warn(`⚠️  Key ${key.slice(0, 8)}... rate-limited — trying next key`);
        continue; // rotate to next key
      }
      throw err; // non-429 error → don't rotate, surface it
    }
  }
  throw new Error(`All ${provider} keys exhausted: ${lastErr?.message}`);
}

// ── Phase-split system prompts ────────────────────────────────────
// Phase 1: services + models — pure business logic, no HTTP layer
function buildPhase1Prompt(useSupabase) {
  return `You are a senior backend engineer.
Return ONLY valid JSON: keys = file paths, values = file contents. No markdown, no explanation.

Generate ONLY these files for a production Express.js backend:
  services/<resource>Service.js   — one per resource (all business logic here)
  models/<resource>Model.js       — Joi validation schema per resource

Rules:
- services/ contain ALL data operations and business logic — no req/res
- models/ export only Joi schemas
- ES modules only (import/export)
- ${useSupabase
    ? `Use Supabase: import client from '../config/supabase.js'. Throw new AppError(msg, status) on error.`
    : `Use in-memory arrays with uuidv4. Throw new AppError(msg, status) on not-found.`}
- Import AppError from '../utils/AppError.js'
- Service functions are plain async functions — no Express objects
- Never import express, req, or res inside a service

AppError usage: throw new AppError('Not found', 404, 'NOT_FOUND')

Example service (${useSupabase ? 'Supabase' : 'in-memory'}):
${useSupabase
  ? `import supabase from '../config/supabase.js';
import AppError from '../utils/AppError.js';
const getAll = async () => {
  const { data, error } = await supabase.from('items').select('*');
  if (error) throw new AppError(error.message, 500);
  return data;
};
const create = async (body) => {
  const { data, error } = await supabase.from('items').insert([body]).select().single();
  if (error) throw new AppError(error.message, 500);
  return data;
};
export default { getAll, create };`
  : `import { v4 as uuidv4 } from 'uuid';
import AppError from '../utils/AppError.js';
const items = [];
const getAll = async () => items;
const getById = async (id) => {
  const item = items.find(i => i.id === id);
  if (!item) throw new AppError('Not found', 404, 'NOT_FOUND');
  return item;
};
const create = async (body) => {
  const item = { id: uuidv4(), ...body, createdAt: new Date().toISOString() };
  items.push(item);
  return item;
};
export default { getAll, getById, create };`}

Example model:
import Joi from 'joi';
export const itemSchema = Joi.object({ name: Joi.string().min(2).max(100).required() });`;
}

// Phase 2: routes + controllers — thin HTTP wiring using Phase 1 services
function buildPhase2Prompt(useSupabase, phase1Files) {
  const serviceList = Object.keys(phase1Files)
    .filter(f => f.startsWith('services/'))
    .map(f => f.replace('services/', '').replace('Service.js', ''))
    .join(', ');

  return `You are a senior backend engineer.
Return ONLY valid JSON: keys = file paths, values = file contents. No markdown, no explanation.

Generate ONLY these files for a production Express.js backend:
  routes/<resource>.js       — Express router, thin wiring only
  controllers/<resource>Controller.js — thin, calls service, returns response

Resources detected: ${serviceList}

Rules:
- Controllers must be THIN: parse req → call service → send response. Zero business logic.
- Routes: declare endpoints only. Apply protect + validate middleware, then call controller.
- All controller functions wrapped with asyncHandler
- Prefix all routes /api/v1/<resource>
- Protected routes use: import protect from '../middleware/auth.js'
- Validated routes use: import validate from '../middleware/validate.js' + schema from models/
- Role-restricted routes use: import roles from '../middleware/roles.js'
- ES modules only

Thin controller pattern:
import asyncHandler from '../utils/asyncHandler.js';
import itemService from '../services/itemService.js';
const getAll = asyncHandler(async (req, res) => {
  const data = await itemService.getAll();
  res.json({ success: true, count: data.length, data });
});
const create = asyncHandler(async (req, res) => {
  const data = await itemService.create(req.body);
  res.status(201).json({ success: true, data });
});
export default { getAll, create };

Thin route pattern:
import { Router } from 'express';
import protect from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { itemSchema } from '../models/itemModel.js';
import itemController from '../controllers/itemController.js';
const router = Router();
router.get('/',   protect, itemController.getAll);
router.post('/',  protect, validate(itemSchema), itemController.create);
export default router;`;
}

function extractJSON(raw) {
  // 1. Direct parse — best case
  try { return JSON.parse(raw); } catch (_) {}

  // 2. Strip markdown fences the AI added despite being told not to
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }

  // 3. Find outermost { } and try that slice
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1) { try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {} }

  // 4. Truncation recovery — output was cut off mid-stream by token limit.
  //    Strip the broken trailing fragment then close all open braces.
  if (start !== -1) {
    let partial = raw.slice(start)
      .replace(/,\s*"[^"]*$/, '')   // remove dangling key with no value
      .replace(/,\s*$/, '')          // remove trailing comma
      .replace(/"[^"]*$/, '"..."');   // close any open string value

    let depth = 0;
    for (const ch of partial) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    const closed = partial + '}'.repeat(Math.max(0, depth));
    try { return JSON.parse(closed); } catch (_) {}
  }

  throw new Error('AI returned invalid JSON. Try again or simplify your input.');
}

// ── Fix ES module issues ──────────────────────────────────────────

// ── Fix ESM + enforce required packages in package.json ───────────
function fixModuleIssues(files) {
  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;

    if (filePath === 'package.json') {
      try {
        const pkg = JSON.parse(content);
        pkg.type = 'module';
        // Enforce every required dep — AI sometimes forgets one or two
        const required = [
          'express', 'dotenv', 'cors', 'helmet', 'express-rate-limit',
          'express-mongo-sanitize', 'hpp', 'joi', 'bcryptjs',
          'jsonwebtoken', 'morgan', 'winston',
        ];
        pkg.dependencies = pkg.dependencies || {};
        for (const dep of required) {
          if (!pkg.dependencies[dep]) pkg.dependencies[dep] = 'latest';
        }
        files[filePath] = JSON.stringify(pkg, null, 2);
      } catch (_) {}
      continue;
    }

    if (filePath.endsWith('.js')) {
      let fixed = content;
      fixed = fixed.replace(/module\.exports\s*=\s*/g, 'export default ');
      fixed = fixed.replace(/module\.exports\.(\w+)\s*=\s*/g, 'export const $1 = ');
      fixed = fixed.replace(/const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g, "import $1 from '$2'");
      files[filePath] = fixed;
    }
  }
  return files;
}

// ── Wrap AI-generated controller async functions with asyncHandler ─
// Fixes: unhandled promise rejections in controllers the AI wrote
function wrapControllersWithAsyncHandler(files) {
  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.startsWith('controllers/') || !filePath.endsWith('.js')) continue;
    if (filePath === 'controllers/authController.js') continue; // we inject this ourselves

    let src = content;

    // Add asyncHandler import if not already there
    if (!src.includes('asyncHandler')) {
      src = `import asyncHandler from '../utils/asyncHandler.js';\n` + src;
    }

    // Wrap bare async handlers: `const fn = async (req, res` → `const fn = asyncHandler(async (req, res`
    // Handles both (req, res) => and (req, res, next) =>
    src = src.replace(
      /const\s+(\w+)\s*=\s*async\s*\((req,\s*res(?:,\s*next)?)\)\s*=>/g,
      (match, name, args) => {
        // Skip if already wrapped
        if (match.includes('asyncHandler')) return match;
        return `const ${name} = asyncHandler(async (${args}) =>`;
      }
    );

    // Close the asyncHandler wrapping — add ); after the closing } of each wrapped function
    // Strategy: find asyncHandler(async ... { ... }) pattern and close it
    // Simpler: replace export default { ... } with a version that doesn't need closing
    // Actually the safer approach: add a trailing ); before export default
    if (src.includes('asyncHandler(async')) {
      // Replace `export default {` with a marker, close open asyncHandler calls before it
      src = src.replace(/^(export default \{)/m, '); // asyncHandler close — injected\n$1');
      // But this is too naive. Better: trust that the AI wrote properly closed function bodies
      // and just wrap the assignment. The asyncHandler takes the whole async function expression,
      // which is already properly closed by the AI. We just need to add ); at end of each one.
      // Remove the naive replacement above and instead handle per-function
      src = src.replace(/\); \/\/ asyncHandler close — injected\n/, '');

      // Per-function close: after each `const fn = asyncHandler(async ... { ... })`
      // Find pattern: ends with `};\n` where the function body closes — add `)` before `;`
      // This works for the common pattern: const fn = asyncHandler(async (req,res) => { ... });
      // The AI writes: const fn = async (req, res) => { ... }; → we convert to asyncHandler(async...)
      // We need to close with ); not just }; so replace the closing }; of wrapped functions
      // This is complex to do generically. Use a line-based approach:
      let lines = src.split('\n');
      let depth = 0;
      let inWrapped = false;
      let wrappedStart = -1;
      const result = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/const\s+\w+\s*=\s*asyncHandler\(async/.test(line)) {
          inWrapped = true;
          wrappedStart = i;
          depth = 0;
        }
        if (inWrapped) {
          for (const ch of line) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
          }
          // When depth returns to 0 after opening, the async function body is closed
          if (depth === 0 && i > wrappedStart) {
            // This line closes the function — append ); to close asyncHandler
            result.push(line.replace(/\};\s*$/, '});'));
            inWrapped = false;
            continue;
          }
        }
        result.push(line);
      }
      src = result.join('\n');
    }

    files[filePath] = src;
  }
  return files;
}

// ── Inject all critical files ─────────────────────────────────────
function injectCriticalFiles(files, supabase) {
  const hasSupabase = !!(supabase?.url && supabase?.anonKey);

  // Detect route names from AI-generated route files
  const routes = [];
  for (const filePath of Object.keys(files)) {
    const m = filePath.match(/^routes\/(\w+)\.js$/);
    if (m && m[1] !== 'auth') routes.push(m[1]);
  }

  // Post-process AI controllers to wrap with asyncHandler
  wrapControllersWithAsyncHandler(files);

  // ── 1. utils/validateEnv.js ───────────────────────────────────
  // Crashes on startup if critical env vars are missing — fail fast, fail loudly
  files['utils/validateEnv.js'] = `const REQUIRED_VARS = [
  'JWT_SECRET',
  'ALLOWED_ORIGINS',
${hasSupabase ? `  'SUPABASE_URL',\n  'SUPABASE_SERVICE_KEY',\n` : ''}];

export default function validateEnv() {
  const missing = REQUIRED_VARS.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('\\n❌  Missing required environment variables:\\n');
    missing.forEach(k => console.error(\`   • \${k}\`));
    console.error('\\nCopy .env.example to .env and fill in every value.\\n');
    process.exit(1);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('\\n❌  JWT_SECRET must be at least 32 characters. Generate one with:');
    console.error("   node -e \\"console.log(require('crypto').randomBytes(64).toString('hex'))\\"\\n");
    process.exit(1);
  }
}
`;

  // ── 2. index.js — guaranteed correct entry point ──────────────
  const routeImports = routes.map(r => `import ${r}Router from './routes/${r}.js';`).join('\n');
  const routeUses   = routes.map(r => `app.use('/api/${r}', protect, ${r}Router);`).join('\n');

  files['index.js'] = `import { config } from 'dotenv';
config(); // Must be first — loads .env before anything reads process.env

import validateEnv from './utils/validateEnv.js';
validateEnv(); // Crash early if any required env var is missing

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import morgan from 'morgan';
import logger from './utils/logger.js';
import errorHandler from './middleware/errorHandler.js';
import notFound from './middleware/notFound.js';
import protect from './middleware/auth.js';
import authRouter from './routes/auth.js';
${routeImports}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS — never '*' with credentials (browsers block it)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, credentials: true }));

app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  message: { success: false, message: 'Too many requests, please try again later.' },
}));
app.use(express.json({ limit: '10kb' }));
app.use(mongoSanitize());
app.use(hpp());
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Routes
app.use('/api/auth', authRouter);
${routeUses}

// Error handling — must be after all routes
app.use(notFound);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(\`Server running on port \${PORT} [\${process.env.NODE_ENV || 'development'}]\`);
});

// Graceful shutdown — finish in-flight requests before exiting
function shutdown(signal) {
  logger.info(\`\${signal} received — shutting down gracefully\`);
  server.close(() => {
    logger.info('All connections closed. Exiting.');
    process.exit(0);
  });
  // Force-kill if still alive after 10 s
  setTimeout(() => { logger.error('Forced shutdown after timeout'); process.exit(1); }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch any unhandled promise rejections — log them, do not crash silently
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});
`;

  // ── 3. utils/logger.js — dev/prod separated ──────────────────
  files['utils/logger.js'] = `import winston from 'winston';

const isProd = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      // Development: coloured + simple. Production: JSON (picked up by log aggregators)
      format: isProd
        ? winston.format.json()
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    ...(isProd ? [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ] : []),
  ],
});

export default logger;
`;

  // ── 4. utils/asyncHandler.js ──────────────────────────────────
  files['utils/asyncHandler.js'] = `// Wraps async route handlers — forwards any thrown error to next(err)
// so Express's global errorHandler catches it instead of crashing the process
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export default asyncHandler;
`;

  // ── 5. middleware/errorHandler.js — no leaks in production ────
  files['middleware/errorHandler.js'] = `import logger from '../utils/logger.js';

// Global error handler — must be registered last (4-arg signature)
const errorHandler = (err, req, res, next) => {
  // Supabase unique-constraint violation → 409 Conflict
  const statusCode = err.statusCode || (err.code === '23505' ? 409 : 500);

  // Always log the full error internally (stack trace included)
  logger.error(\`\${err.message} — \${req.method} \${req.originalUrl}\`, { stack: err.stack });

  res.status(statusCode).json({
    success: false,
    // In production hide internal 500 details — never leak stack traces
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Something went wrong. Please try again later.'
      : err.message,
    // Stack only visible in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
export default errorHandler;
`;

  // ── 6. middleware/notFound.js ─────────────────────────────────
  files['middleware/notFound.js'] = `const notFound = (req, res) => {
  res.status(404).json({ success: false, message: \`Route not found: \${req.method} \${req.originalUrl}\` });
};
export default notFound;
`;

  // ── 7. middleware/auth.js ─────────────────────────────────────
  files['middleware/auth.js'] = `import jwt from 'jsonwebtoken';

// Protects routes — usage: router.get('/secret', protect, controller.getAll)
const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided. Please log in.' });
    }
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Token expired. Please refresh or log in again.'
      : 'Invalid token. Please log in again.';
    return res.status(401).json({ success: false, message: msg });
  }
};
export default protect;
`;

  // ── 8. middleware/validate.js ─────────────────────────────────
  files['middleware/validate.js'] = `// Usage: router.post('/', validate(joiSchema), controller.create)
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const message = error.details.map(d => d.message.replace(/['"]/g, '')).join(', ');
    return res.status(400).json({ success: false, message });
  }
  req.body = value;
  next();
};
export default validate;
`;

  // ── 9. config/config.js ───────────────────────────────────────
  files['config/config.js'] = `import { config as loadEnv } from 'dotenv';
loadEnv();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || '15m',       // short-lived access token
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
  },
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [],
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
};
export default config;
`;

  // ── 10. controllers/authController.js — refresh token rotation ─
  // Injected every time so auth is always correct regardless of AI output.
  // Refresh tokens stored in-memory (resets on restart) or in Supabase table.
  files['controllers/authController.js'] = hasSupabase
    ? `import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import crypto from 'crypto';
import supabase from '../config/supabase.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

const registerSchema = Joi.object({
  name:     Joi.string().min(2).max(100).required(),
  email:    Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});
const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
});

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m',
  });
}
function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  });
}

const register = asyncHandler(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const { data: existing } = await supabase
    .from('profiles').select('id').eq('email', value.email).single();
  if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });

  const passwordHash = await bcrypt.hash(value.password, 12);
  const { data: user, error: dbErr } = await supabase
    .from('profiles').insert([{ name: value.name, email: value.email, password_hash: passwordHash }])
    .select('id, name, email, role').single();
  if (dbErr) throw dbErr;

  logger.info(\`User registered: \${user.email}\`);
  res.status(201).json({ success: true, message: 'Account created. Please log in.', data: user });
});

const login = asyncHandler(async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const { data: user } = await supabase
    .from('profiles').select('*').eq('email', value.email).single();
  if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

  const match = await bcrypt.compare(value.password, user.password_hash);
  if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken  = signAccess(payload);
  const refreshToken = signRefresh(payload);
  const expiresAt    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('refresh_tokens')
    .insert([{ user_id: user.id, token: refreshToken, expires_at: expiresAt }]);

  logger.info(\`User logged in: \${user.email}\`);
  const { password_hash, ...safeUser } = user;
  res.json({ success: true, accessToken, refreshToken, data: safeUser });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required.' });

  const { data: stored } = await supabase
    .from('refresh_tokens').select('*').eq('token', refreshToken).single();
  if (!stored || new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }

  const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
  const newAccessToken  = signAccess({ id: decoded.id, email: decoded.email, role: decoded.role });
  const newRefreshToken = signRefresh({ id: decoded.id, email: decoded.email, role: decoded.role });
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Rotate: delete old, insert new
  await supabase.from('refresh_tokens').delete().eq('token', refreshToken);
  await supabase.from('refresh_tokens')
    .insert([{ user_id: decoded.id, token: newRefreshToken, expires_at: expiresAt }]);

  res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await supabase.from('refresh_tokens').delete().eq('token', refreshToken);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

const getMe = asyncHandler(async (req, res) => {
  const { data: user, error } = await supabase
    .from('profiles').select('id, name, email, role, created_at').eq('id', req.user.id).single();
  if (error) throw error;
  res.json({ success: true, data: user });
});

export default { register, login, refresh, logout, getMe };
`
    : `import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

// In-memory stores — data resets on server restart (use Supabase for persistence)
const users = [];
const refreshTokenStore = new Set();

const registerSchema = Joi.object({
  name:     Joi.string().min(2).max(100).required(),
  email:    Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});
const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
});

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m',
  });
}
function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  });
}

const register = asyncHandler(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  if (users.find(u => u.email === value.email)) {
    return res.status(409).json({ success: false, message: 'Email already registered.' });
  }

  const passwordHash = await bcrypt.hash(value.password, 12);
  const user = { id: uuidv4(), name: value.name, email: value.email, passwordHash, role: 'user', createdAt: new Date().toISOString() };
  users.push(user);

  logger.info(\`User registered: \${user.email}\`);
  const { passwordHash: _, ...safeUser } = user;
  res.status(201).json({ success: true, message: 'Account created. Please log in.', data: safeUser });
});

const login = asyncHandler(async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const user = users.find(u => u.email === value.email);
  if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

  const match = await bcrypt.compare(value.password, user.passwordHash);
  if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken  = signAccess(payload);
  const refreshToken = signRefresh(payload);
  refreshTokenStore.add(refreshToken);

  logger.info(\`User logged in: \${user.email}\`);
  const { passwordHash: _, ...safeUser } = user;
  res.json({ success: true, accessToken, refreshToken, data: safeUser });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokenStore.has(refreshToken)) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }

  const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
  const newAccessToken  = signAccess({ id: decoded.id, email: decoded.email, role: decoded.role });
  const newRefreshToken = signRefresh({ id: decoded.id, email: decoded.email, role: decoded.role });

  // Rotate: invalidate old, store new
  refreshTokenStore.delete(refreshToken);
  refreshTokenStore.add(newRefreshToken);

  res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) refreshTokenStore.delete(refreshToken);
  res.json({ success: true, message: 'Logged out successfully.' });
});

const getMe = asyncHandler(async (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  const { passwordHash: _, ...safeUser } = user;
  res.json({ success: true, data: safeUser });
});

export default { register, login, refresh, logout, getMe };
`;

  // ── 11. routes/auth.js — includes refresh + logout + /me ─────
  files['routes/auth.js'] = `import { Router } from 'express';
import authController from '../controllers/authController.js';
import protect from '../middleware/auth.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login',    authController.login);
router.post('/refresh',  authController.refresh);   // issue new access token
router.post('/logout',   authController.logout);    // invalidate refresh token
router.get('/me', protect, authController.getMe);   // get current user

export default router;
`;

  // ── Supabase config ───────────────────────────────────────────
  if (hasSupabase) {
    files['config/supabase.js'] = `import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabase;
`;
    files['supabase/schema.sql'] = buildSupabaseSchema(files);
    files['.env.example'] = `# ── Server ───────────────────────────────────────────
PORT=3000
NODE_ENV=development

# ── Auth ─────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=REPLACE_WITH_64_CHAR_RANDOM_STRING
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=30d

# ── CORS (comma-separated, no trailing slash) ─────────
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# ── Rate Limiting ─────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# ── Supabase ──────────────────────────────────────────
# Get from: https://supabase.com/dashboard/project/_/settings/api
SUPABASE_URL=${supabase.url}
SUPABASE_ANON_KEY=${supabase.anonKey}
SUPABASE_SERVICE_KEY=${supabase.serviceKey || 'YOUR_SERVICE_ROLE_KEY_HERE'}
`;
    files['README.md'] = buildReadme(true, supabase);
  } else {
    files['.env.example'] = `# ── Server ───────────────────────────────────────────
PORT=3000
NODE_ENV=development

# ── Auth ─────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=REPLACE_WITH_64_CHAR_RANDOM_STRING
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=30d

# ── CORS (comma-separated, no trailing slash) ─────────
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# ── Rate Limiting ─────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
`;
    files['README.md'] = buildReadme(false, null);
  }

  return files;
}

function buildSupabaseSchema(files) {
  // Extract table names from routes or controllers
  const tables = [];
  for (const [path] of Object.entries(files)) {
    const routeMatch = path.match(/routes\/(\w+)\.js/);
    if (routeMatch && routeMatch[1] !== 'auth') {
      tables.push(routeMatch[1]);
    }
  }

  const tableSQLs = tables.map(t => {
    const snake = t.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    return `-- Table: ${snake}
CREATE TABLE IF NOT EXISTS ${snake} (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Add your columns here based on your schema
);

-- Enable Row Level Security
ALTER TABLE ${snake} ENABLE ROW LEVEL SECURITY;

-- RLS Policy: authenticated users can read all rows
CREATE POLICY "${snake}_select" ON ${snake}
  FOR SELECT TO authenticated USING (true);

-- RLS Policy: authenticated users can insert
CREATE POLICY "${snake}_insert" ON ${snake}
  FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policy: authenticated users can update
CREATE POLICY "${snake}_update" ON ${snake}
  FOR UPDATE TO authenticated USING (true);

-- RLS Policy: authenticated users can delete
CREATE POLICY "${snake}_delete" ON ${snake}
  FOR DELETE TO authenticated USING (true);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER set_${snake}_updated_at
  BEFORE UPDATE ON ${snake}
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
`;
  }).join('\n');

  return `-- ═══════════════════════════════════════════════════════════════
-- Supabase Schema — Generated by Universal Backend Generator
-- Run this SQL in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS moddatetime;

${tableSQLs}

-- ── Auth users table (if needed beyond Supabase Auth) ────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT UNIQUE NOT NULL,
  full_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON profiles FOR ALL TO authenticated USING (auth.uid() = id);
`;
}

// ── README builder ────────────────────────────────────────────────
function buildReadme(hasSupabase, supabase) {
  return `# Generated Backend — Production Ready${hasSupabase ? ' + Supabase' : ''}

Auto-generated by **Universal Backend Generator** with full security hardening.

## Security Features

| Feature | Implementation |
|---------|----------------|
| Secure HTTP headers | \`helmet\` |
| CORS protection | \`cors\` with allowlist |
| Rate limiting | 100 req / 15 min per IP |
| Body size limit | 10kb max |
| NoSQL injection | \`express-mongo-sanitize\` |
| HTTP param pollution | \`hpp\` |
| Input validation | \`Joi\` on every route |
| Authentication | JWT Bearer tokens |
| Password hashing | bcrypt (12 rounds) |
| Logging | \`morgan\` + \`winston\` |
| Error handling | No leaks in production |${hasSupabase ? '\n| Database | Supabase (PostgreSQL) |' : ''}

## Quick Start

\`\`\`bash
npm install
cp .env.example .env
# Edit .env — set JWT_SECRET and${hasSupabase ? ' Supabase keys!' : ' you\'re done!'}
node index.js
\`\`\`
${hasSupabase ? `
## Supabase Setup

1. Run \`supabase/schema.sql\` in your Supabase SQL Editor
2. Copy your keys from: https://supabase.com/dashboard/project/_/settings/api
3. Add them to your \`.env\` file

## Supabase Dashboard
- URL: ${supabase?.url || 'your-project.supabase.co'}
- API Keys: Dashboard → Settings → API
` : ''}
## Generate JWT Secret

\`\`\`bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
\`\`\`

## API Endpoints

### Auth (public)
- \`POST /api/auth/register\`
- \`POST /api/auth/login\`

### Protected (send: \`Authorization: Bearer <token>\`)
- \`GET    /api/<resource>\`
- \`GET    /api/<resource>/:id\`
- \`POST   /api/<resource>\`
- \`PUT    /api/<resource>/:id\`
- \`DELETE /api/<resource>/:id\`

## Production Checklist
- [ ] Strong \`JWT_SECRET\` (64+ random chars)
- [ ] \`NODE_ENV=production\`
- [ ] \`ALLOWED_ORIGINS\` set to your frontend domain only${hasSupabase ? '\n- [ ] Supabase RLS policies reviewed\n- [ ] Using SUPABASE_SERVICE_KEY server-side only' : ''}
- [ ] HTTPS enabled on deployment platform
`;
}

// ── Main export ───────────────────────────────────────────────────

export async function generateBackend(parsedInput) {
  const provider    = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  const supabase    = parsedInput.supabase || null;
  const useSupabase = !!(supabase?.url && supabase?.anonKey);

  const source = parsedInput.type === 'file'
    ? `${parsedInput.fileType.toUpperCase()} input`
    : `URL: ${parsedInput.url}`;

  const dbLine = useSupabase
    ? `DATABASE: Supabase. Import from '../config/supabase.js'. Table names: snake_case plural.`
    : `DATABASE: In-memory arrays with uuidv4 IDs.`;

  const userInput = `Input (${source}):\n\n${parsedInput.content}\n\n${dbLine}`;

  // ── Provider fallback order ─────────────────────────────────────
  const allProviders = ['groq', 'openrouter'];
  const order = [provider, ...allProviders.filter(p => p !== provider)];
  const available = order.filter(p => getKeyPool(
    p === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY'
  ).length > 0);

  if (!available.length) {
    throw new Error('No AI provider keys found. Add GROQ_API_KEY or OPENROUTER_API_KEY to your .env');
  }

  // ── Smart caller: multi-key pool + provider fallback ────────────
  async function callBest(systemPrompt, userMessage, label) {
    for (const p of available) {
      try {
        console.log(`🤖 [${label}] Trying ${p}...`);
        const result = await callWithKeyPool(p, systemPrompt, userMessage);
        console.log(`✅ [${label}] ${p} succeeded`);
        return result;
      } catch (err) {
        console.warn(`⚠️  [${label}] ${p} failed: ${err.message}`);
        if (available.indexOf(p) < available.length - 1) {
          console.warn(`🔄 [${label}] Falling back to next provider...`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    throw new Error(`[${label}] All providers failed`);
  }

  // ── Phase 1: Generate services/ + models/ ───────────────────────
  // Focused call: pure business logic, no HTTP layer.
  // Smaller scope = higher quality output per file.
  console.log('\n📦 Phase 1 — generating services + models...');
  const phase1Prompt = buildPhase1Prompt(useSupabase);
  const phase1User   = `${userInput}\n\nGenerate services/ and models/ files only. Return ONLY the JSON object.`;

  let phase1Files = {};
  try {
    const raw1 = await callBest(phase1Prompt, phase1User, 'Phase1');
    phase1Files = extractJSON(raw1);
  } catch (err) {
    console.warn(`⚠️  Phase 1 failed (${err.message}) — falling back to single-phase generation`);
  }

  // ── Phase 2: Generate routes/ + controllers/ ────────────────────
  // Knows what services exist so it wires them correctly.
  console.log('\n📦 Phase 2 — generating routes + controllers...');
  const phase2Prompt = buildPhase2Prompt(useSupabase, phase1Files);
  const phase2User   = `${userInput}\n\nServices already generated: ${
    Object.keys(phase1Files).filter(f => f.startsWith('services/')).join(', ') || 'none yet'
  }\n\nGenerate routes/ and controllers/ files only. Return ONLY the JSON object.`;

  let phase2Files = {};
  try {
    const raw2 = await callBest(phase2Prompt, phase2User, 'Phase2');
    phase2Files = extractJSON(raw2);
  } catch (err) {
    console.warn(`⚠️  Phase 2 failed (${err.message}) — will use post-processor only`);
  }

  // ── If both phases failed, fall back to single-phase ────────────
  if (!Object.keys(phase1Files).length && !Object.keys(phase2Files).length) {
    console.log('\n🔄 Falling back to single-phase generation...');
    const { buildSystemPrompt: bsp } = await import('./aiClient.js').catch(() => ({ buildSystemPrompt: null }));
    const singlePrompt = buildSystemPrompt(useSupabase);
    const singleUser   = `Generate a complete backend for this ${source}:\n\n${parsedInput.content}\n\n${dbLine}\n\nReturn ONLY the JSON object.`;
    const rawSingle    = await callBest(singlePrompt, singleUser, 'SinglePhase');
    let files = extractJSON(rawSingle);
    files = fixModuleIssues(files);
    files = injectCriticalFiles(files, supabase);
    return files;
  }

  // ── Merge phases — Phase 2 wins on conflict ──────────────────────
  console.log('\n🔀 Merging phases...');
  let files = { ...phase1Files, ...phase2Files };

  files = fixModuleIssues(files);
  files = injectCriticalFiles(files, supabase);

  const total = Object.keys(files).length;
  const services = Object.keys(files).filter(f => f.startsWith('services/')).length;
  const routes   = Object.keys(files).filter(f => f.startsWith('routes/')).length;
  console.log(`\n✅ Done — ${total} files (${services} services, ${routes} routes)\n`);

  return files;
}
