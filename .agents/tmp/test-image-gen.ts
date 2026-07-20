import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { GoogleGenAI, Modality } from '@google/genai'

function loadEnv(): Record<string, string> {
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(scriptDir, '..', '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
  }
  return env
}

const env = loadEnv()
const apiKey = env.OWNER_GOOGLE_API_KEY ?? env.GOOGLE_API_KEY
if (!apiKey) { console.error('NO_KEY'); process.exit(1) }

;(async () => {
  const client = new GoogleGenAI({ apiKey })
  for (const modelId of ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']) {
    console.log(`\n=== ${modelId} ===`)
    try {
      const r = await client.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: 'A tiny orange tabby astronaut floating in space, digital art' }] }],
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      })
      const parts = r.candidates?.[0]?.content?.parts ?? []
      let foundImage = false
      let foundText = ''
      for (const p of parts) {
        if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/')) {
          foundImage = true
          console.log(`  ✓ image bytes: ${p.inlineData.mimeType}, ${p.inlineData.data.length} chars base64`)
        }
        if (typeof p.text === 'string' && p.text.trim()) {
          foundText += p.text
        }
      }
      if (!foundImage) console.log(`  ✗ no image returned. text="${foundText.slice(0, 200)}"`)
      console.log(`  usage:`, r.usageMetadata)
    } catch (err: any) {
      console.log(`  ERROR: ${err.message?.slice(0, 250)}`)
    }
  }
})()
