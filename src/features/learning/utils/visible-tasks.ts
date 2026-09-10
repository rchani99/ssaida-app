export function mergeVisibleTasks<Task extends { study_item_id: string | null }>(
  continuing: Task[],
  today: Task[],
): Task[] {
  const continuingItemIds = new Set(
    continuing.map((task) => task.study_item_id).filter((id) => id !== null),
  );
  return [
    ...continuing,
    ...today.filter(
      (task) => task.study_item_id === null || !continuingItemIds.has(task.study_item_id),
    ),
  ];
}
