export function splitTaskText(text: string): { title: string; description: string | null } {
  const raw = (text ?? "").trim();
  if (!raw) {return { title: "Untitled task", description: null };}

  const normalized = raw.replace(/\\n/g, "\n");
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length > 1) {
    const desc = lines.slice(1).join("\n")
      .replace(/;\s*(Impact:|Effort:|Acceptance:)/g, "\n$1")
      .replace(/\n{2,}/g, "\n")
      .trim();
    return {
      title: lines[0],
      description: desc || null,
    };
  }

  const single = lines[0] ?? normalized;
  const markers = [" Impact:", " Effort:", " Acceptance:"];
  let cut = -1;
  for (const marker of markers) {
    const idx = single.indexOf(marker);
    if (idx !== -1 && (cut === -1 || idx < cut)) {cut = idx;}
  }

  if (cut > 0) {
    const desc = single
      .slice(cut)
      .trim()
      .replace(/;\s*(Impact:|Effort:|Acceptance:)/g, "\n$1")
      .replace(/\n{2,}/g, "\n")
      .trim();
    return {
      title: single.slice(0, cut).trim(),
      description: desc || null,
    };
  }

  return { title: single, description: null };
}
