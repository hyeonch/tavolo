import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { initializeDatabaseAsync } from '../src/db/database';

export default function RootLayout() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    initializeDatabaseAsync()
      .then(() => {
        if (mounted) {
          setDatabaseReady(true);
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setDatabaseError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (databaseError) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.errorTitle}>기록 저장소를 준비하지 못했습니다.</Text>
        <Text style={styles.loadingText}>{databaseError}</Text>
      </View>
    );
  }

  if (!databaseReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#356859" />
        <Text style={styles.loadingText}>요리 기록을 준비하고 있어요.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFFCF6',
  },
  loadingText: {
    color: '#59605B',
    fontSize: 15,
  },
  errorTitle: {
    color: '#1E211F',
    fontSize: 17,
    fontWeight: '700',
  },
});
