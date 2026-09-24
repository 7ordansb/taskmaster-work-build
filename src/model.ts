export type ItemKind = 'task' | 'segment';
export type LinkKind = 'timed' | 'dependent' | 'parallel';
export interface WorkItem {
  id: string; title: string; kind: ItemKind; parentId: string | null; segmentId: string | null;
  status: string; dueDate: string | null; startDate: string | null; notes: string;
  position: number; size: number | null; createdAt: string; updatedAt: string;
}
export interface TaskLink {
  id: string; sourceId: string; targetId: string; kind: LinkKind;
  timing: string | null; label: string; createdAt: string;
}
export interface SegmentRule { segmentId: string; type: 'default-due-days' | 'default-size' | 'required-link'; value: string }

export const DEFAULT_SEGMENTS = [
  { title: 'Inbox', color: '#a7b3a5' }, { title: 'In progress', color: '#85a6cf' },
  { title: 'Review', color: '#d7ad70' }, { title: 'Done', color: '#88ae91' },
];
export const LINK_STYLES: Record<LinkKind, { label: string; color: string; dash: string; marker: string }> = {
  timed: { label: 'Timed', color: '#a77bce', dash: '5 5', marker: '⏱' },
  dependent: { label: 'Depends on', color: '#dc856f', dash: '', marker: '→' },
  parallel: { label: 'Parallel', color: '#5b9f91', dash: '2 4', marker: '∥' },
};

export function itemSize(item: WorkItem, mode: 'manual' | 'due' | 'children', all: WorkItem[], min = 34, max = 82) {
  if (mode === 'manual') return Math.max(min, Math.min(max, item.size ?? 48));
  let raw = 48;
  if (mode === 'children') raw += all.filter(x => x.parentId === item.id).length * 7;
  if (mode === 'due' && item.dueDate) {
    const days = (new Date(item.dueDate).getTime() - Date.now()) / 86400000;
    raw = days < 0 ? 68 : days <= 1 ? 72 : days <= 3 ? 64 : days <= 7 ? 57 : days <= 30 ? 48 : 40;
  }
  return Math.max(min, Math.min(max, raw));
}

export function canMove(items: WorkItem[], movingId: string, parentId: string | null): boolean {
  if (movingId === parentId) return false;
  let cursor = parentId;
  while (cursor) { if (cursor === movingId) return false; cursor = items.find(x => x.id === cursor)?.parentId ?? null; }
  return true;
}
