/**
 * Pure browser-safe presentation for owner L1-L5 storage classes.
 * Every level has its own immutable label; unknown values are HOLD, not L4.
 * This is gross display math, never deletion eligibility or APFS recovery.
 */
export const LEVELS=[
 {level:1,short:"L1 · GUARDED",name:"Source-qualified generated",detail:"No automated action",color:"#22d3ee"},
 {level:2,short:"L2 · TAUGHT REVIEW",name:"Owner taught review",detail:"Category consent required",color:"#fbbf24"},
 {level:3,short:"L3 · INDIVIDUAL",name:"One exact item",detail:"Migration review only",color:"#a78bfa"},
 {level:4,short:"L4 · HUMAN ONLY",name:"Human-only high risk",detail:"Software never deletes",color:"#34d399"},
 {level:5,short:"L5 · NEVER DELETE",name:"Permanent owner protection",detail:"Immutable: no revoke or delete",color:"#fb7185"},
] as const;
export const INVALID_LEVEL={level:null,short:"LEVEL UNKNOWN · HOLD",name:"Unclassified source level",detail:"No review or deletion authority",color:"#64748b"} as const;
export function byLevel(level:number){
 return LEVELS.find(x=>x.level===level)??null;
}
export type GrossLevelInput={level:number;grossBytes:number};
export function grossLevelSlices(items:readonly GrossLevelInput[]){
 const slices=LEVELS.map(x=>({...x,value:0}));
 let unclassified=0,invalidBytes=false;
 for(const item of items){
  if(!Number.isSafeInteger(item.grossBytes)||item.grossBytes<0){invalidBytes=true;continue;}
  const found=slices.find(x=>x.level===item.level);
  if(found)found.value+=item.grossBytes;
  else unclassified+=item.grossBytes;
 }
 const total=slices.reduce((sum,x)=>sum+x.value,0)+unclassified;
 return {total,complete:!invalidBytes&&unclassified===0,
  slices:unclassified>0?[...slices,{...INVALID_LEVEL,value:unclassified}]:slices};
}
