export function csv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            // Protect spreadsheet users from formulas in participant-controlled names.
            if (
              typeof value === "string" &&
              /^(?:\s*[=+\-@]|[\t\r\n])/.test(text)
            )
              text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
