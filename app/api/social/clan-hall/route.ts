import {NextRequest} from "next/server";
import {getSessionUid} from "@/lib/session";
import {restrictedClanResponse} from "@/lib/restrictedClanHall";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){return restrictedClanResponse(request,await getSessionUid(request));}
