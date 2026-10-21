import type { EvidenceAttachment } from '@molokh/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { evidenceAttachmentPresentation, evidenceUploadPresentation } from './presentation';

export function EvidenceAttachmentSection(props: {
  readonly attachments: readonly EvidenceAttachment[];
  readonly uploadEnabled: boolean;
  readonly onUpload?: () => void;
  readonly onOpen?: (attachmentId: string) => void;
}) {
  const upload = evidenceUploadPresentation(props.uploadEnabled);
  return <View style={styles.section}>
    <Text accessibilityRole="header" aria-level={3} style={styles.title}>Доказательства</Text>
    <Text style={styles.hint}>{upload.explanation}</Text>
    {upload.canUpload ? <Pressable accessibilityRole="button" onPress={props.onUpload}
      style={styles.button}><Text style={styles.buttonText}>{upload.title}</Text></Pressable> : null}
    {props.attachments.map((attachment) => {
      const copy = evidenceAttachmentPresentation(attachment);
      return <View key={attachment.attachmentId} style={styles.item}>
        <Text style={styles.name}>{attachment.fileName}</Text>
        <Text style={styles.state}>{copy.title}</Text>
        <Text style={styles.hint}>{copy.explanation}</Text>
        {copy.canOpen ? <Pressable accessibilityRole="button"
          onPress={() => props.onOpen?.(attachment.attachmentId)} style={styles.secondary}>
          <Text>Открыть оригинал</Text>
        </Pressable> : null}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 14,
    padding: 16, gap: 10, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', color: '#15181c' },
  hint: { color: '#56606b', lineHeight: 20 },
  item: { borderTopWidth: 1, borderTopColor: '#e7e9ec', paddingTop: 10, gap: 4 },
  name: { fontWeight: '600', color: '#15181c' }, state: { color: '#303740' },
  button: { backgroundColor: '#20252b', borderRadius: 10, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: '#b9c0c8', borderRadius: 10,
    padding: 10, alignItems: 'center' },
});
