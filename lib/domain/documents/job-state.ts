const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600] as const;

export type RetryDecision =
  | { terminal: true; retryAt: null }
  | { terminal: false; retryAt: string };

export function getRetryDecision(
  attempts: number,
  now: Date,
): RetryDecision {
  if (attempts >= MAX_ATTEMPTS) {
    return { terminal: true, retryAt: null };
  }

  const delayMilliseconds = RETRY_DELAYS_SECONDS[attempts - 1] * 1_000;
  return {
    terminal: false,
    retryAt: new Date(now.getTime() + delayMilliseconds).toISOString(),
  };
}
