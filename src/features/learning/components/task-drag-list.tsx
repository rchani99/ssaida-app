import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors, radius, spacing } from '@/design-system/tokens';

import type { DailyTask } from '@/features/learning/types/learning.types';

export function dragTarget(index: number, distance: number, stride: number, count: number) {
  return Math.max(0, Math.min(count - 1, index + Math.round(distance / stride)));
}

export function TaskDragList({
  tasks,
  disabled,
  onMove,
  onDragStateChange,
}: {
  tasks: DailyTask[];
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const height = Math.max(80, 40 * fontScale + 24);
  return (
    <View>
      <Text style={styles.hint}>오른쪽 세 줄을 잡고 원하는 위치로 끌어 놓으세요.</Text>
      {tasks.map((task, index) => (
        <DragRow
          key={task.id}
          task={task}
          index={index}
          count={tasks.length}
          height={height}
          disabled={disabled}
          onMove={onMove}
          onDragStateChange={onDragStateChange}
        />
      ))}
    </View>
  );
}

function DragRow(props: {
  task: DailyTask;
  index: number;
  count: number;
  height: number;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onDragStateChange: (dragging: boolean) => void;
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
      if (distance !== undefined && !current.disabled)
        current.onMove(
          current.index,
          dragTarget(current.index, distance, current.height + spacing.sm, current.count),
        );
      setOffset(null);
      current.onDragStateChange(false);
    };
    // PanResponder stores these callbacks; refs are read on gestures, not during render.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderGrant: () => {
        if (latest.current.disabled) return;
        active.current = true;
        setOffset(0);
        latest.current.onDragStateChange(true);
      },
      onPanResponderMove: (_, gesture) => {
        if (!active.current) return;
        if (latest.current.disabled) {
          finish();
          return;
        }
        const { index, count, height } = latest.current;
        const stride = height + spacing.sm;
        setOffset(Math.max(-index * stride, Math.min((count - 1 - index) * stride, gesture.dy)));
      },
      onPanResponderRelease: (_, gesture) => finish(gesture.dy),
      onPanResponderTerminate: () => finish(),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }, []);
  useEffect(() => {
    if (props.disabled && active.current) {
      active.current = false;
      setOffset(null);
      latest.current.onDragStateChange(false);
    }
  }, [props.disabled]);
  useEffect(
    () => () => {
      if (active.current) latest.current.onDragStateChange(false);
    },
    [],
  );
  const target = dragTarget(props.index, offset ?? 0, props.height + spacing.sm, props.count);
  return (
    <View
      style={[
        styles.row,
        { height: props.height },
        offset !== null && {
          zIndex: 1,
          elevation: 3,
          backgroundColor: colors.primaryLight,
          transform: [{ translateY: offset }],
        },
      ]}
    >
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.name}>
          {props.index + 1}. {props.task.name_snapshot}
        </Text>
        {offset !== null && <Text style={styles.hint}>{target + 1}번째 위치에 놓기</Text>}
      </View>
      <View
        {...responder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={props.task.name_snapshot + ' 순서 이동'}
        accessibilityHint="위아래로 끌어서 순서를 바꿔요."
        accessibilityState={{ disabled: props.disabled }}
        accessibilityValue={{ min: 1, max: props.count, now: props.index + 1 }}
        accessibilityActions={[
          { name: 'increment', label: '아래로' },
          { name: 'decrement', label: '위로' },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (props.disabled || active.current) return;
          if (nativeEvent.actionName === 'increment' || nativeEvent.actionName === 'decrement')
            props.onMove(
              props.index,
              Math.max(
                0,
                Math.min(
                  props.count - 1,
                  props.index + (nativeEvent.actionName === 'increment' ? 1 : -1),
                ),
              ),
            );
        }}
        style={[styles.handle, props.disabled && styles.disabled]}
      >
        <Text accessible={false} style={styles.handleText}>
          ☰
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  copy: { flex: 1 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm },
  handle: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  handleText: { fontSize: 26, color: colors.primaryDark },
  disabled: { opacity: 0.4 },
});
