/**
 * The market's block mark as a sidebar panel glyph.
 *
 * The `sidebar.panellist` row belongs to the sidebar: it renders this as the
 * row's direct icon child, hands down the edge it wants, and paints the
 * selected state around it. So the glyph is decorative — no wrapper element,
 * because an inline box would become the baseline of a line box inside the
 * row's glyph slot and lift the mark above the label — and it carries no label
 * of its own. That is the same contract the schedule panel's clock follows in
 * the shipped client.
 *
 * The geometry is market-mark.ts, the one source `MarketLogo` also draws the
 * panel's own mark from, so the sidebar entry and the page it opens cannot
 * drift apart.
 */
import {
  MARK_BLOCK_RADIUS,
  MARK_BLOCK_SIZE,
  MARK_GRID_BLOCKS,
  MARK_PLUG_BLOCK,
  MARK_VIEW_BOX,
} from './market-mark.ts'

/**
 * The sidebar's icon share: the square edge it asks for, and whether this
 * panel is the selected one.
 *
 * `active` is accepted and unused on purpose — the row's selected state is
 * drawn by the sidebar around the glyph, which is why the schedule panel's own
 * icon ignores it too. Taking it here would mean two owners of one state.
 */
export interface MarketPanelIconProps {
  readonly size: number
  readonly active: boolean
}

/**
 * @param props - see {@link MarketPanelIconProps}.
 * @returns the block mark at the requested size.
 */
export function MarketPanelIcon({ size }: MarketPanelIconProps) {
  const plug = MARK_PLUG_BLOCK
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEW_BOX} ${MARK_VIEW_BOX}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {MARK_GRID_BLOCKS.map((block, index) => (
        <rect
          key={index}
          x={block.x}
          y={block.y}
          width={MARK_BLOCK_SIZE}
          height={MARK_BLOCK_SIZE}
          rx={MARK_BLOCK_RADIUS}
        />
      ))}
      <rect
        x={plug.x}
        y={plug.y}
        width={MARK_BLOCK_SIZE}
        height={MARK_BLOCK_SIZE}
        rx={MARK_BLOCK_RADIUS}
        transform={`rotate(${plug.degrees} ${plug.originX} ${plug.originY})`}
      />
    </svg>
  )
}
