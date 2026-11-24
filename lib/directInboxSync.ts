import {createHash} from "node:crypto";
export const DIRECT_SYNC_WINDOW=80;
type MarkerRow={id:number;deliveredAt:Date|null;editedAt:Date|null};
export function directInboxMarker(conversationId:number,rows:MarkerRow[]){
  const ordered=rows.slice().sort((a,b)=>b.id-a.id).slice(0,DIRECT_SYNC_WINDOW);
  return createHash("sha256").update(JSON.stringify([conversationId,
    ordered.map(row=>[row.id,row.deliveredAt?.toISOString()??null,row.editedAt?.toISOString()??null])])).digest("hex");
}
type Reader={$queryRaw:<T>(strings:TemplateStringsArray,...values:unknown[])=>Promise<T>};
type ProbeRow={conversationId:number;id:number|null;deliveredAt:Date|null;editedAt:Date|null};
const validUid=(v:string)=>/^[A-Za-z0-9_.:-]{1,100}$/.test(v);
// Existing admitted read-only relations. No raw row or timestamp leaves the server.
export async function readDirectInboxSyncMarker(prisma:Reader,viewerUid:string,targetUid:string){
  if(!validUid(viewerUid)||!validUid(targetUid)||viewerUid===targetUid)return null;
  const rows=await prisma.$queryRaw<ProbeRow[]>`
    SELECT c.id AS "conversationId", m.id, m.delivered_at AS "deliveredAt", m.edited_at AS "editedAt"
    FROM public.users a JOIN public.users b ON b.uid=${targetUid}
    JOIN public.direct_conversations c
      ON c.pair_key=least(a.id,b.id)::text||':'||greatest(a.id,b.id)::text
    LEFT JOIN LATERAL (
      SELECT id,delivered_at,edited_at FROM public.direct_messages
      WHERE conversation_id=c.id ORDER BY id DESC LIMIT 80
    ) m ON true
    WHERE a.uid=${viewerUid} AND a.id<>b.id
      AND EXISTS(SELECT 1 FROM public.direct_conversation_participants p WHERE p.conversation_id=c.id AND p.user_id=a.id)
      AND EXISTS(SELECT 1 FROM public.direct_conversation_participants p WHERE p.conversation_id=c.id AND p.user_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM public.direct_conversation_participants p WHERE p.conversation_id=c.id AND p.user_id NOT IN(a.id,b.id))
    ORDER BY m.id DESC NULLS LAST
  `;
  if(!rows.length||rows.length>DIRECT_SYNC_WINDOW)return null;
  const conversationId=rows[0].conversationId;
  if(rows.some(row=>row.conversationId!==conversationId))return null;
  return directInboxMarker(conversationId,rows.flatMap(row=>row.id===null?[]:[{id:row.id,deliveredAt:row.deliveredAt,editedAt:row.editedAt}]));
}
