import "server-only";
import campaign from "@/config/renaissance-campaign.json";
import indexRegistry from "@/config/kingdom-index-routes.json";
import assurance from "@/config/kingdom-index-assurance-profiles.json";
import rubric from "@/config/kingdom-index-quality-rubric.json";
import { loadKingdomIndex } from "@/lib/kingdomIndex";

export type RenaissanceMode = "command" | "atlas" | "circuit" | "marshal" | "doctor" | "vault" | "arbiter" | "forge" | "architect" | "train" | "sentinel" | "chronicles";
export type RenaissanceRoute = {
  rank:number; href:string; phase:string; phaseCode:string; kind:"public"|"dynamic"|"utility";
  status:"unmeasured"|"current"|"drifted"|"stale"|"provisional";
  score:number|null; profile:string; gates:number; indexed:boolean;
};
export type RenaissanceSnapshot = {
  sourceBaselineSha:string; campaignVersion:string; totalTemplates:number; adminTemplates:number;
  dynamicTemplates:number; indexedTemplates:number; indexObserved:number; indexCertified:number;
  phases:{id:string;code:string;name:string;total:number;publicTotal:number}[];
  routes:RenaissanceRoute[];
  rubric:{id:string;max:number;criteria:{id:string;max:number;requirement:string}[]}[];
  profiles:{id:string;label:string;gates:{id:string;dimension:string;requirement:string}[]}[];
};
const PRIVATE_ROUTES = new Set(["/profile","/settings","/wallet","/connect-wallet","/pending-bets","/past-earnings","/upload","/app"]);
const isRestricted = (href:string) => href==="/admin" || href.startsWith("/admin/") || href.startsWith("/market/invoices/") || PRIVATE_ROUTES.has(href);
export async function loadRenaissanceSnapshot():Promise<RenaissanceSnapshot> {
  const index = await loadKingdomIndex();
  const byHref = new Map(index.pages.map(row => [row.href,row]));
  const profileByHref = assurance.routeProfiles as Record<string,string>;
  const definitions = assurance.profiles as Record<string,{label:string;gates:{id:string;dimension:string;requirement:string}[]}>;
  const routes:RenaissanceRoute[] = [];
  let rank=0;
  for(const phase of campaign.phases) {
    for(const href of phase.routes) {
      rank++;
      if(isRestricted(href)) continue;
      const record=byHref.get(href);
      const profile=profileByHref[href] ?? "unclassified";
      routes.push({rank,href,phase:phase.id,phaseCode:phase.code,
        kind:href.includes("[")?"dynamic":indexRegistry.some(row=>row.href===href)?"public":"utility",
        status:record?.status??"unmeasured",score:record?.score??null,
        profile,gates:definitions[profile]?.gates.length??0,indexed:!!record});
    }
  }
  const all = campaign.phases.flatMap(phase=>phase.routes);
  return {
    sourceBaselineSha:campaign.sourceBaselineSha,campaignVersion:campaign.version,
    totalTemplates:all.length,adminTemplates:all.filter(h=>h==="/admin"||h.startsWith("/admin/")).length,
    dynamicTemplates:all.filter(h=>h.includes("[")).length,
    indexedTemplates:index.pages.length,indexObserved:index.observed,indexCertified:index.certified,
    phases:campaign.phases.map(phase=>({id:phase.id,code:phase.code,name:phase.name,total:phase.routes.length,publicTotal:phase.routes.filter(h=>!isRestricted(h)).length})),
    routes,
    rubric:Object.entries(rubric.dimensions).map(([id,x])=>({id,max:x.weight,criteria:x.criteria.map(c=>({id:c.id,max:c.max,requirement:c.requirement}))})),
    profiles:Object.entries(definitions).map(([id,p])=>({id,label:p.label,gates:p.gates}))
  };
}
export const renaissanceModules = campaign.modules;
