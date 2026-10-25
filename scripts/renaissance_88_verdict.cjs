"use strict";
/** Deterministic candidate smoke verdict. A fixture outage is not a site regression. */
function classifyCandidateRoute(record,dbFixture){
 if(!record||!Array.isArray(record.views)||record.views.length===0)return "UNKNOWN";
 let unknown=false;
 for(const view of record.views){
  if(view.browserStatus==="FAIL" && !view.dependencyUnavailable)return "FAIL";
  if(view.http!==200||view.sameOrigin!==true||view.final_path!==record.route)return "FAIL";
  if(view.dependencyUnavailable){
   if(dbFixture==="UNAVAILABLE"){unknown=true;continue;}
   return "FAIL";
  }
  if(!view.rendered||!view.body_title||!view.landmark||view.keyboardFocus!==true||
     view.uncaughtErrors>0)return "FAIL";
  if(view.browserStatus==="UNKNOWN")unknown=true;
 }
 // Browser-intercepted POSTs did not execute. Report separately as unknown
 // write-side contract, never conflate attempts with a failed GET navigation.
 return unknown?"UNKNOWN":"PASS";
}
module.exports={classifyCandidateRoute};
