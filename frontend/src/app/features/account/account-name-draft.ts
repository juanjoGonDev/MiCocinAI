/** True when the editable value differs from the saved name after server-side trimming. */
export function nameDraftIsDirty(draft: string, savedName: string): boolean {
  return draft.trim() !== savedName.trim();
}
