/** Disposable integration fixture only. No inherited DB URL, TCP listener,
 * production schema mutation, financial activation or network chain source. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createECDH, createPrivateKey, randomBytes, randomUUID, sign} from "node:crypto";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../../lib/generated/prisma/index.js";
import {makeSignDoc, pubkeyToAddress, serializeSignDoc} from "@cosmjs/amino";
import {satchelAutoSpendChallengeText, verifySatchelAutoSpendSignature, type SatchelSpendChallenge} from "../../lib/warSatchelAutoSpendConsent.ts";
import {normalizeReplayPlayers, resolveReplayTeams} from "../../lib/teamResolution.ts";
import type {LiveGameSession} from "../../lib/liveSessionSnapshot.ts";

const REPOSITORY = fileURLToPath(new URL("../../", import.meta.url));
const ROLE = "satchel_lifecycle_fixture";
// The repository intentionally declares the untyped pg package globally.
// Keep this disposable fixture's used driver surface explicit.
type FixtureSql = {
  connect():Promise<void>;end():Promise<void>;
  query<Row=Record<string,string>>(text:string,values?:unknown[]):Promise<{rows:Row[];rowCount:number|null}>;
};

export async function startLifecycleDatabase() {
  const bin = process.env.AOE2WAR_TEST_PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
  assert.ok(existsSync(path.join(bin, "initdb")), "isolated PostgreSQL 16 tools required");
  assert.match(execFileSync(path.join(bin, "postgres"), ["--version"], {encoding: "utf8"}), /PostgreSQL\) 16\./);
  const root = realpathSync(mkdtempSync("/tmp/aoe2-satchel-lifecycle-"));
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  mkdirSync(socket, {mode: 0o700});
  let started = false, closed = false;
  let sql: FixtureSql | undefined, prisma: PrismaClient | undefined;
  const cleanup = async () => {
    if (closed) return; closed = true;
    try { await prisma?.$disconnect(); } finally {
      try { await sql?.end(); } finally {
        try {
          if (started) execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], {stdio: "pipe", timeout: 30000});
        } finally { rmSync(root, {recursive: true, force: true}); }
      }
    }
  };
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", data, "-U", ROLE, "--auth-local=trust", "--auth-host=reject"], {stdio: "pipe", timeout: 30000});
    execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-h '' -k ${socket} -c timezone=UTC`, "-w", "start"], {stdio: "pipe", timeout: 30000});
    started = true;
    sql = new pg.Client({host: socket, port: 5432, user: ROLE, database: "postgres"}) as FixtureSql;
    await sql.connect(); await sql.query("SET statement_timeout='20s'");
    // Diff compares two datamodels offline. Explicit disposable configuration
    // wins over dotenv; neither datasource flag nor migration execution CLI
    // is used. Prisma adapters below connect only to our private Unix socket.
    const env: NodeJS.ProcessEnv = {...process.env, DATABASE_URL: "postgresql://fixture@127.0.0.1:1/unused_offline_schema"};
    for (const key of Object.keys(env)) if (key.startsWith("PG") || ["DIRECT_URL", "SHADOW_DATABASE_URL"].includes(key)) delete env[key];
    const ddl = execFileSync(path.join(REPOSITORY, "node_modules/.bin/prisma"), ["migrate", "diff", "--from-empty", "--to-schema", path.join(REPOSITORY, "prisma/schema.prisma"), "--script"],
      {cwd: REPOSITORY, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120000});
    assert.ok(ddl.includes('CREATE TABLE "war_satchel_deposit_intents"'), "offline Prisma diff omitted full datamodel: "+ddl.slice(0,500));
    // The schema intentionally refers to this separately managed sequence.
    await sql.query("CREATE SEQUENCE battle_public_number_seq START 1");
    await sql.query(ddl);
    const names = (await sql.query<{tablename: string}>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND left(tablename,12)='war_satchel_' ORDER BY tablename")).rows.map(r => r.tablename);
    assert.ok(names.length > 10, "full Prisma Satchel schema must exist before guard installation");
    for (const name of names) {
      assert.match(name, /^war_satchel_[a-z_]+$/);
      assert.equal((await sql.query(`SELECT count(*) AS count FROM public."${name}"`)).rows[0].count, "0", "never drop populated fixture history");
    }
    const externalDependents = await sql.query("SELECT conname FROM pg_constraint WHERE contype='f' AND confrelid::regclass::text=ANY($1::text[]) AND NOT conrelid::regclass::text=ANY($1::text[])", [names]);
    assert.equal(externalDependents.rowCount, 0, "Satchel reconstruction cannot remove unrelated application constraints");
    await sql.query(`DROP TABLE ${names.map(name => `public."${name}"`).join(",")} CASCADE`);
    // Reinstall complete actual source migrations, including SQL-only CHECKs,
    // admission/immutability triggers and physical receipt uniqueness absent
    // from Prisma's datamodel. No production migration frontier is inferred.
    const migrations = readdirSync(path.join(REPOSITORY, "prisma/migrations"))
      .filter(name => /^\d{8}_\d{6}_war_satchel_/.test(name)).sort();
    assert.ok(migrations.includes("20261019_010000_war_satchel_wager_authority"));
    for (const name of migrations) await sql.query(readFileSync(path.join(REPOSITORY, "prisma/migrations", name, "migration.sql"), "utf8"));
    const tableCount = Number((await sql.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count);
    assert.ok(tableCount > 100, "canonical application dependencies must use full relational schema");
    prisma = new PrismaClient({adapter: new PrismaPg({host: socket, port: 5432, user: ROLE, database: "postgres", max: 6})});
    await prisma.$queryRaw`SELECT 1`;
    return {prisma, sql, root, cleanup, migrations, tableCount};
  } catch (error) { await cleanup(); throw error; }
}
export type LifecycleDatabase = Awaited<ReturnType<typeof startLifecycleDatabase>>;

/** Public, test-only secp256k1 key material may be supplied by the continuous
 * isolated SDK fixture. Never load a mnemonic, keyring or environment secret. */
export function lifecycleOwnerKey(privateKeyHex?: string) {
  if (privateKeyHex !== undefined) assert.match(privateKeyHex, /^[0-9a-f]{64}$/);
  const scalar = privateKeyHex === undefined ? Buffer.alloc(32, 7) : Buffer.from(privateKeyHex, "hex");
  const curve = createECDH("secp256k1"); curve.setPrivateKey(scalar);
  const uncompressed = curve.getPublicKey(undefined, "uncompressed");
  const publicKeyBase64 = curve.getPublicKey(undefined, "compressed").toString("base64");
  const privateKey = createPrivateKey({format: "jwk", key: {kty: "EC", crv: "secp256k1",
    d: scalar.toString("base64url"), x: uncompressed.subarray(1, 33).toString("base64url"), y: uncompressed.subarray(33).toString("base64url")}});
  const pub_key = {type: "tendermint/PubKeySecp256k1", value: publicKeyBase64};
  const walletAddress = pubkeyToAddress(pub_key, "wolo");
  return {walletAddress, publicKeyBase64, signAdr36(text: string) {
    const doc = makeSignDoc([{type: "sign/MsgSignData", value: {signer: walletAddress, data: Buffer.from(text).toString("base64")}}], {amount: [], gas: "0"}, "", "", "0", "0");
    const signature=sign("sha256", Buffer.from(serializeSignDoc(doc)), {key: privateKey, dsaEncoding: "ieee-p1363"});
    // Keplr/Cosmos emits canonical low-S secp256k1 signatures. Node's OpenSSL
    // signer may emit the equivalent high-S form which the SDK rejects.
    const order=BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
    const s=BigInt("0x"+signature.subarray(32).toString("hex"));
    if(s>order/BigInt(2))Buffer.from((order-s).toString(16).padStart(64,"0"),"hex").copy(signature,32);
    return {pub_key: {...pub_key}, signature: signature.toString("base64")};
  }};
}

/** Seed domain inputs only: the real Watcher worker must create its own
 * execution row; the real authenticated deposit must create its own balance.
 * Default plan is one 12-WOLO winner leg, no Desync, bounded future games. */
export async function seedLifecycleOwnerAndMarkets(db: LifecycleDatabase, options: {
  ownerPrivateKeyHex?: string; ownerWalletAddress?: string; ownerUid?: string;
  ownerSteamId?: string; now?: Date; team?: boolean; gamesRemaining?: number;
  sessionKey?: string; stakeWolo?: number;
} = {}) {
  const key = lifecycleOwnerKey(options.ownerPrivateKeyHex);
  if (options.ownerWalletAddress !== undefined) assert.equal(options.ownerWalletAddress, key.walletAddress, "SDK depositor must own the actual ADR36 key");
  const now = options.now ?? new Date(); assert.ok(Number.isFinite(now.getTime()));
  const ownerUid = options.ownerUid ?? "owner-1", ownerSteamId = options.ownerSteamId ?? "76561198000000001";
  const owner = await db.prisma.user.create({data: {uid: ownerUid, walletAddress: key.walletAddress, steamId: ownerSteamId,
    inGameName: "LifecycleOwner", steamPersonaName: "LifecycleOwner", verified: true, verificationLevel: 2, verificationMethod: "isolated_test_fixture"}});
  const gamesRemaining = options.gamesRemaining ?? 3;
  const stakeWolo = options.stakeWolo ?? 12;
  assert.ok(Number.isSafeInteger(stakeWolo) && stakeWolo > 0 && stakeWolo <= 1000);
  const preset = await db.prisma.betAutoPreset.create({data: {userId: owner.id, enabled: true, winnerStakeWolo: stakeWolo,
    desyncSide: "none", desyncStakeWolo: 0, untilOut: false, gamesRemaining, selfOnly: true, version: 1}});
  const issuedAt = new Date(now.getTime() - 10000), signedAt = new Date(now.getTime() - 5000);
  const challenge: SatchelSpendChallenge = {ownerUid, walletAddress: key.walletAddress, presetId: preset.id, presetVersion: preset.version,
    winnerStakeWolo: stakeWolo, desyncSide: "none", desyncStakeWolo: 0, perGameCapWolo: 1000, dailyCapWolo: 10000,
    untilOut: false, gamesRemaining, nonce: randomBytes(16).toString("hex"), issuedAtUtc: issuedAt.toISOString(),
    challengeExpiresAtUtc: new Date(now.getTime() + 240000).toISOString(), spendExpiresAtUtc: new Date(now.getTime() + 3600000).toISOString(),
    signedAtUtc: null, revokedAtUtc: null};
  const challengeText = satchelAutoSpendChallengeText(challenge), signature = key.signAdr36(challengeText);
  verifySatchelAutoSpendSignature({challenge, ownerUid, ownerWallet: key.walletAddress, presetId: preset.id,
    presetVersion: preset.version, nowUtc: signedAt.toISOString(), keplrSignature: signature});
  const consentId = randomUUID();
  const consent = await db.prisma.satchelAutoSpendConsent.create({data: {id: consentId, ownerUserId: owner.id,
    presetId: preset.id, presetVersion: preset.version, ownerUid, walletAddress: key.walletAddress, nonce: challenge.nonce,
    winnerStakeWolo: stakeWolo, desyncSide: "none", desyncStakeWolo: 0, perGameCapWolo: 1000, dailyCapWolo: 10000,
    issuedAt, challengeExpiresAt: new Date(challenge.challengeExpiresAtUtc), spendExpiresAt: new Date(challenge.spendExpiresAtUtc), signedAt,
    originalMandate: {create: {untilOut: false, gamesRemaining, challengeText, ownerSignatureJson: signature, signedAt}}}});
  const source = await seedLifecycleSession(db, {ownerUid, ownerSteamId, now, team:options.team, sessionKey:options.sessionKey});
  return {owner, preset, ...source, challenge, signature, consent, ownerKey: key, now};
}

export async function seedLifecycleSession(db:LifecycleDatabase, options:{ownerUid:string;ownerSteamId:string;now:Date;team?:boolean;sessionKey?:string}) {
  const {ownerUid,ownerSteamId,now}=options;
  const marketAt = new Date(now.getTime() - 3000);
  const rawPlayers = [{name: "LifecycleOwner", steamId: ownerSteamId, teamId: 1},
    ...(options.team === false ? [] : [{name: "LifecycleTeammate", steamId: "76561198000000003", teamId: 1}]),
    {name: "LifecycleOpponent", steamId: "76561198000000002", teamId: 2},
    ...(options.team === false ? [] : [{name: "LifecycleOpponentTwo", steamId: "76561198000000004", teamId: 2}])];
  const players = normalizeReplayPlayers(rawPlayers), teamResolution = resolveReplayTeams(players);
  assert.equal(teamResolution.status, "resolved"); assert.equal(teamResolution.confidence, "high");
  assert.ok(teamResolution.propositionHash); assert.ok(teamResolution.rosterHash);
  const sessionKey = options.sessionKey ?? "watcher:lifecycle:" + randomUUID();
  const market = await db.prisma.betMarket.create({data: {slug: "lifecycle-" + randomUUID(), title: "Isolated lifecycle owner/team wager",
    eventLabel: "Isolated SDK/PG lifecycle", marketType: "winner", status: "live", integrityStatus: "verified",
    linkedSessionKey: sessionKey, teamFormat: teamResolution.format, teamResolutionStatus: teamResolution.status,
    teamResolutionProvenance: teamResolution.provenance, teamConfidence: teamResolution.confidence,
    leftRosterSnapshot: rawPlayers.filter(p => p.teamId === 1), rightRosterSnapshot: rawPlayers.filter(p => p.teamId === 2),
    leftLabel: rawPlayers.filter(p=>p.teamId===1).map(p=>p.name).join(" / "), rightLabel: rawPlayers.filter(p=>p.teamId===2).map(p=>p.name).join(" / "), propositionHash: teamResolution.propositionHash,
    sourceRosterHash: teamResolution.rosterHash, sourceParseIteration: 1, createdAt: marketAt,
    phaseOpensAt: marketAt, closeAt: new Date(now.getTime() + 600000)}});
  const session: LiveGameSession = {id: market.id, sessionKey, identityAliases: [], replayFile: null,
    replayHash: teamResolution.rosterHash, parseIteration: 1, createdAt: marketAt.toISOString(), updatedAt: now.toISOString(),
    completedAt: null, playedOn: marketAt.toISOString(), mapName: "Arabia", durationSeconds: null, originalFilename: null,
    disconnectDetected: false, winner: null, bettingEligible: true, parseReason: "watcher_live", parseSource: "watcher",
    unresolvedResult: null, state: "live", finalProofPending: false, players, teamResolution,
    uploaders: [{uid: ownerUid, displayName: "LifecycleOwner", parseRows: 1, lastSeenAt: now.toISOString()}],
    watcherCount: 1, watcherIds: ["isolated-lifecycle-watcher"], watcherSessionIds: [sessionKey],
    authenticatedWatcherParticipantUids: [ownerUid], authenticatedLiveWatcherParticipantUids: [ownerUid],
    authenticatedLiveObservedAt: now.toISOString(), authenticatedLiveObservations: [{uid: ownerUid, observedAt: now.toISOString(), gameType: "Random Map", players}],
    replayFingerprints: [teamResolution.rosterHash], watcherVersions: ["isolated-fixture"], parseRows: 1, coverageLevel: "single", disposition: "live",
    uploader: {uid: ownerUid, displayName: "LifecycleOwner"}};
  return {market, session};
}
