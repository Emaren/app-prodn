import type {ContactInboxPayload} from "./types";
export function acknowledgeVisibleRead(args:{payload:ContactInboxPayload;viewerUid:string;isActive:()=>boolean;send?:typeof fetch;now?:()=>number}):Promise<boolean>;
