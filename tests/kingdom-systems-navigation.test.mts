import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const shell=src("app/AppShell.tsx");
const header=src("components/HeaderMenu.tsx");
const instruments=src("components/kingdom-instruments/KingdomInstruments.tsx");
const css=src("components/kingdom-instruments/KingdomInstruments.module.css");
const routes=["/kingdom-sensors","/kingdom-tests","/kingdom-recovery"];

test("castle and account menus have exactly one Kingdom Systems gateway and Bettors label",()=>{
  const menus=[
    shell.slice(shell.indexOf("const KINGDOM_LINKS = ["),shell.indexOf("const PAGE_HEADINGS:")),
    header.slice(header.indexOf("const menuEntries = useMemo"),header.indexOf("const visibleEntries =")),
  ];
  for(const menu of menus){
    assert.equal([...menu.matchAll(/href: "\/kingdom-systems"/g)].length,1);
    assert.match(menu,/href: "\/kingdom-bettors", label: "Bettors"/);
    assert.doesNotMatch(menu,/href: "\/kingdom-bettors", label: "Kingdom Bettors"/);
    for(const route of routes)assert.ok(!menu.includes('href: "'+route+'"'),route+" must be behind Systems");
  }
});

test("all three original station URLs remain first-class routable pages",()=>{
  for(const route of routes){
    const code=src("app"+route+"/page.tsx");
    assert.match(code,/KingdomInstruments/);
    assert.ok(instruments.includes('href: "'+route+'"'),"missing Systems launch destination "+route);
  }
  assert.match(instruments,/kind==="systems"&&<SystemsStationDirectory\/>/);
  assert.match(instruments,/data-systems-stations/);
  assert.match(css, /\.systemsStationGrid\{display:grid/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
