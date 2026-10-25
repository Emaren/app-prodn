#!/usr/bin/env node
/** Scheduled Operator Bridge read probe. Emits bounded sanitized observations;
 * no database credential, publishing, service or financial action is exposed.
 * Existing private ops infrastructure may persist stdout as diagnostic data. */
import {collectSatchelFinanceDiagnostics} from "../lib/warSatchelFinanceDiagnosticsServer.ts";
import {financeDoctorFindings,financeInspectionChecks} from "../lib/warSatchelFinanceDiagnostics.ts";
if(process.argv.slice(2).some(x=>x!=="--json"))throw Error("Only --json is supported; endpoints and financial actions are fixed.");
const report=await collectSatchelFinanceDiagnostics();
console.log(JSON.stringify({...report,doctorFindings:financeDoctorFindings(report),inspectionChecks:financeInspectionChecks(report)},null,2));
// Successful collection remains a financial HOLD. Never use this exit as a
// launch permit or automatically reactivate an ambiguous operation.
process.exitCode=3;
