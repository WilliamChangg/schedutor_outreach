import { request } from 'undici';
import { getConfig, METRO_AREAS, DISCOVERY_QUERIES, METRO_SUBLOCATIONS } from '../utils/config.js';
import { googleMapsRateLimiter } from '../utils/rate-limiter.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
import {
  insertLead,
  getLeadBySourceId,
  findDuplicateLead,
  startDiscoveryRun,
  completeDiscoveryRun,
  failDiscoveryRun,
  type Lead
} from '../db/index.js';

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types?: string[];
  business_status?: string;
  rating?: number;
  user_ratings_total?: number;
}

interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  address_components?: {
    long_name: string;
    short_name: string;
    types: string[];
  }[];
}

interface TextSearchResponse {
  results: PlaceResult[];
  next_page_token?: string;
  status: string;
  error_message?: string;
}

interface PlaceDetailsResponse {
  result: PlaceDetails;
  status: string;
  error_message?: string;
}

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';

export async function searchPlaces(
  query: string,
  location: { lat: number; lng: number },
  radiusMeters: number = 50000, // 50km default radius
  paginate: boolean = false // Whether to fetch all pages (up to 60 results)
): Promise<PlaceResult[]> {
  const config = getConfig();
  if (!config.googleMapsApiKey) {
    throw new Error('Google Maps API key not configured');
  }

  const allResults: PlaceResult[] = [];
  let pageToken: string | undefined;

  do {
    await googleMapsRateLimiter.waitForSlot();

    const params = new URLSearchParams({
      query: query,
      location: `${location.lat},${location.lng}`,
      radius: radiusMeters.toString(),
      key: config.googleMapsApiKey
    });

    if (pageToken) {
      params.set('pagetoken', pageToken);
    }

    const url = `${PLACES_API_BASE}/textsearch/json?${params}`;
    const response = await request(url);
    const data = await response.body.json() as TextSearchResponse;

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      // INVALID_REQUEST often means page token not ready yet
      if (data.status === 'INVALID_REQUEST' && pageToken) {
        await sleep(2000);
        continue;
      }
      throw new Error(`Google Places API error: ${data.status} - ${data.error_message}`);
    }

    allResults.push(...(data.results || []));

    // Only continue pagination if enabled and there's a next page
    if (paginate && data.next_page_token) {
      pageToken = data.next_page_token;
      // Google requires a delay before using next_page_token
      await sleep(2000);
    } else {
      pageToken = undefined;
    }
  } while (pageToken);

  return allResults;
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const config = getConfig();
  if (!config.googleMapsApiKey) {
    throw new Error('Google Maps API key not configured');
  }

  await googleMapsRateLimiter.waitForSlot();

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'place_id,name,formatted_address,types,address_components',
    key: config.googleMapsApiKey
  });

  const url = `${PLACES_API_BASE}/details/json?${params}`;
  const response = await request(url);
  const data = await response.body.json() as PlaceDetailsResponse;

  if (data.status !== 'OK') {
    if (data.status === 'NOT_FOUND') {
      return null;
    }
    throw new Error(`Google Places API error: ${data.status} - ${data.error_message}`);
  }

  return data.result;
}

function parseAddressComponents(components: PlaceDetails['address_components']): {
  city: string | null;
  stateProvince: string | null;
  country: 'US' | 'CA' | null;
} {
  if (!components) {
    return { city: null, stateProvince: null, country: null };
  }

  let city: string | null = null;
  let stateProvince: string | null = null;
  let country: 'US' | 'CA' | null = null;

  for (const component of components) {
    if (component.types.includes('locality')) {
      city = component.long_name;
    } else if (component.types.includes('administrative_area_level_1')) {
      stateProvince = component.short_name;
    } else if (component.types.includes('country')) {
      if (component.short_name === 'US' || component.short_name === 'CA') {
        country = component.short_name;
      }
    }
  }

  return { city, stateProvince, country };
}

function classifyBusinessType(
  name: string,
  types: string[] = []
): Lead['business_type'] {
  const nameLower = name.toLowerCase();

  // Check for franchise indicators
  const franchiseKeywords = ['kumon', 'mathnasium', 'sylvan', 'huntington', 'tutor doctor', 'club z'];
  if (franchiseKeywords.some(k => nameLower.includes(k))) {
    return 'franchise';
  }

  // Check for online platform indicators
  const onlineKeywords = ['online', 'virtual', 'remote'];
  if (onlineKeywords.some(k => nameLower.includes(k))) {
    return 'online_platform';
  }

  // Check for agency indicators
  const agencyKeywords = ['center', 'centre', 'academy', 'institute', 'learning', 'school', 'services', 'group', 'agency'];
  if (agencyKeywords.some(k => nameLower.includes(k))) {
    return 'agency';
  }

  // Check if types suggest an establishment
  if (types.includes('establishment') && types.includes('point_of_interest')) {
    return 'agency';
  }

  // Default to solo tutor
  return 'solo_tutor';
}

export interface DiscoveryResult {
  leadsFound: number;
  leadsNew: number;
  leadsDuplicate: number;
  leads: Lead[];
}

export interface DiscoveryOptions {
  queries?: string[];
  deep?: boolean; // Use all queries, pagination, and sublocations
  paginate?: boolean;
  useSublocations?: boolean;
}

export async function discoverLeadsInMetro(
  metro: { name: string; state: string; lat: number; lng: number },
  country: 'US' | 'CA',
  options: DiscoveryOptions = {},
  onProgress?: (message: string) => void
): Promise<DiscoveryResult> {
  // Handle deep mode - enable all features
  const deep = options.deep ?? false;
  const queries = options.queries ?? (deep ? DISCOVERY_QUERIES : DISCOVERY_QUERIES.slice(0, 3));
  const paginate = options.paginate ?? deep;
  const useSublocations = options.useSublocations ?? deep;

  // Get sublocations if enabled and available
  const metroKey = `${metro.name}, ${metro.state}`;
  const sublocations = useSublocations && METRO_SUBLOCATIONS[metroKey]
    ? METRO_SUBLOCATIONS[metroKey]
    : [{ name: metro.name, lat: metro.lat, lng: metro.lng }];

  const radius = sublocations.length > 1 ? 15000 : 50000; // 15km for sublocations, 50km otherwise

  const run = startDiscoveryRun('google_maps', queries.join(', '), `${metro.name}, ${metro.state}`);
  const result: DiscoveryResult = {
    leadsFound: 0,
    leadsNew: 0,
    leadsDuplicate: 0,
    leads: []
  };

  const seenPlaceIds = new Set<string>();

  try {
    for (const sublocation of sublocations) {
      if (sublocations.length > 1) {
        onProgress?.(`\n  Searching ${sublocation.name}...`);
      }

      for (const query of queries) {
        const searchQuery = `${query} in ${metro.name}, ${metro.state}`;
        onProgress?.(`Searching: "${query}"${paginate ? ' (with pagination)' : ''}`);

        const places = await searchPlaces(
          query,
          { lat: sublocation.lat, lng: sublocation.lng },
          radius,
          paginate
        );
        onProgress?.(`Found ${places.length} results for "${query}"`);

        for (const place of places) {
          // Skip if we've already seen this place ID in this run
          if (seenPlaceIds.has(place.place_id)) {
            continue;
          }
          seenPlaceIds.add(place.place_id);

          // Skip non-operational businesses
          if (place.business_status && place.business_status !== 'OPERATIONAL') {
            continue;
          }

          result.leadsFound++;

          // Check if we already have this lead by source ID
          const existingBySourceId = getLeadBySourceId('google_maps', place.place_id);
          if (existingBySourceId) {
            result.leadsDuplicate++;
            continue;
          }

          // Get detailed place information
          const details = await getPlaceDetails(place.place_id);
          if (!details) {
            continue;
          }

          const { city, stateProvince, country: detectedCountry } = parseAddressComponents(details.address_components);

          // Skip if not in US or CA
          if (!detectedCountry || (detectedCountry !== 'US' && detectedCountry !== 'CA')) {
            continue;
          }

          // Check for duplicate by business name and location
          const existingByName = findDuplicateLead(details.name, city, stateProvince);
          if (existingByName) {
            result.leadsDuplicate++;
            continue;
          }

          // Insert new lead
          const lead = insertLead({
            business_name: details.name,
            business_type: classifyBusinessType(details.name, details.types),
            website: null,
            phone: null,
            address: details.formatted_address || null,
            city,
            state_province: stateProvince,
            country: detectedCountry,
            source: 'google_maps',
            source_id: place.place_id,
            google_rating: null,
            google_review_count: null
          });

          result.leadsNew++;
          result.leads.push(lead);

          onProgress?.(`Added: ${details.name} (${city}, ${stateProvince})`);
        }
      }
    }

    completeDiscoveryRun(run.id, result.leadsFound, result.leadsNew, result.leadsDuplicate);
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    failDiscoveryRun(run.id, errorMessage);
    throw error;
  }
}

export async function discoverLeadsInMultipleMetros(
  metros: typeof METRO_AREAS.US | typeof METRO_AREAS.CA,
  country: 'US' | 'CA',
  options: DiscoveryOptions = {},
  onProgress?: (message: string) => void
): Promise<DiscoveryResult> {
  const totalResult: DiscoveryResult = {
    leadsFound: 0,
    leadsNew: 0,
    leadsDuplicate: 0,
    leads: []
  };

  for (const metro of metros) {
    onProgress?.(`\n--- Discovering leads in ${metro.name}, ${metro.state} ---`);

    const metroResult = await discoverLeadsInMetro(metro, country, options, onProgress);

    totalResult.leadsFound += metroResult.leadsFound;
    totalResult.leadsNew += metroResult.leadsNew;
    totalResult.leadsDuplicate += metroResult.leadsDuplicate;
    totalResult.leads.push(...metroResult.leads);

    onProgress?.(`${metro.name} complete: ${metroResult.leadsNew} new leads, ${metroResult.leadsDuplicate} duplicates`);
  }

  return totalResult;
}

// Quick test function
export async function testGoogleMapsConnection(): Promise<boolean> {
  const config = getConfig();
  if (!config.googleMapsApiKey) {
    console.error('Google Maps API key not configured');
    return false;
  }

  try {
    const results = await searchPlaces('tutoring', { lat: 40.7128, lng: -74.006 });
    console.log(`Connection test successful. Found ${results.length} results.`);
    return true;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}
