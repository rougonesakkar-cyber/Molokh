import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  ActivityIndicator: () => null,
  Pressable: () => null,
  StyleSheet: { create: <T>(styles: T): T => styles },
  Text: () => null,
  View: () => null,
}));

import { DISCOVERY_PRESENTATION_COPY } from './DiscoverySection';

describe('Discovery presentation', () => {
  it('[AC-154] explains radius-first expansion and visible inbound interest', () => {
    expect(DISCOVERY_PRESENTATION_COPY.orderHint).toContain('внутри вашего радиуса');
    expect(DISCOVERY_PRESENTATION_COPY.orderHint).toContain('затем расширяем поиск');
    expect(DISCOVERY_PRESENTATION_COPY.inboundInterest).toBe('Хочет тренироваться с вами');
    expect(DISCOVERY_PRESENTATION_COPY.cityExpansion).toBe(
      'Расширение поиска в пределах города',
    );
  });
});
