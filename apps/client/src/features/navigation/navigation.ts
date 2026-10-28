export type AppDestination = 'HOME' | 'DISCOVERY' | 'CHATS' | 'COMMUNITY' | 'PROFILE';
export type LayoutMode = 'compact' | 'medium' | 'expanded';

const destinationByParam: Readonly<Record<string, AppDestination>> = {
  home: 'HOME',
  discovery: 'DISCOVERY',
  chats: 'CHATS',
  community: 'COMMUNITY',
  profile: 'PROFILE',
};

export function parseDestination(value: string | string[] | undefined): AppDestination | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? destinationByParam[first.toLocaleLowerCase('en-US')] ?? null : null;
}

export function destinationParam(destination: AppDestination): string {
  return destination.toLocaleLowerCase('en-US');
}

export function destinationsForRole(role: string): readonly AppDestination[] {
  if (role === 'Athlete') return ['HOME', 'DISCOVERY', 'CHATS', 'COMMUNITY', 'PROFILE'];
  if (role === 'Central') return ['HOME'];
  return ['HOME', 'PROFILE'];
}

export function layoutMode(width: number): LayoutMode {
  if (width < 600) return 'compact';
  if (width < 840) return 'medium';
  return 'expanded';
}
