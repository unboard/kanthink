import {
  Section, Row, Column, Text, Heading, Link, Button, Img, Hr, Markdown,
} from '@react-email/components'
import * as React from 'react'
import { BaseLayout } from './components/BaseLayout'

// --- AST types ---

export type EmailNode = string | EmailElement | EmailNode[]

export interface EmailElement {
  type: string
  props?: Record<string, unknown>
  children?: EmailNode
}

export interface EmailConfig {
  subject: string
  previewText: string
  body: EmailNode[]
}

// --- Component whitelist ---

const COMPONENT_MAP: Record<string, React.ElementType> = {
  // React Email components
  Section,
  Row,
  Column,
  Text,
  Heading,
  Link,
  Button,
  Img,
  Hr,
  Markdown,
  // HTML elements
  table: 'table',
  thead: 'thead',
  tbody: 'tbody',
  tr: 'tr',
  th: 'th',
  td: 'td',
  div: 'div',
  span: 'span',
  strong: 'strong',
  em: 'em',
  br: 'br',
  p: 'p',
  a: 'a',
}

// --- Props sanitization ---

const BLOCKED_PROPS = new Set(['dangerouslySetInnerHTML', 'ref', 'key', 'children'])

function sanitizeProps(props: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (BLOCKED_PROPS.has(k)) continue
    if (k.startsWith('on') && k.length > 2 && k[2] === k[2].toUpperCase()) continue
    clean[k] = v
  }
  return clean
}

// --- Recursive renderer ---

function renderNode(node: EmailNode, key?: number): React.ReactNode {
  if (node === null || node === undefined) return null

  // String → text
  if (typeof node === 'string') return node

  // Array → fragment
  if (Array.isArray(node)) {
    return React.createElement(
      React.Fragment,
      null,
      ...node.map((child, i) => renderNode(child, i))
    )
  }

  // Element
  const component = COMPONENT_MAP[node.type]
  if (!component) return null

  const props: Record<string, unknown> = node.props ? sanitizeProps(node.props) : {}
  if (key !== undefined) props.key = key

  const children = node.children !== undefined ? renderNode(node.children) : undefined

  return React.createElement(component, props, children)
}

// --- Main component ---

export function DynamicEmail({ config }: { config: EmailConfig }) {
  return (
    <BaseLayout previewText={config.previewText}>
      {config.body.map((node, i) => renderNode(node, i))}
    </BaseLayout>
  )
}
