import { Icon } from './Icon';

export type GridLayout = 'stack' | 'row';
export type BarsShown = 1 | 2 | 'all';

/** Beat › Tracks: Stack or Row layout, how many bars are shown at once, and the pager that moves between them. */
export function GridLayoutControls({ loopBars, layout, onLayout, perPage, onPerPage, pageStart, onPage }: {
  loopBars: number;
  layout: GridLayout;
  onLayout: (layout: GridLayout) => void;
  /** Bars on screen at once while stacked (the whole loop when it all fits). */
  perPage: number;
  onPerPage: (shown: BarsShown) => void;
  pageStart: number;
  onPage: (bar: number) => void;
}) {
  if (loopBars < 2) return null;
  const paged = layout === 'stack' && perPage < loopBars;
  const last = pageStart + perPage - 1;
  return (
    <div className="grid-layout">
      <div className="grid-layout-main">
        <div className="layout-toggle" role="group" aria-label="Layout">
          <button id="layout-stack" className={layout === 'stack' ? 'on' : 'secondary'} aria-pressed={layout === 'stack'}
            onClick={() => onLayout('stack')}>Stack</button>
          <button id="layout-row" className={layout === 'row' ? 'on' : 'secondary'} aria-pressed={layout === 'row'}
            onClick={() => onLayout('row')}>Row</button>
        </div>
        {layout === 'stack' && (
          <label className="bars-shown">Bars
            <select id="bars-shown" aria-label="Bars shown" value={perPage >= loopBars ? 'all' : String(perPage)}
              onChange={(event) => onPerPage(event.target.value === 'all' ? 'all' : (Number(event.target.value) as 1 | 2))}>
              <option value="1">1</option>
              {loopBars > 2 && <option value="2">2</option>}
              <option value="all">All</option>
            </select>
          </label>
        )}
      </div>
      {paged && (
        <div className="bar-pager" role="group" aria-label="Bar shown">
          <button className="secondary" aria-label="Previous bar" disabled={pageStart === 0}
            onClick={() => onPage(Math.max(0, pageStart - perPage))}><Icon name="back" className="inline-icon" /></button>
          <span id="bar-pager-value">{perPage === 1 ? `Bar ${pageStart + 1}` : `Bars ${pageStart + 1}–${last + 1}`}/{loopBars}</span>
          <button className="secondary" aria-label="Next bar" disabled={last >= loopBars - 1}
            onClick={() => onPage(pageStart + perPage)}><Icon name="forward" className="inline-icon" /></button>
        </div>
      )}
    </div>
  );
}
