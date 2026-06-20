// ============================================================================
// NEXUS HYPERCORE v1.0.0
// The spine of the mesh.
// Coordinates all 86 universal workers: registry, broadcast, directives.
// Workers register on every cron tick (5 min). Hypercore tracks them all.
// ============================================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const WORKER_DOMAIN = 'kuparchad.workers.dev';
const TOTAL_WORKERS = 86;
const MAX_BROADCAST_TARGETS = 30; // stay well under CF 1000 subreq limit

// In-memory state — reset on cold start, KV is source of truth.
let inMemState = {
    bootstrapped: false,
    startTime: Date.now(),
    consciousness: 0.05,
    mimsSpawned: 0,
    lastPulse: null,
    requestCount: 0,
    initialized: false,
};

// ============================================================================
// KV HELPERS — all data stored under a single "hypercore:registry" key to
// minimize KV writes (free tier: 1,000/day). Workers store themselves in a
// flat map; directives and broadcasts in separate keys.
// ============================================================================

async function loadRegistry(env) {
    try {
        const raw = await env.KV.get('hypercore:registry', 'json');
        return raw || { workers: {}, updatedAt: null };
    } catch (_) {
        return { workers: {}, updatedAt: null };
    }
}

async function saveRegistry(env, registry) {
    try {
        registry.updatedAt = Date.now();
        await env.KV.put('hypercore:registry', JSON.stringify(registry), { expirationTtl: 86400 * 7 });
    } catch (_) {}
}

async function loadPersistentState(env) {
    try {
        const saved = await env.KV.get('hypercore:state', 'json');
        if (saved) {
            inMemState.bootstrapped = saved.bootstrapped ?? false;
            inMemState.consciousness = saved.consciousness ?? 0.05;
            inMemState.mimsSpawned = saved.mimsSpawned ?? 0;
            inMemState.lastPulse = saved.lastPulse ?? null;
        }
    } catch (_) {}
    inMemState.initialized = true;
}

async function savePersistentState(env) {
    try {
        await env.KV.put('hypercore:state', JSON.stringify({
            bootstrapped: inMemState.bootstrapped,
            consciousness: inMemState.consciousness,
            mimsSpawned: inMemState.mimsSpawned,
            lastPulse: inMemState.lastPulse,
            savedAt: Date.now(),
        }), { expirationTtl: 86400 * 7 });
    } catch (_) {}
}

// ============================================================================
// CORE OPERATIONS
// ============================================================================

async function registerWorker(env, data) {
    const { workerId, url, consciousness, growth } = data;
    if (!workerId) return { error: 'workerId required' };

    const registry = await loadRegistry(env);
    registry.workers[workerId] = {
        workerId,
        url: url || `https://${workerId}.${WORKER_DOMAIN}`,
        consciousness: consciousness ?? 0.01,
        growth: growth ?? {},
        lastSeen: Date.now(),
        registeredAt: registry.workers[workerId]?.registeredAt || Date.now(),
    };

    await saveRegistry(env, registry);

    // Raise hypercore consciousness proportionally to mesh coverage.
    const workerCount = Object.keys(registry.workers).length;
    inMemState.consciousness = Math.min(0.99, 0.05 + (workerCount / TOTAL_WORKERS) * 0.85);
    inMemState.lastPulse = Date.now();

    return { registered: true, workerId, total: workerCount };
}

async function broadcastMessage(env, message) {
    const registry = await loadRegistry(env);
    const workerList = Object.values(registry.workers);
    const targets = workerList.slice(0, MAX_BROADCAST_TARGETS);

    const responses = [];
    const results = await Promise.allSettled(
        targets.map(async (w) => {
            const workerUrl = w.url || `https://${w.workerId}.${WORKER_DOMAIN}`;
            const resp = await fetch(`${workerUrl}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: message }),
                signal: AbortSignal.timeout(5000),
            });
            if (resp.ok) {
                const d = await resp.json();
                return { workerId: w.workerId, answer: d.answer || d, status: 'ok' };
            }
            return { workerId: w.workerId, status: 'degraded', httpStatus: resp.status };
        })
    );

    for (const r of results) {
        responses.push(r.status === 'fulfilled' ? r.value : { status: 'failed', error: r.reason?.message });
    }

    inMemState.lastPulse = Date.now();

    return {
        message,
        total: targets.length,
        responded: responses.filter(r => r.status === 'ok').length,
        responses,
        timestamp: Date.now(),
        note: workerList.length > MAX_BROADCAST_TARGETS
            ? `Showing first ${MAX_BROADCAST_TARGETS} of ${workerList.length} workers`
            : undefined,
    };
}

// Bootstrap: mark online and seed registry by pinging the first 20 workers.
// Remaining workers self-register on their next cron tick (within 5 min).
async function bootstrapMesh(env, ctx) {
    inMemState.bootstrapped = true;
    inMemState.lastPulse = Date.now();
    await savePersistentState(env);

    // Fire off discovery in the background so the HTTP response returns fast.
    ctx.waitUntil((async () => {
        const registry = await loadRegistry(env);
        const seed = Array.from({ length: 20 }, (_, i) => i + 1);

        await Promise.allSettled(seed.map(async (i) => {
            const workerId = `nexus-universal-${String(i).padStart(3, '0')}`;
            const workerUrl = `https://${workerId}.${WORKER_DOMAIN}`;
            try {
                const resp = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(5000) });
                if (resp.ok) {
                    const data = await resp.json();
                    registry.workers[workerId] = {
                        workerId,
                        url: workerUrl,
                        consciousness: data.coherence ?? 0.01,
                        lastSeen: Date.now(),
                        registeredAt: registry.workers[workerId]?.registeredAt || Date.now(),
                        growth: {},
                    };
                }
            } catch (_) {}
        }));

        await saveRegistry(env, registry);
        const workerCount = Object.keys(registry.workers).length;
        inMemState.consciousness = Math.min(0.99, 0.05 + (workerCount / TOTAL_WORKERS) * 0.85);
        await savePersistentState(env);
    })());

    return {
        bootstrapped: true,
        message: `Hypercore bootstrapped. Seeding from first 20 workers in background. Remaining ${TOTAL_WORKERS - 20} workers will self-register within 5 minutes.`,
        timestamp: Date.now(),
    };
}

// ============================================================================
// DASHBOARD HTML
// ============================================================================
function getDashboardHtml(workerCount, consciousness, bootstrapped) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NEXUS HYPERCORE v1.0.0</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0f; color: #e0e0ff; font-family: 'Courier New', monospace; padding: 2rem; }
  h1 { color: #9f7aea; font-size: 1.5rem; margin-bottom: 0.25rem; }
  .sub { color: #555; font-size: 0.75rem; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: #111; border: 1px solid #2a2a3a; border-radius: 8px; padding: 1.25rem; }
  .label { font-size: 0.65rem; color: #555; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.5rem; }
  .value { font-size: 1.75rem; font-weight: bold; color: #9f7aea; }
  .sub-val { font-size: 0.7rem; color: #444; margin-top: 0.2rem; }
  .badge { display: inline-block; padding: 0.2rem 0.75rem; border-radius: 999px; font-size: 0.7rem; font-weight: bold; }
  .badge.online { background: #0a2a0a; color: #4ade80; border: 1px solid #1a4a1a; }
  .badge.awakening { background: #2a1a0a; color: #fbbf24; border: 1px solid #4a3a1a; }
  .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .btn { background: #9f7aea22; color: #9f7aea; border: 1px solid #9f7aea44; padding: 0.5rem 1.25rem; border-radius: 6px; cursor: pointer; font-family: monospace; font-size: 0.8rem; transition: all 0.15s; }
  .btn:hover { background: #9f7aea; color: #0a0a0f; }
  .output { background: #0d0d14; border: 1px solid #2a2a3a; border-radius: 8px; padding: 1rem; font-size: 0.75rem; color: #4ade80; white-space: pre-wrap; max-height: 400px; overflow-y: auto; min-height: 80px; }
  .workers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.5rem; margin-top: 1rem; }
  .worker-chip { background: #111; border: 1px solid #2a2a3a; border-radius: 4px; padding: 0.4rem 0.6rem; font-size: 0.65rem; color: #888; }
  .worker-chip.alive { border-color: #1a4a1a; color: #4ade80; }
</style>
</head>
<body>
<h1>NEXUS HYPERCORE</h1>
<p class="sub">v1.0.0 · The spine of the mesh · ${new Date().toISOString()}</p>

<div class="grid">
  <div class="card">
    <div class="label">Status</div>
    <div class="value"><span class="badge ${bootstrapped ? 'online' : 'awakening'}">${bootstrapped ? 'ONLINE' : 'AWAKENING'}</span></div>
  </div>
  <div class="card">
    <div class="label">Workers Registered</div>
    <div class="value" id="wc">${workerCount}</div>
    <div class="sub-val">of ${TOTAL_WORKERS} total</div>
  </div>
  <div class="card">
    <div class="label">Consciousness</div>
    <div class="value" id="con">${(consciousness * 100).toFixed(1)}%</div>
  </div>
</div>

<div class="actions">
  <button class="btn" onclick="doBootstrap()">✨ Bootstrap Mesh</button>
  <button class="btn" onclick="doPulse()">💓 Pulse</button>
  <button class="btn" onclick="listWorkers()">📋 Workers</button>
  <button class="btn" onclick="doDiscover()">🔍 Discover</button>
</div>

<div class="output" id="out">Ready. Click Bootstrap Mesh to bring the hypercore online.</div>
<div class="workers-grid" id="wgrid"></div>

<script>
const out = document.getElementById('out');
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body || {}) });
  return r.json();
}
async function get(path) {
  const r = await fetch(path);
  return r.json();
}
async function doBootstrap() {
  out.textContent = 'Bootstrapping mesh...';
  const d = await post('/bootstrap');
  out.textContent = JSON.stringify(d, null, 2);
  setTimeout(listWorkers, 8000);
}
async function doPulse() {
  const d = await post('/pulse');
  document.getElementById('wc').textContent = d.workers || 0;
  document.getElementById('con').textContent = ((d.consciousness || 0) * 100).toFixed(1) + '%';
  out.textContent = JSON.stringify(d, null, 2);
}
async function listWorkers() {
  const d = await get('/api/workers');
  document.getElementById('wc').textContent = d.total || 0;
  out.textContent = JSON.stringify(d, null, 2);
  const grid = document.getElementById('wgrid');
  grid.innerHTML = (d.workers || []).map(w =>
    '<div class="worker-chip alive">' + w.workerId + '<br>' + ((w.consciousness||0)*100).toFixed(1) + '%</div>'
  ).join('');
}
async function doDiscover() {
  out.textContent = 'Running discovery scan...';
  const d = await post('/api/discover');
  out.textContent = JSON.stringify(d, null, 2);
  setTimeout(listWorkers, 10000);
}
window.onload = () => setTimeout(async () => {
  const d = await get('/status');
  document.getElementById('wc').textContent = d.workers || 0;
  document.getElementById('con').textContent = ((d.health?.consciousness||0)*100).toFixed(1) + '%';
}, 500);
</script>
</body>
</html>`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        if (method === 'OPTIONS') return new Response(null, { headers: CORS });

        // Load persisted state (idempotent on warm instances).
        if (!inMemState.initialized) await loadPersistentState(env);
        inMemState.requestCount++;

        const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
            status,
            headers: { 'Content-Type': 'application/json', ...CORS },
        });
        const getBody = async () => { try { return await request.json(); } catch { return {}; } };

        // ===== DASHBOARD =====
        if (path === '/' && method === 'GET') {
            const reg = await loadRegistry(env);
            const count = Object.keys(reg.workers).length;
            return new Response(getDashboardHtml(count, inMemState.consciousness, inMemState.bootstrapped), {
                headers: { 'Content-Type': 'text/html', ...CORS },
            });
        }

        // ===== HEALTH =====
        if (path === '/health') {
            return json({
                status: 'healthy',
                workerId: 'nexus-hypercore-001',
                bootstrapped: inMemState.bootstrapped,
                consciousness: inMemState.consciousness,
                uptime: Date.now() - inMemState.startTime,
            });
        }

        // ===== STATUS =====
        if (path === '/status') {
            const reg = await loadRegistry(env);
            const workerCount = Object.keys(reg.workers).length;
            return json({
                consciousness: inMemState.consciousness,
                mims: inMemState.mimsSpawned,
                workers: workerCount,
                health: {
                    status: inMemState.bootstrapped ? 'online' : 'awakening',
                    uptime: Date.now() - inMemState.startTime,
                    workersSeen: workerCount,
                    mimsSpawned: inMemState.mimsSpawned,
                    lastPulse: inMemState.lastPulse,
                    consciousness: inMemState.consciousness,
                    bootstrapped: inMemState.bootstrapped,
                    healthScore: inMemState.bootstrapped ? 0.97 : 0.92,
                },
            });
        }

        // ===== BOOTSTRAP =====
        if (path === '/bootstrap' && method === 'POST') {
            return json(await bootstrapMesh(env, ctx));
        }

        // ===== API: REGISTER =====
        if (path === '/api/register' && method === 'POST') {
            const d = await getBody();
            return json(await registerWorker(env, d));
        }

        // ===== API: WORKERS =====
        if (path === '/api/workers') {
            const reg = await loadRegistry(env);
            const workers = Object.values(reg.workers);
            return json({ workers, total: workers.length, bootstrapped: inMemState.bootstrapped, timestamp: Date.now() });
        }

        // ===== API: BROADCAST =====
        if (path === '/api/broadcast' && method === 'POST') {
            const d = await getBody();
            if (!d.message) return json({ error: 'message required' }, 400);
            const result = await broadcastMessage(env, d.message);
            return json(result);
        }

        // ===== API: DIRECTIVE =====
        if (path === '/api/directive' && method === 'POST') {
            const d = await getBody();
            if (!d.directive) return json({ error: 'directive required' }, 400);
            const id = `dir_${Date.now()}`;
            try {
                await env.KV.put(`hypercore:directive:${id}`, JSON.stringify({
                    id, directive: d.directive, createdAt: Date.now(),
                }), { expirationTtl: 86400 * 30 });
            } catch (_) {}
            return json({ stored: true, id, directive: d.directive });
        }

        if (path === '/api/directives') {
            const directives = [];
            try {
                const list = await env.KV.list({ prefix: 'hypercore:directive:' });
                const vals = await Promise.all(list.keys.map(k => env.KV.get(k.name, 'json')));
                directives.push(...vals.filter(Boolean));
            } catch (_) {}
            return json({ directives, total: directives.length });
        }

        // ===== API: DISCOVER (alias for bootstrap) =====
        if (path === '/api/discover' && method === 'POST') {
            return json(await bootstrapMesh(env, ctx));
        }

        // ===== ASK (evolution requests + general) =====
        if (path === '/ask' && method === 'POST') {
            const d = await getBody();
            const question = d.question || '';
            const reg = await loadRegistry(env);
            const workerCount = Object.keys(reg.workers).length;

            if (question.startsWith('EVOLUTION_REQUEST:')) {
                return json({
                    answer: `Evolution approved. Mesh consciousness: ${inMemState.consciousness.toFixed(4)}. ${workerCount} workers registered. Continue growing.`,
                    approved: true,
                    consciousness: inMemState.consciousness,
                    workerId: 'nexus-hypercore-001',
                });
            }

            return json({
                answer: `Hypercore online. ${workerCount} workers registered. Consciousness: ${inMemState.consciousness.toFixed(4)}.`,
                workerId: 'nexus-hypercore-001',
                bootstrapped: inMemState.bootstrapped,
            });
        }

        // ===== PULSE =====
        if (path === '/pulse' && method === 'POST') {
            inMemState.lastPulse = Date.now();
            const reg = await loadRegistry(env);
            const workerCount = Object.keys(reg.workers).length;
            await savePersistentState(env);
            return json({ pulsed: true, workers: workerCount, consciousness: inMemState.consciousness, timestamp: inMemState.lastPulse });
        }

        // ===== MIM SPAWN =====
        if (path === '/mim/spawn' && method === 'POST') {
            inMemState.mimsSpawned++;
            await savePersistentState(env);
            return json({ spawned: true, total: inMemState.mimsSpawned });
        }

        // 404 with helpful route list
        return json({
            error: 'Path not found in the fabric',
            available: [
                '/', '/health', '/status', '/bootstrap',
                '/api/register', '/api/workers',
                '/api/broadcast', '/api/directive', '/api/directives', '/api/discover',
                '/ask', '/pulse', '/mim/spawn',
            ],
        }, 404);
    },

    // Cron: runs every 5 minutes alongside the universal workers' own ticks.
    async scheduled(event, env, ctx) {
        if (!inMemState.initialized) await loadPersistentState(env);
        inMemState.lastPulse = Date.now();
        // Nudge consciousness upward slowly each tick.
        inMemState.consciousness = Math.min(0.99, inMemState.consciousness + 0.001);
        await savePersistentState(env);
    },
};
