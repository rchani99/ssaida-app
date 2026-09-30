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
      {['개인정보처리방침', '이용약관', '문의하기'].map((label) => (
        <View key={label} style={s.card}>
          <Text style={s.text}>{label}</Text>
          <Text style={s.secondary}>
            {label === '문의하기' ? '문의 연락처 준비 중' : '정책 문서 준비 중'}
          </Text>
        </View>
      ))}
    </View>
  );
}
