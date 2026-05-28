import { StyleSheet, Text, View } from 'react-native';

export default function AddScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>요리 추가</Text>
      <Text style={styles.copy}>오늘 만든 요리의 이름, 사진, 메모를 남기는 화면입니다.</Text>
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
