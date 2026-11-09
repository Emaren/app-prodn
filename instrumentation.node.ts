import {
  requireNonfinancialAuthDatasource,
} from "./lib/nonfinancialRuntimeAdmission";
import {
  installRuntimeCrashDiagnostics,
  installR25HeapTelemetry,
} from "./lib/runtimeCrashDiagnostics";
import {
  startWarGraphRuntime,
} from "./lib/wargraph/runtime";

if (process.env.NODE_ENV === "production") {
  // Fail the candidate at Next startup, before listening or serving Steam
  // callbacks, if the reviewed auth profile inherited a read-only preview
  // database, broad role or missing financial-runtime isolation.
  requireNonfinancialAuthDatasource(process.env.DATABASE_URL ?? "", process.env);
  installRuntimeCrashDiagnostics();
  installR25HeapTelemetry();
  startWarGraphRuntime();
}
