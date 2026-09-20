#!/usr/bin/env node
/**
 * Probes every public Flo surface and writes the result into status.json,
 * keeping ninety days of history per service.
 *
 * It runs on GitHub, away from Cloudflare and Vercel, so a failure of either
 * cannot take the status page down with it. The one shared dependency left is
 * DNS, which is stated on the page rather than hidden.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SERVICES = [
  { id: 'web', name: 'Website', url: 'https://flo.now/' },
  { id: 'app', name: 'Sign in and launcher', url: 'https://app.flo.now/api/health' },
  { id: 'inbox', name: 'Inbox', url: 'https://inbox.flo.now/api/health' },
  { id: 'cloud', name: 'Cloud', url: 'https://cloud.flo.now/api/health' },
  { id: 'calendar', name: 'Calendar', url: 'https://calendar.flo.now/api/health' },
  { id: 'live', name: 'Live', url: 'https://live.flo.now/api/health' },
  { id: 'book', name: 'Book', url: 'https://book.flo.now/api/health' },
  { id: 'console', name: 'Console', url: 'https://console.flo.now/api/health', expect: [200, 302, 403] },
  { id: 'developers', name: 'Developers', url: 'https://developers.flo.now/api/health' },
  { id: 'worker', name: 'Mail and background work', url: 'https://worker.flo.now/health' },
]

const TIMEOUT_MS = 15000
const KEEP_DAYS = 90

async function probe(service) {
  const started = Date.now()
  try {
    const response = await fetch(service.url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'flo-status-check' },
    })
    const ms = Date.now() - started
    const expected = service.expect ?? [200, 301, 302, 307, 308]
    return { up: expected.includes(response.status), status: response.status, ms }
  } catch (error) {
    return { up: false, status: 0, ms: Date.now() - started, error: (error && error.name) || 'failed' }
  }
}

const now = new Date().toISOString()
let previous = { services: {} }
try {
  previous = JSON.parse(readFileSync('status.json', 'utf8'))
} catch {}

const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000
const services = {}
for (const service of SERVICES) {
  const result = await probe(service)
  const history = (previous.services?.[service.id]?.history ?? []).filter((point) => Date.parse(point.at) > cutoff)
  history.push({ at: now, up: result.up, ms: result.ms })
  const day = history.filter((point) => Date.parse(point.at) > Date.now() - 24 * 60 * 60 * 1000)
  const uptime = (list) => (list.length ? Math.round((list.filter((p) => p.up).length / list.length) * 1000) / 10 : null)
  services[service.id] = {
    name: service.name,
    url: service.url,
    up: result.up,
    status: result.status,
    ms: result.ms,
    uptimeDay: uptime(day),
    uptimeRange: uptime(history),
    history: history.slice(-2600),
  }
}

const down = Object.values(services).filter((s) => !s.up)
writeFileSync(
  'status.json',
  JSON.stringify(
    {
      checkedAt: now,
      overall: down.length === 0 ? 'all services are answering' : `${down.length} of ${SERVICES.length} not answering`,
      allUp: down.length === 0,
      services,
    },
    null,
    2,
  ) + '\n',
)
console.log(`${now}: ${down.length ? down.map((s) => s.name).join(', ') + ' down' : 'everything up'}`)
