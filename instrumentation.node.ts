import {
  startWarGraphRuntime,
} from "./lib/wargraph/runtime";

if (process.env.NODE_ENV === "production") {
  startWarGraphRuntime();
}
