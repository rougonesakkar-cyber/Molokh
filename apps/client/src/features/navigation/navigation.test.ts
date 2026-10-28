import { describe, expect, it } from 'vitest';

import {
  destinationParam,
  destinationsForRole,
  layoutMode,
  parseDestination,
} from './navigation';

describe('application navigation', () => {
  it('keeps the five athlete destinations and role queues inside Home', () => {
    expect(destinationsForRole('Athlete')).toEqual([
      'HOME', 'DISCOVERY', 'CHATS', 'COMMUNITY', 'PROFILE',
    ]);
    expect(destinationsForRole('Coach')).toEqual(['HOME', 'PROFILE']);
    expect(destinationsForRole('Gym Admin')).toEqual(['HOME', 'PROFILE']);
    expect(destinationsForRole('Central')).toEqual(['HOME']);
  });

  it('parses deep-link state safely', () => {
    expect(parseDestination('chats')).toBe('CHATS');
    expect(parseDestination(['profile', 'home'])).toBe('PROFILE');
    expect(parseDestination('internal-state')).toBeNull();
    expect(destinationParam('COMMUNITY')).toBe('community');
  });

  it('uses stable compact, medium and expanded boundaries', () => {
    expect(layoutMode(599)).toBe('compact');
    expect(layoutMode(600)).toBe('medium');
    expect(layoutMode(839)).toBe('medium');
    expect(layoutMode(840)).toBe('expanded');
  });
});
