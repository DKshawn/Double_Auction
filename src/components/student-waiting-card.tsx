import { Check, Clock3 } from "lucide-react";
import type { ReactNode } from "react";

export function StudentWaitingCard({
  children,
  assigned = false,
  className = "",
}: {
  children: ReactNode;
  assigned?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`panel student-waiting-card ${className}`}
      aria-label="学生の待機画面"
    >
      <div className="student-waiting-icon" aria-hidden="true">
        {assigned ? <Check size={32} /> : <Clock3 size={32} />}
      </div>
      {children}
    </section>
  );
}
