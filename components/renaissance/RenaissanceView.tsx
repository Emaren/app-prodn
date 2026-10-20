import RenaissanceCanvas from "./RenaissanceCanvas";
import {loadRenaissanceSnapshot,type RenaissanceMode} from "@/lib/renaissance/registry";
export default async function RenaissanceView({mode}:{mode:RenaissanceMode}) {
  const snapshot=await loadRenaissanceSnapshot();
  return <RenaissanceCanvas mode={mode} snapshot={snapshot}/>;
}
