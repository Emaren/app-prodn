import { Prisma } from "../generated/prisma";

type TransactionClient = Prisma.TransactionClient;

/**
 * Storage-only Frontier allocator.
 *
 * Policy about who falls or advances lives in movement/deadline/settlement
 * law. This helper only returns a currently vacant Frontier node, extending
 * the unbounded Frontier when necessary.
 */
export async function ensureVacantWarGraphFrontierNode(
  tx: TransactionClient,
  graphId: number,
): Promise<number> {
  if (!Number.isSafeInteger(graphId) || graphId < 1) {
    throw new Error("WARGRAPH_GRAPH_ID_INVALID");
  }

  const vacant = await tx.warGraphNode.findFirst({
    where: {
      graphId,
      layer: { ordinal: 3 },
      occupancy: null,
    },
    orderBy: [{ ordinal: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (vacant) return vacant.id;

  const frontier = await tx.warGraphLayer.findUnique({
    where: {
      graphId_ordinal: { graphId, ordinal: 3 },
    },
    select: { id: true },
  });
  if (!frontier) {
    throw new Error("WARGRAPH_FRONTIER_LAYER_MISSING");
  }

  const latest = await tx.warGraphNode.findFirst({
    where: {
      graphId,
      layerId: frontier.id,
    },
    orderBy: [{ ordinal: "desc" }, { id: "desc" }],
    select: { ordinal: true },
  });

  const ordinal = (latest?.ordinal ?? -1) + 1;

  const node = await tx.warGraphNode.create({
    data: {
      graphId,
      layerId: frontier.id,
      seatKey: `frontier:${ordinal}`,
      ordinal,
      angularSeed: ordinal,
      presentation: {},
    },
    select: { id: true },
  });

  return node.id;
}
