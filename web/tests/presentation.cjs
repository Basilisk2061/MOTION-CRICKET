const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = fs.readFileSync(path.join(__dirname, '../src/PhoneController.tsx'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
}}).outputText
const moduleResult = { exports: {} }
new Function('require', 'module', 'exports', compiled)(
  id => {
    if (id === './phone') return {}
    if (id === './bowlGesture') {
      const gestureModule = { exports: {} }
      const gestureCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/bowlGesture.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText
      new Function('require', 'module', 'exports', gestureCode)(require, gestureModule, gestureModule.exports)
      return gestureModule.exports
    }
    return require(id)
  }, moduleResult, moduleResult.exports)
const html = renderToStaticMarkup(React.createElement(moduleResult.exports.default))
assert.ok(html.includes('Waiting for game'))
assert.ok(html.includes('Enable motion'))
assert.ok(html.includes('Sensor details'))
assert.ok(html.includes('phone-controller'))
// Setup buttons still invoke existing sensor permission/calibration handlers.
assert.ok(source.includes('onClick={enable}'))
assert.ok(source.includes('onClick={calibrate} disabled={!fresh}'))
const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
for (const control of ['setAxes(', 'setBeginner(', 'onClick={playAgain}', 'setOrbit('])
  assert.ok(app.includes(control))
assert.equal((app.match(/<CricketBat\b/g) || []).length, 1)
console.log('PASS: phone setup markup, existing action bindings, player controls, single bat')
