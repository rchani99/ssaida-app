import { GripVertical } from 'lucide-react-native';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';

import type { DailyTask } from '@/features/learning/types/learning.types';
import type { ReactNode } from 'react';

export function dragTarget(index: number, distance: number, stride: number, count: number) {
  return Math.max(0, Math.min(count - 1, index + Math.round(distance / stride)));
}

export function TaskDragList({
  tasks,
  disabled,
  onMove,
  onDragStateChange,
  draggableIds = tasks.map((task) => task.id),
  renderDetails,
  renderBadge,
  showHint = true,
}: {
  tasks: DailyTask[];
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onDragStateChange: (dragging: boolean) => void;
  draggableIds?: string[];
  renderDetails?: (task: DailyTask) => ReactNode;
  renderBadge?: (task: DailyTask) => ReactNode;
  showHint?: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const layouts = useRef(new Map<string, { y: number; height: number }>());
  const indexes = tasks.flatMap((task, index) => (draggableIds.includes(task.id) ? [index] : []));
  const target = (index: number, distance: number) => {
    const start = layouts.current.get(tasks[index].id);
    if (!start) return index;
    const center = start.y + start.height / 2 + distance;
    return indexes.reduce((nearest, candidate) => {
      const row = layouts.current.get(tasks[candidate].id);
      const best = layouts.current.get(tasks[nearest].id);
      return row &&
        best &&
        Math.abs(row.y + row.height / 2 - center) < Math.abs(best.y + best.height / 2 - center)
        ? candidate
        : nearest;
    }, index);
  };
  return (
    <View style={{ gap: t.spacing[8] }}>
      {showHint && indexes.length > 1 && (
        <Text style={styles.hint}>오른쪽 손잡이를 잡고 원하는 위치로 끌어 놓으세요.</Text>
      )}
      {tasks.map((task, index) => (
        <View
          key={task.id}
          style={{ zIndex: draggingId === task.id ? 1 : 0 }}
          onLayout={({ nativeEvent }) => {
            layouts.current.set(task.id, nativeEvent.layout);
          }}
        >
          <DragRow
            task={task}
            index={index}
            indexes={indexes}
            disabled={disabled}
            draggable={indexes.length > 1 && indexes.includes(index)}
            target={target}
            onMove={onMove}
            onDragStateChange={(active) => {
              setDraggingId(active ? task.id : null);
              onDragStateChange(active);
            }}
            details={renderDetails?.(task)}
            badge={renderBadge?.(task)}
          />
        </View>
      ))}
    </View>
  );
}

function DragRow(props: {
  task: DailyTask;
  index: number;
  indexes: number[];
  disabled: boolean;
  draggable: boolean;
  target: (index: number, distance: number) => number;
  onMove: (from: number, to: number) => void;
  onDragStateChange: (dragging: boolean) => void;
  details?: ReactNode;
  badge?: ReactNode;
}) {
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const active = useRef(false);
  const [offset, setOffset] = useState<number | null>(null);
  const responder = useMemo(() => {
    const finish = (distance?: number) => {
      if (!active.current) return;
      active.current = false;
      const current = latest.current;
      if (distance !== undefined && !current.disabled && current.draggable)
        current.onMove(current.index, current.target(current.index, distance));
      setOffset(null);
      current.onDragStateChange(false);
    };
    // PanResponder stores these callbacks; refs are read only when a gesture fires.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled && latest.current.draggable,
      onMoveShouldSetPanResponder: () => !latest.current.disabled && latest.current.draggable,
      onPanResponderGrant: () => {
        if (latest.current.disabled || !latest.current.draggable) return;
        active.current = true;
        setOffset(0);
        latest.current.onDragStateChange(true);
      },
      onPanResponderMove: (_, gesture) => {
        if (!active.current) return;
        if (latest.current.disabled || !latest.current.draggable) {
          finish();
          return;
        }
        setOffset(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => finish(gesture.dy),
      onPanResponderTerminate: () => finish(),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }, []);
  useEffect(() => {
    if ((props.disabled || !props.draggable) && active.current) {
      active.current = false;
      setOffset(null);
      latest.current.onDragStateChange(false);
    }
  }, [props.disabled, props.draggable]);
  useEffect(
    () => () => {
      if (active.current) latest.current.onDragStateChange(false);
    },
    [],
  );
  return (
    <View
      style={[
        styles.row,
        offset !== null && { zIndex: 1, elevation: 3, transform: [{ translateY: offset }] },
      ]}
    >
      <View style={styles.titleRow}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: t.spacing[8],
          }}
        >
          <Text style={styles.name}>
            {props.index + 1}. {props.task.name_snapshot}
          </Text>
          {props.badge}
        </View>
        {props.draggable && (
          <View
            {...responder.panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={props.task.name_snapshot + ' 순서 이동'}
            accessibilityHint="위아래로 끌어서 순서를 바꿔요."
            accessibilityState={{ disabled: props.disabled }}
            accessibilityValue={{
              min: 1,
              max: props.indexes.length,
              now: props.indexes.indexOf(props.index) + 1,
            }}
            accessibilityActions={[
              { name: 'increment', label: '아래로' },
              { name: 'decrement', label: '위로' },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (props.disabled || active.current) return;
              const step =
                nativeEvent.actionName === 'increment'
                  ? 1
                  : nativeEvent.actionName === 'decrement'
                    ? -1
                    : 0;
              const next = props.indexes[props.indexes.indexOf(props.index) + step];
              if (step && next !== undefined) props.onMove(props.index, next);
            }}
            style={[styles.handle, props.disabled && { opacity: 0.4 }]}
          >
            <GripVertical {...dashboardIconProps} color={t.colors.textSecondary} />
          </View>
        )}
      </View>
      {props.details}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    padding: t.spacing[12],
    gap: t.spacing[8],
    ...t.border.card,
    borderRadius: t.radius.normal,
    backgroundColor: t.colors.card,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[8] },
  name: { ...t.typography.cardTitle, color: t.colors.textPrimary, flexShrink: 1 },
  hint: { ...t.typography.caption, color: t.colors.textSecondary },
  handle: {
    minWidth: t.icon.touchMin,
    minHeight: t.icon.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
