export {};

export interface GoogleLatLng {
  lat: number;
  lng: number;
}

export interface GoogleMap {
  panTo: (center: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
  getZoom: () => number | undefined;
}

interface GoogleMarker {
  setMap: (map: GoogleMap | null) => void;
  addListener: (event: string, handler: () => void) => void;
}

interface GoogleCircle {
  setMap: (map: GoogleMap | null) => void;
}

interface GoogleMapOptions {
  center: GoogleLatLng;
  zoom: number;
  disableDefaultUI?: boolean;
  clickableIcons?: boolean;
  gestureHandling?: string;
  backgroundColor?: string;
}

interface GoogleMapsNamespace {
  Map: new (element: HTMLElement, options: GoogleMapOptions) => GoogleMap;
  Marker: new (options: {
    map: GoogleMap;
    position: GoogleLatLng;
    title?: string;
    label?: { text: string; color?: string; fontWeight?: string; fontSize?: string };
    icon?: {
      path: number;
      scale?: number;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeWeight?: number;
    };
  }) => GoogleMarker;
  Circle: new (options: {
    map: GoogleMap;
    center: GoogleLatLng;
    radius: number;
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWeight?: number;
  }) => GoogleCircle;
  SymbolPath: { CIRCLE: number };
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            itp_support?: boolean;
            use_fedcm_for_button?: boolean;
            context?: 'signin' | 'signup' | 'use';
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number;
              locale?: string;
              click_listener?: () => void;
            },
          ) => void;
        };
      };
      maps: GoogleMapsNamespace;
    };
  }
}
