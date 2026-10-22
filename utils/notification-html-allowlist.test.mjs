import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const appSource = readFileSync(new URL('./sanitize-notification-html.ts', import.meta.url), 'utf8')
const emailSource = readFileSync(
  new URL('../supabase/edge-functions/send-notification-email/_notification-html.ts', import.meta.url),
  'utf8'
)

function balanced(source, openIndex) {
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openIndex, index + 1)
    }
  }
  throw new Error('unclosed block')
}

function optionsBlock(source) {
  const marker = 'const notificationHtmlSanitizeOptions'
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, marker)
  return balanced(source, source.indexOf('{', start))
}

function quotedStrings(text) {
  return [...text.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
}

function arrayField(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`))
  assert.ok(match, key)
  return quotedStrings(match[1])
}

function attributeMap(block) {
  const match = block.match(/allowedAttributes:\s*\{([\s\S]*?)\n {2}\}/)
  assert.ok(match, 'allowedAttributes')
  const map = {}
  for (const entry of match[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    map[entry[1]] = quotedStrings(entry[2])
  }
  return map
}

function scalarField(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*([^,\\n]+)`))
  assert.ok(match, key)
  return match[1].trim().replaceAll("'", '').replaceAll('"', '')
}

function constLine(source, name) {
  const line = source.split('\n').find((entry) => entry.includes(`const ${name} =`))
  assert.ok(line, name)
  return line.trim().replaceAll('"', "'").replace(/;$/, '')
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, name)
  const body = balanced(source, source.indexOf('{', start))
  return body.replace(/:\s*[A-Za-z_|[\]]+/g, '').replaceAll('"', "'").replace(/\s+/g, ' ')
}

function transformKeys(block) {
  const start = block.indexOf('transformTags:')
  assert.notEqual(start, -1, 'transformTags')
  const body = balanced(block, block.indexOf('{', start))
  return [...body.matchAll(/\n {4}(\w+):/g)].map((match) => match[1])
}

test('in-app and email notification allowlists match', () => {
  const app = optionsBlock(appSource)
  const email = optionsBlock(emailSource)

  assert.deepEqual(arrayField(email, 'allowedTags'), arrayField(app, 'allowedTags'))
  assert.deepEqual(attributeMap(email), attributeMap(app))
  assert.deepEqual(arrayField(email, 'allowedSchemes'), arrayField(app, 'allowedSchemes'))
  assert.equal(scalarField(email, 'allowProtocolRelative'), scalarField(app, 'allowProtocolRelative'))
  assert.equal(scalarField(email, 'disallowedTagsMode'), scalarField(app, 'disallowedTagsMode'))
  assert.equal(scalarField(email, 'parseStyleAttributes'), scalarField(app, 'parseStyleAttributes'))
  assert.deepEqual(transformKeys(email), transformKeys(app))

  for (const name of ['HEX_COLOR', 'RGB_COLOR', 'TEXT_ALIGN']) {
    assert.equal(constLine(emailSource, name), constLine(appSource, name))
  }

  for (const name of ['authorColor', 'filterAuthorStyle', 'isKeptHref']) {
    assert.equal(functionBody(emailSource, name), functionBody(appSource, name))
  }
})
