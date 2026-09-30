import { Text, View } from 'react-native';

import { learningStyles as s } from '@/features/learning/components/learning-controls';

export function AccountManagementInfoPanel({ kind }: { kind: 'deletion' | 'recovery' }) {
  return (
    <View style={s.panel}>
      <Text accessibilityRole="header" style={s.title}>
        {kind === 'deletion' ? '계정 삭제' : '부모 PIN 재설정'}
      </Text>
      <Text style={s.text}>
        {kind === 'deletion'
          ? '현재 앱에서는 계정 삭제를 요청할 수 없어요.'
          : 'PIN을 잊었을 때 재설정하는 기능은 아직 준비 중이에요.'}
      </Text>
      <Text style={s.secondary}>
        {kind === 'deletion'
          ? '로그아웃하거나 앱을 지워도 계정과 학습 기록은 삭제되지 않아요.'
          : '현재 PIN을 알고 있다면 설정의 부모 PIN 변경을 이용해 주세요. 로그아웃하거나 다시 로그인해도 PIN은 초기화되지 않아요.'}
      </Text>
    </View>
  );
}
