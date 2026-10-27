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
      maps: GoogleMapsNamespace;
    };
  }
}
