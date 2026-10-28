export const EXIT_CONFIRM_MS: number;
export const EXIT_CONFIRM_TEXT: string;
export function decideAndroidBack(
  now: number,
  armedUntil: number,
  consumed: boolean,
): { action: 'consumed' | 'toast' | 'exit'; armedUntil: number };
