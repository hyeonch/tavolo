import { StyleSheet, Text, View } from 'react-native';

export default function RecapScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>결산</Text>
      <Text style={styles.copy}>올해의 요리 기록과 요리 월드컵을 준비하는 공간입니다.</Text>
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
