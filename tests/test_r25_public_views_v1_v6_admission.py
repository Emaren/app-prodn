"""Source-pinned nonfinancial read model v1-v6: exact immutable ACL and catalog."""
import importlib.util
import json
from pathlib import Path
from unittest import TestCase, mock
import unittest

SOURCE=Path(__file__).resolve().parents[1]/"scripts/r25_c_start_root.py"
spec=importlib.util.spec_from_file_location("r25_public_v1_v6_witness",SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    approved={
        schema:{
            "definitions_sha256":m.PROD_PUBLIC_ADDITIONAL_DEFINITION_SHA256[schema],
            "view_names":sorted(names),
            "schema_and_view_access":True,
        }
        for schema,names in m.PROD_PUBLIC_ADDITIONAL_VIEWS.items()
    }
    flags=(
       "restricted_role", "restricted_auth_owner", "no_auth_owner_memberships",
       "definers_pinned_owner_searchpath", "no_memberships", "no_database_create",
       "no_schema_create", "user_projection_callable", "no_direct_table_mutation",
       "no_users_secret_select", "no_unreviewed_table_select",
       "no_unreviewed_column_select", "no_sequence_mutation",
       "no_other_volatile_functions",
    )
    main={k:True for k in flags}
    main.update({
        "session_user":m.PROD_DB_ROLE,"callable_definers":m.PROD_DEFINERS,
        "definer_identity_sha256":"a"*64,"read_acl_sha256":"b"*64,
        "public_read_model":{
            "definitions_sha256":m.PROD_PUBLIC_READ_MODEL_SHA256,
            "exact_view_count":len(m.PROD_PUBLIC_READ_MODEL_VIEWS),
            "schema_and_view_access":True,
        },
    })
    return main,approved


class ProductionExactViews(TestCase):
    def test_exact_whitelist_no_financial_source_or_unexpected_schemas(self):
        self.assertEqual(len(m.PROD_PUBLIC_READ_MODEL_VIEWS),7)
        self.assertEqual(sum(map(len,m.PROD_PUBLIC_ADDITIONAL_VIEWS.values())),12)
        self.assertEqual(len(m.PROD_PUBLIC_APPROVED_IDENTITIES),19)
        self.assertEqual(len(set(m.PROD_PUBLIC_APPROVED_IDENTITIES)),19)
        self.assertNotIn("public.trophies",m.PROD_PUBLIC_APPROVED_IDENTITIES)
        self.assertNotIn("public.api_keys",m.PROD_PUBLIC_APPROVED_IDENTITIES)
        self.assertNotIn("public.bet_wagers",m.PROD_PUBLIC_APPROVED_IDENTITIES)
        for sha in m.PROD_PUBLIC_ADDITIONAL_DEFINITION_SHA256.values():
            self.assertRegex(sha,r"^[a-f0-9]{64}$")

    def test_attests_exact_views_and_read_only_no_mutations(self):
        main,approved=fixture()
        sqls=[]
        def fake(_,sql,password):
            sqls.append(sql)
            return json.dumps(main if len(sqls)==1 else approved).encode()
        with mock.patch.object(m,"production_psql",side_effect=fake):
            result=m.production_database_witness("fixture","redacted")
        self.assertEqual(len(sqls),2)
        self.assertTrue(all("BEGIN READ ONLY;" in sql for sql in sqls))
        self.assertTrue(all("ROLLBACK;" in sql for sql in sqls))
        self.assertIn("aoe2war_public_v6.champions_elo_custody",sqls[0])
        self.assertIn("aoe2war_public_v2.radio_station_display",sqls[0])
        self.assertEqual(result["additional_read_model_sha256"],m.sha(m.canonical(approved)))
        self.assertTrue(result["no_unreviewed_table_select"])

    def test_wrong_view_digest_names_or_private_select_stay_hold(self):
        for mutation in ("definition","name","extra_schema","private_select"):
            main,approved=fixture()
            if mutation=="definition":
                approved["aoe2war_public_v6"]["definitions_sha256"]="0"*64
            elif mutation=="name":
                approved["aoe2war_public_v5"]["view_names"].append("users_credentials")
            elif mutation=="extra_schema":
                approved["aoe2war_public_v7"]=approved["aoe2war_public_v6"]
            else:
                main["no_unreviewed_column_select"]=False
            with self.subTest(mutation=mutation),mock.patch.object(m,"production_psql",side_effect=[json.dumps(main).encode(),json.dumps(approved).encode()]):
                with self.assertRaises(m.Hold):
                    m.production_database_witness("fixture","redacted")


if __name__=="__main__":unittest.main()
