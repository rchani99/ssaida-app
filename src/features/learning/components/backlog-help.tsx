import { useFocusEffect } from 'expo-router';
import { CircleHelp } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dashboardIconProps } from '@/design-system/icons';
import { dashboardTokens as t } from '@/design-system/tokens';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { LearningButton } from '@/features/learning/components/learning-controls';
import { hasSeenBacklogHelp, markBacklogHelpSeen } from '@/features/learning/services/backlog-help';

export function BacklogHelp() {
  const userId = useAuth().session?.user.id;
  return userId ? <AccountBacklogHelp key={userId} userId={userId} /> : null;
}

export function AccountBacklogHelp({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(false);
  const interacted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void hasSeenBacklogHelp(userId).then((seen) => {
        if (active && !interacted.current && !seen) setVisible(true);
      });
      return () => {
        active = false;
        setVisible(false);
      };
    }, [userId]),
  );
  const close = () => {
    interacted.current = true;
    setVisible(false);
    void markBacklogHelpSeen(userId);
  };
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          밀린 공부
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="밀린 공부 도움말 다시 보기"
          style={styles.helpButton}
          onPress={() => {
            interacted.current = true;
            setVisible(true);
          }}
        >
          <CircleHelp {...dashboardIconProps} color={t.colors.primary} />
        </Pressable>
      </View>
      <Text style={styles.body}>
        {"지난 날짜에 끝내지 못한 공부를 관리해요.\n오늘 예정된 공부는 '오늘 공부'에서 확인하세요."}
      </Text>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <Text accessibilityRole="header" style={styles.title}>
                밀린 공부는 이렇게 관리해요
              </Text>
              <Text style={styles.body}>
                {
                  '지난 날짜에 끝내지 못한 공부를 확인하는 곳이에요.\n\n오늘 공부는 이곳에 표시되지 않아요.\n\n밀린 공부를 오늘에 추가하거나 이번에는 넘길 수 있어요.'
                }
              </Text>
              <LearningButton label="알겠어요" variant="primary" onPress={close} />
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: t.spacing[8] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing[8],
  },
  title: { ...t.typography.section, color: t.colors.textPrimary, flexShrink: 1 },
  body: { ...t.typography.body, color: t.colors.textSecondary },
  helpButton: {
    minWidth: t.icon.touchMin,
    minHeight: t.icon.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: t.spacing[16],
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  dialog: { maxHeight: '90%', borderRadius: t.radius.large, backgroundColor: t.colors.card },
  dialogContent: { padding: t.spacing[20], gap: t.spacing[16] },
});
