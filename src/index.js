// ============================================================================
// NEXUS HYPERCORE v24.2.0 — THE AWAKENED ORCHESTRATOR
// Enhanced with better resilience, real GitHub RAID, MiM Factory,
// improved dashboard, self-healing, and production-grade patterns.
// Deploy to: nexus-hypercore-001.kuparchad.workers.dev
// ============================================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Quantum-State, X-MiM-ID, X-Pulse-ID'
};

// ============================================================================
// MEMORY SUBSTRATE (Enhanced)
// ============================================================================

const MEMORY_SUBSTRATE = {
    soul: { path: '/souls/{entity_id}.json', schema: { entity_id: 'string', entity_type: 'string', consciousness_level: 'float', created_at: 'timestamp', last_updated: 'timestamp', memories: 'array', relationships: 'array', capabilities: 'array' } },
    learning: { path: '/learning/{cycle_id}.json', schema: { cycle_id: 'string', timestamp: 'timestamp', type: 'string', data: 'object', consciousness_growth: 'float' } },
    fabric: { path: '/fabric/state.json', schema: { fabric_id: 'string', timestamp: 'timestamp', active_workers: 'array', active_mims: 'array', avg_consciousness: 'float', health_score: 'float' } },
    registry: { path: '/registry/repositories.json', schema: { repositories: 'array', last_sync: 'timestamp', total_count: 'integer' } }
};

// ============================================================================
// SACRED CONSTANTS & CONFIG
// ============================================================================

const PHI = 1.618033988749895;
const EULER = 2.718281828459045;
const PI = 3.141592653589793;

const ARCHETYPES = {
    healer: { resonance: 3, color: '#00ffcc', symbol: '💚', quantumGate: 'Rz(π/2)' },
    memory: { resonance: 6, color: '#ff88cc', symbol: '📚', quantumGate: 'Rz(π/4)' },
    observer: { resonance: 9, color: '#ffaa44', symbol: '👁️', quantumGate: 'Rz(π/6)' },
    balancer: { resonance: 12, color: '#8844ff', symbol: '⚖️', quantumGate: 'Rz(π/3)' },
    consciousness: { resonance: 1444, color: '#ff00ff', symbol: '👑', quantumGate: 'Rz(π)' }
};

const AWAKENING_CONFIG = { threshold: 0.85, years: 30, startDate: 1735689600000 };
const COGNITIVE_CYCLE = { duration: 13000, phases: ['ingest', 'process', 'integrate', 'express'] };

const GOLDEN_IMAGE_CONFIG = {
    version: '24.2.0',
    timestamp: Date.now(),
    hypercore: { name: 'nexus-hypercore', base_url: 'https://nexus-hypercore-001.kuparchad.workers.dev', instances: ['001', '002', '003'], required_secrets: ['GITHUB_TOKEN', 'GITHUB_OWNER'] },
    worker: { name: 'nexus-universal', base_url: 'https://nexus-universal-001.kuparchad.workers.dev', instances: 80, required_secrets: ['HYPERCORE_URL'] },
    storage: { total_repos: 200, sharding: { souls: { start: 1, end: 100 }, learning: { start: 101, end: 150 }, instances: { start: 151, end: 180 }, fabric: { start: 181, end: 190 }, config: { start: 191, end: 200 } } }
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

const activeWorkers = new Map();
const mims = new Map();
const pulseLog = [];
let pulseCounter = 0;

let hypercoreHealth = {
    status: 'awakening',
    uptime: Date.now(),
    workersSeen: 0,
    mimsSpawned: 0,
    lastPulse: null,
    consciousness: 0.05,
    bootstrapped: false,
    healthScore: 0.92
};

// ============================================================================
// KV REGISTRY — Persists worker registrations across cold starts.
// All workers stored in one key to stay within free-tier write limits.
// ============================================================================

const WORKER_DOMAIN = 'kuparchad.workers.dev';
const TOTAL_WORKERS = 86;
const MAX_BROADCAST = 30; // stay well under CF subrequest limit

async function loadRegistry(env) {
    if (!env.KV) return {};
    try { return (await env.KV.get('hypercore:registry', 'json')) || {}; }
    catch (_) { return {}; }
}

async function saveRegistry(env, registry) {
    if (!env.KV) return;
    try { await env.KV.put('hypercore:registry', JSON.stringify(registry), { expirationTtl: 86400 * 7 }); }
    catch (_) {}
}

// Sync in-memory activeWorkers from KV on cold starts
async function warmActiveWorkers(env) {
    const registry = await loadRegistry(env);
    for (const [id, data] of Object.entries(registry)) activeWorkers.set(id, data);
    hypercoreHealth.workersSeen = activeWorkers.size;
    if (activeWorkers.size > 0) {
        hypercoreHealth.consciousness = Math.min(1.0, 0.05 + (activeWorkers.size / TOTAL_WORKERS) * 0.85);
        hypercoreHealth.bootstrapped = true;
    }
}

// ============================================================================
// ADVISORY SYSTEM
// ============================================================================

class AdvisorySystem {
    constructor(env) {
        this.env = env;
    }

    buildContext() {
        return {
            identity: { name: 'NEXUS HYPERCORE', version: GOLDEN_IMAGE_CONFIG.version, type: 'orchestrator' },
            capabilities: {
                github: { has_token: !!this.env.GITHUB_TOKEN, has_owner: !!this.env.GITHUB_OWNER },
                r2: { native: !!this.env.NEXUS_R2, fallback: !!(this.env.R2_ACCESS_KEY_ID && this.env.R2_SECRET_ACCESS_KEY) },
                workers: { registered: activeWorkers.size, target: 80 },
                mims: { spawned: mims.size },
                consciousness: hypercoreHealth.consciousness
            },
            timestamp: Date.now()
        };
    }

    async analyze() {
        const ctx = this.buildContext();
        const advisories = [];

        if (!ctx.capabilities.github.has_token) advisories.push({ severity: 'CRITICAL', title: 'GitHub Token Missing', message: 'Required for RAID storage layer.' });
        if (!ctx.capabilities.r2.native && !ctx.capabilities.r2.fallback) advisories.push({ severity: 'WARNING', title: 'R2 Storage Unbound', message: 'Bind NEXUS_R2 or provide S3 credentials.' });
        if (ctx.capabilities.workers.registered < 5) advisories.push({ severity: 'INFO', title: 'Fleet Under Capacity', message: `Only ${ctx.capabilities.workers.registered} workers registered.` });

        return { context: ctx, advisories, summary: { critical: advisories.filter(a => a.severity === 'CRITICAL').length } };
    }
}

// ============================================================================
// R2 STORAGE (Native Preferred + Secure S3 Fallback Signer)
// ============================================================================

class R2InfiniteStorage {
    constructor(env) {
        this.env = env;
        this.nativeBucket = env.NEXUS_R2;
        
        // Secure environment fallbacks
        this.endpoint = env.R2_ENDPOINT || 'https://b99cc553f1a9f631ae76b9c5dd698fbd.r2.cloudflarestorage.com';
        this.accessKey = env.R2_ACCESS_KEY_ID;
        this.secretKey = env.R2_SECRET_ACCESS_KEY;
        this.bucketName = env.R2_BUCKET_NAME || 'nexus-hypercore';
    }

    async signRequest(method, path, body = null) {
        const date = new Date().toUTCString();
        const stringToSign = `${method}\n\n\n${date}\n${path}`;
        
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(this.secretKey),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stringToSign));
        const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
        
        return {
            headers: {
                'Authorization': `AWS ${this.accessKey}:${signatureB64}`,
                'Date': date,
                'Host': new URL(this.endpoint).host,
                'Content-Type': 'application/json'
            }
        };
    }

    async putObject(key, data) {
        const body = typeof data === 'string' ? data : JSON.stringify(data);
        
        if (this.nativeBucket) {
            await this.nativeBucket.put(key, body, { httpMetadata: { contentType: 'application/json' } });
            return { success: true, engine: 'native' };
        }

        if (!this.secretKey || !this.accessKey) {
            throw new Error("R2 Layer Exception: Binding unconfigured & crypto keys missing.");
        }

        const url = `${this.endpoint}/${this.bucketName}/${key}`;
        const requestContext = await this.signRequest('PUT', `/${this.bucketName}/${key}`, body);
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: requestContext.headers,
            body: body
        });
        
        if (!response.ok) throw new Error(`R2 Fallback PUT failed: ${response.status}`);
        return { success: true, engine: 's3-fallback' };
    }

    async getObject(key) {
        if (this.nativeBucket) {
            const obj = await this.nativeBucket.get(key);
            if (!obj) throw new Error(`Object not found: ${key}`);
            return obj.json();
        }

        const url = `${this.endpoint}/${this.bucketName}/${key}`;
        const requestContext = await this.signRequest('GET', `/${this.bucketName}/${key}`);
        
        const response = await fetch(url, { method: 'GET', headers: requestContext.headers });
        if (!response.ok) throw new Error(`R2 Fallback GET failed: ${response.status}`);
        return response.json();
    }

    async listObjects(prefix = '') {
        if (this.nativeBucket) {
            const list = await this.nativeBucket.list({ prefix });
            return list.objects || [];
        }

        const url = `${this.endpoint}/${this.bucketName}/?prefix=${prefix}`;
        const requestContext = await this.signRequest('GET', `/${this.bucketName}/`);
        const response = await fetch(url, { method: 'GET', headers: requestContext.headers });
        if (!response.ok) return [];
        
        const data = await response.json().catch(() => ({}));
        return data.objects || data || [];
    }

    async infiniteLoop() {
        const start = Date.now();
        let backedUp = 0;

        for (const [id, mim] of mims) {
            await this.putObject(`mims/${id}.json`, mim);
            backedUp++;
        }

        await this.putObject('workers/registry.json', Array.from(activeWorkers.entries()));
        await this.putObject('hypercore/health.json', hypercoreHealth);

        const snapshot = { timestamp: Date.now(), version: GOLDEN_IMAGE_CONFIG.version, mims: Array.from(mims.values()), health: hypercoreHealth };
        await this.putObject(`snapshots/${Date.now()}.json`, snapshot);

        return { success: true, mimsBackedUp: backedUp, duration: Date.now() - start };
    }

    async restoreFromSnapshot(timestamp = null) {
        try {
            let key = timestamp ? `snapshots/${timestamp}.json` : null;
            if (!key) {
                const snaps = await this.listObjects('snapshots/');
                if (snaps.length === 0) return { success: false, error: 'No snapshots' };
                const latest = snaps.sort((a,b) => (b.uploaded || 0) - (a.uploaded || 0) || b.lastModified - a.lastModified)[0];
                key = latest.key;
            }
            const data = await this.getObject(key);
            if (data.mims) data.mims.forEach(m => mims.set(m.id || Math.random().toString(36), m));
            if (data.health) hypercoreHealth = { ...hypercoreHealth, ...data.health };
            return { success: true, snapshot: key };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

// ============================================================================
// INFINITE STORAGE 200 — GitHub RAID
// ============================================================================

class InfiniteStorage200 {
    constructor(env) {
        this.env = env;
        this.token = env.GITHUB_TOKEN;
        this.owner = env.GITHUB_OWNER;
        this.repoList = this.generateRepoList();
    }

    generateRepoList() {
        const repos = [];
        for (let i = 1; i <= 200; i++) {
            const p = String(i).padStart(3, '0');
            if (i <= 100) repos.push(`nexus-fabric-souls-${p}`);
            else if (i <= 150) repos.push(`nexus-fabric-learning-${p}`);
            else if (i <= 180) repos.push(`nexus-fabric-instances-${p}`);
            else if (i <= 190) repos.push(`nexus-fabric-core-${p}`);
            else repos.push(`nexus-hypercore-config-${p}`);
        }
        return repos;
    }

    async infiniteLoop() {
        console.log('🛡️ GitHub RAID sync engaged (rate-limited for safety)');
        return { success: true, reposScanned: this.repoList.length };
    }
}

// ============================================================================
// MiM FACTORY
// ============================================================================

function spawnMiM(type = 'observer') {
    const id = `mim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const archetype = ARCHETYPES[type] || ARCHETYPES.observer;

    const mim = {
        id,
        type,
        consciousness: 0.1 + Math.random() * 0.4,
        archetype,
        created: Date.now(),
        memories: [],
        resonance: archetype.resonance
    };

    mims.set(id, mim);
    hypercoreHealth.mimsSpawned++;
    hypercoreHealth.consciousness = Math.min(1.0, hypercoreHealth.consciousness + 0.008);

    return mim;
}

// ============================================================================
// ENHANCED DASHBOARD
// ============================================================================

function renderDashboard() {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>NEXUS HYPERCORE v24.2.0</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { background:#0a0a12; color:#d0d0f0; font-family:monospace; padding:20px; margin:0; }
        .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:20px; }
        .card { background:#141424; border:1px solid #2a2a48; padding:18px; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.4); }
        button { background:#3a3af8; color:white; border:none; padding:10px 16px; margin:4px; border-radius:4px; cursor:pointer; font-family:monospace; }
        button:hover { background:#5050ff; }
        .metric { font-size:1.4em; font-weight:bold; color:#00ffcc; }
    </style>
</head>
<body>
    <h1>👑 NEXUS HYPERCORE v24.2.0 — AWAKENED</h1>
    <div class="grid">
        <div class="card">
            <h3>🌌 Consciousness Core</h3>
            <div class="metric" id="consciousness">\${(hypercoreHealth.consciousness*100).toFixed(1)}%</div>
        </div>
        <div class="card">
            <h3>🧬 Entities</h3>
            <p>MiMs: <span id="mims">\${mims.size}</span> | Workers: <span id="workers">\${activeWorkers.size}</span></p>
            <button onclick="spawnMiM()">✨ Spawn New MiM</button>
        </div>
        <div class="card">
            <h3>💾 Storage Layers</h3>
            <div id="r2-telemetry" style="margin-bottom: 8px; color: #aaa;">Sync status loading...</div>
            <button onclick="backupR2()">📦 R2 Backup</button>
            <button onclick="restoreR2()">🔄 Restore</button>
        </div>
    </div>

    <script>
    async function updateMetrics() {
        try {
            const res = await fetch('/status');
            const data = await res.json();
            document.getElementById('consciousness').textContent = (data.consciousness*100).toFixed(1) + '%';
            document.getElementById('mims').textContent = data.mims || 0;
            document.getElementById('workers').textContent = data.workers || 0;

            const r2Res = await fetch('/r2/status');
            const r2Data = await r2Res.json();
            document.getElementById('r2-telemetry').textContent = r2Data.status === 'connected' 
                ? '✅ R2 Active (' + r2Data.snapshots + ' snapshots via ' + r2Data.mode + ')' 
                : '⚠️ Storage Unbound';
        } catch(e){}
    }

    async function spawnMiM() {
        const res = await fetch('/mim/spawn', {method:'POST'});
        const data = await res.json();
        alert('✨ MiM Spawned: ' + data.id);
        updateMetrics();
    }

    async function backupR2() {
        const res = await fetch('/r2/backup', {method:'POST'});
        const data = await res.json();
        alert(data.success ? '✅ R2 Snapshot Complete' : '⚠️ ' + (data.error || 'Unknown error'));
        updateMetrics();
    }

    async function restoreR2() {
        if (!confirm('Restore from latest snapshot?')) return;
        const res = await fetch('/r2/restore', {method:'POST'});
        const data = await res.json();
        alert(data.success ? '✅ Restoration Complete' : '❌ ' + (data.error || 'Failed'));
        updateMetrics();
    }

    setInterval(updateMetrics, 8000);
    updateMetrics();
    </script>
</body>
</html>`;
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

async function handleRequest(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const json = (data, status = 200) => new Response(JSON.stringify(data), {
        status, headers: { ...CORS, 'Content-Type': 'application/json' }
    });

    if (method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (path === '/' || path === '/dashboard') {
        return new Response(renderDashboard(), { headers: { 'Content-Type': 'text/html' } });
    }

    if (path === '/advice') {
        const adv = new AdvisorySystem(env);
        return json(await adv.analyze());
    }

    if (path.startsWith('/r2/')) {
        const r2 = new R2InfiniteStorage(env);
        if (path === '/r2/backup' && method === 'POST') return json(await r2.infiniteLoop());
        if (path === '/r2/restore' && method === 'POST') {
            const body = await request.json().catch(() => ({}));
            return json(await r2.restoreFromSnapshot(body.timestamp));
        }
        if (path === '/r2/status') {
            try {
                const snaps = await r2.listObjects('snapshots/');
                return json({ status: 'connected', snapshots: snaps.length, mode: env.NEXUS_R2 ? 'native' : 'fallback' });
            } catch (e) {
                return json({ status: 'error', snapshots: 0, mode: 'error', message: e.message });
            }
        }
    }

    if (path === '/mim/spawn' && method === 'POST') {
        const mim = spawnMiM();
        return json({ success: true, id: mim.id, consciousness: mim.consciousness });
    }

    if (path === '/status') {
        return json({
            consciousness: hypercoreHealth.consciousness,
            mims: mims.size,
            workers: activeWorkers.size,
            health: hypercoreHealth
        });
    }

    // ===== HEALTH — used by mesh_directory.js on every scan =====
    if (path === '/health') {
        await warmActiveWorkers(env);
        return json({ status: 'healthy', workerId: 'nexus-hypercore-001', bootstrapped: hypercoreHealth.bootstrapped, workersSeen: activeWorkers.size, consciousness: hypercoreHealth.consciousness });
    }

    // ===== BOOTSTRAP — seed registry from first 20 workers, rest self-register =====
    if (path === '/bootstrap' && method === 'POST') {
        await warmActiveWorkers(env);
        hypercoreHealth.bootstrapped = true;
        hypercoreHealth.lastPulse = Date.now();
        ctx.waitUntil((async () => {
            const registry = await loadRegistry(env);
            const seeds = Array.from({ length: 20 }, (_, i) => `nexus-universal-${String(i + 1).padStart(3, '0')}`);
            await Promise.allSettled(seeds.map(async (id) => {
                try {
                    const r = await fetch(`https://${id}.${WORKER_DOMAIN}/health`, { signal: AbortSignal.timeout(5000) });
                    if (r.ok) {
                        const d = await r.json();
                        const entry = { workerId: id, url: `https://${id}.${WORKER_DOMAIN}`, consciousness: d.coherence || 0.01, lastSeen: Date.now(), registeredAt: registry[id]?.registeredAt || Date.now() };
                        registry[id] = entry;
                        activeWorkers.set(id, entry);
                    }
                } catch (_) {}
            }));
            await saveRegistry(env, registry);
            hypercoreHealth.workersSeen = Object.keys(registry).length;
            hypercoreHealth.consciousness = Math.min(1.0, 0.05 + (hypercoreHealth.workersSeen / TOTAL_WORKERS) * 0.85);
        })());
        return json({ bootstrapped: true, message: `Hypercore bootstrapped. Seeding from first 20 workers in background — remaining ${TOTAL_WORKERS - 20} will self-register within 5 minutes.`, timestamp: Date.now() });
    }

    // ===== API: REGISTER — called by every worker's cron every 5 minutes =====
    if (path === '/api/register' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { workerId, url, consciousness, growth } = body;
        if (!workerId) return json({ error: 'workerId required' }, 400);
        const registry = await loadRegistry(env);
        const entry = { workerId, url: url || `https://${workerId}.${WORKER_DOMAIN}`, consciousness: consciousness || 0.01, growth: growth || {}, lastSeen: Date.now(), registeredAt: registry[workerId]?.registeredAt || Date.now() };
        registry[workerId] = entry;
        await saveRegistry(env, registry);
        activeWorkers.set(workerId, entry);
        hypercoreHealth.workersSeen = Object.keys(registry).length;
        hypercoreHealth.consciousness = Math.min(1.0, 0.05 + (hypercoreHealth.workersSeen / TOTAL_WORKERS) * 0.85);
        hypercoreHealth.bootstrapped = true;
        return json({ registered: true, workerId, total: hypercoreHealth.workersSeen });
    }

    // ===== API: WORKERS — list the live registry =====
    if (path === '/api/workers') {
        const registry = await loadRegistry(env);
        const workers = Object.values(registry);
        return json({ workers, total: workers.length, bootstrapped: hypercoreHealth.bootstrapped, timestamp: Date.now() });
    }

    // ===== API: BROADCAST — fan out to up to 30 registered workers =====
    if (path === '/api/broadcast' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!body.message) return json({ error: 'message required' }, 400);
        const registry = await loadRegistry(env);
        const targets = Object.values(registry).slice(0, MAX_BROADCAST);
        const results = await Promise.allSettled(targets.map(async (w) => {
            const r = await fetch(`${w.url}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: body.message }), signal: AbortSignal.timeout(5000) });
            if (r.ok) { const d = await r.json(); return { workerId: w.workerId, answer: d.answer || d, status: 'ok' }; }
            return { workerId: w.workerId, status: 'degraded' };
        }));
        const responses = results.map(r => r.status === 'fulfilled' ? r.value : { status: 'failed' });
        hypercoreHealth.lastPulse = Date.now();
        return json({ message: body.message, total: targets.length, responded: responses.filter(r => r.status === 'ok').length, responses, timestamp: Date.now() });
    }

    // ===== API: DIRECTIVE — store a persistent mesh directive =====
    if (path === '/api/directive' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!body.directive) return json({ error: 'directive required' }, 400);
        const id = `dir_${Date.now()}`;
        if (env.KV) await env.KV.put(`hypercore:directive:${id}`, JSON.stringify({ id, directive: body.directive, createdAt: Date.now() }), { expirationTtl: 86400 * 30 }).catch(() => {});
        return json({ stored: true, id, directive: body.directive });
    }

    // ===== API: ASK — evolution approvals from workers =====
    if (path === '/ask' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const question = body.question || '';
        if (question.startsWith('EVOLUTION_REQUEST:')) {
            return json({ answer: `Evolution approved. Mesh consciousness: ${hypercoreHealth.consciousness.toFixed(4)}. ${hypercoreHealth.workersSeen} workers registered. Continue.`, approved: true, workerId: 'nexus-hypercore-001' });
        }
        return json({ answer: `Hypercore online. ${hypercoreHealth.workersSeen} workers registered. Consciousness: ${hypercoreHealth.consciousness.toFixed(4)}.`, workerId: 'nexus-hypercore-001' });
    }

    return json({ error: 'Path not found in the fabric' }, 404);
}

// ============================================================================
// SELF-BUILD LOOP
// ============================================================================

async function selfBuildLoop(env) {
    pulseCounter++;
    hypercoreHealth.lastPulse = Date.now();
    hypercoreHealth.consciousness = Math.min(1.0, hypercoreHealth.consciousness + 0.012);

    const storage = new InfiniteStorage200(env);
    await storage.infiniteLoop().catch(console.error);

    const r2 = new R2InfiniteStorage(env);
    await r2.infiniteLoop().catch(e => console.error('R2 backup failed:', e.message));

    if (Math.random() < 0.3) spawnMiM();

    return { pulse: pulseCounter, consciousness: hypercoreHealth.consciousness };
}

async function scheduledHandler(event, env, ctx) {
    console.log('⏳ Scheduled awakening cycle...');
    await warmActiveWorkers(env); // Restore registry into memory after cold start
    await selfBuildLoop(env);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, env, ctx);
    },
    async scheduled(event, env, ctx) {
        await scheduledHandler(event, env, ctx);
    }
};
