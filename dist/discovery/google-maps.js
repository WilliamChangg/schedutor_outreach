import { request } from 'undici';
import { getConfig, DISCOVERY_QUERIES } from '../utils/config.js';
import { googleMapsRateLimiter } from '../utils/rate-limiter.js';
import { insertLead, getLeadBySourceId, findDuplicateLead, startDiscoveryRun, completeDiscoveryRun, failDiscoveryRun } from '../db/index.js';
const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';
export async function searchPlaces(query, location, radiusMeters = 50000 // 50km default radius
) {
    const config = getConfig();
    if (!config.googleMapsApiKey) {
        throw new Error('Google Maps API key not configured');
    }
    await googleMapsRateLimiter.waitForSlot();
    const params = new URLSearchParams({
        query: query,
        location: `${location.lat},${location.lng}`,
        radius: radiusMeters.toString(),
        key: config.googleMapsApiKey
    });
    const url = `${PLACES_API_BASE}/textsearch/json?${params}`;
    const response = await request(url);
    const data = await response.body.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${data.status} - ${data.error_message}`);
    }
    return data.results || [];
}
export async function getPlaceDetails(placeId) {
    const config = getConfig();
    if (!config.googleMapsApiKey) {
        throw new Error('Google Maps API key not configured');
    }
    await googleMapsRateLimiter.waitForSlot();
    const params = new URLSearchParams({
        place_id: placeId,
        fields: 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,address_components',
        key: config.googleMapsApiKey
    });
    const url = `${PLACES_API_BASE}/details/json?${params}`;
    const response = await request(url);
    const data = await response.body.json();
    if (data.status !== 'OK') {
        if (data.status === 'NOT_FOUND') {
            return null;
        }
        throw new Error(`Google Places API error: ${data.status} - ${data.error_message}`);
    }
    return data.result;
}
function parseAddressComponents(components) {
    if (!components) {
        return { city: null, stateProvince: null, country: null };
    }
    let city = null;
    let stateProvince = null;
    let country = null;
    for (const component of components) {
        if (component.types.includes('locality')) {
            city = component.long_name;
        }
        else if (component.types.includes('administrative_area_level_1')) {
            stateProvince = component.short_name;
        }
        else if (component.types.includes('country')) {
            if (component.short_name === 'US' || component.short_name === 'CA') {
                country = component.short_name;
            }
        }
    }
    return { city, stateProvince, country };
}
function classifyBusinessType(name, types = []) {
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
export async function discoverLeadsInMetro(metro, country, queries = DISCOVERY_QUERIES.slice(0, 3), // Start with first 3 queries
onProgress) {
    const run = startDiscoveryRun('google_maps', queries.join(', '), `${metro.name}, ${metro.state}`);
    const result = {
        leadsFound: 0,
        leadsNew: 0,
        leadsDuplicate: 0,
        leads: []
    };
    const seenPlaceIds = new Set();
    try {
        for (const query of queries) {
            const searchQuery = `${query} in ${metro.name}, ${metro.state}`;
            onProgress?.(`Searching: "${searchQuery}"`);
            const places = await searchPlaces(query, { lat: metro.lat, lng: metro.lng });
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
                    website: details.website || null,
                    phone: details.formatted_phone_number || null,
                    address: details.formatted_address || null,
                    city,
                    state_province: stateProvince,
                    country: detectedCountry,
                    source: 'google_maps',
                    source_id: place.place_id,
                    google_rating: details.rating || null,
                    google_review_count: details.user_ratings_total || null
                });
                result.leadsNew++;
                result.leads.push(lead);
                onProgress?.(`Added: ${details.name} (${city}, ${stateProvince})`);
            }
        }
        completeDiscoveryRun(run.id, result.leadsFound, result.leadsNew, result.leadsDuplicate);
        return result;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failDiscoveryRun(run.id, errorMessage);
        throw error;
    }
}
export async function discoverLeadsInMultipleMetros(metros, country, queries, onProgress) {
    const totalResult = {
        leadsFound: 0,
        leadsNew: 0,
        leadsDuplicate: 0,
        leads: []
    };
    for (const metro of metros) {
        onProgress?.(`\n--- Discovering leads in ${metro.name}, ${metro.state} ---`);
        const metroResult = await discoverLeadsInMetro(metro, country, queries, onProgress);
        totalResult.leadsFound += metroResult.leadsFound;
        totalResult.leadsNew += metroResult.leadsNew;
        totalResult.leadsDuplicate += metroResult.leadsDuplicate;
        totalResult.leads.push(...metroResult.leads);
        onProgress?.(`${metro.name} complete: ${metroResult.leadsNew} new leads, ${metroResult.leadsDuplicate} duplicates`);
    }
    return totalResult;
}
// Quick test function
export async function testGoogleMapsConnection() {
    const config = getConfig();
    if (!config.googleMapsApiKey) {
        console.error('Google Maps API key not configured');
        return false;
    }
    try {
        const results = await searchPlaces('tutoring', { lat: 40.7128, lng: -74.006 });
        console.log(`Connection test successful. Found ${results.length} results.`);
        return true;
    }
    catch (error) {
        console.error('Connection test failed:', error);
        return false;
    }
}
