export function canShowReplayParserDiagnostics(view: string, isAdmin: boolean) {
  return view === "extreme" && isAdmin;
}
