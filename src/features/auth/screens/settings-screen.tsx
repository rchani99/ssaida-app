import { useFocusEffect, useNavigation } from 'expo-router';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react-native';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';
import { ChildSettingsPanel } from '@/features/auth/components/child-settings-panel';
import { ParentPinSettingsPanel } from '@/features/auth/components/parent-pin-settings-panel';
import { ServiceInfoPanel } from '@/features/auth/components/service-info-panel';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { DailyTargetSettingsPanel } from '@/features/learning/components/daily-target-settings-panel';
import { RestWeekdaysPanel } from '@/features/learning/components/rest-weekdays-panel';
import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { useNotifications } from '@/features/notifications/notification-context';
import { NotificationSettingsPanel } from '@/features/notifications/notification-settings-panel';

import type { LucideIcon } from 'lucide-react-native';

type Detail = 'rest' | 'notifications' | 'target' | 'pin' | 'child' | 'service' | null;
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export function SettingsScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const child = useCurrentChild();
  const notifications = useNotifications();
  const [detail, setDetail] = useState<Detail>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!detail) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setDetail(null);
        return true;
      });
      return () => subscription.remove();
    }, [detail]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '설정',
      headerLeft: detail
        ? () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="설정 목록으로 돌아가기"
              onPress={() => setDetail(null)}
              style={styles.headerBack}
            >
              <ChevronLeft {...dashboardIconProps} color={t.colors.textPrimary} />
            </Pressable>
          )
        : undefined,
    });
  }, [detail, navigation]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setErrorMessage(null);
    try {
      await signOut();
    } catch {
      setErrorMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSigningOut(false);
    }
  };

  if (detail) {
    const panels = {
      rest: <RestWeekdaysPanel />,
      notifications: <NotificationSettingsPanel />,
      target: <DailyTargetSettingsPanel />,
      pin: <ParentPinSettingsPanel />,
      child: <ChildSettingsPanel />,
      service: <ServiceInfoPanel />,
    } satisfies Record<Exclude<Detail, null>, React.ReactNode>;
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {panels[detail]}
      </ScrollView>
    );
  }

  const restDays = child.data?.rest_weekdays ?? [];
  const restValue = child.isLoading
    ? '불러오는 중'
    : child.isError
      ? '확인 필요'
      : restDays.length
        ? restDays.map((day) => DAY_LABELS[day - 1]).join('·')
        : '없음';
  const notificationValue = !notifications.supported
    ? '지원 안 됨'
    : !notifications.ready
      ? '불러오는 중'
      : notifications.settings.notificationsEnabled && notifications.permission === 'granted'
        ? '켜짐'
        : '꺼짐';

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <SettingsSection title="학습 설정">
        <SettingsRow
          icon={CalendarDays}
          label="정기 휴식 요일"
          value={restValue}
          onPress={() => setDetail('rest')}
        />
        <SettingsRow
          icon={Bell}
          label="알림 설정"
          value={notificationValue}
          onPress={() => setDetail('notifications')}
        />
        <SettingsRow
          icon={Clock3}
          label="학습 시간 기본값"
          value={
            child.data
              ? `${child.data.daily_target_minutes}분`
              : child.isLoading
                ? '불러오는 중'
                : '확인 필요'
          }
          onPress={() => setDetail('target')}
          last
        />
      </SettingsSection>

      <SettingsSection title="계정 / 보안">
        <SettingsRow
          icon={ShieldCheck}
          label="부모 PIN 변경"
          description="현재 PIN 확인 후 변경"
          value="사용 중"
          onPress={() => setDetail('pin')}
          last
        />
      </SettingsSection>

      <SettingsSection title="아이">
        <SettingsRow
          icon={UserRound}
          label="아이 정보 관리"
          value={child.data?.name ?? (child.isLoading ? '불러오는 중' : '확인 필요')}
          onPress={() => setDetail('child')}
          last
        />
      </SettingsSection>

      <SettingsSection title="앱 정보">
        <SettingsRow icon={Info} label="서비스 정보" onPress={() => setDetail('service')} last />
      </SettingsSection>

      <SettingsSection title="기타">
        <SettingsRow
          icon={LogOut}
          label={isSigningOut ? '로그아웃 중…' : '로그아웃'}
          tone="danger"
          disabled={isSigningOut}
          onPress={() => void handleSignOut()}
          trailing={isSigningOut ? <ActivityIndicator color={t.colors.danger} /> : undefined}
          last
        />
      </SettingsSection>
      {errorMessage && (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      )}
    </ScrollView>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  description,
  value,
  onPress,
  disabled = false,
  tone = 'default',
  trailing,
  last = false,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  const content = (
    <>
      <View style={styles.iconCircle}>
        <Icon
          {...dashboardIconProps}
          color={tone === 'danger' ? t.colors.danger : t.colors.primary}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, tone === 'danger' && styles.danger]}>{label}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      {trailing ?? (value && <Text style={styles.value}>{value}</Text>)}
      {onPress && !trailing && <ChevronRight {...dashboardIconProps} size={t.icon.size.small} />}
    </>
  );
  const rowStyle = [styles.row, !last && styles.rowDivider];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    gap: t.spacing[24],
    padding: t.layout.screenPadding,
    backgroundColor: t.colors.background,
  },
  section: { gap: t.spacing[8] },
  sectionTitle: { ...t.typography.section, color: t.colors.textPrimary },
  card: {
    overflow: 'hidden',
    borderRadius: t.radius.large,
    backgroundColor: t.colors.card,
    ...t.border.card,
    ...t.shadow,
  },
  row: {
    minHeight: t.icon.touchMin + t.spacing[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[12],
    paddingHorizontal: t.spacing[16],
    paddingVertical: t.spacing[12],
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  pressed: { backgroundColor: t.colors.background },
  disabled: { opacity: 0.55 },
  iconCircle: {
    padding: t.spacing[8],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.background,
  },
  copy: { flex: 1, minWidth: 0, gap: t.spacing[4] },
  label: { ...t.typography.body, color: t.colors.textPrimary, fontWeight: '600' },
  description: { ...t.typography.caption, color: t.colors.textSecondary },
  value: { ...t.typography.body, color: t.colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  danger: { color: t.colors.danger },
  error: { ...t.typography.body, color: t.colors.danger },
  headerBack: {
    minHeight: t.icon.touchMin,
    minWidth: t.icon.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
