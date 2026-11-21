/**
 * Open what was shared, the way a person would before answering: follow the links,
 * read the page, and for a GitHub repo read its README, its skill files and what's in it.
 *
 * Kan used to answer shares from the card title and the og:description alone. A post that
 * said "npx skills add xikhar/papercraft" plus a link got a made-up app, because nobody
 * looked at the repo. This is the looking.
 *
 * Public content only: links on the card, fetched without credentials. Never throws.
 */

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Kanthink/1.0)' }
const TOTAL = 18_000

export interface ShareSource { url: string; kind: 'github' | 'page'; text: string }

/** Every http(s) link in the share, short links resolved, de-duplicated, X posts left out (the card already has their text). */
export async function linksIn(text: string): Promise<string[]> {
  const raw = [...new Set((text.match(/https?:\/\/[^\s)<>\]"']+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')))]
  const out: string[] = []
  for (const u of raw.slice(0, 10)) {
    const url = /^https?:\/\/(t\.co|bit\.ly|buff\.ly|lnkd\.in)\//i.test(u) ? await resolve(u) : u
    if (!url || /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\//i.test(url) || /pbs\.twimg\.com/i.test(url)) continue
    if (!out.includes(url)) out.push(url)
  }
  // Also catch "owner/repo" named after a skills/npx command when no link spells it out.
  for (const m of text.matchAll(/npx\s+skills\s+add\s+([\w.-]+\/[\w.-]+)/g)) {
    const gh = `https://github.com/${m[1]}`
    if (!out.some((u) => u.toLowerCase().startsWith(gh.toLowerCase()))) out.push(gh)
  }
  return out.slice(0, 4)
}

async function resolve(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: UA, signal: AbortSignal.timeout(6000) })
    res.body?.cancel().catch(() => {})
    return res.url || null
  } catch { return null }
}

async function get(url: string, max = 400_000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { ...UA, Accept: 'text/html,text/plain,application/json,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const body = await res.text()
    return body.slice(0, max)
  } catch { return null }
}

function pageText(html: string): string {
  const main = html.match(/<(article|main)[\s\S]*?<\/\1>/i)?.[0] ?? html
  return main
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

/** A GitHub repo: what it is (README), any agent skill it ships (SKILL.md), and its file list. */
async function readRepo(owner: string, repo: string): Promise<string | null> {
  const api = `https://api.github.com/repos/${owner}/${repo}`
  const meta = await get(api)
  if (!meta) return null
  let info: { description?: string; default_branch?: string; stargazers_count?: number; license?: { spdx_id?: string } } = {}
  try { info = JSON.parse(meta) } catch { /* keep going */ }
  const branch = info.default_branch || 'HEAD'
  let paths: string[] = []
  try {
    const tree = JSON.parse((await get(`${api}/git/trees/${branch}?recursive=1`)) || '{}') as { tree?: { path: string; type: string }[] }
    paths = (tree.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path)
  } catch { /* no tree */ }
  const raw = (p: string) => get(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`, 60_000)
  const readme = paths.find((p) => /^readme(\.md)?$/i.test(p)) ?? 'README.md'
  const skills = paths.filter((p) => /(^|\/)SKILL\.md$/.test(p)).slice(0, 2)
  const [readmeText, ...skillTexts] = await Promise.all([raw(readme), ...skills.map(raw)])
  const parts = [
    `GitHub repo ${owner}/${repo}${info.description ? ` — ${info.description}` : ''}${info.stargazers_count ? ` (${info.stargazers_count} stars)` : ''}${info.license?.spdx_id ? `, ${info.license.spdx_id} license` : ''}.`,
    readmeText ? `README:\n${readmeText.slice(0, 7000)}` : '',
    ...skills.map((p, i) => (skillTexts[i] ? `${p} (an agent skill: instructions an AI coding agent follows):\n${skillTexts[i]!.slice(0, 6000)}` : '')),
    paths.length ? `Files (${paths.length}):\n${paths.filter((p) => !/\.(jpg|jpeg|png|gif|webp|mp4|mp3|wav)$/i.test(p)).slice(0, 80).join('\n')}` : '',
  ]
  return parts.filter(Boolean).join('\n\n')
}

/** Read every link in the share. Returns what was read, within a total budget. */
export async function readShareSources(shareText: string): Promise<ShareSource[]> {
  try {
    const links = await linksIn(shareText)
    const read = await Promise.all(links.map(async (url): Promise<ShareSource | null> => {
      const gh = url.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#]|$)/i)
      if (gh) {
        const text = await readRepo(gh[1], gh[2])
        return text ? { url, kind: 'github', text } : null
      }
      const html = await get(url)
      if (!html) return null
      const text = pageText(html)
      return text.length > 200 ? { url, kind: 'page', text: text.slice(0, 8000) } : null
    }))
    const out: ShareSource[] = []
    let used = 0
    for (const s of read) {
      if (!s || used >= TOTAL) continue
      const text = s.text.slice(0, TOTAL - used)
      used += text.length
      out.push({ ...s, text })
    }
    return out
  } catch {
    return []
  }
}
