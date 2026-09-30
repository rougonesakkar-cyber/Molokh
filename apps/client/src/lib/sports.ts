export interface SportOption {
  readonly code: string;
  readonly label: string;
}

export const sportOptions: readonly SportOption[] = [
  { code: 'BOXING', label: 'Бокс' },
  { code: 'KICKBOXING', label: 'Кикбоксинг' },
  { code: 'MUAY_THAI', label: 'Тайский бокс' },
  { code: 'MMA', label: 'MMA' },
  { code: 'WRESTLING', label: 'Борьба' },
  { code: 'FUNCTIONAL_TRAINING', label: 'Функциональный тренинг' },
  { code: 'RUNNING', label: 'Бег' },
  { code: 'YOGA', label: 'Йога' },
  { code: 'SWIMMING', label: 'Плавание' },
];

export function sportLabel(code: string): string {
  return sportOptions.find((option) => option.code === code)?.label ?? code.replaceAll('_', ' ');
}
