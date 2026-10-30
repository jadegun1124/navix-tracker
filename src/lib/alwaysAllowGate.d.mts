export const GATE_TITLE: string;
export const GATE_BODY: string;
export const GATE_BUTTON: string;
export const GATE_OPENING: string;
export const GATE_OPEN_FAILED: string;

export function alwaysAllowGateCovers(stage: string): boolean;

export function needsAlwaysAllowGate(snapshot: {
  native?: boolean;
  location?: string;
  precise?: boolean | null;
} | null | undefined): boolean;

export type AlwaysAllowGateTarget = 'ready' | 'foreground-dialog' | 'background-dialog' | 'location-settings';

export function alwaysAllowGateTarget(input: {
  sdk: number;
  foreground: boolean;
  background: boolean;
  precise: boolean;
  backgroundDialogAskable: boolean;
  fineDialogAskable: boolean;
}): AlwaysAllowGateTarget;
