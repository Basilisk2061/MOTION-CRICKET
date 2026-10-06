const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
const classes = new Set(), timers = new Map(), listeners = new Map()
let now = 0, nextId = 0, effect, cleanup
const moduleResult = { exports: {} }
const code = ts.transpileModule(fs.readFileSync('src/useAutoHideCursor.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
new Function('require', 'module', 'exports', 'document', 'window', 'setTimeout', 'clearTimeout', code)(
  id => id === 'react' ? { useLayoutEffect: fn => { effect = fn } } : {},
  moduleResult, moduleResult.exports,
  { body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } } },
  { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => {
    if (listeners.get(name) === fn) listeners.delete(name)
  } },
  (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id },
  id => timers.delete(id),
)
function render(active) { cleanup?.(); moduleResult.exports.default(active); cleanup = effect() }
function advance(ms) {
  now += ms
  for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn() }
}
const hidden = () => classes.has('game-cursor-hidden')
render(true); assert(!hidden()); advance(2499); assert(!hidden()); advance(1); assert(hidden())
listeners.get('mousemove')(); assert(!hidden()); advance(2499); assert(!hidden()); advance(1); assert(hidden())
for (const overlay of ['MENU', 'Settings', 'setup', 'innings']) {
  render(false); assert(!hidden(), overlay); assert.equal(timers.size, 0); advance(10000); assert(!hidden())
  assert(!listeners.has('mousemove'))
  render(true); assert(!hidden()); advance(2499); assert(!hidden()); advance(1); assert(hidden())
}
cleanup(); assert(!hidden()); assert.equal(timers.size, 0); assert.equal(listeners.size, 0)
// StrictMode remount and repeated movement must leave only one timer/listener.
render(true); cleanup(); render(true)
for (let i = 0; i < 20; i++) listeners.get('mousemove')()
assert.equal(timers.size, 1); assert.equal(listeners.size, 1); cleanup()
const app = fs.readFileSync('src/App.tsx', 'utf8')
assert(app.includes("useAutoHideCursor(modes.status==='PLAYING' && !suspended)"))
assert(app.includes('const suspended=onboarding||helpPaused'))
assert(fs.readFileSync('src/autoHideCursor.css', 'utf8').includes('cursor: none !important'))
console.log('PASS: initially visible, 2500ms idle hide, immediate mouse restore, menu/settings/setup safety, resume and cleanup')
