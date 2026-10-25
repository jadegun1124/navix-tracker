export interface Profile {
  sub: string;
  name: string;
  email: string;
  picture: string | null;
  preview: boolean;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  at: number;
}

export interface Member {
  id: string;
  name: string;
  role: 'self' | 'child' | 'guardian';
  lat: number | null;
  lng: number | null;
  accuracyM: number;
  battery: number | null;
  updatedAt: number;
  moving: boolean | null;
  inviteCode?: string;
}

export interface HomeZone {
  label: string;
  address: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface FamilyNotice {
  id: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
}

export interface PermissionState {
  notifications: 'unknown' | 'granted' | 'denied' | 'skipped';
  accuracy: 'precise' | 'approximate';
  locationMode: 'unknown' | 'while-using' | 'always' | 'denied';
  motion: 'unknown' | 'granted' | 'denied' | 'skipped';
  battery: 'unknown' | 'acknowledged' | 'skipped';
  completed: boolean;
}

export type Stage = 'splash' | 'login' | 'survey' | 'terms' | 'phone' | 'permissions' | 'map';
export type FamilyTab = 'map' | 'alerts' | 'menu';

export interface Session {
  stage: Stage;
  profile: Profile | null;
  survey: string | null;
  terms: Record<string, boolean>;
  phone: string;
  permissions: PermissionState;
  members: Member[];
  tracks: Record<string, TrackPoint[]>;
  home: HomeZone | null;
  inviteCode: string;
  notices: FamilyNotice[];
  tab: FamilyTab;
  pendingInvite: string | null;
}

export const DEFAULT_CENTER = { lat: 37.6366, lng: 127.0672 };

export const TERM_IDS = {
  terms: 'terms',
  location: 'location',
  privacy: 'privacy',
  guardian: 'guardian',
  marketing: 'marketing',
  overseas: 'overseas',
} as const;

export const REQUIRED_TERMS = [TERM_IDS.terms, TERM_IDS.location, TERM_IDS.privacy, TERM_IDS.guardian];
