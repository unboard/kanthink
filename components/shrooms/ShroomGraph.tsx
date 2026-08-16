'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Channel, InstructionCard } from '@/lib/types';
import { buildShroomGraph, capabilityBadges, type GraphNode } from '@/lib/shrooms/graph';
import { resolveInputRequirements } from '@/lib/shrooms/invocation';

/**
 * The shape of your automations, drawn.
 *
 * Deliberately a view of what Kan wrote rather than a place to author from scratch:
 * shrooms are built by talking, and a canvas that demanded you assemble one from parts
 * would trade the good half of that for a worse one. What the canvas is *for* is the
 * things a list genuinely cannot show — what feeds what, what nothing ever triggers, and
 * a chain whose downstream shroom needs more cards than its upstream can produce.
 *
 * The one edit it does own is the wire, because a connection between two things is the
 * one property that is easier to drag than to describe. Drag from a node's right port
 * onto another node to chain them; drop on empty space to unchain.
 *
 * SVG and a hand-rolled layout rather than a graph library — the layout is a few dozen
 * lines against a model that is already tested, and this codebase keeps its dependency
 * list short on purpose.
 */

const NODE_W = 210;
const NODE_H = 104;
const GAP_X = 90;
const GAP_Y = 26;
const PAD = 40;

const ACTION_LABEL: Record<string, string> = {
  generate: 'Generate',
  modify: 'Modify',
  move: 'Move',
  report: 'Report',
};

const ENTRY_COLOR: Record<string, string> = {
  schedule: '#3b82f6',
  column: '#22c55e',
  manual: '#a1a1aa',
};

function nodeX(n: GraphNode) {
  return PAD + n.depth * (NODE_W + GAP_X);
}
function nodeY(n: GraphNode) {
  return PAD + n.row * (NODE_H + GAP_Y);
}

/** A cubic curve from one node's right edge to another's left edge. */
function wirePath(from: GraphNode, to: GraphNode): string {
  const x1 = nodeX(from) + NODE_W;
  const y1 = nodeY(from) + NODE_H / 2;
  const x2 = nodeX(to);
  const y2 = nodeY(to) + NODE_H / 2;
  const bend = Math.max(40, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

interface ShroomGraphProps {
  shrooms: InstructionCard[];
  channels: Record<string, Channel>;
  /** Open a shroom for editing. */
  onOpen: (shroom: InstructionCard) => void;
  /** Run a shroom at its default scope. */
  onRun?: (shroom: InstructionCard) => void;
  /** Set or clear what a shroom chains into. Absent makes the canvas read-only. */
  onChain?: (shroomId: string, nextId: string | undefined) => void;
  /** Ids mid-run, for the pulse. */
  runningIds?: string[];
  /** Shown above each node when several channels are on screen at once. */
  showChannelNames?: boolean;
}

export function ShroomGraph({
  shrooms,
  channels,
  onOpen,
  onRun,
  onChain,
  runningIds = [],
  showChannelNames = false,
}: ShroomGraphProps) {
  const graph = useMemo(() => buildShroomGraph(shrooms, channels), [shrooms, channels]);
  const svgRef = useRef<SVGSVGElement>(null);

  const [selected, setSelected] = useState<string | null>(null);
  // A wire being dragged: which node it left, and where the cursor is in graph space.
  const [drag, setDrag] = useState<{ from: string; x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);

  const width = PAD * 2 + graph.columns * NODE_W + (graph.columns - 1) * GAP_X;
  const height = PAD * 2 + graph.rows * NODE_H + (graph.rows - 1) * GAP_Y;

  const nodeById = useMemo(
    () => Object.fromEntries(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes]
  );

  /** Cursor position in the SVG's own coordinates, so drags line up at any zoom. */
  const toGraphSpace = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }, [width, height]);

  const handlePortDown = (nodeId: string) => (e: React.PointerEvent) => {
    if (!onChain) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ from: nodeId, ...toGraphSpace(e) });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, ...toGraphSpace(e) });
  };

  const handlePointerUp = () => {
    if (!drag) return;
    // Dropping on nothing clears the chain; that's the only way to unchain by mouse, and
    // it matches how the wire looks when you let go of it in empty space.
    if (onChain) {
      if (hoverTarget && hoverTarget !== drag.from) onChain(drag.from, hoverTarget);
      else if (!hoverTarget) onChain(drag.from, undefined);
    }
    setDrag(null);
    setHoverTarget(null);
  };

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No shrooms yet.</p>
        <p className="mt-1 max-w-xs text-xs text-neutral-400 dark:text-neutral-500">
          Build one by talking to Kan, and it will appear here with whatever it connects to.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-neutral-50 dark:bg-neutral-950">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block touch-pan-x touch-pan-y"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={() => setSelected(null)}
      >
        <defs>
          <pattern id="sg-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" className="fill-neutral-200 dark:fill-neutral-800" />
          </pattern>
          <marker id="sg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-neutral-400 dark:fill-neutral-600" />
          </marker>
          <marker id="sg-arrow-broken" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
          </marker>
        </defs>

        <rect width={width} height={height} fill="url(#sg-grid)" />

        {/* Wires under the nodes, so a curve never covers a title. */}
        {graph.edges.map((edge) => {
          const from = nodeById[edge.from];
          const to = nodeById[edge.to];
          if (!from || !to) return null;
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={wirePath(from, to)}
              fill="none"
              strokeWidth={edge.broken ? 2 : 1.5}
              stroke={edge.broken ? '#f43f5e' : 'currentColor'}
              strokeDasharray={edge.broken ? '5 4' : undefined}
              markerEnd={edge.broken ? 'url(#sg-arrow-broken)' : 'url(#sg-arrow)'}
              className={edge.broken ? '' : 'text-neutral-400 dark:text-neutral-600'}
            />
          );
        })}

        {/* The wire currently being dragged. */}
        {drag && nodeById[drag.from] && (
          <path
            d={`M ${nodeX(nodeById[drag.from]) + NODE_W} ${nodeY(nodeById[drag.from]) + NODE_H / 2} L ${drag.x} ${drag.y}`}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        )}

        {graph.nodes.map((node) => {
          const x = nodeX(node);
          const y = nodeY(node);
          const isRunning = runningIds.includes(node.id);
          const isSelected = selected === node.id;
          const isDropTarget = drag !== null && hoverTarget === node.id && drag.from !== node.id;
          const hasProblem = node.warnings.some((w) => w.kind === 'arity' || w.kind === 'cycle');
          const accent = isRunning ? '#8b5cf6' : ENTRY_COLOR[node.entry];
          const needs = resolveInputRequirements(node.shroom).minCards;
          const badges = capabilityBadges(node.shroom);

          return (
            <g
              key={node.id}
              transform={`translate(${x} ${y})`}
              onPointerEnter={() => drag && setHoverTarget(node.id)}
              onPointerLeave={() => drag && setHoverTarget(null)}
              onClick={(e) => { e.stopPropagation(); setSelected(node.id); }}
              onDoubleClick={() => onOpen(node.shroom)}
              className="cursor-pointer"
            >
              {/* Border colour comes from a class in the ordinary case so it follows the
                  theme; only the three states that mean something get a fixed colour. */}
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={12}
                className={`fill-white dark:fill-neutral-900 ${
                  isDropTarget || hasProblem || isSelected
                    ? ''
                    : 'stroke-neutral-200 dark:stroke-neutral-700'
                }`}
                stroke={isDropTarget || isSelected ? '#8b5cf6' : hasProblem ? '#f43f5e' : undefined}
                strokeWidth={isDropTarget || isSelected ? 2 : 1}
                opacity={node.reachable ? 1 : 0.82}
              />

              {/* Entry stripe: the colour says how a run of this node begins. */}
              <rect width={4} height={NODE_H} rx={2} fill={accent} />

              <text x={16} y={22} className="fill-neutral-400 dark:fill-neutral-500" fontSize={8.5} fontFamily="ui-monospace, monospace" letterSpacing={1.4}>
                {(ACTION_LABEL[node.shroom.action] ?? node.shroom.action).toUpperCase()}
                {node.entryLabel ? ` · ${node.entryLabel.toUpperCase()}` : ''}
              </text>

              <text x={16} y={44} className="fill-neutral-900 dark:fill-neutral-100" fontSize={13.5} fontWeight={600}>
                {node.shroom.title.length > 24 ? `${node.shroom.title.slice(0, 23)}…` : node.shroom.title}
              </text>

              {showChannelNames && node.channelName && (
                <text x={16} y={61} className="fill-neutral-400 dark:fill-neutral-500" fontSize={10}>
                  {node.channelName}
                </text>
              )}

              {/* Ports row: what it needs coming in, what it may do while it's there. */}
              <text x={16} y={showChannelNames ? 79 : 66} className="fill-neutral-500 dark:fill-neutral-400" fontSize={9.5} fontFamily="ui-monospace, monospace">
                {needs === 0 ? 'needs nothing' : needs === 1 ? 'needs 1 card' : `needs ${needs} cards`}
              </text>
              <text x={16} y={showChannelNames ? 93 : 82} className="fill-neutral-400 dark:fill-neutral-500" fontSize={9.5} fontFamily="ui-monospace, monospace">
                {badges.length === 4 ? 'all abilities' : badges.length === 0 ? 'note only' : badges.join(' · ')}
              </text>

              {!node.reachable && (
                <text x={NODE_W - 12} y={22} textAnchor="end" className="fill-neutral-400 dark:fill-neutral-600" fontSize={9} fontFamily="ui-monospace, monospace">
                  MANUAL
                </text>
              )}
              {hasProblem && (
                <circle cx={NODE_W - 14} cy={NODE_H - 14} r={4} fill="#f43f5e" />
              )}

              {/* Input port */}
              <circle cx={0} cy={NODE_H / 2} r={4.5} className="fill-neutral-300 dark:fill-neutral-700" />

              {/* Output port — the handle you drag a chain from. */}
              <circle
                cx={NODE_W}
                cy={NODE_H / 2}
                r={onChain ? 6.5 : 4.5}
                fill={drag?.from === node.id ? '#8b5cf6' : 'currentColor'}
                className={onChain ? 'cursor-crosshair text-neutral-400 dark:text-neutral-600 hover:text-violet-500' : 'text-neutral-300 dark:text-neutral-700'}
                onPointerDown={handlePortDown(node.id)}
              />

              {isRunning && (
                <circle cx={NODE_W} cy={NODE_H / 2} r={10} fill="none" stroke="#8b5cf6" strokeWidth={1.5} opacity={0.6}>
                  <animate attributeName="r" values="7;14;7" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {selected && nodeById[selected] && (
        <NodeInspector
          node={nodeById[selected]}
          onOpen={() => onOpen(nodeById[selected].shroom)}
          onRun={onRun ? () => onRun(nodeById[selected].shroom) : undefined}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/**
 * What's wrong with the selected node, and the two things you'd want to do about it.
 *
 * Fixed to the bottom of the canvas rather than floating by the node: a popover would
 * cover the wires, which are the reason you opened the graph.
 */
function NodeInspector({
  node,
  onOpen,
  onRun,
  onClose,
}: {
  node: GraphNode;
  onOpen: () => void;
  onRun?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none sticky bottom-0 left-0 right-0 flex justify-center p-3">
      <div className="pointer-events-auto w-full max-w-xl rounded-xl border border-neutral-200 bg-white/95 p-3.5 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {node.shroom.title}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400 wrap-anywhere">
              {node.shroom.summary?.trim() || node.shroom.instructions}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <svg className="h-4 w-4" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {node.warnings.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {node.warnings.map((w, i) => (
              <li
                key={i}
                className={`text-xs leading-relaxed ${
                  w.kind === 'unreachable'
                    ? 'text-neutral-500 dark:text-neutral-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {w.detail}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-neutral-200 pt-2.5 dark:border-neutral-700">
          {onRun && (
            <button
              onClick={onRun}
              className="rounded border border-neutral-300 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700 transition-colors hover:border-violet-500 hover:bg-violet-50 hover:text-violet-700 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-violet-500/15"
            >
              Run
            </button>
          )}
          <button
            onClick={onOpen}
            className="rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
