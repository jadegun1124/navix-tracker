export function mapsApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
}

let loading: Promise<NonNullable<Window['google']>['maps']> | null = null;

export function loadGoogleMaps(): Promise<NonNullable<Window['google']>['maps']> {
  const key = mapsApiKey();
  if (!key) return Promise.reject(new Error('missing-key'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=ko&region=KR&v=weekly`;
      script.async = true;
      script.onload = () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error('maps-missing'));
      };
      script.onerror = () => {
        loading = null;
        reject(new Error('maps-load'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}
