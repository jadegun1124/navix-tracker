export const WHILE_USING_TITLE: string;
export const WHILE_USING_LEAD: string;
export const WHILE_USING_OPTION: string;
export const WHILE_USING_ONCE: string;
export const WHILE_USING_DENY: string;
export const WHILE_USING_MOCK_TITLE: string;
export const PRECISE_HINT: string;
export const COACH_NEXT: string;
export const OVERLAY_ASK_TITLE: string;
export const OVERLAY_ASK_BODY: string;
export const OVERLAY_ALLOW: string;
export const OVERLAY_SKIP: string;
export const OVERLAY_BANNER: string;

export type ForegroundPhase = 'need' | 'while-using' | 'always' | 'denied';
export type OverlayPhase = 'unknown' | 'granted' | 'denied';
export type AlwaysAllowAction =
  | 'request-foreground'
  | 'ask-overlay'
  | 'settings-with-overlay'
  | 'settings-fallback-guide'
  | 'done'
  | 'stop'
  | 'browser';

export function nextAlwaysAllowAction(input: {
  native: boolean;
  foreground: ForegroundPhase;
  overlay: OverlayPhase;
}): AlwaysAllowAction;
