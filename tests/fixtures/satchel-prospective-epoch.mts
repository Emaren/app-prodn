/** TEST-ONLY operator setup in a private Unix-socket PostgreSQL database.
 * Synthetic hashes/signers DO NOT attest mainnet H*, custody, or solvency.
 * Never import this from runtime code. Production inserts demand the separate
 * FINANCIAL approval path and independently certified chain/custody witnesses.
 */
import {createHash} from "node:crypto";
type Sql={query(sql:string,values?:unknown[]):Promise<unknown>};
export async function seedIsolatedProspectiveEpoch(
 sql:Sql,
 input:{vault:string;txHeight:bigint;intentCreatedAt:Date},
) {
 const digest=(text:string)=>createHash("sha256").update(text).digest("hex");
 const e="synthetic_epoch_"+digest(input.vault).slice(0,14);
 const approvedAt=new Date(Math.min(Date.now()-120_000,input.intentCreatedAt.getTime()-120_000));
 if(input.txHeight<=BigInt(1))throw Error("positive synthetic chain height required");
 await sql.query(`INSERT INTO war_satchel_prospective_epochs
 (epoch_id,chain_id,vault_address,start_height,start_app_hash,manifest_sha256,
 source_commit,legacy_claims_sha256,legacy_liabilities_sha256,custody_witness_sha256,
 recovery_witness_sha256,reserve_witness_sha256,five_reviewer_approval_sha256,
 chain_anchor_witness_sha256,approved_at,state)
 VALUES($1,'wolo-1',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'approved')`,[
 e,input.vault,(input.txHeight-BigInt(1)).toString(),digest("test chain root"),
 digest("synthetic nonauthorizing manifest"),"f".repeat(40),digest("frozen claims"),
 digest("unknown legacy liabilities"),digest("synthetic vault witness"),
 digest("synthetic recovery"),digest("synthetic reserves"),digest("synthetic five-role review"),
 digest("synthetic chain anchor"),approvedAt.toISOString(),
 ]);
 return e;
}
