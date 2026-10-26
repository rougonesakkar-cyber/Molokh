import type { EvidenceAttachment } from '@molokh/contracts';

export function evidenceAttachmentPresentation(
  attachment: Pick<EvidenceAttachment, 'state' | 'canAccessOriginal'>,
): { readonly title: string; readonly explanation: string; readonly canOpen: boolean } {
  if (attachment.state === 'PENDING_SCAN') return {
    title: 'Файл проверяется', canOpen: false,
    explanation: 'Доступ появится только после безопасной проверки файла.',
  };
  if (attachment.state === 'QUARANTINED') return {
    title: 'Файл изолирован', canOpen: false,
    explanation: 'Проверка не подтвердила безопасность. Участникам файл недоступен.',
  };
  return { title: 'Файл доступен', canOpen: attachment.canAccessOriginal,
    explanation: attachment.canAccessOriginal
      ? 'Оригинал доступен только вам и уполномоченному Central reviewer.'
      : 'Оригинал не раскрыт вам. Для другой стороны нужен отдельный процесс раскрытия.' };
}

export function evidenceUploadPresentation(uploadEnabled: boolean): {
  readonly title: string; readonly explanation: string; readonly canUpload: boolean;
} {
  return uploadEnabled ? { title: 'Добавить доказательство', canUpload: true,
    explanation: 'До 5 image/audio/video файлов, суммарно до 100 МБ. Проверка обязательна.' }
    : { title: 'Загрузка пока недоступна', canUpload: false,
      explanation: 'Внешний защищённый storage отключён. Файл не будет принят или сохранён.' };
}
