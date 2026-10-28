export const EXIT_CONFIRM_MS = 2000;
export const EXIT_CONFIRM_TEXT = '한 번 더 누르면 앱이 종료됩니다';

/** Root map: first back asks again. A second back inside the window exits. An open sheet consumes the press. */
export function decideAndroidBack(now, armedUntil, consumed) {
  if (consumed) return { action: 'consumed', armedUntil };
  if (now < armedUntil) return { action: 'exit', armedUntil };
  return { action: 'toast', armedUntil: now + EXIT_CONFIRM_MS };
}
