import type {InboxPayload} from "@/lib/contactInbox";
export function selectRestrictedTarget(summary:unknown,explicit:string|null):string|null;
export function restrictedSyncMarker(conversationId:unknown,rows:unknown):string;
export function mapRestrictedInbox(summary:unknown,history:unknown,options:{actor:string;targetUid:string|null;summaryOnly?:boolean;before?:number|null}):InboxPayload & {summaryTruncated:boolean};
