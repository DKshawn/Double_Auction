import { JudgmentDemoEntry } from "@/experiments/judgment/components/demo-entry";
import { studies } from "@/experiments/judgment/server/core";

export default function JudgmentDemoPage() {
  return <JudgmentDemoEntry studies={studies} />;
}
