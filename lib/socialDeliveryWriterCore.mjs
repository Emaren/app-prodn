// Separate, bounded HD delivery operation; no receipt mutation on GET/SSE.
const CALL="SELECT aoe2war_social_hd_v2.direct_delivered($1::text,$2::text,$3::integer[]) AS decision";
const uid=v=>typeof v==="string"&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v);
const fail=(status,detail)=>({status,body:{detail}});
const validId=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
function action(input){
  if(!input||typeof input!=="object"||Array.isArray(input)||
     Object.keys(input).length!==2||!uid(input.targetUid)||
     !Array.isArray(input.messageIds)||input.messageIds.length<1||input.messageIds.length>50||
     !input.messageIds.every(validId)||new Set(input.messageIds).size!==input.messageIds.length)return null;
  return {targetUid:input.targetUid,messageIds:input.messageIds.slice()};
}
export async function executeSocialDeliveryWrite({pool,verifySession,sessionToken,input,onError}){
  const a=action(input);
  if(!a)return fail(400,"INVALID_DIRECT_DELIVERY_REQUEST");
  if(typeof sessionToken!=="string"||sessionToken.length<32||sessionToken.length>4096)return fail(401,"SIGNED_SESSION_REQUIRED");
  let actor;
  try{actor=await verifySession(sessionToken);if(!uid(actor))throw Error();}
  catch{return fail(401,"INVALID_SIGNED_SESSION");}
  if(actor===a.targetUid)return fail(403,"DIRECT_DELIVERY_DENIED");
  let db,began=false;
  try{
    db=await pool.connect();
    await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");began=true;
    await db.query("SET LOCAL statement_timeout = '1500ms'");
    await db.query("SET LOCAL lock_timeout = '350ms'");
    const d=(await db.query(CALL,[actor,a.targetUid,a.messageIds]))?.rows?.[0]?.decision;
    if(d?.status===200&&d.body?.ok===true&&Object.keys(d.body).length===2&&
       Number.isInteger(d.body.updatedCount)&&d.body.updatedCount>=0&&d.body.updatedCount<=a.messageIds.length){
      await db.query("COMMIT");began=false;
      return {status:200,body:{ok:true,updatedCount:d.body.updatedCount}};
    }
    if([400,401,403,404,409,429,503].includes(d?.status)&&
       typeof d.body?.detail==="string"&&/^[A-Z0-9_]{2,80}$/.test(d.body.detail)){
      await db.query("ROLLBACK");began=false;
      return fail(d.status,d.body.detail);
    }
    throw Error("INVALID_DELIVERY_DECISION");
  }catch(error){
    if(began)await db.query("ROLLBACK").catch(()=>{});
    if(error?.code==="40001"||error?.code==="55P03")return fail(409,"SOCIAL_RETRY_SAFELY");
    onError?.("SOCIAL_DELIVERY_UNAVAILABLE");
    return fail(503,"SOCIAL_DELIVERY_RETRY_SAFELY");
  }finally{db?.release();}
}
