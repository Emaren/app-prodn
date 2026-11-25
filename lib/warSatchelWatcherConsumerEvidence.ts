/** Rebind queued Watcher admission to CURRENT locked owner/market facts.
 * Saved sourceEvidence flags describe an earlier admission, not a perpetual
 * authority to spend after Steam, session, roster or side identity changes.
 */
import {normalizeReplaySteamId} from "./replayPlayerIdentity.ts";
import {normalizeReplayPlayers,resolveReplayTeams} from "./teamResolution.ts";
import {satchelWatcherSpendWindowIssue,type SatchelWatcherSpendMarket} from "./warSatchelWatcherSpendWindow.ts";

type Execution={gameIdentityKey:string;sessionKey:string|null;propositionHash:string;
 selectedSide:string|null;winnerMarketId:number;desyncMarketId:number|null;sourceEvidence:unknown};
type Market={id:number;linkedSessionKey:string|null;propositionHash:string|null;
 sourceRosterHash:string|null;sourceParseIteration:number|null;
 teamResolutionStatus:string|null;teamConfidence:string|null;
 leftRosterSnapshot:unknown;rightRosterSnapshot:unknown};
export function satchelWatcherConsumerIdentityIssue(input:{
 execution:Execution;owner:{uid:string;steamId:string|null};market:Market;
}):string|null{
 const {execution:x,owner,market:m}=input;
 const e=x.sourceEvidence&&typeof x.sourceEvidence==="object"&&!Array.isArray(x.sourceEvidence)
  ?x.sourceEvidence as Record<string,unknown>:{};
 const steam=normalizeReplaySteamId(owner.steamId);
 if(!steam||e.ownerUid!==owner.uid||normalizeReplaySteamId(e.ownerSteamId)!==steam)
  return "watcher_consumer_owner_steam_changed";
 if(e.mode!=="shadow"||e.exactSteamRosterMatch!==true||e.exactUploaderUidMatch!==true||
    e.marketIntegrityStatus!=="verified"||e.teamResolutionStatus!=="resolved"||e.teamConfidence!=="high"||
    e.winnerMarketId!==x.winnerMarketId||e.desyncMarketId!==x.desyncMarketId||m.id!==x.winnerMarketId||
    !m.linkedSessionKey||e.linkedSessionKey!==m.linkedSessionKey||
    e.canonicalSessionKey!==x.gameIdentityKey||x.sessionKey!==x.gameIdentityKey||
    e.propositionHash!==x.propositionHash||m.propositionHash!==x.propositionHash)
  return "watcher_consumer_game_identity_changed";
 if(m.teamResolutionStatus!=="resolved"||m.teamConfidence!=="high"||
    !m.sourceRosterHash||e.sourceRosterHash!==m.sourceRosterHash||
    !Number.isSafeInteger(m.sourceParseIteration)||(m.sourceParseIteration??0)<1||
    e.sourceParseIteration!==m.sourceParseIteration)
  return "watcher_consumer_roster_changed";
 const left=normalizeReplayPlayers(m.leftRosterSnapshot),right=normalizeReplayPlayers(m.rightRosterSnapshot);
 const resolution=resolveReplayTeams([...left,...right]);
 const keys=(players:typeof left)=>players.map(p=>p.stablePlayerKey).sort().join("\n");
 if(resolution.status!=="resolved"||resolution.confidence!=="high"||resolution.teams.length!==2||
    resolution.rosterHash!==m.sourceRosterHash||resolution.propositionHash!==m.propositionHash||
    keys(resolution.teams[0].players)!==keys(left)||keys(resolution.teams[1].players)!==keys(right))
  return "watcher_consumer_roster_changed";
 const onLeft=left.some(p=>p.steamId===steam),onRight=right.some(p=>p.steamId===steam);
 if(onLeft===onRight||x.selectedSide!==(onLeft?"left":"right"))
  return "watcher_consumer_selected_side_changed";
 return null;
}
/** Recheck the same signed authority at the END of database I/O as well as
 * initial admission. A fresh chain proof cannot extend an expired game or
 * owner spending window. Throwing before commit rolls back every posting.
 */
export function satchelWatcherConsumerTimeIssue(input:{
 markets:readonly SatchelWatcherSpendMarket[];executionCreatedAt:Date;
 signedAt:Date;spendExpiresAt:Date;now:Date;
}):string|null{
 if(!Number.isFinite(input.now.getTime())||!Number.isFinite(input.spendExpiresAt.getTime())||
    input.now.getTime()>=input.spendExpiresAt.getTime())
  return "watcher_consumer_mandate_expired_during_transaction";
 if(input.markets.length<1||input.markets.length>2)return "watcher_consumer_market_window_missing";
 for(const market of input.markets){
  const issue=satchelWatcherSpendWindowIssue({market,executionCreatedAt:input.executionCreatedAt,
   signedAt:input.signedAt,now:input.now});
  if(issue)return issue;
 }
 return null;
}
