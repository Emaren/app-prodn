import {requireServerAdmin} from "@/lib/adminSession";
import JobExchangeClient from "@/components/central-command/JobExchangeClient";
import registry from "@/config/central-command-lanes.json";
export const dynamic="force-dynamic";
export default async function JobBoardPrivate(){
 await requireServerAdmin();
 const lanes=registry.lanes.map(l=>({id:l.id,label:l.label,issueUrl:"https://github.com/"+l.issue.repository+"/issues/"+l.issue.number}));
 return <JobExchangeClient lanes={lanes}/>;
}
