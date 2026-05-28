import { StyleSheet, Text, View } from 'react-native';

export default function CalendarScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>달력</Text>
      <Text style={styles.copy}>날짜별 요리 기록을 이곳에서 모아볼 수 있습니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#FFFCF6',
    padding: 24,
  },
  title: {
    color: '#1E211F',
    fontSize: 28,
    fontWeight: '800',
  },
  copy: {
    marginTop: 8,
    color: '#59605B',
    fontSize: 16,
  },
});
