#!/usr/bin/env node
/** Curl-style checks for production deploys. Run: node scripts/verify-deploy.mjs */

const checks = [
  ['Vercel UI', 'https://footbollsnakegame-client.vercel.app/', (r) => r.ok],
  ['socket-config.json', 'https://footbollsnakegame-client.vercel.app/socket-config.json', (r) => r.ok],
  [
    'API /health',
    'https://footbollsnakegame-api.onrender.com/health',
    (r) => r.ok && r.status === 200,
  ],
]

let failed = false
for (const [name, url, pass] of checks) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { Accept: '*/*' },
    })
    const ok = pass(r)
    console.log(`${ok ? 'OK ' : 'FAIL'} ${name} → HTTP ${r.status} ${url}`)
    if (!ok) failed = true
  } catch (e) {
    failed = true
    console.log(`FAIL ${name} → ${e?.message ?? e} ${url}`)
  }
}

process.exit(failed ? 1 : 0)
