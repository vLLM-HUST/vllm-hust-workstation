/** UI labels only. Never pass these names to requests, provenance or routing. */
export function modelDisplayName(id: string): string {
  return id.replace(/-(?:A\d{3,4}|H\d{2,3}|L\d{2}S?)$/i, "");
}

export function modelChoiceLabel(id: string, ids: string[]): string {
  const name = modelDisplayName(id);
  const siblings = [...new Set(ids)].filter(value => modelDisplayName(value) === name).sort();
  return siblings.length > 1 ? `${name} · 实例 ${siblings.indexOf(id) + 1}` : name;
}

export function modelSummaryLabel(value: string): string {
  return [...new Set(value.split(/\s+·\s+/).map(modelDisplayName))].join(" · ");
}
