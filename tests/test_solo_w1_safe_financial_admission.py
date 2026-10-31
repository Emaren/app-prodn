"""R13: new SHA requires positive independent CALL-SITE noninterference.

Pure adversarial source-verifier tests; never invent HEL1 signer receipts.
"""
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
import aoe2_solo_website_financial_proof as proof

SAFE="a9525f46302edff88ed073743a7dfaed08be9e3e"
ORIGINAL="b46a51f1592c9f296839924ae55e722618b10d35"

class PositiveW1SafeCallsiteVerification(unittest.TestCase):
    def graph(self):
        public={"app/page.tsx","app/war-chest/page.tsx",
                "app/api/lobby/route.ts","app/api/live-games/route.ts",
                "app/api/bets/route.ts","app/api/header-summary/route.ts"}
        prewarm="scripts/prewarm-production.mjs"
        sinks={"lib/bets.ts::ensureBetMarkets",
          "lib/tournamentProofReconciler.ts::reconcileTournamentMatchProofs",
          "lib/betMarketEnsureQueue.ts::queueBetMarketEnsure",
          "lib/bets.ts::settleResolvedMarketWagers",
          "lib/bets.ts::reconcilePendingCoreBetClaims",
          "lib/bets.ts::settleFounderBonuses"}
        expected=[
          ("app/page.tsx","lib/lobbySnapshot.ts::loadLobbySnapshot"),
          ("app/api/lobby/route.ts","lib/lobbySnapshot.ts::loadLobbySnapshot"),
          ("app/api/live-games/route.ts","lib/liveGamesPublicSnapshot.ts::loadPublicLiveGamesSnapshot"),
          ("app/api/bets/route.ts","lib/bets.ts::loadBetBoardSnapshot[ensureMarkets=false]"),
          ("app/api/header-summary/route.ts","lib/liveGames.ts::loadLiveGamesSnapshot"),
          ("app/war-chest/page.tsx","lib/warChest.ts::loadWarChestSnapshot"),
          (prewarm,"app/page.tsx"),
          (prewarm,"app/api/lobby/route.ts"),
          (prewarm,"app/api/live-games/route.ts"),
        ]
        # Explicit authorized writer exists, but only POST producer reaches it.
        expected.append(("app/api/replay/post-ingest/route.ts::POST",
                         "lib/bets.ts::ensureBetMarkets"))
        nodes=set(public)|{prewarm}|sinks|set(sum(([a,b]for a,b in expected),[]))
        return {"nodes":sorted(nodes),"edges":[list(x)for x in expected],
                "routes":{"GET":sorted(public),"HEAD":sorted(public),
                          "PREWARM":[prewarm]},
                "writer_nodes":sorted(sinks)}

    def scope(self):
        return {"candidate_sha":SAFE,
                "read_side_effect_policy":{
                    "GET":"AUTHENTICATED_PRODUCER_ONLY_FINANCIAL_DISPATCH",
                    "HEAD":"AUTHENTICATED_PRODUCER_ONLY_FINANCIAL_DISPATCH",
                    "PREWARM":"AUTHENTICATED_PRODUCER_ONLY_FINANCIAL_DISPATCH"}}

    def check(self,scope,graph):
        # B's upstream verify_closed_graph is independently tested; a genuine
        # signed native receipt must provide the full source/graph origin.
        with patch.object(proof,"verify_closed_graph",return_value=graph):
            return proof.verify_w1_safe_public_financial_closure(scope)

    def test_authorized_post_writer_can_exist_without_public_read_path(self):
        self.assertTrue(self.check(self.scope(),self.graph()))

    def test_signed_policy_label_alone_is_not_a_path_proof(self):
        g=self.graph()
        g["edges"].append(["lib/lobbySnapshot.ts::loadLobbySnapshot",
                           "lib/bets.ts::ensureBetMarkets"])
        with self.assertRaisesRegex(proof.FinancialProofHold,"W1_SAFE_PUBLIC_READ_REACHES"):
            self.check(self.scope(),g)

    def test_prewarmer_side_effect_path_cannot_hide(self):
        g=self.graph()
        g["edges"].append(["app/api/live-games/route.ts",
                           "lib/betMarketEnsureQueue.ts::queueBetMarketEnsure"])
        with self.assertRaisesRegex(proof.FinancialProofHold,"W1_SAFE_PUBLIC_READ_REACHES"):
            self.check(self.scope(),g)

    def test_missing_read_entrypoint_or_lobby_callsite_holds(self):
        g=self.graph();g["routes"]["HEAD"].remove("app/api/lobby/route.ts")
        with self.assertRaisesRegex(proof.FinancialProofHold,"W1_SAFE_PUBLIC_GET_HEAD"):
            self.check(self.scope(),g)
        g=self.graph();g["edges"].remove(["app/api/lobby/route.ts",
                                          "lib/lobbySnapshot.ts::loadLobbySnapshot"])
        with self.assertRaisesRegex(proof.FinancialProofHold,"W1_SAFE_EXPECTED_PUBLIC_CALLSITE"):
            self.check(self.scope(),g)

    def test_fake_safe_status_or_untested_source_sha_holds(self):
        s=self.scope();s["read_side_effect_policy"]["HEAD"]="UNVERIFIED_NO_PROBE"
        with self.assertRaisesRegex(proof.FinancialProofHold,"W1_SAFE_READ_SIDE_EFFECT"):
            self.check(s,self.graph())
        s=self.scope();s["candidate_sha"]=ORIGINAL
        with self.assertRaisesRegex(proof.FinancialProofHold,"W1_SAFE_SOURCE_IDENTITY"):
            self.check(s,self.graph())

    def test_omitting_money_sink_from_dag_holds(self):
        g=self.graph();g["writer_nodes"].remove("lib/bets.ts::ensureBetMarkets")
        with self.assertRaisesRegex(proof.FinancialProofHold,"SETTLEMENT_CALL_SINKS"):
            self.check(self.scope(),g)

if __name__=="__main__":unittest.main()
