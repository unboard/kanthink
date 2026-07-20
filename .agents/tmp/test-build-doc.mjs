import { buildPlaygroundDoc } from '../../components/playground/buildPlaygroundDoc.ts'

const doc = buildPlaygroundDoc('export default function App() { return <div>hi</div>; }', {
  title: 'Test',
  uploadUrl: 'https://kanthink.com/api/playground/upload',
  aiUrl: 'https://kanthink.com/api/playground/ai',
  saveUrl: 'https://kanthink.com/api/playground/save',
  cardToken: 'card123.abcdef',
  initialRecord: { slug: 'r1', data: { title: 'Origami Crane', steps: ['Fold paper'] }, label: 'Crane' },
})

// Extract the regular <script> block and verify it parses as JS
const scriptMatch = doc.match(/<script>\n([\s\S]*?)<\/script>/)
if (!scriptMatch) { console.error('No <script> block found'); process.exit(1) }
const js = scriptMatch[1]

// Spot-check required globals
const checks = {
  'window.kanthinkInitial':   /window\.kanthinkInitial\s*=/,
  'window.kanthinkSave':      /window\.kanthinkSave\s*=/,
  'window.kanthinkUpload':    /window\.kanthinkUpload\s*=/,
  'window.kanthinkAI':        /window\.kanthinkAI\s*=/,
  '__KPG_SAVE_URL':           /__KPG_SAVE_URL\s*=\s*"https:\/\/kanthink\.com\/api\/playground\/save"/,
  '__KPG_CARD_TOKEN':         /__KPG_CARD_TOKEN\s*=\s*"card123\.abcdef"/,
  'initialRecord.data baked': /"slug":"r1".+?"data":\{"title":"Origami Crane"/,
  'storage shim':             /Storage shim/,
}
let pass = 0, fail = 0
for (const [name, re] of Object.entries(checks)) {
  if (re.test(js)) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}

// Verify the JS parses — use new Function() so we don't actually run it
try {
  new Function(js)
  console.log('\n  ✓ <script> parses as valid JS')
} catch (err) {
  console.log(`\n  ✗ <script> failed to parse: ${err.message}`)
  fail++
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
