import { studyView as sharedStudyView } from "../lib/study-view";
import { pptStudySettings } from "./study";
export * from "../lib/study-view";

export function studyView(...args: Parameters<typeof sharedStudyView>) {
  const view = sharedStudyView(...args);
  if (view.study?.teacher)
    view.study.teacher.preset = {
      label: "Default",
      settings: pptStudySettings(),
    };
  return view;
}
