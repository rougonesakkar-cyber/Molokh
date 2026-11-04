import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { type AppTheme, useAppTheme } from './theme';

interface ChoiceGroupProps<Value extends string | number> {
  readonly label: string;
  readonly options: readonly (readonly [Value, string])[];
  readonly value: Value;
  readonly disabled?: boolean;
  readonly onChange: (value: Value) => void;
}

export function ChoiceGroup<Value extends string | number>({
  label, options, value, disabled = false, onChange,
}: ChoiceGroupProps<Value>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [focused, setFocused] = useState<Value | null>(null);
  const web = Platform.OS === 'web';

  return (
    <View accessibilityLabel={label} role={web ? 'group' : 'radiogroup'} style={styles.group}>
      {options.map(([option, text]) => {
        const checked = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole={web ? 'button' : 'radio'}
            accessibilityState={web ? { disabled } : { checked, disabled }}
            {...(web ? { 'aria-pressed': checked } : {})}
            disabled={disabled}
            focusable={!disabled}
            onBlur={() => setFocused(null)}
            onFocus={() => setFocused(option)}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.option,
              checked && styles.checked,
              disabled && styles.disabled,
              !disabled && pressed && styles.pressed,
              !disabled && focused === option && styles.focused,
            ]}
          >
            <Text style={[styles.label, checked && styles.checkedLabel]}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    group: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
    option: {
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: theme.touchTarget,
      minWidth: theme.touchTarget,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    checked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    disabled: { opacity: 0.55 },
    focused: {
      outlineColor: theme.colors.text,
      outlineOffset: 2,
      outlineStyle: 'solid',
      outlineWidth: 2,
    },
    pressed: { opacity: 0.8 },
    label: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.meta,
      fontWeight: '700',
      textAlign: 'center',
    },
    checkedLabel: { color: theme.colors.onPrimary },
  });
}
