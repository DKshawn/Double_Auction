import { studyView as sharedStudyView } from "../study-view";
import { pptStudySettings } from "./study";
export * from "../study-view";

export function studyView(...args: Parameters<typeof sharedStudyView>) {
  const view = sharedStudyView(...args);
  if (view.study?.teacher)
    view.study.teacher.preset = {
      label: "Default",
      settings: pptStudySettings(),
    };
  return view;
}
