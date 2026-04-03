import { METRO_AREAS } from '../utils/config.js';
import { type Lead } from '../db/index.js';
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
export declare function searchPlaces(query: string, location: {
    lat: number;
    lng: number;
}, radiusMeters?: number): Promise<PlaceResult[]>;
export declare function getPlaceDetails(placeId: string): Promise<PlaceDetails | null>;
export interface DiscoveryResult {
    leadsFound: number;
    leadsNew: number;
    leadsDuplicate: number;
    leads: Lead[];
}
export declare function discoverLeadsInMetro(metro: {
    name: string;
    state: string;
    lat: number;
    lng: number;
}, country: 'US' | 'CA', queries?: string[], // Start with first 3 queries
onProgress?: (message: string) => void): Promise<DiscoveryResult>;
export declare function discoverLeadsInMultipleMetros(metros: typeof METRO_AREAS.US | typeof METRO_AREAS.CA, country: 'US' | 'CA', queries?: string[], onProgress?: (message: string) => void): Promise<DiscoveryResult>;
export declare function testGoogleMapsConnection(): Promise<boolean>;
export {};
