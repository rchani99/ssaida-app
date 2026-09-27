import Constants from 'expo-constants';
import { Text, View } from 'react-native';

import { learningStyles as s } from '@/features/learning/components/learning-controls';

export function ServiceInfoPanel() {
  const version = Constants.expoConfig?.version ?? '확인할 수 없음';
  return (
    <View style={s.panel}>
      <Text style={s.title}>서비스 정보</Text>
      <View style={s.card}>
        <Text style={s.text}>앱 이름</Text>
        <Text style={s.secondary}>쌓이다</Text>
      </View>
      <View style={s.card}>
        <Text style={s.text}>앱 버전</Text>
        <Text style={s.secondary}>{version}</Text>
      </View>
      <Text style={s.secondary}>
        등록된 개인정보처리방침 및 이용약관 링크가 없어 이번 화면에는 표시하지 않아요.
      </Text>
    </View>
  );
}
