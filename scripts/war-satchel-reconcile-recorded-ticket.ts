/**
 * HD-only operator inspection / post-chain crash recovery for one exact
 * Watcher reservation. No wallet, chain broadcast, fees, refund or retry.
 *
 * Example: npx tsx scripts/war-satchel-reconcile-recorded-ticket.ts
 *             --inspect 1234 567
 * Only independently certified operators can run --reconcile.
 */
import { getPrisma } from "../lib/prisma.ts";
import { reconcileRecordedSatchelTicket } from "../lib/warSatchelRecordedTicketReconciliation.ts";

function parsePositive(raw: string | undefined) {
  if (!raw || !/^[1-9][0-9]{0,12}$/.test(raw)) {
    throw Error("SATCHEL_RECONCILE_INVALID_POSITIVE_INTEGER");
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) throw Error("SATCHEL_RECONCILE_INTEGER_OVERFLOW");
  return n;
}
async function main() {
  const argv=process.argv.slice(2);
  if (argv.length!==3 || !["--inspect","--reconcile"].includes(argv[0])) {
    throw Error("SATCHEL_RECONCILE_USAGE: --inspect EXECUTION_ID OWNER_USER_ID | --reconcile EXECUTION_ID OWNER_USER_ID");
  }
  const executionId=parsePositive(argv[1]),ownerUserId=parsePositive(argv[2]);
  const prisma=getPrisma();
  if (argv[0]==="--inspect") {
    // Inspection cannot query funded tables on an older production database.
    if (process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED!=="true") {
      console.log(JSON.stringify({
        mode:"inspect",source:"not_installed",executionId,ownerUserId,
        noChangesMade:true,transferSent:false,
      }));
      return;
    }
    const reserve=await prisma.satchelFundedReservation.findUnique({
      where:{executionId},
      select:{
        ownerUserId:true,status:true,ticketRequestId:true,
        amountUwolo:true,ticketId:true,
      },
    });
    if(!reserve||reserve.ownerUserId!==ownerUserId)throw Error("SATCHEL_RECONCILE_OWNER_NOT_FOUND");
    console.log(JSON.stringify({
      mode:"inspect",executionId,ownerUserId,
      status:reserve.status,
      ticketId:reserve.ticketId,
      amountUwolo:reserve.amountUwolo.toString(),
      canReconcileOnlyRecordedTicket:reserve.status==="unknown_hold",
      noChangesMade:true,transferSent:false,
    }));
    return;
  }
  if(process.env.WAR_SATCHEL_RECORD_ONLY_RECONCILIATION_ENABLED!=="true"||
     process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED!=="true"){
    throw Error("SATCHEL_RECONCILE_PROTECTED_EXECUTION_DISABLED");
  }
  const result=await reconcileRecordedSatchelTicket(prisma,{executionId,ownerUserId});
  console.log(JSON.stringify({mode:"reconcile",...result,transferSent:false}));
}
main().catch(error=>{
 const code=error instanceof Error?error.message:"SATCHEL_RECONCILE_UNKNOWN";
 console.error(/^SATCHEL_RECONCILE_|^WAR_SATCHEL_FUNDED_REFUSED:/.test(code)
   ?code:"SATCHEL_RECONCILE_FAILED_CLOSED");
 process.exitCode=2;
});
