import type { Place } from '../store'

interface Hit { display_name: string; lat: string; lon: string; name?: string }

/** Optional place lookup (OpenStreetMap Nominatim). Fails soft: the app works without it. */
export async function searchPlaces(q: string, signal: AbortSignal): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=en&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(String(res.status))
  const hits: Hit[] = await res.json()
  return hits.map(h => ({
    name: h.display_name.split(',').slice(0, 2).map(s => s.trim()).join(', '),
    lat: +h.lat,
    lng: +h.lon,
  }))
}
