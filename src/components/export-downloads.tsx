"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { errorMessage } from "@/lib/client";
import { EXPORTS, type ExportKind, type ExportProvider } from "@/lib/exports";

export function ExportDownloads({
  code,
  loadExport,
}: {
  code: string;
  loadExport?: ExportProvider;
}) {
  const [pending, setPending] = useState<ExportKind | null>(null);
  const [error, setError] = useState("");
  async function download(kind: ExportKind) {
    setPending(kind);
    setError("");
    try {
      let blob: Blob;
      if (loadExport) {
        const result = await loadExport(kind);
        blob = new Blob([result.content], { type: result.contentType });
      } else {
        const response = await fetch(`/api/rooms/${code}/export?kind=${kind}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || "ダウンロードできませんでした。");
        }
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `auction-${code}-${kind}.${kind === "settings" ? "json" : "csv"}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      <div className="export-buttons">
        {EXPORTS.map(({ kind, label }) => (
          <button
            type="button"
            key={kind}
            className="button secondary"
            disabled={pending !== null}
            onClick={() => void download(kind)}
          >
            <Download size={15} />
            {pending === kind ? "保存中…" : label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
