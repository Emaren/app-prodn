/** Opaque authenticated physical assets, never a global solvency certificate.
 * An API amount, JSON clone or recent caller clock cannot mint this evidence.
 */
import { collectAndVerifyPinnedWarSatchelBankProof } from "./warSatchelAuthenticatedFinancialProof.ts";

const MARK=Symbol("authenticated-wolo-comet-bank-state");
const issued=new WeakSet<object>();
export type AuthenticatedWarSatchelBank=Readonly<{
  chainId:"wolo-1";denom:"uwolo";vaultAddress:string;balanceUwolo:bigint;height:bigint;
  commitHeight:bigint;blockHash:string;appHash:string;observedAtMs:number;
  authenticatedHeadExpiresAtMs:number;[MARK]:true;
}>;
export function authenticatedWarSatchelBankFreshAt(value:unknown,nowMs=Date.now()):value is AuthenticatedWarSatchelBank{
  if(!value||typeof value!=="object"||!issued.has(value))return false;
  const bank=value as AuthenticatedWarSatchelBank;
  return Number.isSafeInteger(nowMs)&&Number.isSafeInteger(bank.observedAtMs)&&
    bank.observedAtMs<=nowMs&&nowMs-bank.observedAtMs<=30_000&&
    Number.isSafeInteger(bank.authenticatedHeadExpiresAtMs)&&nowMs<bank.authenticatedHeadExpiresAtMs;
}
export async function authenticateWarSatchelBank(vault:string,reader:typeof fetch=fetch,canceled?:AbortSignal):Promise<AuthenticatedWarSatchelBank>{
  const verified=await collectAndVerifyPinnedWarSatchelBankProof(vault,reader,canceled);
  const result=Object.freeze({chainId:"wolo-1" as const,denom:"uwolo" as const,
    vaultAddress:verified.vaultAddress,balanceUwolo:verified.balanceUwolo,height:verified.height,
    commitHeight:verified.commitHeight,blockHash:verified.blockHash,appHash:verified.appHash,
    observedAtMs:verified.verifiedAtMs,authenticatedHeadExpiresAtMs:verified.authenticatedHeadExpiresAtMs,[MARK]:true as const});
  issued.add(result);
  return result;
}
