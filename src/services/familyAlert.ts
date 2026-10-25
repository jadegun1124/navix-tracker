export type FamilyAlertKind = 'sos' | 'leave';

export interface FamilyAlert {
  id: string;
  kind: FamilyAlertKind;
  code: string;
  from: string;
  body: string;
  at: number;
}

const STORAGE_KEY = 'umap_family_alert_v1';
const ACK_KEY = 'umap_family_alert_ack';
const CHANNEL = 'umap-family-alert';

function isAlert(value: unknown): value is FamilyAlert {
  if (!value || typeof value !== 'object') return false;
  const alert = value as FamilyAlert;
  return typeof alert.id === 'string' && (alert.kind === 'sos' || alert.kind === 'leave') && typeof alert.code === 'string' && typeof alert.at === 'number';
}

export function publishFamilyAlert(input: Omit<FamilyAlert, 'id' | 'at'>): FamilyAlert {
  const alert: FamilyAlert = { ...input, id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alert));
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(alert);
    channel.close();
  } catch {
    /* BroadcastChannel 이 없는 웹뷰 */
  }
  return alert;
}

export function readFamilyAlert(): FamilyAlert | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return isAlert(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function ackFamilyAlert(id: string) {
  localStorage.setItem(ACK_KEY, id);
}

export function isFamilyAlertAcked(id: string): boolean {
  return localStorage.getItem(ACK_KEY) === id;
}

export function subscribeFamilyAlerts(onAlert: (alert: FamilyAlert) => void): () => void {
  let channel: BroadcastChannel | null = null;
  const onMessage = (event: MessageEvent) => {
    if (isAlert(event.data)) onAlert(event.data);
  };
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', onMessage);
  } catch {
    channel = null;
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed: unknown = JSON.parse(event.newValue);
      if (isAlert(parsed)) onAlert(parsed);
    } catch {
      /* 손상된 알림 */
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
