/** UI design slots only: no PAPER sessions, financial data, or execution authority. */
export const PAPER_FLEET_DESIGN_SLOTS = 100;
export const PAPER_FLEET_PAGE_SIZE = 10;
export const PAPER_FLEET_PAGE_COUNT = PAPER_FLEET_DESIGN_SLOTS / PAPER_FLEET_PAGE_SIZE;

export function paperFleetDesignPage(page: number): number[] {
  const safePage = Number.isFinite(page)
    ? Math.max(1, Math.min(PAPER_FLEET_PAGE_COUNT, Math.trunc(page)))
    : 1;
  const first = (safePage - 1) * PAPER_FLEET_PAGE_SIZE + 1;
  return Array.from({ length: PAPER_FLEET_PAGE_SIZE }, (_, index) => first + index);
}
