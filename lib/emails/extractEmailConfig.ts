import type { EmailConfig, EmailNode } from './dynamicRenderer'

function isValidNode(node: unknown): node is EmailNode {
  if (typeof node === 'string') return true
  if (Array.isArray(node)) return node.every(isValidNode)
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as Record<string, unknown>
    if (typeof el.type !== 'string' || el.type.length === 0) return false
    if (el.children !== undefined && !isValidNode(el.children)) return false
    return true
  }
  return false
}

/**
 * Try to repair truncated JSON by closing open brackets/braces.
 * Works for the common case where the LLM output gets cut off mid-array/object.
 */
function repairTruncatedJson(json: string): string {
  // Find the last valid-ish position: trim trailing commas and whitespace
  let s = json.trimEnd()
  // Remove trailing comma if any
  if (s.endsWith(',')) s = s.slice(0, -1)

  // Count unclosed brackets/braces
  const stack: string[] = []
  let inString = false
  let escape = false
  for (const ch of s) {
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }

  // Close everything that's still open
  return s + stack.reverse().join('')
}

/**
 * Extract an [EMAIL_TEMPLATE]...[/EMAIL_TEMPLATE] block from AI response text.
 * Handles truncated responses where the closing tag may be missing.
 * Returns null if no valid config found.
 */
export function extractEmailConfig(response: string): EmailConfig | null {
  // Try complete match first
  const completeMatch = response.match(/\[EMAIL_TEMPLATE\]([\s\S]*?)\[\/EMAIL_TEMPLATE\]/)

  let jsonText: string | null = null

  if (completeMatch) {
    jsonText = completeMatch[1].trim()
  } else {
    // Fallback: opening tag exists but no closing tag (truncated response)
    const openIdx = response.indexOf('[EMAIL_TEMPLATE]')
    if (openIdx === -1) return null
    const content = response.slice(openIdx + '[EMAIL_TEMPLATE]'.length).trim()
    if (!content) return null
    jsonText = content
  }

  // Try parsing as-is first, then try repairing truncated JSON
  for (const attempt of [jsonText, repairTruncatedJson(jsonText)]) {
    try {
      const parsed = JSON.parse(attempt)

      if (!parsed.subject || !parsed.body || !Array.isArray(parsed.body) || parsed.body.length === 0) {
        continue
      }

      const body: EmailNode[] = parsed.body.filter((n: unknown) => isValidNode(n))
      if (body.length === 0) continue

      return {
        previewText: parsed.previewText || parsed.subject,
        subject: parsed.subject,
        body,
      }
    } catch {
      // Try next attempt
    }
  }

  return null
}

/**
 * Strip the [EMAIL_TEMPLATE] block from response text for display.
 * Handles both complete and truncated (missing closing tag) blocks.
 */
export function cleanDisplayResponse(rawText: string): string {
  // First try complete block
  let cleaned = rawText.replace(/\[EMAIL_TEMPLATE\][\s\S]*?\[\/EMAIL_TEMPLATE\]/, '').trim()

  // If opening tag still present (no closing tag — truncated), strip to end of string
  if (cleaned.includes('[EMAIL_TEMPLATE]')) {
    cleaned = cleaned.replace(/\[EMAIL_TEMPLATE\][\s\S]*$/, '').trim()
  }

  return cleaned || "Here's the email template I've put together:"
}

/**
 * Check if a response string contains an [EMAIL_TEMPLATE] block.
 * Used by the UI to show a "template updated" indicator on messages.
 */
export function containsEmailTemplate(text: string): boolean {
  return text.includes('[EMAIL_TEMPLATE]')
}
