export type MeetingStageMode = "board" | "screen";

export function canAnnotateInStage(canAnnotateByPermission: boolean, stageMode: MeetingStageMode) {
  return canAnnotateByPermission && stageMode === "board";
}

export function getStageModeLabel(stageMode: MeetingStageMode) {
  return stageMode === "board" ? "Annotation board" : "Live screen";
}
