export class TransactionRetryExhaustedError extends Error {
  readonly attempts: number;

  constructor(attempts: number, cause: unknown) {
    super(`Transaction retry exhausted after ${attempts} attempts`, { cause });
    this.name = 'TransactionRetryExhaustedError';
    this.attempts = attempts;
  }
}

export class CaseNotFoundError extends Error {
  readonly caseId: string;

  constructor(caseId: string) {
    super(`Case ${caseId} was not found`);
    this.name = 'CaseNotFoundError';
    this.caseId = caseId;
  }
}

export class TransactionRollbackError extends Error {
  readonly operationError: unknown;

  constructor(operationError: unknown, rollbackError: Error) {
    super('Transaction rollback failed; the database client was evicted', {
      cause: rollbackError,
    });
    this.name = 'TransactionRollbackError';
    this.operationError = operationError;
  }
}
