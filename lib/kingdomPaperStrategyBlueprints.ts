/**
 * Educational PAPER research blueprints only. These are not configured bots,
 * accepted financial parameters, investment advice or executable strategies.
 * No live asset market, exchange, funding, PnL or wallet data is represented.
 */
export const PAPER_BLUEPRINT_RESEARCH_UNIVERSE = {
  bases: ["BTC", "ETH", "SOL"],
  referenceQuotes: ["USDT", "USDC"],
  proposedVenues: ["Kraken", "Coinbase"],
} as const;

export const PAPER_STRATEGY_BLUEPRINTS = [
  {
    id: "twin-blades",
    name: "Twin Blades",
    tagline: "Two-sided exposure · hypothesis only",
    premise:
      "Study opposing long and short legs as a paper hedge. Equal size does not guarantee equal risk, matched fills, or delta neutrality.",
    legs: [
      {
        name: "Long leg",
        role: "Observe the long-side entry, fee assumptions and adverse movement before evaluating a hedge.",
      },
      {
        name: "Short leg",
        role: "Observe the short-side entry, funding or borrow assumptions and independent liquidation risk.",
      },
    ],
    questions: [
      "Do fees, spread and slippage overwhelm the proposed edge?",
      "Does exposure remain near the intended hedge after unequal fills?",
      "How do funding, borrow costs and gap moves change the outcome?",
    ],
    studyPlan: [
      "Document entry and hedge assumptions in a PAPER-only experiment.",
      "Record both legs independently with hypothetical execution costs.",
      "Inspect drawdown, unmatched exposure, and exits before changing any threshold.",
    ],
  },
  {
    id: "pincer",
    name: "Pincer",
    tagline: "Staged entries · hypothesis only",
    premise:
      "Study coordinated entries around a defined market scenario. A staggered long/short plan can increase exposure when conditions diverge.",
    legs: [
      {
        name: "First observation",
        role: "Define an entry trigger, its invalidation condition and the planned maximum exposure.",
      },
      {
        name: "Second observation",
        role: "Evaluate the counter-position or staged response independently; never assume either leg will fill.",
      },
    ],
    questions: [
      "What happens when only one trigger executes or the market gaps?",
      "Does the combined position exceed the planned drawdown limit?",
      "Can an exit rule be tested without relying on impossible fills?",
    ],
    studyPlan: [
      "Write the entry and invalidation sequence before reviewing outcomes.",
      "Model missing fills, slippage and delayed second-leg activation in a future simulator.",
      "Compare adverse scenarios and stop conditions before any PAPER engine admission.",
    ],
  },
] as const;

export type PaperBlueprintId = (typeof PAPER_STRATEGY_BLUEPRINTS)[number]["id"];

export function paperStrategyBlueprint(id: PaperBlueprintId) {
  return PAPER_STRATEGY_BLUEPRINTS.find((blueprint) => blueprint.id === id) ??
    PAPER_STRATEGY_BLUEPRINTS[0];
}
