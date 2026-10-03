/**
 * Kanthink app kit, v1.
 *
 * The components a built app imports from 'kit'. They're modelled on shadcn/ui
 * (MIT): same token names, similar class recipes. They're plain ES modules, because
 * apps run without a build step. Every colour, font and corner comes from the app's
 * style tokens (CSS variables injected by the host page), so the kit restyles itself
 * when the owner changes the app's look.
 *
 * Contract: the API documented in lib/playground/style/tokens.ts (KIT_PROMPT).
 * Change one, change the other. Versioned by filename, never edited in a way that
 * breaks an app already built against it.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';

const h = React.createElement;
const { useState, useEffect, useRef, useId, forwardRef, createContext, useContext, useSyncExternalStore, Children, isValidElement, cloneElement } = React;

// --- cn: join classes, letting later ones win over earlier ones in the same group ---

function groupOf(cls) {
  const parts = cls.split(':');
  const util = parts.pop().replace(/^!/, '').replace(/^-/, '');
  const variant = parts.join(':');
  let key = null;
  let m;
  if ((m = /^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|w|h|min-w|min-h|max-w|max-h|z|opacity|leading|tracking|shadow|inset|top|right|bottom|left|order|basis|grow|shrink)(-|$)/.exec(util))) key = m[1];
  else if (/^text-(xs|sm|base|lg|[0-9]?xl|\[\d)/.test(util)) key = 'text-size';
  else if (/^text-(left|center|right|justify|start|end)$/.test(util)) key = 'text-align';
  else if (/^text-/.test(util)) key = 'text-color';
  else if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(util)) key = 'font-weight';
  else if (/^font-/.test(util)) key = 'font-family';
  else if (/^bg-/.test(util)) key = 'bg';
  else if (/^rounded(-(none|sm|md|lg|xl|2xl|3xl|full|\[.*\]))?$/.test(util)) key = 'rounded';
  else if (/^border(-(0|2|4|8))?$/.test(util)) key = 'border-w';
  else if (/^border-(?!t|b|l|r|x|y|s|e|solid|dashed|dotted|none)/.test(util)) key = 'border-color';
  else if (/^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden|contents)$/.test(util)) key = 'display';
  else if (/^justify-/.test(util)) key = 'justify';
  else if (/^items-/.test(util)) key = 'items';
  else if (/^flex-(row|col)/.test(util)) key = 'flex-dir';
  else if (/^grid-cols-/.test(util)) key = 'grid-cols';
  return key ? variant + '|' + key : null;
}

export function cn(...inputs) {
  const flat = [];
  const walk = (v) => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.keys(v).forEach((k) => { if (v[k]) flat.push(k); });
    else String(v).split(/\s+/).forEach((c) => { if (c) flat.push(c); });
  };
  inputs.forEach(walk);
  const seen = new Map();
  const out = [];
  for (const cls of flat) {
    const g = groupOf(cls);
    if (g && seen.has(g)) out[seen.get(g)] = null;
    if (g) seen.set(g, out.length);
    out.push(cls);
  }
  return out.filter(Boolean).join(' ');
}

// Motion lives here once, so components don't each need it, and reduced motion turns it off.
if (typeof document !== 'undefined' && !document.getElementById('__kit_css')) {
  const style = document.createElement('style');
  style.id = '__kit_css';
  style.textContent = [
    '@keyframes kit-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes kit-pop{from{opacity:0;transform:translate(-50%,-48%) scale(.97)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}',
    '@keyframes kit-right{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes kit-up{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes kit-spin{to{transform:rotate(360deg)}}',
    '.kit-fade{animation:kit-fade .15s ease-out}.kit-pop{animation:kit-pop .18s ease-out}.kit-right{animation:kit-right .2s ease-out}.kit-up{animation:kit-up .2s ease-out}.kit-spin{animation:kit-spin .8s linear infinite}',
    '@media (prefers-reduced-motion: reduce){.kit-fade,.kit-pop,.kit-right,.kit-up{animation:none}}',
  ].join('\n');
  document.head.appendChild(style);
}

const style = () => (typeof window !== 'undefined' && window.kanthinkStyle) || {};

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

// --- Icons the kit itself needs (apps use lucide-react) ---

const svg = (d, cls) => h('svg', { className: cls || 'h-4 w-4', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d }));
const CheckIcon = (cls) => svg('M20 6 9 17l-5-5', cls);
const XIcon = (cls) => svg('M18 6 6 18M6 6l12 12', cls);
const ChevronIcon = (cls) => svg('m6 9 6 6 6-6', cls);

export function Spinner({ className, size = 16 }) {
  return h('svg', { className: cn('kit-spin', className), width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
    h('circle', { cx: 12, cy: 12, r: 9, stroke: 'currentColor', strokeOpacity: 0.25, strokeWidth: 3 }),
    h('path', { d: 'M21 12a9 9 0 0 0-9-9', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' }));
}

// --- Button ---

const BUTTON_VARIANTS = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  outline: 'border border-input bg-card text-foreground hover:bg-accent',
  ghost: 'text-foreground hover:bg-accent',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
};
const BUTTON_SIZES = {
  sm: 'h-9 px-3 text-sm rounded-md',
  md: 'h-11 px-4 text-sm rounded-md',
  lg: 'h-12 px-6 text-base rounded-lg',
  icon: 'h-11 w-11 rounded-md',
};

export const Button = forwardRef(function Button({ variant = 'default', size = 'md', loading = false, className, children, disabled, type = 'button', ...props }, ref) {
  return h('button', {
    ref, type, disabled: disabled || loading, 'aria-busy': loading || undefined,
    className: cn('inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50', ring, BUTTON_SIZES[size === 'default' ? 'md' : size] || BUTTON_SIZES.md, BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.default, className),
    ...props,
  }, loading ? h(Spinner, { size: 16 }) : null, children);
});

// --- Card ---

const div = (base) => forwardRef(function Part({ className, ...props }, ref) { return h('div', { ref, className: cn(base, className), ...props }); });
export const Card = div('rounded-lg border border-border bg-card text-card-foreground');
export const CardHeader = div('flex flex-col gap-1.5 p-5');
export const CardContent = div('p-5 pt-0');
export const CardFooter = div('flex items-center gap-2 p-5 pt-0');
export function CardTitle({ className, as = 'h3', ...props }) { return h(as, { className: cn('font-heading text-lg font-semibold leading-tight tracking-tight', className), ...props }); }
export function CardDescription({ className, ...props }) { return h('p', { className: cn('text-sm text-muted-foreground', className), ...props }); }

// --- Form controls ---

const fieldBase = 'w-full rounded-md border border-input bg-card text-base text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive sm:text-sm';

export const Input = forwardRef(function Input({ className, type = 'text', ...props }, ref) {
  return h('input', { ref, type, className: cn(fieldBase, 'h-11 px-3', className), ...props });
});

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
  return h('textarea', { ref, rows, className: cn(fieldBase, 'min-h-[88px] px-3 py-2.5 leading-relaxed', className), ...props });
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return h('div', { className: cn('relative', className && /\bw-/.test(className) ? '' : 'w-full') },
    h('select', { ref, className: cn(fieldBase, 'h-11 appearance-none pl-3 pr-9', className), ...props }, children),
    h('span', { className: 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground' }, ChevronIcon('h-4 w-4')));
});

export function Label({ className, ...props }) {
  return h('label', { className: cn('text-sm font-medium leading-none text-foreground', className), ...props });
}

export function Field({ label, hint, error, children, className, id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  const describedBy = error ? id + '-error' : hint ? id + '-hint' : undefined;
  const only = Children.count(children) === 1 && isValidElement(children)
    ? cloneElement(children, { id: children.props.id || id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children;
  return h('div', { className: cn('flex flex-col gap-1.5', className) },
    label ? h(Label, { htmlFor: id }, label) : null,
    only,
    error ? h('p', { id: id + '-error', className: 'text-sm text-destructive' }, error)
      : hint ? h('p', { id: id + '-hint', className: 'text-sm text-muted-foreground' }, hint) : null);
}

function useControlled(value, fallback) {
  const [inner, setInner] = useState(fallback);
  return [value !== undefined ? value : inner, setInner];
}

export function Checkbox({ checked, defaultChecked = false, onChange, onCheckedChange, label, disabled, className, id: idProp }) {
  onChange = onChange || onCheckedChange;
  const auto = useId();
  const id = idProp || auto;
  const [on, setOn] = useControlled(checked, defaultChecked);
  return h('label', { htmlFor: id, className: cn('inline-flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-foreground', disabled && 'cursor-not-allowed opacity-50', className) },
    h('input', { id, type: 'checkbox', className: 'peer sr-only', checked: !!on, disabled, onChange: (e) => { setOn(e.target.checked); onChange && onChange(e.target.checked, e); } }),
    h('span', { 'aria-hidden': true, className: cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card') },
      on ? CheckIcon('h-3.5 w-3.5') : null),
    label ? h('span', null, label) : null);
}

export function Switch({ checked, defaultChecked = false, onChange, onCheckedChange, label, disabled, className }) {
  onChange = onChange || onCheckedChange;
  const [on, setOn] = useControlled(checked, defaultChecked);
  const toggle = () => { if (disabled) return; setOn(!on); onChange && onChange(!on); };
  const sw = h('button', {
    type: 'button', role: 'switch', 'aria-checked': !!on, disabled, onClick: toggle,
    className: cn('relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50', ring, on ? 'bg-primary' : 'bg-input'),
  }, h('span', { className: cn('inline-block h-5 w-5 rounded-full bg-card shadow-sm transition-transform duration-150', on ? 'translate-x-[22px]' : 'translate-x-0.5') }));
  if (!label) return h('span', { className }, sw);
  return h('label', { className: cn('inline-flex min-h-[44px] cursor-pointer items-center justify-between gap-3 text-sm text-foreground', className) }, h('span', null, label), sw);
}

export function RadioGroup({ value, defaultValue, onChange, onValueChange, options = [], className, name }) {
  onChange = onChange || onValueChange;
  const auto = useId();
  const [current, setCurrent] = useControlled(value, defaultValue);
  return h('div', { role: 'radiogroup', className: cn('flex flex-col gap-1', className) },
    options.map((o) => {
      const on = current === o.value;
      return h('label', { key: String(o.value), className: 'flex min-h-[44px] cursor-pointer items-start gap-3 py-2 text-sm text-foreground' },
        h('input', { type: 'radio', name: name || auto, className: 'peer sr-only', checked: on, onChange: () => { setCurrent(o.value); onChange && onChange(o.value); } }),
        h('span', { 'aria-hidden': true, className: cn('mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2', on ? 'border-primary' : 'border-input bg-card') },
          on ? h('span', { className: 'h-2.5 w-2.5 rounded-full bg-primary' }) : null),
        h('span', { className: 'flex flex-col gap-0.5' }, h('span', { className: 'font-medium' }, o.label), o.hint ? h('span', { className: 'text-muted-foreground' }, o.hint) : null));
    }));
}

export function Segmented({ value, defaultValue, onChange, onValueChange, options = [], className, size = 'md' }) {
  onChange = onChange || onValueChange;
  const [current, setCurrent] = useControlled(value, defaultValue !== undefined ? defaultValue : options[0] && options[0].value);
  return h('div', { role: 'tablist', className: cn('inline-flex items-center gap-1 rounded-md bg-muted p-1', className) },
    options.map((o) => {
      const on = current === o.value;
      return h('button', {
        key: String(o.value), type: 'button', role: 'tab', 'aria-selected': on,
        onClick: () => { setCurrent(o.value); onChange && onChange(o.value); },
        className: cn('inline-flex items-center justify-center gap-1.5 rounded-sm px-3 font-medium transition-colors', size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm', ring, on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'),
      }, o.label);
    }));
}

export function Slider({ value, defaultValue, min = 0, max = 100, step = 1, onChange, onValueChange, className, ...props }) {
  // shadcn's Slider takes and reports arrays; accept that shape too.
  const arrays = Array.isArray(value) || Array.isArray(defaultValue) || (!onChange && onValueChange);
  if (Array.isArray(value)) value = value[0];
  if (Array.isArray(defaultValue)) defaultValue = defaultValue[0];
  if (!onChange && onValueChange) onChange = (n) => onValueChange(arrays ? [n] : n);
  const [current, setCurrent] = useControlled(value, defaultValue !== undefined ? defaultValue : min);
  return h('input', {
    type: 'range', min, max, step, value: current,
    onChange: (e) => { const n = Number(e.target.value); setCurrent(n); onChange && onChange(n); },
    className: cn('h-11 w-full cursor-pointer accent-primary', className), ...props,
  });
}

// --- Display ---

const BADGE = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-border text-foreground',
  highlight: 'bg-highlight text-highlight-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
};
export function Badge({ variant = 'secondary', className, ...props }) {
  return h('span', { className: cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', BADGE[variant] || BADGE.secondary, className), ...props });
}

export function Progress({ value = 0, className, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return h('div', { role: 'progressbar', 'aria-valuenow': Math.round(v), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label, className: cn('h-2 w-full overflow-hidden rounded-full bg-muted', className) },
    h('div', { className: 'h-full rounded-full bg-primary transition-[width] duration-300 ease-out', style: { width: v + '%' } }));
}

export function Separator({ className, vertical = false, orientation }) {
  if (orientation === 'vertical') vertical = true;
  return h('div', { role: 'separator', className: cn('flex-shrink-0 bg-border', vertical ? 'h-full w-px' : 'h-px w-full', className) });
}

export function Skeleton({ className }) {
  return h('div', { 'aria-hidden': true, className: cn('animate-pulse rounded-md bg-muted', className) });
}

export function Kbd({ className, ...props }) {
  return h('kbd', { className: cn('inline-flex h-5 items-center rounded-sm border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground', className), ...props });
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

export function Avatar({ src, name, size = 40, className }) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };
  if (src && !broken) return h('img', { src, alt: name || '', style: box, onError: () => setBroken(true), className: cn('flex-shrink-0 rounded-full object-cover', className) });
  return h('span', { style: { ...box, fontSize: Math.round(size * 0.4) }, className: cn('inline-flex flex-shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground', className) }, initials(name));
}

const ALERT = {
  default: 'border-border bg-card text-card-foreground',
  destructive: 'border-destructive/40 bg-destructive/10 text-foreground',
  success: 'border-success/40 bg-success/10 text-foreground',
  warning: 'border-warning/40 bg-warning/10 text-foreground',
};
export function Alert({ variant = 'default', title, icon, children, className }) {
  return h('div', { role: variant === 'destructive' ? 'alert' : 'status', className: cn('flex gap-3 rounded-lg border p-4 text-sm', ALERT[variant] || ALERT.default, className) },
    icon ? h('span', { className: 'mt-0.5 flex-shrink-0' }, icon) : null,
    h('div', { className: 'flex flex-col gap-1' }, title ? h('p', { className: 'font-medium' }, title) : null, children ? h('div', { className: 'text-muted-foreground' }, children) : null));
}

export function EmptyState({ icon, title, children, action, className }) {
  return h('div', { className: cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className) },
    icon ? h('div', { className: 'flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground' }, icon) : null,
    title ? h('p', { className: 'font-heading text-base font-semibold text-foreground' }, title) : null,
    children ? h('p', { className: 'max-w-sm text-sm text-muted-foreground' }, children) : null,
    action || null);
}

export function Stat({ label, value, hint, trend, className }) {
  return h('div', { className: cn('flex flex-col gap-1', className) },
    h('span', { className: 'text-sm text-muted-foreground' }, label),
    h('span', { className: 'font-heading text-2xl font-semibold tabular-nums tracking-tight text-foreground' }, value),
    hint ? h('span', { className: cn('text-sm', trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground') }, hint) : null);
}

// --- Table ---

export function Table({ className, children, ...props }) {
  return h('div', { className: 'w-full overflow-x-auto' }, h('table', { className: cn('w-full caption-bottom border-collapse text-sm', className), ...props }, children));
}
export function THead({ className, ...props }) { return h('thead', { className: cn('border-b border-border', className), ...props }); }
export function TBody({ className, ...props }) { return h('tbody', { className: cn('[&>tr:last-child]:border-0', className), ...props }); }
export function TR({ className, ...props }) { return h('tr', { className: cn('border-b border-border transition-colors hover:bg-accent/50', className), ...props }); }
export function TH({ className, align = 'left', ...props }) {
  return h('th', { className: cn('h-10 px-3 font-medium text-muted-foreground', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left', className), ...props });
}
export function TD({ className, align = 'left', ...props }) {
  return h('td', { className: cn('px-3 py-2.5 align-middle', align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : '', className), ...props });
}

// --- Tabs ---

const TabsCtx = createContext(null);
export function Tabs({ value, defaultValue, onChange, onValueChange, className, children }) {
  onChange = onChange || onValueChange;
  const [current, setCurrent] = useControlled(value, defaultValue);
  const select = (v) => { setCurrent(v); onChange && onChange(v); };
  return h(TabsCtx.Provider, { value: { current, select } }, h('div', { className: cn('flex flex-col gap-3', className) }, children));
}
export function TabsList({ className, ...props }) {
  return h('div', { role: 'tablist', className: cn('inline-flex h-11 items-center gap-1 self-start rounded-md bg-muted p-1 text-muted-foreground', className), ...props });
}
export function TabsTrigger({ value, className, children }) {
  const ctx = useContext(TabsCtx);
  const on = ctx && ctx.current === value;
  return h('button', {
    type: 'button', role: 'tab', 'aria-selected': !!on, onClick: () => ctx && ctx.select(value),
    className: cn('inline-flex h-9 items-center justify-center whitespace-nowrap rounded-sm px-3 text-sm font-medium transition-colors', ring, on ? 'bg-card text-foreground shadow-sm' : 'hover:text-foreground'),
  }, children);
}
export function TabsContent({ value, className, children }) {
  const ctx = useContext(TabsCtx);
  if (!ctx || ctx.current !== value) return null;
  return h('div', { role: 'tabpanel', className }, children);
}

// --- Overlays ---

function useOverlay(open, onClose, panelRef) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const target = el.querySelector('[autofocus], input, select, textarea, button:not([data-kit-close])') || el;
      target.focus && target.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (prev && prev.focus) prev.focus();
    };
  }, [open]);
}

function CloseButton({ onClose }) {
  return h('button', { type: 'button', 'data-kit-close': true, onClick: onClose, 'aria-label': 'Close', className: cn('absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', ring) }, XIcon('h-4 w-4'));
}

export function Dialog({ open, onClose, onOpenChange, title, description, footer, children, className }) {
  onClose = onClose || (onOpenChange ? () => onOpenChange(false) : undefined);
  const panel = useRef(null);
  useOverlay(open, onClose, panel);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(h('div', { className: 'fixed inset-0 z-50' },
    h('div', { className: 'kit-fade absolute inset-0 bg-black/50', onClick: onClose }),
    h('div', { ref: panel, role: 'dialog', 'aria-modal': true, tabIndex: -1, className: cn('kit-pop fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg outline-none', className) },
      title || description ? h('div', { className: 'flex flex-col gap-1.5 pr-8' },
        title ? h('h2', { className: 'font-heading text-lg font-semibold leading-tight' }, title) : null,
        description ? h('p', { className: 'text-sm text-muted-foreground' }, description) : null) : null,
      children,
      footer ? h('div', { className: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }, footer) : null,
      h(CloseButton, { onClose }))), document.body);
}

export function Sheet({ open, onClose, onOpenChange, side = 'right', title, children, className }) {
  onClose = onClose || (onOpenChange ? () => onOpenChange(false) : undefined);
  const panel = useRef(null);
  useOverlay(open, onClose, panel);
  if (!open || typeof document === 'undefined') return null;
  const pos = side === 'bottom'
    ? 'kit-up inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t'
    : 'kit-right inset-y-0 right-0 h-full w-full max-w-md border-l';
  return createPortal(h('div', { className: 'fixed inset-0 z-50' },
    h('div', { className: 'kit-fade absolute inset-0 bg-black/50', onClick: onClose }),
    h('div', { ref: panel, role: 'dialog', 'aria-modal': true, tabIndex: -1, className: cn('fixed flex flex-col gap-4 overflow-y-auto border-border bg-card p-6 text-card-foreground shadow-lg outline-none', pos, className) },
      title ? h('h2', { className: 'pr-8 font-heading text-lg font-semibold' }, title) : null,
      children,
      h(CloseButton, { onClose }))), document.body);
}

export function Tooltip({ content, children, className }) {
  return h('span', { className: cn('group relative inline-flex', className) },
    children,
    h('span', { role: 'tooltip', className: 'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100' }, content));
}

// --- Toasts ---

let toasts = [];
const toastListeners = new Set();
const emit = () => toastListeners.forEach((l) => l());
let toastId = 0;

export function toast(input) {
  const t = typeof input === 'string' ? { title: input } : { ...(input || {}) };
  const id = ++toastId;
  toasts = [...toasts.slice(-2), { id, ...t }];
  emit();
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== id); emit(); }, t.duration || 3500);
  return id;
}

export function Toaster({ className }) {
  const list = useSyncExternalStore((l) => { toastListeners.add(l); return () => toastListeners.delete(l); }, () => toasts, () => toasts);
  if (typeof document === 'undefined') return null;
  return createPortal(h('div', { 'aria-live': 'polite', className: cn('pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4', className) },
    list.map((t) => h('div', {
      key: t.id,
      className: cn('kit-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg',
        t.variant === 'destructive' ? 'border-destructive/50' : t.variant === 'success' ? 'border-success/50' : 'border-border'),
    },
      t.variant === 'success' ? h('span', { className: 'mt-0.5 text-success' }, CheckIcon('h-4 w-4')) : null,
      h('div', { className: 'flex flex-col gap-0.5' },
        h('span', { className: 'font-medium' }, t.title),
        t.description ? h('span', { className: 'text-muted-foreground' }, t.description) : null)))), document.body);
}

// --- Brand and layout ---

export function Logo({ size = 32, className }) {
  const s = style();
  const [broken, setBroken] = useState(false);
  if (s.logoUrl && !broken) {
    return h('img', { src: s.logoUrl, alt: s.appName || 'Logo', onError: () => setBroken(true), style: { height: size, width: 'auto', maxWidth: size * 4 }, className: cn('flex-shrink-0 object-contain', className) });
  }
  return h('span', { 'aria-hidden': true, style: { width: size, height: size, fontSize: Math.round(size * 0.42) }, className: cn('inline-flex flex-shrink-0 items-center justify-center rounded-md bg-primary font-heading font-semibold text-primary-foreground', className) }, initials(s.appName));
}

export function AppHeader({ title, subtitle, actions, logo = true, className }) {
  const s = style();
  return h('header', { className: cn('flex items-center gap-3 py-4', className) },
    logo ? h(Logo, { size: 32 }) : null,
    h('div', { className: 'flex min-w-0 flex-col' },
      h('span', { className: 'truncate font-heading text-lg font-semibold leading-tight text-foreground' }, title || s.appName || ''),
      subtitle ? h('span', { className: 'truncate text-sm text-muted-foreground' }, subtitle) : null),
    actions ? h('div', { className: 'ml-auto flex items-center gap-2' }, actions) : null);
}

const PAGE_WIDTH = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-none' };
const PAGE_PAD = { compact: 'px-4 py-4', comfortable: 'px-4 py-6 sm:px-6', airy: 'px-5 py-10 sm:px-8' };
export function Page({ width = 'md', className, children }) {
  const pad = PAGE_PAD[style().density] || PAGE_PAD.comfortable;
  return h('main', { className: cn('mx-auto w-full', PAGE_WIDTH[width] || PAGE_WIDTH.md, pad, className) }, children);
}
