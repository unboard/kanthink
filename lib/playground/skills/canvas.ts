/**
 * The canvas skill.
 *
 * Any app where people put things on a surface and arrange them (a whiteboard, a
 * moodboard, a collage, a remix board, sticky notes, a diagram) is built on the
 * kit's InfiniteCanvas (public/kit/v1.js), never hand-rolled. One component,
 * maintained in one place, is how every canvas app gets the same polish: an
 * infinite surface that fills the screen, pan and zoom, transformer handles,
 * multi-select, undo, freehand ink, images dropped or pasted in.
 *
 * isCanvasApp decides when the skill applies; CANVAS_PROMPT is what the builder is
 * told. Change the prompt and the kit together.
 */

/** Words that mean "a surface you arrange things on". A canvas used only to draw a game is not this. */
const CANVAS_WORDS = /\b(infinite canvas|whiteboard|white board|mood ?board|vision board|collage|pin ?board|corkboard|sticky notes?|artboard|remix (board|studio|canvas)|canvas (app|tool|editor|board|workspace)|on a canvas|onto a canvas|the canvas|design canvas|visual canvas|diagram(ming)? (tool|editor|app)|mind ?map|layout editor|drag (and|&|-and-) ?drop (images|photos|items|cards|shapes))\b/i

export function isCanvasApp(...texts: (string | null | undefined)[]): boolean {
  const all = texts.filter(Boolean).join('\n')
  if (/InfiniteCanvas/.test(all)) return true
  // A game drawn on <canvas> keeps its own loop.
  if (/\b(platformer|arcade|shooter|sprite|game loop|requestAnimationFrame)\b/i.test(all) && !/\b(whiteboard|mood ?board|collage|infinite canvas)\b/i.test(all)) return false
  return CANVAS_WORDS.test(all)
}

export const CANVAS_PROMPT = `CANVAS SKILL — this app is a canvas. Build it on the kit's InfiniteCanvas. Do not hand-roll pan, zoom, drag, selection or resize handles, and do not use <canvas> or a library for the board itself.

  import { InfiniteCanvas, imageItem } from 'kit';

  const canvas = useRef(null);
  const [items, setItems] = useState([]);   // load from / save to window.kanthinkData (debounced) so the board survives
  <div className="fixed inset-0">            // the canvas FILLS the screen. Never a box inside a page.
    <InfiniteCanvas
      ref={canvas}
      items={items}                          // [{ id, x, y, w, h, rotation, type, ...anything yours }]
      onChange={setItems}                    // every move, resize, rotate, delete, duplicate, ink stroke, undo
      renderItem={(item, { selected, zoom }) => …}   // fill the item's box: w-full h-full. Ink items ({type:'ink'}) render themselves.
      onDropFiles={async (files, at) => {    // images dropped on the board or pasted (⌘V) land where they fell
        const added = await Promise.all(files.filter(f => f.type.startsWith('image/')).map(f => imageItem(f, at)));
        canvas.current.add(added);           // add() is one undoable change, and selects what it added
      }}
      onItemDoubleClick={(item) => …}        // e.g. edit a note's text in place
      selection={sel} onSelectionChange={setSel}   // optional: control it to show a panel for the selection
    >
      {/* overlays: your own floating panels, absolutely positioned (top-left title, right-side properties panel) */}
    </InfiniteCanvas>
  </div>

What it already does (don't rebuild, don't block): wheel/trackpad pans, pinch or ⌘+wheel zooms at the pointer, two-finger pinch on touch, space-drag / middle-drag / Hand tool pans; click, shift-click and marquee select; drag to move; 8 resize handles plus a rotate handle on one item (shift snaps rotation, images keep their ratio), corner handles scale a multi-selection; Delete, ⌘D duplicate, ⌘Z / ⇧⌘Z, ⌘A, arrows nudge (shift ×10), ] and [ for layer order, V/H/P tools, ⌘0 and ⇧1; a floating toolbar (select, pan, draw with ink colors, undo, redo, zoom, fit); a dot grid that moves with the view.
Ref API: canvas.current.add(items) · zoomToFit() · centerOn(id) · center() (world point at the middle of the view) · screenToWorld(x, y) · getView() · select(ids) · undo() · redo().

How a polished canvas app feels:
- Opens on something: sample items or a one-line empty hint in the middle ("Drop images here, or paste one"), never a blank void with no clue.
- Images render with object-cover inside their box, rounded-md, no borders that fight the selection frame. Text notes: padded, readable at 100%, editable on double-click with a textarea that fills the box.
- Your own controls float over the board (absolute, with bg-card/95, border, shadow, rounded-xl, backdrop-blur) and never cover the bottom-center toolbar. Pass toolbar={false} only if you build an equivalent one.
- Anything that acts on the selection (merge, remix, describe, export) reads the selected items, and says what it will use ("Remix 3 images + your sketch").
- Export: render what's needed (for example draw the selected images onto an offscreen <canvas>) and save it with window.kanthinkDownload.
- Mobile: it is still full screen; panels collapse to a bottom sheet.`
