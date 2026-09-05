import type { RuntimeProjection } from '@molokh/contracts';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const runtime: RuntimeProjection = {
  architecture: 'modular-monolith',
  apiTransport: 'https+sse',
  clients: ['web', 'ios', 'android'],
  database: 'postgresql-18',
};

export default function TechnicalSpikeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>MOLOKH MVP</Text>
        <Text style={styles.title}>Технический контур готов</Text>
        <Text style={styles.body}>
          Один клиент Expo собирается для Web, iOS и Android и использует общий
          типизированный контракт с Fastify API.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Проверяемый baseline</Text>
          <Text style={styles.item}>Клиенты: {runtime.clients.join(' · ')}</Text>
          <Text style={styles.item}>API: {runtime.architecture}</Text>
          <Text style={styles.item}>Transport: {runtime.apiTransport}</Text>
          <Text style={styles.item}>Data: {runtime.database}</Text>
        </View>
        <Text style={styles.note}>
          Это технический spike без финального визуального дизайна.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f6f4ef',
    flex: 1,
  },
  container: {
    alignSelf: 'center',
    flex: 1,
    justifyContent: 'center',
    maxWidth: 680,
    padding: 24,
    width: '100%',
  },
  eyebrow: {
    color: '#8b2f22',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    color: '#171512',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 42,
  },
  body: {
    color: '#4c4943',
    fontSize: 18,
    lineHeight: 27,
    marginTop: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#ded9cf',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    marginTop: 28,
    padding: 20,
  },
  cardTitle: {
    color: '#171512',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  item: {
    color: '#4c4943',
    fontSize: 15,
  },
  note: {
    color: '#777168',
    fontSize: 13,
    marginTop: 18,
  },
});

