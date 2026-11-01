"use client";

import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/** The same accordion presentation in the creation dialog and room preparation. */
export function StudySetupStep({
  id,
  index,
  label,
  summary,
  expanded,
  complete,
  disabled,
  onOpen,
  children,
  footer,
}: {
  id: string;
  index: number;
  label: string;
  summary: string;
  expanded: boolean;
  complete: boolean;
  disabled: boolean;
  onOpen: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={`study-setup-step ${expanded ? "active" : ""}`}>
      <h3>
        <button
          type="button"
          id={`${id}-heading-${index}`}
          className="study-setup-step-toggle"
          aria-expanded={expanded}
          aria-controls={`${id}-panel-${index}`}
          disabled={disabled}
          onClick={onOpen}
        >
          <span className={`study-setup-number ${complete ? "complete" : ""}`}>
            {complete ? <Check size={16} /> : index + 1}
          </span>
          <span className="study-setup-step-title">
            <b>{label}</b>
            <small>{summary}</small>
          </span>
          <span className="study-setup-step-state">
            {expanded
              ? "設定中"
              : complete
                ? "変更"
                : disabled
                  ? "未確認"
                  : "開く"}
          </span>
          <ChevronDown size={16} />
        </button>
      </h3>
      <div
        id={`${id}-panel-${index}`}
        className="study-setup-step-content"
        role="region"
        aria-labelledby={`${id}-heading-${index}`}
        hidden={!expanded}
      >
        {children}
      </div>
      {footer && <div className="study-setup-step-footer">{footer}</div>}
    </section>
  );
}
