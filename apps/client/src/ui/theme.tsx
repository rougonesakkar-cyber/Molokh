import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
} from 'react';
import { useColorScheme } from 'react-native';

const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 } as const;
const radius = { sm: 8, md: 12, lg: 16, xl: 18, pill: 999 } as const;
const typography = {
  caption: 12,
  meta: 13,
  body: 14,
  bodyLarge: 16,
  lead: 17,
  title: 22,
  display: 36,
} as const;

const lightColors = {
  background: '#f6f4ef',
  surface: '#ffffff',
  surfaceMuted: '#faf9f6',
  surfaceStrong: '#e9e5dd',
  text: '#171512',
  textSecondary: '#4c4943',
  textMuted: '#625d55',
  primary: '#8b2f22',
  onPrimary: '#ffffff',
  border: '#d3cec5',
  disabled: '#bbb5ad',
  successBackground: '#e8f1e9',
  successText: '#285d35',
  warningBackground: '#fff7e6',
  warningBorder: '#dfc994',
  warningText: '#59430e',
  dangerBackground: '#fff0ed',
  dangerBorder: '#e5b3aa',
  dangerText: '#7a261b',
  accentBackground: '#f4dfda',
} as const;

const darkColors: ThemeColors = {
  background: '#141311',
  surface: '#211f1c',
  surfaceMuted: '#292621',
  surfaceStrong: '#34302b',
  text: '#f5f2ec',
  textSecondary: '#d4cec4',
  textMuted: '#b8b0a5',
  primary: '#ef9b89',
  onPrimary: '#25110d',
  border: '#504a42',
  disabled: '#686159',
  successBackground: '#1c3524',
  successText: '#a9ddb5',
  warningBackground: '#382d17',
  warningBorder: '#705b2a',
  warningText: '#f0d48e',
  dangerBackground: '#3d201c',
  dangerBorder: '#88473d',
  dangerText: '#ffb3a5',
  accentBackground: '#472922',
};

export type ThemeColors = { readonly [Key in keyof typeof lightColors]: string };

export interface AppTheme {
  readonly colors: ThemeColors;
  readonly dark: boolean;
  readonly radius: typeof radius;
  readonly spacing: typeof spacing;
  readonly touchTarget: 48;
  readonly typography: typeof typography;
}

export const lightTheme: AppTheme = {
  colors: lightColors,
  dark: false,
  radius,
  spacing,
  touchTarget: 48,
  typography,
};

export const darkTheme: AppTheme = {
  colors: darkColors,
  dark: true,
  radius,
  spacing,
  touchTarget: 48,
  typography,
};

const ThemeContext = createContext<AppTheme>(lightTheme);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const theme = useMemo(() => scheme === 'dark' ? darkTheme : lightTheme, [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const hex = color.replace('#', '');
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
