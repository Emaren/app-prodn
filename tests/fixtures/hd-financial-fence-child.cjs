// Disposable PostgreSQL integration process only. Not an operator launcher.
const {Module}=require("node:module"),fs=require("node:fs"),path=require("node:path"),ts=require("typescript"),pg=require("pg");
const filename=path.resolve("lib/hdFinancialMaintenanceFence.ts"),m=new Module(filename);
m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
m._compile(ts.transpileModule(fs.readFileSync(filename,"utf8")+"\nexport {withConfiguredLease};",{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const fixture=JSON.parse(process.env.HD_FENCE_CHILD_FIXTURE);
m.exports.withConfiguredLease(new pg.Client({host:fixture.socket,user:"fence_reader",database:"postgres"}),fixture.authority,fixture.input,async signal=>{
  process.stdout.write("ADMITTED\n");
  await new Promise(resolve=>process.stdin.once("data",resolve));signal.throwIfAborted();
  process.stdout.write("ACTION_DONE\n");
}).then(()=>{process.stdout.write("COMPLETE\n");process.exit(0);},()=>{process.stdout.write("HELD_OR_UNKNOWN\n");process.exit(2);});
