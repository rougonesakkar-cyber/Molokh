import { describe, expect, it } from 'vitest';

import { evidenceAttachmentPresentation, evidenceUploadPresentation } from './presentation';

describe('Evidence presentation', () => {
  it('[AC-181][AC-182] explains scan states without promising unavailable access', () => {
    expect(evidenceAttachmentPresentation({ state: 'PENDING_SCAN', canAccessOriginal: false }))
      .toMatchObject({ canOpen: false, title: 'Файл проверяется' });
    expect(evidenceAttachmentPresentation({ state: 'AVAILABLE', canAccessOriginal: true }))
      .toMatchObject({ canOpen: true, title: 'Файл доступен' });
    expect(evidenceAttachmentPresentation({ state: 'QUARANTINED', canAccessOriginal: false }))
      .toMatchObject({ canOpen: false, title: 'Файл изолирован' });
    expect(evidenceUploadPresentation(false)).toMatchObject({ canUpload: false,
      title: 'Загрузка пока недоступна' });
  });
});
