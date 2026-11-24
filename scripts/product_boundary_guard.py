#!/usr/bin/env python3
"""PRODUCT source/output authorization. Policy control, NOT an OS/DB/network sandbox.

No task payload is executed by this module. No directory or artifact is created.
The CLI checks the exact checked-out source and changed paths before CI continues.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys

ORIGINS = {
    "Emaren/app-prodn": {
        "https://github.com/Emaren/app-prodn",
        "https://github.com/Emaren/app-prodn.git",
        "git@github.com:Emaren/app-prodn.git",
    },
    "Emaren/kingdom-traders": {
        "https://github.com/Emaren/kingdom-traders",
        "https://github.com/Emaren/kingdom-traders.git",
        "git@github.com:Emaren/kingdom-traders.git",
    },
}
APPROVED_SOURCE = {
    "scripts/product_boundary_guard.py",
    "scripts/product_signed_promotion_gate.py",
    "tests/test_product_boundary_guard.py",
    ".github/workflows/product-boundary.yml",
}
# Single independently inspectable executable-source admission; this is NOT a
# wildcard scripts/ allowance. Future source bytes/base require new review.
EXACT_REVIEWED_SCRIPT = "scripts/kingdom_index_source_audit.mjs"
EXACT_REVIEWED_BASE = "3933f695ec48d4e2cab68e93194b745fab2e4b7d"
EXACT_REVIEWED_SHA256 = "185defe7f93ea39bf1829b7a8eaf4a48f050b50d40ad1438c9be9ca468326a01"
# Existing source history stays admitted ONLY at its former exact base/hash.
# Factory V1 adds one source-reviewed inventory entry, no script wildcard.
EXACT_REVIEWED_FACTORY_BASE = "9f7b56f536ba51b4678ac43baebfae140ada6479"
EXACT_REVIEWED_FACTORY_SHA256 = "bb613ddbd9203f5ad5f2f19be8521db2dc64e03e36e7e4872da0f2b01c1beab8"
# Next dynamic route segments are deliberately NOT admitted by the general
# path grammar. This is one reviewed, immutable route blob and one exact base.
EXACT_REVIEWED_DYNAMIC_ROUTE = "app/api/media-assets/[kind]/[target]/route.ts"
EXACT_REVIEWED_DYNAMIC_BASE = "753c3631a12483c70e1538ccc3b087839677ff9d"
EXACT_REVIEWED_DYNAMIC_SHA256 = "bb1433119e955fd4e7bf9c6d2ecdcb64b0566ed01eef203d9fc224e1b5ba7243"
# Explicit owner-authorized PRODUCT Deployment OS source admission. These four
# SHA256-pinned scripts were reviewed as one source-bound set against the exact
# R1 canonical main base. This grants code REVIEW ONLY, not root execution or
# any extension of authorize_task / the actual 3032 admission boundary.
EXACT_REVIEWED_DEPLOYMENT_OS_BASE = "6f413a39864c7f54f3e3574150ca396819702416"
EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE = {
    "scripts/aoe2_product_release.py":
        "7b772e89781b1d09879866bf375e51ba873af22c579dfb73f6f45795379bf218",
    "scripts/aoe2_product_release_ledger.py":
        "d452f3b0fc31641beeab9ee4df5e6f29a64289faa3f25aa3fca46b60bda83bd9",
    "scripts/aoe2_product_release_transport.py":
        "2a5563f3b7a846839edfbccf8293a8bea4d65d9c32bc4e00bb7eed40074b4894",
    "scripts/aoe2_product_retention.py":
        "a169f1ddd6c541e45c05b3792750931e9ddfa6164399aabe998dc724924e53ae",
}
# F1 exact-source review, additive to the frozen historical R1 admission above.
# This is source admission only, NOT a production root install or owner permit.
# No script wildcard, source identity and base remain strictly pinned.
EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE = "1b6e36e2bf4b823b9192488f12074798232c22ab"
EXACT_REVIEWED_DEPLOYMENT_OS_F1_SOURCE = {
    'scripts/aoe2_product_release.py': 'b05d84de19ee5d28b637e916f9b678556719a3225ad42e356e18897eb1642dc4',
    'scripts/aoe2_product_release_ledger.py': 'd452f3b0fc31641beeab9ee4df5e6f29a64289faa3f25aa3fca46b60bda83bd9',
    'scripts/aoe2_product_release_transport.py': '1acc38ea67ec2f90ce7356541aa986515ab0fe1386292ef06a9f9010222d330a',
    'scripts/aoe2_product_retention.py': 'a169f1ddd6c541e45c05b3792750931e9ddfa6164399aabe998dc724924e53ae',
    'scripts/run_python_contract.py': '46152c770ea9fa63bd4187e12db9a7977450187e8097bbbcfa4a650732bc9657',
    'scripts/run_test_contract.py': '9ba61bcc1cc1c5edb8f2742dbad4b88aeef1e876ad2b5776abe5c5a830ef51bf',
}
# WE2/B exact reviewed protected-browser census admission for the canonical
# 2026-11-15 PRODUCT base. This is only a single immutable script blob; it does
# not authorize its execution, B signing, a new route, financial access, or
# arbitrary scripts. Next script byte/base change requires another review.
EXACT_REVIEWED_B_BROWSER_SCRIPT = "scripts/aoe2_r25_g_browser_acceptance.py"
EXACT_REVIEWED_B_BROWSER_BASE = "f436d6f3c1a04308e33b17db4a69c25a2d925fcf"
EXACT_REVIEWED_B_BROWSER_SHA256 = "0a5c7e1ae073da09e1d20c11aa3467c99dac701ebe39af43ca9673a58cd2cd11"
# One owner-attended B/OS admission for the *exact reviewed* 2026-11-16
# appearance transport guard. Neither the B branch nor scripts are wildcarded.
# A new base/guard byte requires a separately reviewed new policy change.
EXACT_REVIEWED_B_EMBER_BRANCH = "session-b/ember-november-polish-20261116"
EXACT_REVIEWED_B_EMBER_BASE = "d36e9f98e44b0a4de438c5cc623706873c333ca5"
EXACT_REVIEWED_B_EMBER_GUARD = "scripts/r25_b_guard_production_v1.cjs"
EXACT_REVIEWED_B_EMBER_SHA256 = "8edbc84bcb02933ca6955a9abe7f417172247108be8f8ecd91985355e181f6f1"

# WE3 Q09/Q17 40-link PAPER menu: one exact immutable Chrome acceptance
# source, only for the original reviewed #1415 branch and canonical base.
# This is a SOURCE REVIEW CANDIDATE, not a second reviewer endorsement,
# root permission or live website deployment authority. No wildcard scripts.
EXACT_REVIEWED_KINGDOM_MENU_BRANCH = "session-c/we3-kingdom-traders-menu-visibility-20261118"
EXACT_REVIEWED_KINGDOM_MENU_BASE = "81640c7d834c252fb1680190b3f431bd4beb3e58"
EXACT_REVIEWED_KINGDOM_MENU_SCRIPT = "scripts/r25_public_kingdom_menu_chrome.cjs"
EXACT_REVIEWED_KINGDOM_MENU_SHA256 = "c75151d78d67f0c83ac6b79d568e252630fe3f154a2f7df1d1a049edaeaface2"

# C/WE1 one-object Prisma DOCUMENT review. Never permits schema/migrations/SQL.
# This exact reviewed payload is a schema REFERENCE, not a DB write permit.
EXACT_C_PRISMA_DOC_PATH = "prisma/README.md"
EXACT_C_PRISMA_DOC_BRANCH = "session-c/we1-prisma-readme-protected-review-20261122"
EXACT_C_PRISMA_DOC_BASE = "6f900b1e7bf9ed96486bebdb6b17624b14c1a942"
EXACT_C_PRISMA_DOC_SHA256 = "3d19ba793326f3d03e1509ae1ce6e0d39ac832570b125f4ef3f1734343613816"
EXACT_C_PRISMA_DOC_TEST_SHA256 = "fde644a3adbf3b7a4d9bd26de66ffa5387b6cf93680b6d6d7ada4f8c13e45afc"
EXACT_C_PRISMA_WE3_DOC_SHA256 = {
    "DEPLOY.md": "7d4cce17f73e83257a7dc7488c11cee8a37f7be178f9e1b9de00a8641eba9b6b",
    "docs/PARSER_OBSERVATORY.md": "4002ace1b36a2ffbb18985df402c8382a7cac41a5b959f3b6db89479e0d07171",
    "docs/WAR_ROOM_FORUM.md": "e0fdc110a01c2eb05ee833d952cb6323dc12b5d5f5ffaab05cb4803a73526612",
}
EXACT_C_PRISMA_DOC_REQUIRED = frozenset({
    EXACT_C_PRISMA_DOC_PATH,
    "scripts/product_boundary_guard.py",
    "tests/test_c_prisma_doc_admission.py",
}) | frozenset(EXACT_C_PRISMA_WE3_DOC_SHA256)
EXACT_C_PRISMA_DOC_OPTIONAL_DOCSV2 = frozenset({
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
})

# C/WE1 one exact, nonexecuting Scan OS catalog/planner admission.
# Source-only; does NOT grant scanner execution, receiver, schedule or delete.
EXACT_C_SCAN_OS_BRANCH = "session-c/we1-scan-os-exact-review-20261122"
EXACT_C_SCAN_OS_BASE = "204bf5c37560dfd705ee0b46803eec3ad396b082"
EXACT_C_SCAN_OS_HASHES = {
    "scripts/scan_os.py": "7fe37c5b934e4f912814dfa9efb6988692e37da31de3d47ca3450a49e841320a",
    "config/scan-os-catalog.v1.json": "5399ba92c6b93de08bc3f78c74847b88656d2371a5d21102035455209209e794",
    "tests/test_scan_os.py": "b6d22508eb694a5812451451a25104bff34cbd87f29c4ba073172c0cd2fa92aa",
    "tests/test_scan_os_we1_adversarial.py": "ddb268159bf89b8d7d249b618d78360d5968681e913a04c22d0254b4000bb48f",
    "tests/test_c_scan_os_source_admission.py": "a6f20d044d136f897df973ad9b7847a54b9f078ff92ac76eba1f30a7a7a810aa",
}
EXACT_C_SCAN_OS_REQUIRED = frozenset(EXACT_C_SCAN_OS_HASHES) | {
    "scripts/product_boundary_guard.py",
}
EXACT_C_SCAN_OS_OPTIONAL_DOCS = frozenset({
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
})

OUTPUT_PREFIXES = ("artifacts/product-boundary/", "reports/product-boundary/")
DENIED_NAMES = {
    "financial", "finance", "custody", "wallet_signing", "wallet-signing",
    "secrets", "credentials", "private_keys", "signer", "reviewer",
    "payout", "payouts", "settlement", "native_finance", "native-finance",
    "live_orders", "real_orders", "recovery", "owner-private-recovery",
    "financial.sql", "dockerfile", "sudoers",
}
DENIED_SUFFIXES = {".sql", ".sh", ".bash", ".zsh", ".command", ".pem", ".key", ".p12"}
DENIED_DIRS = {"prisma", "systemd", "infra", "ops", ".ssh", ".aws", ".kube"}
DENIED_TEXT = ("execute-shell", "run-arbitrary-command", "8092", "8093", "8094", "8095")
ALLOWED_TASK_ARGV = (
    ("python3", "-I", "-B", "scripts/product_boundary_guard.py", "--check"),
    ("python3", "-I", "-B", "-m", "unittest", "discover", "-s", "tests",
     "-p", "test_product_boundary_guard.py", "-v"),
)
SHA = re.compile(r"^[a-f0-9]{40}$")
# One WE2 protected Factory source review. The two source blobs and original
# Chronicle main base are immutable pins, not a standing release authority.
# Future controller code, new branch or base require another exact review.
EXACT_WE2_FACTORY_BRANCH = "we2/factory-v3-incident-recovery-20261119"
EXACT_WE2_FACTORY_BASE = "6da478878478d2f32ceb2efba06c8a6a2c043301"
EXACT_WE2_FACTORY_SHA256 = {
    "scripts/aoe2_product_release.py":
        "84d9a0e277595b1492d88f19e7c9829dc2896929738328ec37419c792f1f23f5",
    "docs/release/artifacts/aoe2war_product_release_controller_v3.py":
        "3ca35f437b8da2f366f3d0f84662563dd68e5d9d4caf4cd31038ec0f9145c064",
    "tests/test_product_controller_recovery.py":
        "6eda90f9e39646657916b02d07993567c694f6f49e0906afb00b400e8aebdaaf",
}
# Kingdom menu was legitimately merged as canonical main after this Factory
# controller was installed. Preserve its up-to-date reviewed documents; this
# exact replay updates ONLY the DocsV2 registry for the source baseline.
# All three root/runner/test SHA pins and negative guards stay unchanged.
EXACT_WE2_FACTORY_DOCS_REVIEW = frozenset({
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
})
EXACT_WE2_FACTORY_CHANGED = frozenset(EXACT_WE2_FACTORY_SHA256) | {
    "scripts/product_boundary_guard.py", "tests/test_product_boundary_guard.py"
} | EXACT_WE2_FACTORY_DOCS_REVIEW

# 2026-11-23: one independent DATA-transport Factory source-only review.
# This admission changes NO historical WE2 v3/retention pins; it authorizes
# review of exact source blobs only, not host installation or WEBSITE T7.
EXACT_WE2_FACTORY_DATA_BRANCH="we2/factory-data-transport-20261123"
EXACT_WE2_FACTORY_DATA_BASE="f833d7e633cee4b36f1427fa45d76081fa0796ef"
EXACT_WE2_FACTORY_DATA_PINS={
    'docs/release/artifacts/aoe2war_factory_data_stage_v1.py': '96e9c5a693e55ba5475a44eba15aef3db9fd5d2b5fb2f296b7ca3eb89656c87d',
    'docs/release/artifacts/aoe2war_prepare_product_manifest_v2.py': '063e944565cf5ce8033844aef869dc90f3b64b75ceb975ca86ec9c9dbe6e1051',
    'docs/release/artifacts/aoe2war_product_release_controller_v3.py': 'fb31b5a8d9a95f67502f894bb88e27113d333c0f7da955c4e930cb7e0eaa748f',
    'scripts/aoe2_product_release.py': '59bb422dc3efaf5987dcda75b2dd48cfc7ae682adef5317a8f67f4a221d9c0ab',
    'tests/test_factory_data_publisher_v1.py': '1d9a1fd9bcf3ab475ea3439eec565abb382980254c5df6e19e645468e29494b4',
    'tests/test_factory_data_stage_v1.py': '14f54b6128946cb5322aaecdd66c0f599c9e1d189b5b4cba48570e62866529f9',
    'tests/test_product_release.py': '9c319843a47d27abdc616ccef80ec2692eb2b5d5a43d3ca034030cea83401306',
    'tests/test_product_release_recovery.py': 'f926c8b2ed37151525ac7f17742ded5b6d68f8c8b241cb837b19e33f2810ae3e',
    'tests/test_product_controller_recovery.py': '4ea4c27a7930e4d39b31f0c4c3da3df368c71812cdfbe170fc2f1845592e5594',
 }
# WE1's ten genuinely rereviewed documents, integrated from the exact
# stacked #1488 review head c7daa1a9. Only these exact bytes are admitted.
# Generated DocsV2 registry/index are checked by ORIGINAL docs_v2_check.py
# rather than hardcoding their hashes here (which would circularly invalidate
# their non-document implementation baseline on every policy change).
EXACT_WE2_FACTORY_DATA_DOC_PINS={
    'docs/OPERATOR_START_HERE.md': '7465afac5c438dd6b352f3c3efa727ec8db558fedcebfb2fd7c5e4215ed4faf5',
    'docs/PLAYER_IDENTITY_DISCOVERY_WAVE2.md': '667f2b74aa2053401c8e6614c2e5c8560754916d63b10ec5ec607cfc0e5fac60',
    'docs/SESSION_A_R25_BETS_PUBLIC_HISTORY_READMODEL_20261107.md': 'a702055899cfdc116ff481dbe5873673bb56efba051722f16a4064c487ffd966',
    'docs/SESSION_A_R25_PUBLIC_NONFINANCIAL_RECOVERY_V5U_20261107.md': 'dc0c803be3fa81476025e4c6a89ca4145077e90b49a8e1d06d484ccc04804b35',
    'docs/SESSION_A_R25_STEAM_V5V_PROTECTHOME_REPAIR_20261107.md': '011ced68aa01caffb6f70a2dd4711caf7561029b398c7f3b0cb1384402839be1',
    'docs/SESSION_B_R25_STEAM_REFRESH_RESTART_REVIEW.md': '19cf19684bf156db8f123a3fd7a92c51f8b4535857668d88d6563686a9b69be7',
    'docs/SESSION_B_R25_STEAM_V5T_EXPIRY_RACE_REVIEW.md': '226126ab408094a1f46bbb50982d2d4d07da20783e54428c371b80c58986938a',
    'docs/STAKING_TREASURY_PAYOUTS.md': 'ee7ea6dc4d2ed7b4e4a30fcf40e5a6adad6664028d7fc4038f68816ddc0a9b23',
    'docs/WARGRAPH_V1.md': '31d6f0acc7fadfd46dc784fb0bc786723bd7e820047603a107b999bd1be9cee6',
    'docs/WATCHER_NATIVE_STREAM_HANDOFF.md': 'ca0a26ebe1c97d2f1a12694c3a3af599fb0ccb3c3b1f2568702d9aecf7bc3bae',
 }
EXACT_WE2_FACTORY_DATA_DOC_GENERATED=frozenset({
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
})
EXACT_WE2_FACTORY_DATA_CHANGED=(frozenset(EXACT_WE2_FACTORY_DATA_PINS)
    |frozenset(EXACT_WE2_FACTORY_DATA_DOC_PINS)
    |EXACT_WE2_FACTORY_DATA_DOC_GENERATED)|{
    "scripts/product_boundary_guard.py",
    "tests/test_product_boundary_guard.py",
}

# WE2 post-T10 Factory V3 invocation-only repair. Historical DATA-stage SHA
# pins remain immutable. This admits exactly the new reviewed source + tests
# from canonical main without authorizing a WEBSITE permit or T7-T10 replay.
EXACT_WE2_FACTORY_V3_RECEIPT_BRANCH = "we2/factory-v3-invocation-reconciliation-20261124"
EXACT_WE2_FACTORY_V3_RECEIPT_BASE = "f14bf4625ed124beafe80dc34188dcb7da16daa0"
EXACT_WE2_FACTORY_V3_RECEIPT_PINS = {
    "scripts/aoe2_product_release.py":
        "5f261cd84bf54a05e6d462d368708e143b816a8f0abad47def41ccf4841bd454",
    "tests/test_product_deployment_invocation.py":
        "d888e194153f48a5fa7daf05acba89c23d40a1dc43ca9d8fde255a80b219d99a",
}
EXACT_WE2_FACTORY_V3_REVIEWED_DOC_PINS = {
    'docs/R25_B3_OPERATOR_EVIDENCE_RELEASE.md': '72c4f17896d9ef6a99cb4ad12c7fa53f2c24bdad56db2567c38152c17a43e0c2',
    'docs/R25_B4_KINGDOM_GRAPH_RELEASE.md': 'a1d46cb0dfcccc452cedfe44fdab39bae55626942cccad11dab97b16c0324237',
    'docs/SESSION_B_AI_SYSTEM_PERSONA_STEAM_BADGE_TRUTH_20261108.md': 'a278607d713aab54426074ccdf7bb238f56751186d03cf8b20fb67a3f7371a54',
    'docs/SESSION_B_MANAGED_MEDIA_FALLBACK_CACHE_RECOVERY_20261108.md': '9a5be6f084ba809c5bf655cc72a7a2c602c22e7be7f31cdac6507c9df8c48148',
    'docs/SESSION_B_PENDING_WOLO_PUBLIC_PRESENTATION_TRUTH_20261108.md': 'f5fe36b2e669bd480f6f14b1d15b4a837b9d6d1c62001854640d84b42d0d28cb',
    'docs/SESSION_B_PRIVATE_PENDING_GIFT_PUBLIC_CONSENT_20261108.md': 'a3549f1952e1a6e08c372964b5e336d3d2c7f4d6fe309fcdf36c655573262f3b',
    'docs/SESSION_B_R25_PUBLIC_PHYSICAL_RELEASE_20261108.md': 'cc00d413e77741f658378c3cf18dcddaa3da601695690f6884b16254f999f18f',
    'docs/SESSION_B_R25_STEAM_POSTCUTOVER_REPAIR_20261108.md': '9578fec04e4689da8b963f7976e62150cffa12f205c1509ff191ac6cecb6011f',
    'docs/SESSION_B_RESTRICTED_PUBLIC_REPLAY_READMODEL_20261108.md': 'd00d4ba9128c653724aa99c2b20f3fc6302d489b0fb65ecd30400ec1613f6030',
    'docs/SESSION_B_STEAM_V8_EXACT_RUNTIME_RELEASE_20261108.md': '648a1808ed35b68a63e5141e1bfd6e98e1e45392ff85ab49b1100ea1b5bee018',
    'docs/SESSION_B_TRAFFIC_CANONICAL_SINGLE_CHART_CORRECTION_20261108.md': '5ef5dccd95f8354ac375a95fad31d18b71edc08b11845f12614a640aa2a6d36a',
    'docs/SESSION_B_TRAFFIC_CURRENT_OBSERVATION_PUBLIC_VIEW_20261108.md': 'a07901d5aa4ed54118afd5e74ed72d357b9da85b8398c2684e6cc7910f7454c1',
    'docs/SESSION_B_TRAFFIC_STEAM_V7_SINGLE_RUNTIME_RELEASE_20261108.md': 'e7cbd7bd5a4aeb775c6e2dd698d18d48b25395bdbf5f9e85c22be7a853393ae8',
}
EXACT_WE2_FACTORY_V3_RECEIPT_GENERATED = frozenset({
    "docs/DOCUMENTATION_CONTROL_PLANE.md", "docs/document-registry.json",
})
EXACT_WE2_FACTORY_V3_RECEIPT_CHANGED = (
    frozenset(EXACT_WE2_FACTORY_V3_RECEIPT_PINS) |
    frozenset(EXACT_WE2_FACTORY_V3_REVIEWED_DOC_PINS) |
    EXACT_WE2_FACTORY_V3_RECEIPT_GENERATED |
    {"scripts/product_boundary_guard.py", "tests/test_product_boundary_guard.py"}
)

# WE2 separately reviewed public V3 invocation projection. Retain historic
# exact DATA and ninth-root pins; this is source review only, never ROOT install.
EXACT_WE2_V3_PUBLIC_BRANCH = 'we2/factory-v3-public-publisher-source-20261124'
EXACT_WE2_V3_PUBLIC_BASE = 'd7797cf7e34b230031193c563e7505b3c2b55c64'
EXACT_WE2_V3_PUBLIC_PINS = {
    'docs/release/artifacts/aoe2war_factory_public_status_v2.py': 'e1ba18b10824a00b3d942d94b7748a2d66fc20d6b100b402130ea89552c050af',
    'scripts/aoe2_product_release.py': 'e34dda657b6a1d4ce06ce800e5eeb3ea06a5818b45f2e6dfe623b3f383480a90',
    'tests/test_factory_public_status_v2.py': '22c103c203f5604bce9ad73c60c147609fc7a8eaac90f04403af5de64fc249bd',
    'tests/test_product_factory_publication.py': 'a46a33d359795286eae3303847a2efd1631bc4e668db353a911e933cef958c3e',
    'scripts/release/we2_factory_v3_public_publisher_reconcile_20261124.py': 'a8ef33b00a6669d60ec1e332f784e1fd8f86faea8cd52b8756286b0d4b1ced55',
    'tests/test_we2_factory_v3_public_publisher_reconcile.py': 'aa08b72b83bfd04f4a17650dfc013821eb1571409eb4cc8836ae7635a2bdd675',
}
EXACT_WE2_V3_PUBLIC_GENERATED = frozenset({
    "docs/DOCUMENTATION_CONTROL_PLANE.md", "docs/document-registry.json"
})
EXACT_WE2_V3_PUBLIC_CHANGED = (
    frozenset(EXACT_WE2_V3_PUBLIC_PINS) | EXACT_WE2_V3_PUBLIC_GENERATED |
    {"scripts/product_boundary_guard.py", "tests/test_product_boundary_guard.py"}
)

# WE2 root-security source review: one branch/base with immutable candidate
# guard/proxy bytes. This is *not* a scripts/ or WE2 wildcard.
# WE1 independently reviewed *new* original Factory post-T10 retention source.
# This does NOT inherit the 2026-11-19 v3 exception, grants no retire/copy,
# and binds exact branch, base, bytes and the entire changed-file set.
EXACT_WE2_FACTORY_RETENTION_BRANCH = "we2/factory-post-t10-retention-20261122"
EXACT_WE2_FACTORY_RETENTION_BASE = "5ead114347294b345a34700dffdc456c2bcc86ba"
EXACT_WE2_FACTORY_RETENTION_PINS = {
    "scripts/aoe2_product_release.py":
        "db53626c6b42944c47bffd7c6a2474a4355d8f6f5a28775c98e4214e6b689015",
    "scripts/aoe2_factory_retention_post_t10.py":
        "81eeea068721bf751d11366b13d6c75f876bce72d3629e58cde6b3f31151ca12",
    "tests/test_factory_retention_post_t10.py":
        "723b42341d91ff63201c723b1f4f3f132efa9c864ac602414e31b4a11e652b11",
}
EXACT_WE2_FACTORY_RETENTION_CHANGED = frozenset(EXACT_WE2_FACTORY_RETENTION_PINS) | {
    "scripts/product_boundary_guard.py",
    "tests/test_product_boundary_guard.py",
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}


EXACT_WE2_STORAGE_BRANCH = "we2/storage-protected-ingress-20261120"
EXACT_WE2_STORAGE_BASE = "815d66ef94900d29bb50b7241dc47927a4343955"
EXACT_WE2_STORAGE_PINS = {
    "scripts/r25_b_guard_production_v1.cjs":
      "8e066dbb57c935f18b9198a40290e5efa717b6f21c892fcc077400d986ff4930",
    "docs/release/artifacts/aoe2war_storage_visual_exact_ingress_v1.conf":
      "463d7b269418d28663171a7b91d923146ca807f955ba5e217e9dbc47eefeaf10",
    "docs/release/artifacts/aoe2war_storage_visual_web_store_v1.conf":
      "7ee7e39536841eff01bcf85eccb9d28edcf7411532e1a5e8952edabdc2cf5705",
    "tests/test_r25_production_node_guard.py":
      "034758434e1c51b2f1165bac9f4116317d332f8b139c48c48899c8a485c16b44",
    "tests/test_we2_storage_visual_exact_ingress.py":
      "7d4f5daa73cdd2e73e20b9745bd9c01cf59f2e2628f06aea453a59e0dbed18b3",
    "docs/release/WE2_STORAGE_VISUAL_PROTECTED_INGRESS_20261120.md":
      "a45ddc319b26ef5390f2d8a36eb8febac8d208c9f5df8022e321d980d0386b20",
}
EXACT_WE2_STORAGE_CHANGED = frozenset(EXACT_WE2_STORAGE_PINS) | {
    "scripts/product_boundary_guard.py",
    "tests/test_product_boundary_guard.py",
    # DocsV2 implementation index is a source-owned *documentation-only*
    # commit after the exact executable implementation baseline.
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}
# New exact bridge dual-path review. Preserve the historical storage-source
# pins unchanged; no branch wildcard, arbitrary exec file or root authorization.
EXACT_WE2_BRIDGE_BRANCH = "we2/bridge-dual-path-20261121"
EXACT_WE2_BRIDGE_BASE = "1bb42c53ebd44bc22b07a3b64862d39f457fb529"
EXACT_WE2_BRIDGE_PINS = {
    "app/api/internal/aoe2war-os/bridge/route.ts":
        "ededff41f0a633d089bd92e1059c2569723f79c65b3dc52b7cb69bdfbe3de96f",
    "scripts/r25_b_guard_production_v1.cjs":
        "87308f4d23b78d275eadd7705269014f6a2bc4620f5977eece76e7f2efa939fa",
    "tests/private-storage-visual-bridge.test.mts":
        "482f56d5b31f50cc0869f617cb5b17b107fb288a5600b60d05cd68a5578e8602",
    "deploy/aoe2war-bridge-dual-path.nginx.inc":
        "1d0bf51aa269c7695c4f5cdc2a65219d707064aa058b270aa56b5604a988d19b",
    "tests/bridge-dual-ingress-contract.test.mts":
        "f76f9d898690ce8a46e4ac2b188bb260be05a0182f7e72f708fcfb8e94081b27",
}
EXACT_WE2_BRIDGE_CHANGED = frozenset(EXACT_WE2_BRIDGE_PINS) | {
    "scripts/product_boundary_guard.py", "tests/test_product_boundary_guard.py",
    "docs/DOCUMENTATION_CONTROL_PLANE.md", "docs/document-registry.json",
}
# Proposed exact nonfinancial R25 Chat source admission (PR #1510).
# Source-only; review of this policy itself is mandatory. No host/SQL authority.
EXACT_WE2_R25_CHAT_BRANCH = "we2/r25-chat-media-exact-20261124"
EXACT_WE2_R25_CHAT_BASE = "9eca0d03fb8d7238a42e1f9363214b68907656ce"
EXACT_WE2_R25_CHAT_PINS = {'scripts/r25_b_guard_production_v1.cjs': '9f45ceac2c3b40d6d2245b1474d16449b6f240e444f5ba0b24f51c67aa01f4cc', 'tests/test_r25_production_node_guard.py': 'cb1f80759881a3e49656b2bd6882b6b264280f312043d99d203ab2592138dd03', 'tests/r25_chat_native_node22.test.cjs': '547f5158c782a008671d269be0438de003784ba9e5905a7f082c6c775cf14e55', 'tests/test_product_boundary_guard.py': '6a01b0c585703a9de96306cfb8eea20ff5171ba9c3d68e56bd2170c13da87521', 'tests/test_we2_r25_chat_exact_admission.py': 'e46b9cf12d30b8affd530c45c9a78a48d0187686c3f11425dacf6fd47e65addc'}
EXACT_WE2_R25_CHAT_CHANGED = frozenset(EXACT_WE2_R25_CHAT_PINS) | {
    "scripts/product_boundary_guard.py", "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}
BRANCH = re.compile(r"^(?:session-c/[a-zA-Z0-9._/-]+|session-b/ember-november-polish-20261116|we2/factory-v3-incident-recovery-20261119|we2/storage-protected-ingress-20261120|we2/bridge-dual-path-20261121|we2/factory-post-t10-retention-20261122|we2/factory-data-transport-20261123|we2/factory-v3-invocation-reconciliation-20261124|we2/factory-v3-public-publisher-source-20261124|we2/r25-chat-media-exact-20261124|main)$")
REPO = re.compile(r"^Emaren/(?:app-prodn|kingdom-traders)$")
SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9._+-]+$")


class BoundaryHold(ValueError):
    pass


def relative_path(raw: str) -> PurePosixPath:
    if not isinstance(raw, str) or not raw or "\x00" in raw:
        raise BoundaryHold("EMPTY_OR_NUL_PATH")
    if raw.startswith(("/", "~", "\\", "$")) or re.match(r"^[a-zA-Z]:", raw):
        raise BoundaryHold("ABSOLUTE_OR_EXPANDING_PATH")
    if "\\" in raw or "//" in raw:
        raise BoundaryHold("NONCANONICAL_SEPARATOR")
    pieces = raw.split("/")
    if any(x in {"", ".", ".."} or not SAFE_COMPONENT.fullmatch(x) for x in pieces):
        raise BoundaryHold("TRAVERSAL_OR_UNSAFE_COMPONENT")
    if any(x == ".git" for x in pieces):
        raise BoundaryHold("GIT_METADATA_FORBIDDEN")
    return PurePosixPath(raw)


def authorize_source(raw: str) -> str:
    path = relative_path(raw)
    parts = tuple(x.lower() for x in path.parts)
    if any(x in DENIED_DIRS or x in DENIED_NAMES for x in parts):
        raise BoundaryHold("PROTECTED_SOURCE_NAMESPACE")
    if any(x in str(path).lower() for x in DENIED_TEXT):
        raise BoundaryHold("PROTECTED_NATIVE_OR_EXEC_SURFACE")
    if path.suffix.lower() in DENIED_SUFFIXES:
        raise BoundaryHold("PROTECTED_FILE_TYPE")
    if parts[0] in {"scripts", ".github"} and str(path) not in APPROVED_SOURCE:
        # General nonfinancial tests are allowed, but scripts/workflows are
        # restricted execution surfaces requiring a separate reviewed change.
        raise BoundaryHold("UNREVIEWED_EXECUTABLE_SURFACE")
    return str(path)


def exact_we2_storage_blob(checkout: Path, raw: str) -> str:
    """One immutable reviewed file, held to base/branch/source elsewhere."""
    expected = EXACT_WE2_STORAGE_PINS.get(raw)
    if expected is None:
        raise BoundaryHold("WE2_STORAGE_UNPINNED_FILE")
    path = checkout
    for component in relative_path(raw).parts:
        path = path / component
        if path.is_symlink():
            raise BoundaryHold("WE2_STORAGE_SYMLINK_ANCESTOR")
    st = path.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
        st.st_uid != os.geteuid() or not 1 <= st.st_size <= 100_000 or
        stat.S_IMODE(st.st_mode) & 0o022):
        raise BoundaryHold("WE2_STORAGE_SINGLE_REGULAR_FILE")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        live = os.fstat(fd)
        if (live.st_dev, live.st_ino, live.st_size, live.st_mtime_ns) != (
            st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns):
            raise BoundaryHold("WE2_STORAGE_FILE_CHANGED")
        blob = os.read(fd, 100001)
    finally:
        os.close(fd)
    if len(blob) != st.st_size or hashlib.sha256(blob).hexdigest() != expected:
        raise BoundaryHold("WE2_STORAGE_EXACT_SHA_MISMATCH")
    return raw


def exact_we2_bridge_blob(checkout: Path, raw: str) -> str:
    expected = EXACT_WE2_BRIDGE_PINS.get(raw)
    if expected is None:
        raise BoundaryHold("WE2_BRIDGE_UNPINNED_FILE")
    path = checkout
    for part in relative_path(raw).parts:
        path = path / part
        if path.is_symlink():
            raise BoundaryHold("WE2_BRIDGE_SYMLINK_ANCESTOR")
    st = path.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
            or st.st_uid != os.geteuid() or not 1 <= st.st_size <= 100_000
            or stat.S_IMODE(st.st_mode) & 0o022):
        raise BoundaryHold("WE2_BRIDGE_SOURCE_CUSTODY")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        actual = os.fstat(fd)
        if (actual.st_dev, actual.st_ino, actual.st_size, actual.st_mtime_ns) != (
                st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns):
            raise BoundaryHold("WE2_BRIDGE_SOURCE_CHANGED")
        blob = os.read(fd, 100001)
    finally:
        os.close(fd)
    if len(blob) != st.st_size or hashlib.sha256(blob).hexdigest() != expected:
        raise BoundaryHold("WE2_BRIDGE_EXACT_SHA_MISMATCH")
    return raw


def authorize_changed_source(checkout: Path, base: str, raw: str) -> str:
    """No dynamic-route wildcard: admit one independently reviewable route."""
    if raw == "scripts/scan_os.py":
        if os.environ.get("BOUNDARY_BRANCH") != EXACT_C_SCAN_OS_BRANCH:
            raise BoundaryHold("C_SCAN_WRONG_BRANCH")
        if base != EXACT_C_SCAN_OS_BASE:
            raise BoundaryHold("C_SCAN_WRONG_BASE")
        _exact_c_scan_source_blob(checkout, raw)
        return raw
    if raw == EXACT_C_PRISMA_DOC_PATH:
        if os.environ.get("BOUNDARY_BRANCH") != EXACT_C_PRISMA_DOC_BRANCH:
            raise BoundaryHold("C_PRISMA_WRONG_BRANCH")
        if base != EXACT_C_PRISMA_DOC_BASE:
            raise BoundaryHold("C_PRISMA_WRONG_BASE")
        _exact_c_prisma_source_blob(checkout, raw, EXACT_C_PRISMA_DOC_SHA256)
        return raw
    if raw == EXACT_REVIEWED_KINGDOM_MENU_SCRIPT:
        if os.environ.get("BOUNDARY_BRANCH") != EXACT_REVIEWED_KINGDOM_MENU_BRANCH:
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_WRONG_BRANCH")
        if base != EXACT_REVIEWED_KINGDOM_MENU_BASE:
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_WRONG_BASE")
        if (checkout / "scripts").is_symlink():
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_SYMLINK_ANCESTOR")
        path = checkout / relative_path(raw)
        st = path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
            st.st_uid != os.geteuid() or not 1 <= st.st_size <= 25000 or
            stat.S_IMODE(st.st_mode) & 0o022):
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_SINGLE_FILE")
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            live = os.fstat(fd)
            if (live.st_dev, live.st_ino, live.st_size) != (
                st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("KINGDOM_MENU_REVIEWED_INODE_CHANGED")
            blob = os.read(fd, 25001)
        finally:
            os.close(fd)
        if (len(blob) != st.st_size or
            hashlib.sha256(blob).hexdigest() != EXACT_REVIEWED_KINGDOM_MENU_SHA256):
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_EXACT_SHA_MISMATCH")
        return raw
    if (base == EXACT_WE2_BRIDGE_BASE
            and os.environ.get("BOUNDARY_BRANCH") == EXACT_WE2_BRIDGE_BRANCH
            and raw in EXACT_WE2_BRIDGE_PINS):
        return exact_we2_bridge_blob(checkout, raw)
    if raw == EXACT_REVIEWED_B_EMBER_GUARD and base == EXACT_WE2_STORAGE_BASE:
        if os.environ.get("BOUNDARY_BRANCH") != EXACT_WE2_STORAGE_BRANCH:
            raise BoundaryHold("WE2_STORAGE_WRONG_BRANCH")
        return exact_we2_storage_blob(checkout, raw)
    if raw == EXACT_REVIEWED_B_EMBER_GUARD:
        if base != EXACT_REVIEWED_B_EMBER_BASE:
            raise BoundaryHold("B_EMBER_GUARD_WRONG_BASE")
        path = checkout / "scripts" / "r25_b_guard_production_v1.cjs"
        if (checkout / "scripts").is_symlink():
            raise BoundaryHold("B_EMBER_GUARD_SYMLINK_ANCESTOR")
        st = path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                or st.st_uid != os.geteuid() or
                not 1 <= st.st_size <= 25000 or stat.S_IMODE(st.st_mode) & 0o022):
            raise BoundaryHold("B_EMBER_GUARD_SINGLE_REGULAR_FILE")
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            live = os.fstat(fd)
            if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("B_EMBER_GUARD_INODE_CHANGED")
            blob = os.read(fd, 25001)
        finally:
            os.close(fd)
        if len(blob) != st.st_size or hashlib.sha256(blob).hexdigest() != EXACT_REVIEWED_B_EMBER_SHA256:
            raise BoundaryHold("B_EMBER_GUARD_EXACT_SHA_MISMATCH")
        return raw
    if raw == EXACT_REVIEWED_DYNAMIC_ROUTE:
        if base != EXACT_REVIEWED_DYNAMIC_BASE:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_WRONG_BASE")
        # Bound every component by this literal constant; never resolve a
        # caller-provided path with arbitrary bracket or traversal segments.
        parent = checkout
        for part in ("app", "api", "media-assets", "[kind]", "[target]"):
            parent = parent / part
            if parent.is_symlink():
                raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_SYMLINK_ANCESTOR")
        path = parent / "route.ts"
        st = path.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size <= 0 or st.st_size > 2_000_000:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_REGULAR_FILE_REQUIRED")
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        try:
            live = os.fstat(descriptor)
            if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_INODE_CHANGED")
            content = os.read(descriptor, 2_000_001)
        finally:
            os.close(descriptor)
        if len(content) != st.st_size or hashlib.sha256(content).hexdigest() != EXACT_REVIEWED_DYNAMIC_SHA256:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_EXACT_SHA_MISMATCH")
        return raw
    if raw == EXACT_REVIEWED_B_BROWSER_SCRIPT:
        if base != EXACT_REVIEWED_B_BROWSER_BASE:
            raise BoundaryHold("B_BROWSER_REVIEWED_WRONG_BASE")
        relative = relative_path(raw)
        path = checkout / relative
        if (checkout / "scripts").is_symlink():
            raise BoundaryHold("B_BROWSER_SYMLINK_ANCESTOR")
        st = path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                or st.st_uid != os.geteuid() or not 1 <= st.st_size <= 100000):
            raise BoundaryHold("B_BROWSER_SINGLE_REGULAR_FILE_REQUIRED")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            live = os.fstat(descriptor)
            if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("B_BROWSER_INODE_CHANGED")
            content = os.read(descriptor, 100001)
        finally:
            os.close(descriptor)
        if (len(content) != st.st_size or
                hashlib.sha256(content).hexdigest() != EXACT_REVIEWED_B_BROWSER_SHA256):
            raise BoundaryHold("B_BROWSER_EXACT_SHA_MISMATCH")
        return raw
    # Dedicated exact DATA-stage source exception: never reuse legacy
    # original Factory or retention review pins for this new protected blob.
    if (base == EXACT_WE2_FACTORY_DATA_BASE and
            os.environ.get("BOUNDARY_BRANCH") == EXACT_WE2_FACTORY_DATA_BRANCH and
            raw in EXACT_WE2_FACTORY_DATA_PINS):
        return exact_we2_factory_data_blob(checkout,raw)
    # Original DATA Factory source remains frozen. Post-T10 V3 receipt
    # code is a separately qualified exact branch/base/hash transition.
    if (base == EXACT_WE2_FACTORY_V3_RECEIPT_BASE and
            os.environ.get("BOUNDARY_BRANCH") == EXACT_WE2_FACTORY_V3_RECEIPT_BRANCH and
            raw in EXACT_WE2_FACTORY_V3_RECEIPT_PINS):
        return exact_we2_factory_v3_receipt_blob(checkout, raw)
    # Separate frozen-root public publisher V3 projection source admission.
    if (base == EXACT_WE2_V3_PUBLIC_BASE and
        os.environ.get("BOUNDARY_BRANCH") == EXACT_WE2_V3_PUBLIC_BRANCH and
        raw in EXACT_WE2_V3_PUBLIC_PINS):
        return exact_we2_v3_public_blob(checkout, raw)
    # New exact post-T10 source review, distinct from the frozen v3 runner.
    if (base == EXACT_WE2_FACTORY_RETENTION_BASE and
            os.environ.get("BOUNDARY_BRANCH") == EXACT_WE2_FACTORY_RETENTION_BRANCH
            and raw in EXACT_WE2_FACTORY_RETENTION_PINS):
        return exact_we2_factory_retention_blob(checkout, raw)
    # One exact reviewed Factory-root pin transition on the sole WE2 branch.
    # This does not admit a general release runner or change root authority.
    if raw == "scripts/aoe2_product_release.py" and base == EXACT_WE2_FACTORY_BASE:
        if os.environ.get("BOUNDARY_BRANCH") != EXACT_WE2_FACTORY_BRANCH:
            raise BoundaryHold("WE2_FACTORY_RUNNER_BRANCH")
        target=checkout/"scripts/aoe2_product_release.py"
        st=target.lstat()
        if (target.is_symlink() or (checkout/"scripts").is_symlink()
            or not stat.S_ISREG(st.st_mode) or st.st_nlink!=1
            or st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)&0o022
            or not 100<=st.st_size<=100000):
            raise BoundaryHold("WE2_FACTORY_RUNNER_CUSTODY")
        fd=os.open(target,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            live=os.fstat(fd)
            if (live.st_dev,live.st_ino,live.st_size)!=(st.st_dev,st.st_ino,st.st_size):
                raise BoundaryHold("WE2_FACTORY_RUNNER_INODE")
            raw_bytes=os.read(fd,100001)
        finally:
            os.close(fd)
        if len(raw_bytes)!=st.st_size or hashlib.sha256(raw_bytes).hexdigest()!=EXACT_WE2_FACTORY_SHA256["scripts/aoe2_product_release.py"]:
            raise BoundaryHold("WE2_FACTORY_RUNNER_SHA256")
        return raw
    if (raw in EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE or
            raw in EXACT_REVIEWED_DEPLOYMENT_OS_F1_SOURCE):
        if base == EXACT_REVIEWED_DEPLOYMENT_OS_BASE:
            pinned = EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE
        elif base == EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE:
            pinned = EXACT_REVIEWED_DEPLOYMENT_OS_F1_SOURCE
        else:
            raise BoundaryHold("DEPLOYMENT_OS_REVIEWED_WRONG_BASE")
        if raw not in pinned:
            raise BoundaryHold("DEPLOYMENT_OS_UNREVIEWED_FOR_BASE")
        relative = relative_path(raw)
        path = checkout / relative
        parent = checkout
        for part in relative.parts[:-1]:
            parent = parent / part
            if parent.is_symlink():
                raise BoundaryHold("DEPLOYMENT_OS_SYMLINK_ANCESTOR")
        st = path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                or st.st_uid != os.geteuid() or st.st_size <= 0
                or st.st_size > 100000):
            raise BoundaryHold("DEPLOYMENT_OS_SINGLE_REGULAR_FILE_REQUIRED")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            live = os.fstat(descriptor)
            if ((live.st_dev, live.st_ino, live.st_size)
                    != (st.st_dev, st.st_ino, st.st_size)):
                raise BoundaryHold("DEPLOYMENT_OS_INODE_CHANGED")
            content = os.read(descriptor, 100001)
        finally:
            os.close(descriptor)
        if (len(content) != st.st_size or hashlib.sha256(content).hexdigest()
                != pinned[raw]):
            raise BoundaryHold("DEPLOYMENT_OS_EXACT_SHA_MISMATCH")
        return raw
    relative = relative_path(raw)
    name = str(relative)
    if name != EXACT_REVIEWED_SCRIPT:
        return authorize_source(name)
    if base == EXACT_REVIEWED_BASE:
        expected_sha = EXACT_REVIEWED_SHA256
    elif base == EXACT_REVIEWED_FACTORY_BASE:
        expected_sha = EXACT_REVIEWED_FACTORY_SHA256
    else:
        raise BoundaryHold("REVIEWED_EXECUTABLE_WRONG_BASE")
    path = checkout / relative
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size < 1 or st.st_size > 500_000:
        raise BoundaryHold("REVIEWED_EXECUTABLE_NOT_SINGLE_REGULAR_FILE")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        live = os.fstat(descriptor)
        if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
            raise BoundaryHold("REVIEWED_EXECUTABLE_CHANGED_INODE")
        content = os.read(descriptor, 500_001)
    finally:
        os.close(descriptor)
    if len(content) != st.st_size or hashlib.sha256(content).hexdigest() != expected_sha:
        raise BoundaryHold("REVIEWED_EXECUTABLE_EXACT_SHA_MISMATCH")
    return name


def authorize_output(raw: str, checkout: Path, product_root: Path) -> Path:
    relative = relative_path(raw)
    value = str(relative)
    if not any(value.startswith(prefix) for prefix in OUTPUT_PREFIXES):
        raise BoundaryHold("UNAPPROVED_ARTIFACT_DESTINATION")
    checkout = checkout.resolve(strict=True)
    product_root = product_root.resolve(strict=True)
    if not checkout.is_relative_to(product_root):
        raise BoundaryHold("CHECKOUT_OUTSIDE_PRODUCT")
    candidate = checkout
    for part in relative.parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise BoundaryHold("SYMLINK_DESTINATION")
        # Paths must not redirect to another filesystem, including bind mounts.
        if candidate.exists() and candidate.stat().st_dev != checkout.stat().st_dev:
            raise BoundaryHold("MOUNT_ESCAPE")
    if not candidate.resolve(strict=False).is_relative_to(checkout):
        raise BoundaryHold("DESTINATION_ESCAPE")
    return candidate


def authorize_task(payload: dict) -> tuple[str, ...]:
    if not isinstance(payload, dict) or set(payload) != {"argv", "cwd", "output"}:
        raise BoundaryHold("UNREVIEWED_TASK_FIELDS")
    argv = payload["argv"]
    if not isinstance(argv, list) or any(not isinstance(s, str) for s in argv):
        raise BoundaryHold("TASK_ARGV_REQUIRED")
    if tuple(argv) not in ALLOWED_TASK_ARGV:
        raise BoundaryHold("UNAUTHORIZED_COMMAND")
    if payload["cwd"] != "." or payload["output"] is not None:
        raise BoundaryHold("TASK_CWD_OR_OUTPUT_NOT_APPROVED")
    return tuple(argv)


def validate_git_pointer(checkout: Path, product_root: Path, repo_name: str) -> None:
    marker = checkout / ".git"
    if marker.is_symlink():
        raise BoundaryHold("SYMLINK_GIT_MARKER")
    if marker.is_dir():
        if marker.resolve(strict=True) != checkout.resolve(strict=True) / ".git":
            raise BoundaryHold("GIT_DIRECTORY_ESCAPE")
        return
    if not marker.is_file():
        raise BoundaryHold("MISSING_GIT_MARKER")
    data = marker.read_text(encoding="utf-8")
    if len(data) > 512 or not data.startswith("gitdir: ") or len(data.splitlines()) != 1:
        raise BoundaryHold("INVALID_GIT_POINTER")
    pointer = data.removeprefix("gitdir: ").strip()
    p = Path(pointer)
    if not p.is_absolute() or ".." in p.parts or p.is_symlink():
        raise BoundaryHold("UNSAFE_GIT_POINTER")
    try:
        actual = p.resolve(strict=True)
    except OSError as exc:
        raise BoundaryHold("UNRESOLVED_GIT_POINTER") from exc
    expected_bases = (
        product_root / ("app-prodn" if repo_name.endswith("app-prodn") else "kingdom-traders") / ".git" / "worktrees",
        product_root / "session-b-app-c02" / ".git" / "worktrees",
    )
    if not any(actual.is_relative_to(b.resolve(strict=False)) for b in expected_bases):
        raise BoundaryHold("GIT_POINTER_OUTSIDE_APPROVED_PRODUCT_ADMIN")
    if actual.stat().st_uid != checkout.stat().st_uid:
        raise BoundaryHold("GIT_POINTER_OWNER_MISMATCH")


def git(checkout: Path, *args: str) -> str:
    env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}
    result = subprocess.run(["git", "-C", str(checkout), *args],
                            capture_output=True, text=True, timeout=25, env=env,
                            check=False)
    if result.returncode:
        raise BoundaryHold("GIT_COMMAND_FAILED:" + args[0])
    return result.stdout.strip()


def check_checkout(checkout: Path, repo_name: str, expected_sha: str,
                   expected_branch: str, product_root: Path,
                   *, ci: bool) -> dict:
    if not REPO.fullmatch(repo_name) or not SHA.fullmatch(expected_sha):
        raise BoundaryHold("BAD_PIN_OR_REPO")
    if not BRANCH.fullmatch(expected_branch) or "//" in expected_branch or ".." in expected_branch:
        raise BoundaryHold("BAD_BRANCH")
    if ci:
        if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REPOSITORY") != repo_name:
            raise BoundaryHold("UNTRUSTED_CI_IDENTITY")
        if checkout.resolve(strict=True) != Path(os.environ.get("GITHUB_WORKSPACE", "/nonexistent")).resolve(strict=True):
            raise BoundaryHold("CI_CHECKOUT_MISMATCH")
    else:
        if not checkout.resolve(strict=True).is_relative_to(product_root.resolve(strict=True)):
            raise BoundaryHold("CHECKOUT_OUTSIDE_PRODUCT")
        if checkout.stat().st_uid != os.geteuid():
            raise BoundaryHold("SOURCE_OWNER_MISMATCH")
    if checkout.is_symlink() or checkout.stat().st_uid != (checkout / ".git").stat().st_uid:
        raise BoundaryHold("CHECKOUT_OWNER_OR_LINK_MISMATCH")
    validate_git_pointer(checkout, product_root, repo_name) if not ci else None
    if Path(git(checkout, "rev-parse", "--show-toplevel")).resolve(strict=True) != checkout.resolve(strict=True):
        raise BoundaryHold("WORKTREE_ROOT_MISMATCH")
    origin = git(checkout, "remote", "get-url", "origin")
    if origin not in ORIGINS[repo_name]:
        raise BoundaryHold("REMOTE_ORIGIN_MISMATCH")
    if git(checkout, "rev-parse", "HEAD") != expected_sha:
        raise BoundaryHold("SOURCE_SHA_MISMATCH")
    if not ci and git(checkout, "branch", "--show-current") != expected_branch:
        raise BoundaryHold("SOURCE_BRANCH_MISMATCH")
    if git(checkout, "status", "--porcelain=v1", "--untracked-files=normal"):
        raise BoundaryHold("DIRTY_SOURCE")
    return {"repo": repo_name, "sha": expected_sha, "branch": expected_branch, "origin": origin}


# B-owned source-only admission for the exact WE1-reviewed Watcher SQL pair.
# No change to general SQL denial, task argv, financial or DB write authority.
EXACT_B_WATCHER_BASE = "a187ada489ce76c939d6d52218ee5a7f22520921"
EXACT_B_WATCHER_BRANCH = "session-c/we3-watcher-v3-release-20261124"
EXACT_B_WATCHER_REVIEWED = "c5577d3050631a2426ea66816dc6b18c0a9ddd84"
EXACT_B_WATCHER_SQL = {
    "config/nonfinancial-public-watcher-v3.sql":
        (13699, "b46f4eb2804cb49a8fdc807e7d0a6f80b49c6bce023581acf7568120ef55c820"),
    "tests/fixtures/current-watcher-v3-original.sql":
        (12687, "d97dc6cc41cd33a86f5a8e0529593ae99b905535cf626f4775b5be4264d1236d"),
}
# Exact WE3 legacy regression correction; this is not another SQL admission.
EXACT_B_WATCHER_REGRESSION = "tests/test_r25_public_watcher_source_parity.py"
EXACT_B_WATCHER_REGRESSION_SHA256 = "d47078b09e710ee7b36354c71d1cef46c4febcac63fc8a67dd0b758e58629c84"
EXACT_B_WATCHER_CHANGED = frozenset(EXACT_B_WATCHER_SQL) | {
    EXACT_B_WATCHER_REGRESSION,
    "lib/currentWatcherAccountState.ts",
    "lib/currentWatcherAccountStateRefreshGate.ts",
    "tests/current-watcher-v3-refresh-retry.test.mts",
    "tests/replay-projection-cache-v2.test.mts",
    "tests/test_current_watcher_v3_sql_pg.py",
    "scripts/product_boundary_guard.py",
    "tests/test_product_boundary_guard.py",
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}


def exact_b_watcher_blob(checkout: Path, raw: str) -> str:
    if raw not in EXACT_B_WATCHER_SQL:
        raise BoundaryHold("B_WATCHER_UNREVIEWED_SQL")
    size, digest = EXACT_B_WATCHER_SQL[raw]
    target = checkout
    for part in relative_path(raw).parts:
        target = target / part
        if target.is_symlink():
            raise BoundaryHold("B_WATCHER_SYMLINK")
    st = target.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
            or st.st_uid != os.geteuid() or st.st_size != size
            or stat.S_IMODE(st.st_mode) & 0o022):
        raise BoundaryHold("B_WATCHER_SOURCE_CUSTODY")
    identity = lambda x: (x.st_dev, x.st_ino, x.st_size, x.st_mtime_ns,
                          x.st_ctime_ns, x.st_uid, x.st_mode, x.st_nlink)
    fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if identity(os.fstat(fd)) != identity(st):
            raise BoundaryHold("B_WATCHER_SOURCE_RACE")
        data = os.read(fd, size + 1)
        if identity(os.fstat(fd)) != identity(st):
            raise BoundaryHold("B_WATCHER_SOURCE_RACE")
    finally:
        os.close(fd)
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise BoundaryHold("B_WATCHER_SQL_SHA")
    return raw


def check_exact_b_watcher_context(checkout: Path, repo: str, branch: str,
                                  base: str, sha: str, *, ci: bool) -> None:
    if repo != "Emaren/app-prodn" or base != EXACT_B_WATCHER_BASE:
        raise BoundaryHold("B_WATCHER_REPO_OR_BASE")
    if branch not in (EXACT_B_WATCHER_BRANCH, "main"):
        raise BoundaryHold("B_WATCHER_BRANCH")
    if ci:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        if branch == EXACT_B_WATCHER_BRANCH:
            pr = event.get("pull_request", {})
            h, b = pr.get("head", {}), pr.get("base", {})
            if (os.environ.get("GITHUB_EVENT_NAME") != "pull_request"
                    or event.get("number") != 1499
                    or (h.get("repo") or {}).get("full_name") != repo
                    or (b.get("repo") or {}).get("full_name") != repo
                    or h.get("ref") != branch or h.get("sha") != sha
                    or b.get("ref") != "main" or b.get("sha") != base):
                raise BoundaryHold("B_WATCHER_PR_IDENTITY")
        elif (os.environ.get("GITHUB_EVENT_NAME") != "push"
              or event.get("ref") != "refs/heads/main"
              or event.get("before") != base or event.get("after") != sha
              or (event.get("repository") or {}).get("full_name") != repo):
            raise BoundaryHold("B_WATCHER_MAIN_IDENTITY")
    if branch == "main":
        parents = git(checkout, "rev-list", "--parents", "-n", "1", sha).split()
        if len(parents) != 3 or parents[:2] != [sha, base]:
            raise BoundaryHold("B_WATCHER_MAIN_PARENTS")
        candidate = parents[2]
        if git(checkout, "rev-parse", sha + "^{tree}") != git(
                checkout, "rev-parse", candidate + "^{tree}"):
            raise BoundaryHold("B_WATCHER_MAIN_TREE")
    else:
        candidate = sha
    if git(checkout, "merge-base", EXACT_B_WATCHER_REVIEWED, candidate) != EXACT_B_WATCHER_REVIEWED:
        raise BoundaryHold("B_WATCHER_REVIEW_ANCESTRY")
    if git(checkout, "merge-base", base, candidate) != base:
        raise BoundaryHold("B_WATCHER_BASE_ANCESTRY")


def exact_b_watcher_changes(checkout: Path, base: str) -> list[str]:
    # Include deletions and type changes; do not inherit ordinary diff-filter.
    changes = git(checkout, "diff", "--name-status", "--no-renames", base, "HEAD", "--")
    rows = [line.split("\t") for line in changes.splitlines()]
    if (any(len(row) != 2 or row[0] not in ("A", "M") for row in rows)
            or len(rows) != len(EXACT_B_WATCHER_CHANGED)
            or {row[1] for row in rows} != EXACT_B_WATCHER_CHANGED):
        raise BoundaryHold("B_WATCHER_EXACT_CHANGED_SCOPE")
    for _, raw in rows:
        if raw in EXACT_B_WATCHER_SQL:
            exact_b_watcher_blob(checkout, raw)
        else:
            authorize_changed_source(checkout, base, raw)
        if raw == EXACT_B_WATCHER_REGRESSION:
            target = checkout
            for part in relative_path(raw).parts:
                target = target / part
                if target.is_symlink():
                    raise BoundaryHold("B_WATCHER_REGRESSION_SYMLINK")
            if hashlib.sha256(target.read_bytes()).hexdigest() != EXACT_B_WATCHER_REGRESSION_SHA256:
                raise BoundaryHold("B_WATCHER_REGRESSION_SHA")
        mode = git(checkout, "ls-files", "--stage", "--", raw)
        if not mode.startswith("100644 ") or len(mode.splitlines()) != 1:
            raise BoundaryHold("B_WATCHER_INDEX_MODE")
    return [row[1] for row in rows]


def changed_source(checkout: Path, base: str) -> list[str]:
    if not SHA.fullmatch(base):
        raise BoundaryHold("UNPINNED_BASE_SHA")
    names = git(checkout, "diff", "--name-only", "--diff-filter=ACMRTUXB",
                base, "HEAD", "--")
    changes = names.splitlines() if names else []
    for name in changes:
        authorize_changed_source(checkout, base, name)
        mode = git(checkout, "ls-files", "--stage", "--", name)
        if mode.startswith("120000 "):
            raise BoundaryHold("SYMLINK_SOURCE_CHANGE")
    return changes


def exact_we2_factory_data_blob(checkout: Path, raw: str) -> str:
    """Validate an exact reviewed DATA-stage blob via O_NOFOLLOW fd."""
    expected=EXACT_WE2_FACTORY_DATA_PINS.get(
        raw,EXACT_WE2_FACTORY_DATA_DOC_PINS.get(raw))
    if expected is None:
        raise BoundaryHold("WE2_FACTORY_DATA_UNPINNED_SOURCE")
    p=checkout
    for part in relative_path(raw).parts:
        p=p/part
        if p.is_symlink():
            raise BoundaryHold("WE2_FACTORY_DATA_SYMLINK")
    st=p.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or
        st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)&0o022 or
        not 1<=st.st_size<=150000):
        raise BoundaryHold("WE2_FACTORY_DATA_SOURCE_CUSTODY")
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        live=os.fstat(fd)
        if (live.st_dev,live.st_ino,live.st_size,live.st_mtime_ns)!=(
                st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns):
            raise BoundaryHold("WE2_FACTORY_DATA_INODE_CHANGED")
        content=os.read(fd,150001)
    finally:
        os.close(fd)
    if len(content)!=st.st_size or hashlib.sha256(content).hexdigest()!=expected:
        raise BoundaryHold("WE2_FACTORY_DATA_SOURCE_SHA")
    return raw

def exact_we2_factory_v3_receipt_blob(checkout: Path, raw: str) -> str:
    expected = EXACT_WE2_FACTORY_V3_RECEIPT_PINS.get(raw, EXACT_WE2_FACTORY_V3_REVIEWED_DOC_PINS.get(raw))
    if expected is None:
        raise BoundaryHold("WE2_V3_RECEIPT_UNPINNED")
    target = checkout
    for part in relative_path(raw).parts:
        target = target / part
        if target.is_symlink():
            raise BoundaryHold("WE2_V3_RECEIPT_SYMLINK")
    st = target.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
            st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode) & 0o022 or
            not 1 <= st.st_size <= 150000):
        raise BoundaryHold("WE2_V3_RECEIPT_FILE_AUTHORITY")
    fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        observed = os.fstat(fd)
        if (observed.st_dev, observed.st_ino, observed.st_size,
                observed.st_mtime_ns) != (
                st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns):
            raise BoundaryHold("WE2_V3_RECEIPT_INODE_RACE")
        raw_bytes = os.read(fd, 150001)
    finally:
        os.close(fd)
    if (len(raw_bytes) != st.st_size or
            hashlib.sha256(raw_bytes).hexdigest() != expected):
        raise BoundaryHold("WE2_V3_RECEIPT_SHA")
    return raw


def check_exact_we2_factory_v3_receipt_source(checkout: Path, repo: str,
                                              branch: str, base: str,
                                              changes: list[str]) -> None:
    if branch != EXACT_WE2_FACTORY_V3_RECEIPT_BRANCH:
        return
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_FACTORY_V3_RECEIPT_BASE:
        raise BoundaryHold("WE2_V3_RECEIPT_BASE_OR_REPO")
    if (len(changes) != len(EXACT_WE2_FACTORY_V3_RECEIPT_CHANGED) or
            frozenset(changes) != EXACT_WE2_FACTORY_V3_RECEIPT_CHANGED):
        raise BoundaryHold("WE2_V3_RECEIPT_CHANGED_SCOPE")
    for raw in EXACT_WE2_FACTORY_V3_RECEIPT_PINS:
        exact_we2_factory_v3_receipt_blob(checkout, raw)
    for raw in EXACT_WE2_FACTORY_V3_REVIEWED_DOC_PINS:
        exact_we2_factory_v3_receipt_blob(checkout, raw)


def exact_we2_v3_public_blob(checkout: Path, raw: str) -> str:
    expected = EXACT_WE2_V3_PUBLIC_PINS.get(raw)
    if expected is None:
        raise BoundaryHold("WE2_V3_PUBLIC_UNPINNED")
    path = checkout
    for part in relative_path(raw).parts:
        path = path / part
        if path.is_symlink():
            raise BoundaryHold("WE2_V3_PUBLIC_SYMLINK")
    st = path.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
            st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode) & 0o022 or
            not 1 <= st.st_size <= 150000):
        raise BoundaryHold("WE2_V3_PUBLIC_FILE_AUTHORITY")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        live = os.fstat(fd)
        if ((live.st_dev,live.st_ino,live.st_size,live.st_mtime_ns) !=
            (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)):
            raise BoundaryHold("WE2_V3_PUBLIC_INODE_RACE")
        data = os.read(fd,150001)
    finally:
        os.close(fd)
    if len(data) != st.st_size or hashlib.sha256(data).hexdigest() != expected:
        raise BoundaryHold("WE2_V3_PUBLIC_SHA")
    return raw


def check_exact_we2_v3_public_source(checkout: Path, repo: str,
                                     branch: str, base: str,
                                     changes: list[str]) -> None:
    if branch != EXACT_WE2_V3_PUBLIC_BRANCH:
        return
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_V3_PUBLIC_BASE:
        raise BoundaryHold("WE2_V3_PUBLIC_BASE_OR_REPO")
    if (len(changes)!=len(EXACT_WE2_V3_PUBLIC_CHANGED) or
            frozenset(changes)!=EXACT_WE2_V3_PUBLIC_CHANGED):
        raise BoundaryHold("WE2_V3_PUBLIC_CHANGED_SCOPE")
    for raw in EXACT_WE2_V3_PUBLIC_PINS:
        exact_we2_v3_public_blob(checkout, raw)


def check_exact_we2_factory_data_source(checkout: Path, repo: str, branch: str,
                                        base: str, changes: list[str]) -> None:
    if branch!=EXACT_WE2_FACTORY_DATA_BRANCH:
        return
    if repo!="Emaren/app-prodn" or base!=EXACT_WE2_FACTORY_DATA_BASE:
        raise BoundaryHold("WE2_FACTORY_DATA_REPO_OR_BASE")
    if (len(changes)!=len(EXACT_WE2_FACTORY_DATA_CHANGED) or
            frozenset(changes)!=EXACT_WE2_FACTORY_DATA_CHANGED):
        raise BoundaryHold("WE2_FACTORY_DATA_CHANGED_SCOPE")
    for file in EXACT_WE2_FACTORY_DATA_PINS:
        exact_we2_factory_data_blob(checkout,file)
    for file in EXACT_WE2_FACTORY_DATA_DOC_PINS:
        exact_we2_factory_data_blob(checkout,file)

def check_exact_we2_factory_source(checkout: Path, repo: str, branch: str,
                                  base: str, changes: list[str]) -> None:
    if branch != EXACT_WE2_FACTORY_BRANCH:
        return
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_FACTORY_BASE:
        raise BoundaryHold("WE2_FACTORY_EXACT_BASE_OR_REPO")
    if frozenset(changes) != EXACT_WE2_FACTORY_CHANGED or len(changes) != len(EXACT_WE2_FACTORY_CHANGED):
        raise BoundaryHold("WE2_FACTORY_EXACT_SOURCE_SCOPE")
    for relative, expected in EXACT_WE2_FACTORY_SHA256.items():
        target=checkout
        for component in Path(relative).parts:
            target=target/component
            if target.is_symlink():
                raise BoundaryHold("WE2_FACTORY_SYMLINK_ANCESTOR")
        st=target.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink!=1
            or st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode)&0o022
            or not 100<=st.st_size<=100000):
            raise BoundaryHold("WE2_FACTORY_PROTECTED_SOURCE_CUSTODY")
        fd=os.open(target,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            live=os.fstat(fd)
            if (live.st_dev,live.st_ino,live.st_size)!=(st.st_dev,st.st_ino,st.st_size):
                raise BoundaryHold("WE2_FACTORY_INODE_CHANGED")
            raw=os.read(fd,100001)
        finally:
            os.close(fd)
        if len(raw)!=st.st_size or hashlib.sha256(raw).hexdigest()!=expected:
            raise BoundaryHold("WE2_FACTORY_EXACT_SOURCE_SHA256_DRIFT")

def exact_we2_factory_retention_blob(checkout: Path, raw: str) -> str:
    expected = EXACT_WE2_FACTORY_RETENTION_PINS.get(raw)
    if expected is None:
        raise BoundaryHold("WE2_RETENTION_UNPINNED_SOURCE")
    target = checkout
    for part in relative_path(raw).parts:
        target = target / part
        if target.is_symlink():
            raise BoundaryHold("WE2_RETENTION_SOURCE_SYMLINK")
    st = target.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
            or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) & 0o022
            or not 100 <= st.st_size <= 100000):
        raise BoundaryHold("WE2_RETENTION_SOURCE_CUSTODY")
    fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        live = os.fstat(fd)
        if (live.st_dev, live.st_ino, live.st_size, live.st_mtime_ns) != (
                st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns):
            raise BoundaryHold("WE2_RETENTION_SOURCE_INODE_CHANGED")
        data = os.read(fd, 100001)
    finally:
        os.close(fd)
    if len(data) != st.st_size or hashlib.sha256(data).hexdigest() != expected:
        raise BoundaryHold("WE2_RETENTION_SOURCE_HASH_DRIFT")
    return raw


def check_exact_we2_factory_retention_source(
        checkout: Path, repo: str, branch: str, base: str, changes: list[str]) -> None:
    if branch != EXACT_WE2_FACTORY_RETENTION_BRANCH:
        return
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_FACTORY_RETENTION_BASE:
        raise BoundaryHold("WE2_RETENTION_SOURCE_REPO_OR_BASE")
    if (len(changes) != len(EXACT_WE2_FACTORY_RETENTION_CHANGED)
            or frozenset(changes) != EXACT_WE2_FACTORY_RETENTION_CHANGED):
        raise BoundaryHold("WE2_RETENTION_EXACT_CHANGED_PATHS")
    for path in EXACT_WE2_FACTORY_RETENTION_PINS:
        exact_we2_factory_retention_blob(checkout, path)


def check_exact_we2_storage_source(checkout: Path, repo: str, branch: str,
                                   base: str, changes: list[str]) -> None:
    """No blanket branch, arbitrary changed script or later source revision."""
    if branch != EXACT_WE2_STORAGE_BRANCH:
        return
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_STORAGE_BASE:
        raise BoundaryHold("WE2_STORAGE_EXACT_BASE_OR_REPO")
    if len(changes) != len(EXACT_WE2_STORAGE_CHANGED) or (
        frozenset(changes) != EXACT_WE2_STORAGE_CHANGED):
        raise BoundaryHold("WE2_STORAGE_EXACT_CHANGED_SET")
    for name in EXACT_WE2_STORAGE_PINS:
        exact_we2_storage_blob(checkout, name)


def check_exact_we2_bridge_source(checkout: Path, repo: str, branch: str,
                                  base: str, changes: list[str]) -> None:
    if branch != EXACT_WE2_BRIDGE_BRANCH:
        return
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_BRIDGE_BASE:
        raise BoundaryHold("WE2_BRIDGE_EXACT_BASE_OR_REPO")
    if len(changes) != len(EXACT_WE2_BRIDGE_CHANGED) or (
            frozenset(changes) != EXACT_WE2_BRIDGE_CHANGED):
        raise BoundaryHold("WE2_BRIDGE_EXACT_CHANGED_SET")
    for name in EXACT_WE2_BRIDGE_PINS:
        exact_we2_bridge_blob(checkout, name)


def _exact_c_prisma_source_blob(checkout: Path, relative: str, expected: str) -> None:
    """Bounded regular-file verification; no symlink, hardlink, unsafe mode or source drift."""
    if relative not in ({EXACT_C_PRISMA_DOC_PATH, "tests/test_c_prisma_doc_admission.py"} |
                        set(EXACT_C_PRISMA_WE3_DOC_SHA256)):
        raise BoundaryHold("C_PRISMA_UNREVIEWED_SOURCE_PATH")
    target = checkout
    for name in relative.split("/"):
        target = target / name
        if target.is_symlink():
            raise BoundaryHold("C_PRISMA_SYMLINK_ANCESTOR")
    limit = 100_000 if relative in EXACT_C_PRISMA_WE3_DOC_SHA256 else 20_000
    st = target.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
            st.st_uid != os.geteuid() or not 1 <= st.st_size <= limit or
            stat.S_IMODE(st.st_mode) & 0o022):
        raise BoundaryHold("C_PRISMA_SINGLE_FILE_REQUIRED")
    fd = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        live = os.fstat(fd)
        if ((live.st_dev, live.st_ino, live.st_size, live.st_mtime_ns) !=
                (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns)):
            raise BoundaryHold("C_PRISMA_SOURCE_CHANGED_DURING_READ")
        content = os.read(fd, limit + 1)
    finally:
        os.close(fd)
    if len(content) != st.st_size or hashlib.sha256(content).hexdigest() != expected:
        if relative == EXACT_C_PRISMA_DOC_PATH:
            raise BoundaryHold("C_PRISMA_SHA256_DRIFT")
        if relative in EXACT_C_PRISMA_WE3_DOC_SHA256:
            raise BoundaryHold("C_PRISMA_REVIEWED_DOC_SHA256_DRIFT")
        raise BoundaryHold("C_PRISMA_TEST_SHA256_DRIFT")


def check_exact_c_prisma_doc_source(checkout: Path, repo: str, branch: str,
                                    base: str, changes: list[str]) -> None:
    """One C-reviewed documentation-only source transition, never a general Prisma rule."""
    if branch != EXACT_C_PRISMA_DOC_BRANCH or repo != "Emaren/app-prodn":
        raise BoundaryHold("C_PRISMA_SOURCE_BRANCH_OR_REPO")
    if base != EXACT_C_PRISMA_DOC_BASE:
        raise BoundaryHold("C_PRISMA_SOURCE_BASE")
    files = set(changes)
    if (len(files) != len(changes) or
            not EXACT_C_PRISMA_DOC_REQUIRED.issubset(files) or
            not files.issubset(EXACT_C_PRISMA_DOC_REQUIRED |
                               EXACT_C_PRISMA_DOC_OPTIONAL_DOCSV2)):
        raise BoundaryHold("C_PRISMA_CHANGED_FILE_SET")
    _exact_c_prisma_source_blob(checkout, EXACT_C_PRISMA_DOC_PATH,
                                EXACT_C_PRISMA_DOC_SHA256)
    _exact_c_prisma_source_blob(checkout, "tests/test_c_prisma_doc_admission.py",
                                EXACT_C_PRISMA_DOC_TEST_SHA256)
    for reviewed, expected in EXACT_C_PRISMA_WE3_DOC_SHA256.items():
        _exact_c_prisma_source_blob(checkout, reviewed, expected)


def _exact_c_scan_source_blob(checkout: Path, raw: str) -> None:
    expected = EXACT_C_SCAN_OS_HASHES.get(raw)
    if expected is None:
        raise BoundaryHold("C_SCAN_UNREVIEWED_PATH")
    p = checkout
    for name in raw.split("/"):
        p = p / name
        if p.is_symlink():
            raise BoundaryHold("C_SCAN_SYMLINK_ANCESTOR")
    st = p.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
            st.st_uid != os.geteuid() or not 1 <= st.st_size <= 20_000 or
            stat.S_IMODE(st.st_mode) & 0o022):
        raise BoundaryHold("C_SCAN_SINGLE_FILE")
    fd = os.open(p, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        live = os.fstat(fd)
        if (live.st_dev, live.st_ino, live.st_size, live.st_mtime_ns) != (
                st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns):
            raise BoundaryHold("C_SCAN_FILE_CHANGED")
        blob = os.read(fd, 20001)
    finally:
        os.close(fd)
    if len(blob) != st.st_size or hashlib.sha256(blob).hexdigest() != expected:
        raise BoundaryHold("C_SCAN_SHA256_DRIFT")


def check_exact_c_scan_os_source(checkout: Path, repo: str, branch: str,
                                 base: str, changes: list[str]) -> None:
    if branch != EXACT_C_SCAN_OS_BRANCH:
        raise BoundaryHold("C_SCAN_SOURCE_BRANCH")
    if repo != "Emaren/app-prodn":
        raise BoundaryHold("C_SCAN_SOURCE_REPO")
    if base != EXACT_C_SCAN_OS_BASE:
        raise BoundaryHold("C_SCAN_SOURCE_BASE")
    files = set(changes)
    if (len(files) != len(changes) or
        not EXACT_C_SCAN_OS_REQUIRED.issubset(files) or
        not files.issubset(EXACT_C_SCAN_OS_REQUIRED | EXACT_C_SCAN_OS_OPTIONAL_DOCS)):
        raise BoundaryHold("C_SCAN_CHANGED_FILE_SET")
    for raw in EXACT_C_SCAN_OS_HASHES:
        _exact_c_scan_source_blob(checkout, raw)


def exact_we2_r25_chat_blob(checkout: Path, raw: str) -> str:
    if raw not in EXACT_WE2_R25_CHAT_CHANGED:
        raise BoundaryHold("R25_CHAT_UNREVIEWED_PATH")
    target = checkout
    for part in relative_path(raw).parts:
        target = target / part
        if target.is_symlink():
            raise BoundaryHold("R25_CHAT_SYMLINK")
    st = target.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
            or st.st_nlink != 1 or stat.S_IMODE(st.st_mode) & 0o022
            or not 1 <= st.st_size <= 4_000_000):
        raise BoundaryHold("R25_CHAT_SOURCE_CUSTODY")
    def ident(x):
        return (x.st_dev,x.st_ino,x.st_mode,x.st_nlink,x.st_uid,
                x.st_size,x.st_mtime_ns,x.st_ctime_ns)
    fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if ident(os.fstat(fd)) != ident(st):
            raise BoundaryHold("R25_CHAT_SOURCE_CHANGED")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            data = handle.read(st.st_size + 1)
        if ident(os.fstat(fd)) != ident(st) or ident(target.lstat()) != ident(st):
            raise BoundaryHold("R25_CHAT_SOURCE_CHANGED")
    finally:
        os.close(fd)
    if len(data) != st.st_size:
        raise BoundaryHold("R25_CHAT_SOURCE_SIZE")
    expected = EXACT_WE2_R25_CHAT_PINS.get(raw)
    if expected is not None and hashlib.sha256(data).hexdigest() != expected:
        raise BoundaryHold("R25_CHAT_SOURCE_SHA")
    return raw


def check_we2_r25_chat_rows(rows):
    if (any(len(row) != 2 or row[0] not in ("A", "M") for row in rows)
            or len(rows) != len(EXACT_WE2_R25_CHAT_CHANGED)
            or {row[1] for row in rows} != EXACT_WE2_R25_CHAT_CHANGED):
        raise BoundaryHold("R25_CHAT_EXACT_CHANGED_SCOPE")


def check_exact_we2_r25_chat_context(checkout: Path, repo: str, branch: str,
                                       base: str, sha: str, *, ci: bool):
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_R25_CHAT_BASE:
        raise BoundaryHold("R25_CHAT_REPO_OR_BASE")
    if branch not in (EXACT_WE2_R25_CHAT_BRANCH, "main"):
        raise BoundaryHold("R25_CHAT_BRANCH")
    if git(checkout, "merge-base", base, sha) != base:
        raise BoundaryHold("R25_CHAT_BASE_ANCESTRY")
    if ci:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        if branch == EXACT_WE2_R25_CHAT_BRANCH:
            pr = event.get("pull_request", {})
            h,b = pr.get("head",{}),pr.get("base",{})
            if (os.environ.get("GITHUB_EVENT_NAME") != "pull_request"
                    or event.get("number") != 1510
                    or (h.get("repo") or {}).get("full_name") != repo
                    or (b.get("repo") or {}).get("full_name") != repo
                    or h.get("ref") != branch or h.get("sha") != sha
                    or b.get("ref") != "main" or b.get("sha") != base):
                raise BoundaryHold("R25_CHAT_PR_IDENTITY")
        else:
            if (os.environ.get("GITHUB_EVENT_NAME") != "push"
                    or event.get("ref") != "refs/heads/main"
                    or event.get("before") != base or event.get("after") != sha):
                raise BoundaryHold("R25_CHAT_MAIN_EVENT")
            parents=git(checkout,"rev-list","--parents","-n","1",sha).split()
            if len(parents)!=3 or parents[1]!=base:
                raise BoundaryHold("R25_CHAT_MAIN_MERGE")
            if git(checkout,"rev-parse",sha+"^{tree}") != git(checkout,"rev-parse",parents[2]+"^{tree}"):
                raise BoundaryHold("R25_CHAT_MAIN_TREE")
    elif branch == "main":
        raise BoundaryHold("R25_CHAT_MAIN_CI_REQUIRED")


def exact_we2_r25_chat_changes(checkout: Path, base: str) -> list[str]:
    rows=[line.split("\t") for line in
          git(checkout,"diff","--name-status","--no-renames",base,"HEAD","--").splitlines()]
    check_we2_r25_chat_rows(rows)
    for _,raw in rows:
        exact_we2_r25_chat_blob(checkout,raw)
        mode=git(checkout,"ls-files","--stage","--",raw)
        if not mode.startswith("100644 ") or len(mode.splitlines())!=1:
            raise BoundaryHold("R25_CHAT_INDEX_MODE")
    return [row[1] for row in rows]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", required=True)
    args = parser.parse_args()
    try:
        ci = os.environ.get("GITHUB_ACTIONS") == "true"
        repo_name = os.environ["BOUNDARY_REPOSITORY"]
        sha = os.environ["BOUNDARY_HEAD_SHA"]
        branch = os.environ["BOUNDARY_BRANCH"]
        base = os.environ["BOUNDARY_BASE_SHA"]
        checkout = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve(strict=True)
        product_root = Path(os.environ.get("PRODUCT_BOUNDARY_ROOT", str(Path.home() / "projects" / "AoE2WAR-LANES" / "PRODUCT")))
        receipt = check_checkout(checkout, repo_name, sha, branch, product_root, ci=ci)
        if (branch == EXACT_WE2_R25_CHAT_BRANCH or
                (branch == "main" and base == EXACT_WE2_R25_CHAT_BASE
                 and "scripts/r25_b_guard_production_v1.cjs" in
                 git(checkout,"diff","--name-only",base,"HEAD","--").splitlines())):
            check_exact_we2_r25_chat_context(checkout,repo_name,branch,base,sha,ci=ci)
            receipt["changed_files"] = exact_we2_r25_chat_changes(checkout,base)
        elif (branch == EXACT_B_WATCHER_BRANCH or
                (branch == "main" and base == EXACT_B_WATCHER_BASE
                 and any(p in git(checkout, "diff", "--name-only", base, "HEAD", "--").splitlines()
                         for p in EXACT_B_WATCHER_SQL))):
            check_exact_b_watcher_context(checkout, repo_name, branch, base, sha, ci=ci)
            receipt["changed_files"] = exact_b_watcher_changes(checkout, base)
        else:
            receipt["changed_files"] = changed_source(checkout, base)
        check_exact_we2_factory_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        check_exact_we2_factory_retention_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        check_exact_we2_factory_data_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        check_exact_we2_factory_v3_receipt_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        check_exact_we2_v3_public_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        check_exact_we2_storage_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        check_exact_we2_bridge_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        if branch == EXACT_C_PRISMA_DOC_BRANCH:
            check_exact_c_prisma_doc_source(
                checkout,repo_name,branch,base,receipt["changed_files"])
        if branch == EXACT_C_SCAN_OS_BRANCH:
            check_exact_c_scan_os_source(
                checkout,repo_name,branch,base,receipt["changed_files"])
        receipt.update(status="PASS_SOURCE_POLICY_ONLY", os_denial_proven=False)
        print(json.dumps(receipt, sort_keys=True))
        return 0
    except (BoundaryHold, KeyError, OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "HOLD_PRODUCT_BOUNDARY", "reason": str(exc)}), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
