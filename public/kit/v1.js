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
const { useState, useEffect, useLayoutEffect, useImperativeHandle, useRef, useId, forwardRef, createContext, useContext, useSyncExternalStore, Children, isValidElement, cloneElement } = React;

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

// --- InfiniteCanvas: the canvas every canvas-shaped app is built on ---
//
// One component, maintained here, so every app that puts things on a board gets the
// same polished behavior: pan and zoom without edges, transformer handles (resize
// from any side or corner, rotate), drag, shift-click and marquee selection, undo
// and redo, freehand ink, nudging, layering, and images dropped or pasted in.
// Items are controlled: the app owns the array and saves it; the canvas reports
// every change through onChange. Contract documented in CANVAS_PROMPT
// (lib/playground/skills/canvas.ts). Change one, change the other.

const CANVAS_MIN_ZOOM = 0.1;
const CANVAS_MAX_ZOOM = 8;
const CANVAS_MIN_SIZE = 8;
const CANVAS_HISTORY = 100;
const clampZoom = (z) => Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, z));
const rad = (deg) => (deg * Math.PI) / 180;
const rot = (x, y, deg) => { const a = rad(deg), c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; };
const canvasId = () => Math.random().toString(36).slice(2, 10);
const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function bboxOf(items) {
  if (!items.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    // A rotated item's corners, so fit and group boxes hold all of it.
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = rot((sx * it.w) / 2, (sy * it.h) / 2, it.rotation || 0);
      x0 = Math.min(x0, cx + p.x); y0 = Math.min(y0, cy + p.y); x1 = Math.max(x1, cx + p.x); y1 = Math.max(y1, cy + p.y);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function inkPath(points) {
  if (!points || !points.length) return '';
  if (points.length < 3) return `M${points[0][0]},${points[0][1]} ` + points.map((p) => `L${p[0]},${p[1]}`).join(' ');
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2, my = (points[i][1] + points[i + 1][1]) / 2;
    d += ` Q${points[i][0]},${points[i][1]} ${mx},${my}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last[0]},${last[1]}`;
}

function Ink({ item }) {
  return h('svg', { width: '100%', height: '100%', viewBox: `0 0 ${item.vw || item.w} ${item.vh || item.h}`, preserveAspectRatio: 'none', style: { overflow: 'visible', display: 'block' } },
    h('path', { d: inkPath(item.points), fill: 'none', stroke: item.color || 'currentColor', strokeWidth: item.size || 4, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }));
}

const ICON = {
  select: 'M5 3l14 8-6 2-2 6z',
  hand: 'M8 13V5.5a1.5 1.5 0 013 0V12m0-6.5v-1a1.5 1.5 0 013 0V12m0-5.5a1.5 1.5 0 013 0V12m0-3a1.5 1.5 0 013 0v5a7 7 0 01-7 7h-1a7 7 0 01-5.6-2.8L4.6 15a1.5 1.5 0 012.4-1.8L8 14.5',
  draw: 'M3 21c3-1 5-3 7-6l8-8a2.1 2.1 0 00-3-3l-8 8c-3 2-5 4-6 7zM14 6l3 3',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
};
const canvasIcon = (d) => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d }));
const PEN_COLORS = ['#111827', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ffffff'];

export const InfiniteCanvas = forwardRef(function InfiniteCanvas({
  items = [], onChange, renderItem,
  selection: selectionProp, onSelectionChange,
  tool: toolProp, onToolChange,
  onDropFiles, onItemDoubleClick,
  penColor: penColorProp, penSize = 4,
  toolbar = true, background = 'dots', className, children,
}, ref) {
  const rootRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const itemsRef = useRef(items); itemsRef.current = items;
  const [selInner, setSelInner] = useState([]);
  const selection = selectionProp ?? selInner;
  const selRef = useRef(selection); selRef.current = selection;
  const setSelection = (ids) => { setSelInner(ids); onSelectionChange && onSelectionChange(ids); };
  const [toolInner, setToolInner] = useState('select');
  const tool = toolProp ?? toolInner;
  const setTool = (t) => { setToolInner(t); onToolChange && onToolChange(t); };
  const [penInner, setPenInner] = useState(PEN_COLORS[0]);
  const penColor = penColorProp ?? penInner;
  const [spaceDown, setSpaceDown] = useState(false);
  const [marquee, setMarquee] = useState(null);
  const [draft, setDraft] = useState(null); // ink being drawn, in world points
  const [busy, setBusy] = useState(null); // 'pan' | 'move' | 'resize' | 'rotate' while dragging
  const past = useRef([]); const future = useRef([]);
  const [, bump] = useState(0);
  const pointers = useRef(new Map());

  const emit = (next) => { onChange && onChange(next); };
  /** A finished change: remembered for undo. */
  const commit = (next, before = itemsRef.current) => {
    past.current.push(before); if (past.current.length > CANVAS_HISTORY) past.current.shift();
    future.current = [];
    emit(next); bump((n) => n + 1);
  };
  const undo = () => { const prev = past.current.pop(); if (!prev) return; future.current.push(itemsRef.current); emit(prev); bump((n) => n + 1); };
  const redo = () => { const next = future.current.pop(); if (!next) return; past.current.push(itemsRef.current); emit(next); bump((n) => n + 1); };

  const screenToWorld = (sx, sy) => {
    const r = rootRef.current.getBoundingClientRect(), v = viewRef.current;
    return { x: (sx - r.left - v.x) / v.z, y: (sy - r.top - v.y) / v.z };
  };
  const zoomAt = (sx, sy, z) => {
    const r = rootRef.current.getBoundingClientRect(), v = viewRef.current, nz = clampZoom(z);
    const px = sx - r.left, py = sy - r.top;
    setView({ z: nz, x: px - ((px - v.x) / v.z) * nz, y: py - ((py - v.y) / v.z) * nz });
  };
  const zoomBy = (f) => { const r = rootRef.current.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, viewRef.current.z * f); };
  const fit = (list = itemsRef.current) => {
    const el = rootRef.current; if (!el) return;
    const r = el.getBoundingClientRect(), b = bboxOf(list);
    if (!b || !r.width) { setView({ x: r.width / 2, y: r.height / 2, z: 1 }); return; }
    const pad = 80, z = clampZoom(Math.min((r.width - pad * 2) / Math.max(b.w, 1), (r.height - pad * 2) / Math.max(b.h, 1), 1));
    setView({ z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z });
  };
  const center = () => { const r = rootRef.current.getBoundingClientRect(); return screenToWorld(r.left + r.width / 2, r.top + r.height / 2); };

  useImperativeHandle(ref, () => ({
    zoomToFit: () => fit(), zoomTo: (z) => zoomBy(z / viewRef.current.z), getView: () => viewRef.current, setView,
    screenToWorld, center, undo, redo, select: setSelection,
    centerOn: (id) => { const it = itemsRef.current.find((i) => i.id === id); if (!it) return; const r = rootRef.current.getBoundingClientRect(), z = viewRef.current.z; setView({ z, x: r.width / 2 - (it.x + it.w / 2) * z, y: r.height / 2 - (it.y + it.h / 2) * z }); },
    /** Add items as one undoable change, centered on the view unless they say where. */
    add: (list) => { const arr = Array.isArray(list) ? list : [list]; const c = center(); const placed = arr.map((it) => ({ id: canvasId(), rotation: 0, ...it, x: it.x ?? c.x - (it.w || 200) / 2, y: it.y ?? c.y - (it.h || 200) / 2 })); commit([...itemsRef.current, ...placed]); setSelection(placed.map((p) => p.id)); return placed; },
  }));

  // First paint: everything in view.
  useLayoutEffect(() => { fit(); }, []);

  // Wheel: pan; pinch or ctrl/cmd + wheel: zoom at the pointer. Non-passive so the page never scrolls.
  useEffect(() => {
    const el = rootRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, viewRef.current.z * Math.exp(-e.deltaY * 0.01));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keys, while the canvas has focus or nothing else does.
  useEffect(() => {
    const down = (e) => {
      if (typing(document.activeElement)) return;
      const mod = e.metaKey || e.ctrlKey, sel = selRef.current, all = itemsRef.current;
      if (e.code === 'Space' && !e.repeat) { setSpaceDown(true); e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelection(all.map((i) => i.id)); return; }
      if (mod && e.key.toLowerCase() === 'd' && sel.length) {
        e.preventDefault();
        const copies = all.filter((i) => sel.includes(i.id)).map((i) => ({ ...i, id: canvasId(), x: i.x + 24, y: i.y + 24 }));
        commit([...all, ...copies]); setSelection(copies.map((c) => c.id)); return;
      }
      if (mod && e.key === '0') { e.preventDefault(); zoomBy(1 / viewRef.current.z); return; }
      if (e.shiftKey && e.key === '!') { fit(); return; }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.25); return; }
      if (mod && e.key === '-') { e.preventDefault(); zoomBy(0.8); return; }
      if (mod) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) { e.preventDefault(); commit(all.filter((i) => !sel.includes(i.id) || i.locked)); setSelection([]); return; }
      if (e.key === 'Escape') { setSelection([]); setTool('select'); return; }
      if (e.key === 'v' || e.key === 'V') { setTool('select'); return; }
      if (e.key === 'h' || e.key === 'H') { setTool('hand'); return; }
      if (e.key === 'p' || e.key === 'P' || e.key === 'd' || e.key === 'D') { setTool('draw'); return; }
      if ((e.key === ']' || e.key === '[') && sel.length) {
        const picked = all.filter((i) => sel.includes(i.id)), rest = all.filter((i) => !sel.includes(i.id));
        commit(e.key === ']' ? [...rest, ...picked] : [...picked, ...rest]); return;
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key] && sel.length) {
        e.preventDefault();
        const [dx, dy] = arrows[e.key], step = e.shiftKey ? 10 : 1;
        commit(all.map((i) => (sel.includes(i.id) && !i.locked ? { ...i, x: i.x + dx * step, y: i.y + dy * step } : i)));
      }
    };
    const up = (e) => { if (e.code === 'Space') setSpaceDown(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  // Images pasted anywhere land in the middle of the view.
  useEffect(() => {
    if (!onDropFiles) return;
    const paste = (e) => {
      if (typing(document.activeElement)) return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); onDropFiles(files, center()); }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [onDropFiles]);

  /** Follow one drag until the pointer lets go. */
  const track = (move, end) => {
    const mv = (e) => move(e);
    const up = (e) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); setBusy(null); end && end(e); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const startPan = (e) => {
    setBusy('pan');
    const sx = e.clientX, sy = e.clientY, v0 = viewRef.current;
    track((m) => setView({ ...v0, x: v0.x + m.clientX - sx, y: v0.y + m.clientY - sy }));
  };

  // Two fingers: pinch to zoom and pan together.
  const pinch = useRef(null);
  const onPointerDownCapture = (e) => {
    if (e.pointerType !== 'touch') return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: viewRef.current };
      e.stopPropagation();
      const mv = (m) => {
        if (!pointers.current.has(m.pointerId) || !pinch.current) return;
        pointers.current.set(m.pointerId, { x: m.clientX, y: m.clientY });
        const [p, q] = [...pointers.current.values()], s = pinch.current;
        const d = Math.hypot(p.x - q.x, p.y - q.y), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const r = rootRef.current.getBoundingClientRect(), z = clampZoom(s.v.z * (d / s.d));
        const wx = (s.mx - r.left - s.v.x) / s.v.z, wy = (s.my - r.top - s.v.y) / s.v.z;
        setView({ z, x: mx - r.left - wx * z, y: my - r.top - wy * z });
      };
      const up = (u) => { pointers.current.delete(u.pointerId); if (pointers.current.size < 2) { pinch.current = null; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); } };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    }
  };
  useEffect(() => {
    const drop = (e) => pointers.current.delete(e.pointerId);
    window.addEventListener('pointerup', drop); window.addEventListener('pointercancel', drop);
    return () => { window.removeEventListener('pointerup', drop); window.removeEventListener('pointercancel', drop); };
  }, []);

  const onBackgroundDown = (e) => {
    if (pinch.current) return;
    rootRef.current.focus({ preventScroll: true });
    if (e.button === 1 || e.button === 2 || tool === 'hand' || spaceDown || (e.pointerType === 'touch' && tool === 'select')) { e.preventDefault(); startPan(e); return; }
    if (e.button !== 0) return;
    if (tool === 'draw') { startInk(e); return; }
    // Marquee: everything it touches is selected (shift adds).
    const start = screenToWorld(e.clientX, e.clientY), base = e.shiftKey ? selRef.current : [];
    if (!e.shiftKey) setSelection([]);
    track((m) => {
      const p = screenToWorld(m.clientX, m.clientY);
      const box = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      setMarquee(box);
      const hit = itemsRef.current.filter((i) => { const b = bboxOf([i]); return b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y; }).map((i) => i.id);
      setSelection([...new Set([...base, ...hit])]);
    }, () => setMarquee(null));
  };

  const startInk = (e) => {
    const pts = [screenToWorld(e.clientX, e.clientY)];
    setDraft(pts.slice());
    track((m) => { pts.push(screenToWorld(m.clientX, m.clientY)); setDraft(pts.slice()); }, () => {
      setDraft(null);
      if (pts.length < 2) return;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), pad = penSize;
      const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad, w = Math.max(...xs) - x + pad, hgt = Math.max(...ys) - y + pad;
      const item = { id: canvasId(), type: 'ink', x, y, w, h: hgt, vw: w, vh: hgt, rotation: 0, color: penColor, size: penSize, points: pts.map((p) => [p.x - x, p.y - y]) };
      commit([...itemsRef.current, item]);
    });
  };

  const onItemDown = (e, it) => {
    if (pinch.current) return;
    if (tool === 'hand' || spaceDown || e.button === 1) { e.preventDefault(); e.stopPropagation(); startPan(e); return; }
    if (tool === 'draw' || e.button !== 0) return;
    e.stopPropagation();
    rootRef.current.focus({ preventScroll: true });
    let sel = selRef.current;
    if (e.shiftKey) { sel = sel.includes(it.id) ? sel.filter((s) => s !== it.id) : [...sel, it.id]; setSelection(sel); return; }
    if (!sel.includes(it.id)) { sel = [it.id]; setSelection(sel); }
    const before = itemsRef.current, start = screenToWorld(e.clientX, e.clientY);
    let moved = false;
    track((m) => {
      const p = screenToWorld(m.clientX, m.clientY), dx = p.x - start.x, dy = p.y - start.y;
      if (!moved && Math.hypot(dx, dy) * viewRef.current.z < 3) return;
      moved = true; setBusy('move');
      emit(before.map((i) => (sel.includes(i.id) && !i.locked ? { ...i, x: i.x + dx, y: i.y + dy } : i)));
    }, () => { if (moved) commit(itemsRef.current, before); });
  };

  // Resize one item from a handle, in its own rotated frame; the opposite side stays put.
  const onHandleDown = (e, it, dx, dy) => {
    e.stopPropagation(); e.preventDefault();
    const before = itemsRef.current, th = it.rotation || 0;
    const c0 = { x: it.x + it.w / 2, y: it.y + it.h / 2 }, ax = (-dx * it.w) / 2, ay = (-dy * it.h) / 2;
    const ratio = it.keepRatio || it.type === 'image';
    setBusy('resize');
    track((m) => {
      const pw = screenToWorld(m.clientX, m.clientY), p = rot(pw.x - c0.x, pw.y - c0.y, -th);
      let w = dx ? Math.max(CANVAS_MIN_SIZE, dx * (p.x - ax)) : it.w, hh = dy ? Math.max(CANVAS_MIN_SIZE, dy * (p.y - ay)) : it.h;
      if (dx && dy && (ratio !== m.shiftKey)) { const s = Math.max(w / it.w, hh / it.h); w = it.w * s; hh = it.h * s; }
      const cl = { x: dx ? ax + (dx * w) / 2 : 0, y: dy ? ay + (dy * hh) / 2 : 0 }, cw = rot(cl.x, cl.y, th);
      const cx = c0.x + cw.x, cy = c0.y + cw.y;
      emit(before.map((i) => (i.id === it.id ? { ...i, x: cx - w / 2, y: cy - hh / 2, w, h: hh } : i)));
    }, () => commit(itemsRef.current, before));
  };

  const onRotateDown = (e, it) => {
    e.stopPropagation(); e.preventDefault();
    const before = itemsRef.current, c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
    setBusy('rotate');
    track((m) => {
      const p = screenToWorld(m.clientX, m.clientY);
      let deg = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
      if (m.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((deg % 360) + 360) % 360;
      emit(before.map((i) => (i.id === it.id ? { ...i, rotation: deg } : i)));
    }, () => commit(itemsRef.current, before));
  };

  // Several selected: scale them all from the group box's opposite corner.
  const onGroupHandleDown = (e, box, dx, dy) => {
    e.stopPropagation(); e.preventDefault();
    const before = itemsRef.current, sel = selRef.current;
    const ax = dx > 0 ? box.x : box.x + box.w, ay = dy > 0 ? box.y : box.y + box.h;
    setBusy('resize');
    track((m) => {
      const p = screenToWorld(m.clientX, m.clientY);
      let sx = dx ? Math.max(0.05, (dx * (p.x - ax)) / box.w) : 1, sy = dy ? Math.max(0.05, (dy * (p.y - ay)) / box.h) : 1;
      if (dx && dy && !m.shiftKey) { const s = Math.max(sx, sy); sx = s; sy = s; }
      emit(before.map((i) => (sel.includes(i.id) && !i.locked ? { ...i, x: ax + (i.x - ax) * sx, y: ay + (i.y - ay) * sy, w: i.w * sx, h: i.h * sy } : i)));
    }, () => commit(itemsRef.current, before));
  };

  const onDragOver = (e) => { if (onDropFiles && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); };
  const onDrop = (e) => {
    if (!onDropFiles) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    e.preventDefault();
    onDropFiles(files, screenToWorld(e.clientX, e.clientY));
  };

  const z = view.z;
  const selected = items.filter((i) => selection.includes(i.id));
  const handles = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const handleCursor = (dx, dy, th) => {
    const names = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
    const a = (((Math.atan2(dy, dx) * 180) / Math.PI + th) % 180 + 180) % 180;
    return names[Math.round(a / 45) % 4];
  };
  const handleEl = (key, style, onDown, cursor, edge) => h('div', {
    key, onPointerDown: onDown,
    style: { position: 'absolute', width: edge ? 10 : 12, height: edge ? 10 : 12, transform: 'translate(-50%, -50%)', cursor, touchAction: 'none', ...style },
    className: 'rounded-[3px] border-2 border-primary bg-background shadow-sm',
  });

  let overlay = null;
  if (selected.length === 1 && !busy?.startsWith('pan')) {
    const it = selected[0], th = it.rotation || 0;
    const cx = (it.x + it.w / 2) * z + view.x, cy = (it.y + it.h / 2) * z + view.y;
    overlay = h('div', { style: { position: 'absolute', left: cx, top: cy, width: it.w * z, height: it.h * z, transform: `translate(-50%, -50%) rotate(${th}deg)`, pointerEvents: 'none' } },
      h('div', { className: 'absolute inset-0 rounded-[2px] border-2 border-primary' }),
      it.locked ? null : h('div', { style: { pointerEvents: 'auto' } },
        h('div', { key: 'stem', className: 'absolute bg-primary', style: { left: '50%', top: -24, width: 2, height: 22, transform: 'translateX(-50%)' } }),
        handleEl('rot', { left: '50%', top: -28, borderRadius: 999 }, (e) => onRotateDown(e, it), 'grab'),
        ...handles.map(([dx, dy]) => handleEl(`${dx}${dy}`, { left: `${(dx + 1) * 50}%`, top: `${(dy + 1) * 50}%` }, (e) => onHandleDown(e, it, dx, dy), handleCursor(dx, dy, th), !dx || !dy))));
  } else if (selected.length > 1) {
    const b = bboxOf(selected);
    overlay = h('div', { style: { position: 'absolute', left: b.x * z + view.x, top: b.y * z + view.y, width: b.w * z, height: b.h * z, pointerEvents: 'none' } },
      h('div', { className: 'absolute inset-0 rounded-[2px] border-2 border-dashed border-primary' }),
      h('div', { style: { pointerEvents: 'auto' } },
        ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => handleEl(`g${dx}${dy}`, { left: `${(dx + 1) * 50}%`, top: `${(dy + 1) * 50}%` }, (e) => onGroupHandleDown(e, b, dx, dy), handleCursor(dx, dy, 0)))));
  }

  const grid = 24 * z;
  const bg = background === 'dots'
    ? { backgroundImage: 'radial-gradient(circle, rgb(var(--foreground, 136 136 136) / 0.28) 1px, transparent 1.2px)', backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.x}px ${view.y}px` }
    : background === 'grid'
      ? { backgroundImage: 'linear-gradient(to right, rgb(var(--foreground, 136 136 136) / 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--foreground, 136 136 136) / 0.1) 1px, transparent 1px)', backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.x}px ${view.y}px` }
      : {};
  const cursor = busy === 'pan' ? 'grabbing' : tool === 'hand' || spaceDown ? 'grab' : tool === 'draw' ? 'crosshair' : 'default';

  const tb = (label, icon, onClick, active, disabled) => h('button', {
    type: 'button', title: label, 'aria-label': label, onClick, disabled,
    className: cn('flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent disabled:opacity-30', active && 'bg-primary text-primary-foreground hover:bg-primary'),
  }, canvasIcon(icon));
  const sep = (k) => h('span', { key: k, className: 'mx-1 h-6 w-px bg-border' });

  return h('div', {
    ref: rootRef, tabIndex: 0, className: cn('relative h-full w-full select-none overflow-hidden bg-background outline-none', className),
    style: { touchAction: 'none', cursor, ...bg },
    onPointerDownCapture, onPointerDown: onBackgroundDown, onContextMenu: (e) => e.preventDefault(), onDragOver, onDrop,
  },
    h('div', { style: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${z})` } },
      items.map((it) => h('div', {
        key: it.id,
        onPointerDown: (e) => onItemDown(e, it),
        onDoubleClick: onItemDoubleClick ? (e) => { e.stopPropagation(); onItemDoubleClick(it); } : undefined,
        style: { position: 'absolute', left: it.x, top: it.y, width: it.w, height: it.h, transform: it.rotation ? `rotate(${it.rotation}deg)` : undefined, cursor: tool === 'select' && !spaceDown ? (it.locked ? 'default' : 'move') : undefined, touchAction: 'none' },
      }, it.type === 'ink' ? h(Ink, { item: it }) : renderItem ? renderItem(it, { selected: selection.includes(it.id), zoom: z }) : null)),
      draft ? h('svg', { style: { position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }, width: 1, height: 1 },
        h('path', { d: inkPath(draft.map((p) => [p.x, p.y])), fill: 'none', stroke: penColor, strokeWidth: penSize, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' })) : null),
    marquee ? h('div', { className: 'pointer-events-none absolute rounded-[2px] border border-primary bg-primary/10', style: { left: marquee.x * z + view.x, top: marquee.y * z + view.y, width: marquee.w * z, height: marquee.h * z } }) : null,
    overlay,
    children,
    toolbar ? h('div', { onPointerDown: (e) => e.stopPropagation(), className: 'absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur' },
      tb('Select (V)', ICON.select, () => setTool('select'), tool === 'select'),
      tb('Pan (H, or hold space)', ICON.hand, () => setTool('hand'), tool === 'hand'),
      tb('Draw (P)', ICON.draw, () => setTool('draw'), tool === 'draw'),
      tool === 'draw' && !penColorProp ? h('span', { className: 'flex items-center gap-1 px-1' }, PEN_COLORS.map((c) => h('button', {
        key: c, type: 'button', 'aria-label': `Ink ${c}`, onClick: () => setPenInner(c),
        className: cn('h-6 w-6 rounded-full border border-border', penColor === c && 'ring-2 ring-primary ring-offset-1 ring-offset-card'), style: { background: c },
      }))) : null,
      sep('s1'),
      tb('Undo (⌘Z)', ICON.undo, undo, false, !past.current.length),
      tb('Redo (⇧⌘Z)', ICON.redo, redo, false, !future.current.length),
      sep('s2'),
      tb('Zoom out', ICON.minus, () => zoomBy(0.8)),
      h('button', { type: 'button', title: 'Reset to 100%', onClick: () => zoomBy(1 / viewRef.current.z), className: 'h-10 min-w-[3.5rem] rounded-md px-1 text-xs tabular-nums text-muted-foreground hover:bg-accent' }, `${Math.round(z * 100)}%`),
      tb('Zoom in', ICON.plus, () => zoomBy(1.25)),
      tb('Fit everything (⇧1)', ICON.fit, () => fit())) : null);
});

/** Read an image file as an item for InfiniteCanvas, sized from the image itself. */
export function imageItem(file, at, maxSide = 360) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not an image'));
      img.onload = () => {
        const s = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * s), hh = Math.round(img.height * s);
        resolve({ id: canvasId(), type: 'image', src: reader.result, x: (at?.x ?? 0) - w / 2, y: (at?.y ?? 0) - hh / 2, w, h: hh, rotation: 0, keepRatio: true });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
