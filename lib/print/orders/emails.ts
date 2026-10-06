import type { JobRow, OrderRow } from './server'
import type { Customer, PartnerBrand } from './types'

/**
 * The emails around an order, in the printer's name and color.
 *
 * Plain, table-free HTML: one message, one button, the deadline stated. These go to
 * people who just bought something and want to know it's on track.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function shell(brand: PartnerBrand, body: string): string {
  const color = /^#[0-9a-f]{6}$/i.test(brand.color ?? '') ? brand.color! : '#111827'
  const logo = brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name ?? '')}" style="max-height:44px;max-width:200px;margin-bottom:20px" />` : brand.name ? `<div style="font-weight:700;font-size:18px;margin-bottom:20px">${esc(brand.name)}</div>` : ''
  const contact = [brand.phone, brand.email, brand.website].filter(Boolean).map((x) => esc(x!)).join(' · ')
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="background:#fff;border-radius:14px;padding:28px 26px">${logo}${body.replace(/\{\{color\}\}/g, color)}</div>
${contact ? `<p style="font-size:12px;color:#71717a;text-align:center;margin-top:16px">${contact}</p>` : ''}
</div></body></html>`
}

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:{{color}};color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;margin:8px 0 4px">${esc(label)}</a>`

function deadline(order: OrderRow, jobs: JobRow[]): string {
  const t = jobs.map((j) => j.lockAt ?? order.lockAt).filter((x): x is number => !!x).sort()[0]
  if (!t) return ''
  const when = new Date(t * 1000).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })
  return `<p style="font-size:14px;color:#52525b;margin:14px 0 0">Changes close <b>${esc(when)}</b>. After that, the version on the page is the one we print.</p>`
}

export function customerEmail(opts: { kind: 'received' | 'proof' | 'message'; order: OrderRow; jobs: JobRow[]; customer: Customer; brand: PartnerBrand; baseUrl: string; text?: string }) {
  const { kind, order, jobs, customer, brand, baseUrl, text } = opts
  const from = brand.name || 'Your printer'
  const hi = customer.name ? `Hi ${esc(customer.name.split(' ')[0])},` : 'Hi,'
  const ref = order.ref ? ` ${order.ref}` : ''
  const link = jobs.length === 1 ? `${baseUrl}/proof/${jobs[0].token}` : `${baseUrl}/proof/o/${order.token}`
  const names = jobs.map((j) => esc(j.name)).join(', ')

  if (kind === 'proof') {
    return {
      subject: `Your proof is ready: ${jobs[0].name}`,
      html: shell(
        brand,
        `<p style="font-size:16px;margin:0 0 10px">${hi}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 6px">We've reviewed your artwork for <b>${names}</b>${ref ? ` (order${esc(ref)})` : ''} and it's ready for you to look over. If we changed anything, the page shows exactly what and why.</p>
${button(link, 'Review your proof')}${deadline(order, jobs)}`,
      ),
    }
  }
  if (kind === 'message') {
    return {
      subject: `A message about your order${ref}`,
      html: shell(brand, `<p style="font-size:16px;margin:0 0 10px">${hi}</p><p style="font-size:16px;line-height:1.5;white-space:pre-wrap;margin:0 0 6px">${esc(text ?? '')}</p>${button(link, 'Open your order')}`),
    }
  }
  return {
    subject: `We've got your order${ref}`,
    html: shell(
      brand,
      `<p style="font-size:16px;margin:0 0 10px">${hi}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 6px">Thanks for your order from ${esc(from)}. We're checking your artwork for <b>${names}</b> now. Everything about it lives on one page: what will print, anything we fix, and where you approve it.</p>
${button(link, 'See your order')}${deadline(order, jobs)}`,
    ),
  }
}

export function printerEmail(opts: { who: string; what: string; job: JobRow; order: OrderRow; link: string }) {
  const { who, what, job, order, link } = opts
  return {
    subject: `${who} ${what} · ${job.name}${order.ref ? ` · ${order.ref}` : ''}`,
    html: shell({}, `<p style="font-size:16px;line-height:1.5;margin:0 0 6px"><b>${esc(who)}</b> ${esc(what)} on <b>${esc(job.name)}</b>${order.ref ? ` (order ${esc(order.ref)})` : ''}.</p>${button(link, 'Open the job')}`),
  }
}
