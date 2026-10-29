/* Q17 source-owned navigation allowlist. Admin entries never import into public menus.
 * Every href is backed by an implemented app/admin/<segment>/page.tsx or app/admin/page.tsx.
 * Dynamic user detail routes are not navigable without an actual uid.
 * Source presence is NOT runtime or deployment attestation. */
export type AtlasVisibility = "public" | "admin" | "hidden-draft" | "redirect" | "api-non-nav" | "removed";
export type AtlasCluster = "command" | "people" | "intelligence" | "creative" | "economy" | "infrastructure";
export type AtlasRoute = Readonly<{
  href: string;
  label: string;
  cluster: AtlasCluster;
  detail: string;
  visibility: "admin";
}>;
export const ATLAS_CLUSTERS: ReadonlyArray<{ id: AtlasCluster; label: string; description: string }> = [
  { id: "command", label: "Command", description: "Mission control, evidence and operational decisions" },
  { id: "people", label: "People", description: "Warriors, presence, clans and community" },
  { id: "intelligence", label: "Intelligence", description: "Observers, investigations and replay truth" },
  { id: "creative", label: "Creation", description: "Stories, artwork, events and the workshop" },
  { id: "economy", label: "Economy", description: "Markets, bounties and restricted financial oversight" },
  { id: "infrastructure", label: "Infrastructure", description: "Services, translation and protected operations" },
];
export const ADMIN_ATLAS_ROUTES: readonly AtlasRoute[] = [
  { href:"/admin", label:"Admin Home", cluster:"command", detail:"Original tournament and operator console", visibility:"admin" },
  { href:"/admin/user-list", label:"Command Tower", cluster:"command", detail:"User list, honours and operator command links", visibility:"admin" },
  { href:"/admin/aoe2war-os", label:"AoE2WAR OS · Navigation Atlas", cluster:"command", detail:"Private navigation constellation, audits and releases", visibility:"admin" },
  { href:"/admin/central-command", label:"Central Command", cluster:"command", detail:"Six engineering lanes, work, priorities and release gates", visibility:"admin" },
  { href:"/admin/ai", label:"AI Council Command", cluster:"intelligence", detail:"Private council controls", visibility:"admin" },
  { href:"/admin/auto-bets", label:"Auto Bets Command", cluster:"economy", detail:"Protected betting controls", visibility:"admin" },
  { href:"/admin/bounties", label:"Bounty Command", cluster:"economy", detail:"Bounty operations", visibility:"admin" },
  { href:"/admin/clans", label:"Clan Command", cluster:"people", detail:"Guild and clan administration", visibility:"admin" },
  { href:"/admin/events", label:"Featured Event Studio", cluster:"creative", detail:"Events and tournament presentation", visibility:"admin" },
  { href:"/admin/forum-editor", label:"Forum Editor", cluster:"creative", detail:"Community editorial tools", visibility:"admin" },
  { href:"/admin/hero-studio", label:"Hero Studio", cluster:"creative", detail:"Campaign hero media", visibility:"admin" },
  { href:"/admin/kingdom-bettors", label:"House Bettors", cluster:"economy", detail:"Betting house command", visibility:"admin" },
  { href:"/admin/living-kingdom", label:"Living Kingdom", cluster:"people", detail:"Source-qualified user journeys and presence", visibility:"admin" },
  { href:"/admin/market-integrity", label:"Market Integrity", cluster:"economy", detail:"Evidence-gated integrity controls", visibility:"admin" },
  { href:"/admin/marketplace", label:"Marketplace Command", cluster:"economy", detail:"Merchant administration", visibility:"admin" },
  { href:"/admin/media-assets", label:"Media Armory", cluster:"creative", detail:"Approved production assets", visibility:"admin" },
  { href:"/admin/oracle", label:"Oracle Command", cluster:"intelligence", detail:"Oracle administration", visibility:"admin" },
  { href:"/admin/page-heroes", label:"Page Heroes", cluster:"creative", detail:"Visual page identity", visibility:"admin" },
  { href:"/admin/parser-lab", label:"Replay Engine Room", cluster:"intelligence", detail:"Replay analysis and parser tools", visibility:"admin" },
  { href:"/admin/radio", label:"Radio WOLO Desk", cluster:"creative", detail:"Radio and show operations", visibility:"admin" },
  { href:"/admin/replay-review", label:"Replay Review", cluster:"intelligence", detail:"Authenticated replay review", visibility:"admin" },
  { href:"/admin/storage-os", label:"Storage & Backup Evidence", cluster:"infrastructure", detail:"Read-only capacity and recovery proof; no automatic cleanup", visibility:"admin" },
  { href:"/admin/traffic", label:"Traffic Command", cluster:"intelligence", detail:"Traffic observatory", visibility:"admin" },
  { href:"/admin/translations", label:"Translation Tower", cluster:"infrastructure", detail:"Language administration", visibility:"admin" },
  { href:"/admin/trophies", label:"Trophy Command", cluster:"people", detail:"Tournament honors", visibility:"admin" },
  { href:"/admin/watcher-funnel", label:"Watcher Funnel", cluster:"intelligence", detail:"Watcher adoption evidence", visibility:"admin" },
  { href:"/admin/wolo-transactions", label:"WOLO Transactions", cluster:"economy", detail:"Private transaction observation", visibility:"admin" },
  { href:"/admin/wolochain", label:"WoloChain Command", cluster:"infrastructure", detail:"Chain operations and observation", visibility:"admin" },
  { href:"/admin/workshop", label:"Workshop Command", cluster:"creative", detail:"Kingdom development studio", visibility:"admin" },
] as const;

/* The #997/#998 Job Exchange deep links are deliberately absent until
 * their page.tsx source exists and Central accepts integration. */
export const PENDING_NAVIGATION = [
  { label:"Job Exchange", note:"G-owned route pending source integration" },
  { label:"Work Board / Six Brains", note:"G-owned route pending source integration" },
] as const;
export const NAVIGATION_ATLAS_HREF = "/admin/aoe2war-os#navigation-atlas";
export const NAVIGATION_CLASSIFICATIONS: readonly AtlasVisibility[] = [
  "public", "admin", "hidden-draft", "redirect", "api-non-nav", "removed",
];
