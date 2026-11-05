"""A06: source-bound v13 clan view is narrowly attested by native C."""
import importlib.util
from pathlib import Path
from unittest import TestCase, main

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("a06_c13",ROOT/"scripts/r25_c_start_root.py")
c=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(c)

class NativeClanV13Attestation(TestCase):
    def test_exact_view_and_definition_pinned(self):
        self.assertEqual(c.PROD_PUBLIC_ADDITIONAL_VIEWS["aoe2war_public_v13"],
                         ("active_clan_directory",))
        self.assertEqual(c.PROD_PUBLIC_ADDITIONAL_DEFINITION_SHA256["aoe2war_public_v13"],
                         "df309879b5bb5570fd29a318c9701a16c9e3da26eebfbb085bd8882ab591ba57")
        self.assertIn("aoe2war_public_v13.active_clan_directory",
                      c.PROD_PUBLIC_APPROVED_IDENTITIES)
        self.assertEqual(len([x for x in c.PROD_PUBLIC_APPROVED_IDENTITIES
                              if x.startswith("aoe2war_public_v13.")]),1)
    def test_no_broader_read_exposure(self):
        self.assertNotIn("public.clans",c.PROD_PUBLIC_APPROVED_IDENTITIES)
        self.assertNotIn("public.clan_members",c.PROD_PUBLIC_APPROVED_IDENTITIES)
        self.assertNotIn("aoe2war_public_v13.clan_member_identifiers",
                         c.PROD_PUBLIC_APPROVED_IDENTITIES)

if __name__=="__main__":main()
