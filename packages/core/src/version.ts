export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`Expected aggregate version ${expectedVersion}, received ${actualVersion}`);
    this.name = 'VersionConflictError';
  }
}

export function assertExpectedVersion(
  actualVersion: number,
  expectedVersion: number,
): void {
  if (actualVersion !== expectedVersion) {
    throw new VersionConflictError(expectedVersion, actualVersion);
  }
}

export function nextAggregateVersion(currentVersion: number): number {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
    throw new RangeError('Aggregate version must be a non-negative safe integer');
  }
  return currentVersion + 1;
}
