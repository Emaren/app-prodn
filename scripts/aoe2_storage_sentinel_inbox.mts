/* Operator-only direct inbox bridge. No HTTP route, no public authentication token. */
import {readFileSync} from "node:fs";
import {getPrisma} from "../lib/prisma.ts";
import {getOrCreateConversationByUsers} from "../lib/contactInbox.ts";
const SENDER_UID="aoe2war-storage-sentinel";
async function main(){
 if(process.env.STORAGE_SENTINEL_DELIVERY_ENABLED!=="1")throw Error("SENTINEL_DELIVERY_NOT_APPROVED");
 const ownerUid=process.env.STORAGE_SENTINEL_OWNER_UID;
 if(!ownerUid||ownerUid.length>100||ownerUid===SENDER_UID)throw Error("PRIVATE_OWNER_ENROLLMENT_REQUIRED");
 const raw=readFileSync(0);
 if(raw.length>4096)throw Error("PRIVATE_DELIVERY_LIMIT");
 const input=JSON.parse(raw.toString("utf8"));
 const id=input.delivery_id,body=input.body;
 if(typeof id!=="string"||!(/^[a-f0-9]{64}(?::daily:\d{8}|:reopen:\d{1,15})?$/).test(id) ||
    typeof body!=="string"||body.length>1700||
    !body.startsWith("STORAGE SENTINEL ")||
    !body.includes("/aoe2war-os/storage-atlas"))throw Error("INVALID_OUTBOX_MESSAGE");
 const prefix="SENTINEL-ID:"+id+"\n";
 const db=getPrisma();
 try{
  await db.$transaction(async tx=>{
   // Prevent two CLI publishers from racing around the find-then-create.
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(282712946)`;
   const [sender,owner]=await Promise.all([
    tx.user.findUnique({where:{uid:SENDER_UID},select:{id:true,isAdmin:true,verificationMethod:true}}),
    tx.user.findUnique({where:{uid:ownerUid},select:{id:true,isAdmin:true,verificationMethod:true}})
   ]);
   // Independently provisioned system identity; NEVER create accounts here.
   if(!sender||sender.isAdmin||sender.verificationMethod!=="system"||
      !owner||!owner.isAdmin||owner.id===sender.id)throw Error("SYSTEM_SENDER_OR_OWNER_NOT_ENROLLED");
   const conversation=await getOrCreateConversationByUsers(tx,sender.id,owner.id);
   const existing=await tx.directMessage.findFirst({where:{conversationId:conversation.id,senderUserId:sender.id,body:{startsWith:prefix}},select:{id:true}});
   if(existing)return;
   await tx.directMessage.create({data:{conversationId:conversation.id,senderUserId:sender.id,body:prefix+body}});
   await tx.directConversation.update({where:{id:conversation.id},data:{updatedAt:new Date()}});
  },{timeout:10000});
  process.stdout.write("DELIVERED_OR_ALREADY_PRESENT\n");
 }finally{await db.$disconnect()}
}
main().catch(()=>{process.stderr.write("HOLD:PRIVATE_OPERATOR_INBOX_DELIVERY\n");process.exitCode=2});
