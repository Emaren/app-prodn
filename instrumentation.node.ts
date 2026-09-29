import {
  installRuntimeCrashDiagnostics,
} from "./lib/runtimeCrashDiagnostics";
import {
  startWarGraphRuntime,
} from "./lib/wargraph/runtime";

if (process.env.NODE_ENV === "production") {
  installRuntimeCrashDiagnostics();
  startWarGraphRuntime();
}
