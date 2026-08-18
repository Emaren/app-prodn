---
id: "aoe2war.app-prodn.docs-marketplace-business"
title: "Marketplace Business V1"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "financial-domain-contract"
reviewed_at: "2026-08-18"
review_interval_days: 30
sensitivity: "internal"
---

# Marketplace Business V1

Marketplace Business V1 turns the Marketplace streets into durable community
commerce while preserving WoloChain as payment truth and AoE2WAR as business
logic/audit truth.

The original `app/market/page.tsx` is a protected presentation surface.
Marketplace expansion is layered through imported components and dedicated
routes rather than casually rewriting that page.

## Canonical implementation

Primary logic:

- `lib/marketplaceBusiness.ts`
- `lib/marketplaceOwnerControl.ts`
- `lib/marketplaceInboxMessage.ts`
- `lib/marketplaceKingdomBusinesses.ts`

Primary product surfaces:

- `components/market/MarketplaceExpansionStreets.tsx`
- `components/market/MarketplaceBusinessCard.tsx`
- `components/market/MarketplaceShopClient.tsx`
- `components/market/MarketplaceOwnerConsole.tsx`
- `components/market/MarketplaceInquiryComposer.tsx`
- `components/market/MarketplaceInvoiceClient.tsx`
- `app/market/shops/[slug]/page.tsx`
- `app/market/invoices/[publicId]/page.tsx`
- Profile and Contact Inbox integration

Durable Prisma truth:

- `MarketplaceShop`
- `MarketplaceInquiry`
- `MarketplaceInvoice`
- `MarketplacePayment`
- `MarketplaceTaxPayment`

## Financial constants

`lib/marketplaceBusiness.ts` defines:

- standard Marketplace unit / charter fee: **100 WOLO**;
- Marketplace business tax: **1000 bps = 10%**;
- invoices: **100-WOLO increments**, 100 through 100,000 WOLO.

These are implementation contracts, not decorative copy.

## Business lifecycle

A player business requires a linked WOLO wallet and one verified charter
payment. A paid proposal is not approval.

Ownership persists while public display is OFF. OFF hides/empties the awning; it
does not destroy ownership.

Kingdom approval and merchant activation are separate:

1. charter payment/proposal is verified;
2. authorized Marketplace administration approves the business without another
   WOLO charge;
3. the merchant may activate/display the approved business from Profile.

Owner controls include business name, offer, image, and display state.
Authorized Marketplace administration has corresponding approval/override
controls.

Kingdom-owned shops are platform surfaces and may follow different display
defaults; they do not imply a player Business tile.

## Payment truth

Marketplace payment verification uses WoloChain transfer truth. AoE2WAR does not
invent an internal spendable Marketplace balance.

`verifyMarketplaceBusinessPayment()` requires:

- valid transaction hash;
- payer's linked WOLO address;
- exact recipient;
- exact amount;
- exact Marketplace memo;
- successful WoloChain verification.

Commerce transaction hashes are single-use. A tx already represented by
Marketplace payment truth or founding Marketplace activity cannot be reused.

## Inquiry rail

A paid inquiry is a custom customer request plus a verified **100 WOLO direct
customer-to-merchant transfer**.

After verification AoE2WAR writes durable Marketplace truth and emits an
immutable Marketplace protocol card through the existing DirectMessage/contact
transport. Normal conversation may continue afterward.

Self-inquiries are prohibited.

## Invoice rail

Merchants can issue invoices in 100-WOLO increments. Qualifying payment is
verified customer-to-merchant WOLO flow and becomes durable Marketplace payment
truth.

## Development rail

A Marketplace development request is merchant-funded work directed to the
Marketplace keeper/Emaren rail. The merchant pays the standard 100 WOLO unit,
the transfer is verified, and an immutable protocol card records the request.

Charter/development expenditure is not merchant gross revenue for Marketplace
tax purposes.

## Kingdom tax

Marketplace tax is **10% of verified gross qualifying inquiry/invoice revenue**.
Tax derives from verified transaction amounts and per-transaction snapshots,
not fake balances.

Profile may expose accrued, paid, and due tax plus PAY TAX. Tax payments also
require verified WOLO truth.

## Messaging boundary

DirectMessage is transport and human workflow. Marketplace tables are durable
business/accounting truth.

Conversation edits/deletion must never erase underlying Marketplace payment,
inquiry, invoice, or tax truth.

## Failure rules

Fail closed when:

- wallet identity is missing/mismatched;
- recipient, amount, or memo is wrong;
- WoloChain verification fails;
- payment proof was already used;
- self-inquiry is attempted;
- merchant/admin authority is absent.

Never repair Marketplace accounting by inventing a payment, changing a tx hash,
or charging an already-paid charter again.

## Release verification

Marketplace releases should prove:

- Prisma schema/migration exactness when DB changes exist;
- WoloChain remains observe/verify-only from ordinary release tooling;
- protected Marketplace page checksum remains unchanged unless explicitly
  authorized;
- owner/admin authority tests;
- inquiry/invoice/tax single-use payment behavior;
- final source/build/version certification.
