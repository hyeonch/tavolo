import { StyleSheet, Text, View } from 'react-native';

const recentMeals = ['김치볶음밥', '토마토 달걀볶음', '버섯 파스타'];

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Tavolo</Text>
        <Text style={styles.title}>오늘의 식탁을 남겨보세요.</Text>
        <Text style={styles.subtitle}>
          직접 만든 요리를 빠르게 기록하고, 달력과 사진으로 다시 꺼내보는
          로컬 우선 요리 아카이브입니다.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>최근 기록</Text>
        {recentMeals.map((meal) => (
          <View key={meal} style={styles.mealRow}>
            <View style={styles.dot} />
            <Text style={styles.mealText}>{meal}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: 24,
    backgroundColor: '#FFFCF6',
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  header: {
    gap: 12,
  },
  eyebrow: {
    color: '#356859',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: '#1E211F',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  subtitle: {
    color: '#59605B',
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    gap: 14,
    borderColor: '#D9DED8',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: 18,
  },
  panelTitle: {
    color: '#1E211F',
    fontSize: 18,
    fontWeight: '700',
  },
  mealRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E07A5F',
  },
  mealText: {
    color: '#303632',
    fontSize: 16,
  },
});
