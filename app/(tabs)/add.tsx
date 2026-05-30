import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createMealAsync, createMealRecordAsync } from '../../src/db/mealRepository';

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export default function AddScreen() {
  const [name, setName] = useState('');
  const [cookedAt, setCookedAt] = useState(getTodayDateInputValue);
  const [rating, setRating] = useState<number | undefined>();
  const [memo, setMemo] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const trimmedName = name.trim();
  const trimmedCookedAt = cookedAt.trim();
  const canSave = useMemo(
    () => trimmedName.length > 0 && isValidDateInput(trimmedCookedAt) && !isSaving,
    [isSaving, trimmedCookedAt, trimmedName]
  );

  async function handleSave() {
    if (!trimmedName) {
      Alert.alert('요리 이름을 입력해주세요.');
      return;
    }

    if (!isValidDateInput(trimmedCookedAt)) {
      Alert.alert('날짜를 YYYY-MM-DD 형식으로 입력해주세요.');
      return;
    }

    setIsSaving(true);

    try {
      const mealId = createLocalId('meal');
      const mealRecordId = createLocalId('meal-record');
      const trimmedMemo = memo.trim();

      const meal = await createMealAsync({
        id: mealId,
        name: trimmedName,
        memo: trimmedMemo || undefined,
      });

      if (!meal) {
        throw new Error('요리 정보를 저장하지 못했습니다.');
      }

      await createMealRecordAsync({
        id: mealRecordId,
        mealId,
        cookedAt: trimmedCookedAt,
        rating,
        memo: trimmedMemo || undefined,
      });

      setName('');
      setCookedAt(getTodayDateInputValue());
      setRating(undefined);
      setMemo('');
      setTagDraft('');
      router.replace('/');
    } catch (error) {
      Alert.alert(
        '저장하지 못했습니다.',
        error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.keyboardAvoidingView}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>새 기록</Text>
          <Text style={styles.title}>오늘 만든 요리</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>요리 이름</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setName}
              placeholder="김치볶음밥"
              placeholderTextColor="#8A928E"
              returnKeyType="next"
              style={styles.input}
              value={name}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>날짜</Text>
            <TextInput
              inputMode="numeric"
              onChangeText={setCookedAt}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#8A928E"
              style={styles.input}
              value={cookedAt}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>만족도</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = rating === value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={value}
                    onPress={() => setRating(selected ? undefined : value)}
                    style={[styles.ratingButton, selected && styles.ratingButtonSelected]}
                  >
                    <Text style={[styles.ratingText, selected && styles.ratingTextSelected]}>
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>메모</Text>
            <TextInput
              multiline
              onChangeText={setMemo}
              placeholder="다음엔 파를 더 넣기"
              placeholderTextColor="#8A928E"
              style={[styles.input, styles.memoInput]}
              textAlignVertical="top"
              value={memo}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>태그 초안</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setTagDraft}
              placeholder="한식, 간단요리"
              placeholderTextColor="#8A928E"
              style={styles.input}
              value={tagDraft}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={handleSave}
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        >
          <Text style={styles.saveButtonText}>{isSaving ? '저장 중' : '저장'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
    backgroundColor: '#FFFCF6',
  },
  screen: {
    gap: 22,
    backgroundColor: '#FFFCF6',
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 72,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: '#356859',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: '#1E211F',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#303632',
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderColor: '#D9DED8',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    color: '#1E211F',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  memoInput: {
    minHeight: 112,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ratingButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#D9DED8',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  ratingButtonSelected: {
    borderColor: '#356859',
    backgroundColor: '#356859',
  },
  ratingText: {
    color: '#59605B',
    fontSize: 16,
    fontWeight: '700',
  },
  ratingTextSelected: {
    color: '#FFFFFF',
  },
  saveButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#356859',
  },
  saveButtonDisabled: {
    backgroundColor: '#AEB7B2',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
