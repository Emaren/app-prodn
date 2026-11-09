# Session C — Kingdom Traders nonfinancial frontend seam (NOT deployed)

Source ancestry is the merged R25 V18 release controller fba4d07e3ee49a2e14c652dcc6641b8af3003abb. Session B retains all production 3032, Steam V18, Nginx, 3030 rollback and website SQL authority. This branch is a separate PRODUCT-only unmerged PR, not a public release.

A static preview route /kingdom-traders has been prepared. It does not fetch the independent Traders endpoint, display a broker balance, create an operator session, provide orders, or modify the existing Kingdom dropdown. The preview uses only 100 historical PAPER accounts and seven still-unpriced fictional BTC positions. It truthfully marks source HALT and does not infer a later Kraken market or a 24-hour result.

The exact contract lives at config/session-c-kingdom-traders-seam.json. Fields currently declare navigationEnabled=false, publicOrigin=null, publicCertificateTrusted=false, operatorCredentialDelegation=false, steamAuthenticationDelegation=false, financialSQLAccessAllowed=false, websiteReleaseOwnershipTransferred=false, walletFundingAllowed=false, and realOrdersAllowed=false. No server-side Next proxy, App API, financial SQL role, or old login cookie integration has been added.

Independent product operator origin may later use /api/status and /api/accounts, but those endpoints are presently protected by a separate owner-specific product Basic login; never share that secret with the public App, frontend JS, build env, middleware or database. A distinct versioned and reviewed nonfinancial consumer read model is required for any future shared public numbers.

Before enabling even a navigation link, accept all of: Session B signed-in admin/nonadmin 3032 rollback handoff, an independently publicly trusted product HTTPS/DNS origin, exact source/build SHA, appropriate app/privacy security review, and owner approval. Until then, the product link is intentionally absent from the existing global navigation. Do not update live 3032 or Nginx from this branch.

Product handoff: https://github.com/Emaren/kingdom-traders/issues/118
App two-lane boundary: https://github.com/Emaren/app-prodn/issues/1280
Seven WoloChain financial gate closure is wholly outside PRODUCT. No 8092–8095 endpoints are used.
