import { studyView as sharedStudyView } from "../study-view";
import { studyMarketSize } from "../study-config";
import { pptStudySettings } from "./study";
export * from "../study-view";

export function studyView(...args: Parameters<typeof sharedStudyView>) {
  const view = sharedStudyView(...args);
  if (view.study?.teacher)
    view.study.teacher.preset = {
      label: "Default",
      settings: pptStudySettings(studyMarketSize(args[0].config)),
    };
  return view;
}
