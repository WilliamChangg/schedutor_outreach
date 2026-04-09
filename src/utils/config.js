"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.METRO_SUBLOCATIONS = exports.DISCOVERY_QUERIES = exports.METRO_AREAS = void 0;
exports.getConfig = getConfig;
var dotenv_1 = require("dotenv");
var path_1 = require("path");
var url_1 = require("url");
var __dirname = (0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url));
// Load .env from project root
(0, dotenv_1.config)({ path: (0, path_1.join)(__dirname, '../../.env') });
var configLoaded = false;
function getConfig() {
    var googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey && !configLoaded) {
        console.warn('Warning: GOOGLE_MAPS_API_KEY not set in .env file. Google Maps discovery will not work.');
        configLoaded = true;
    }
    return {
        googleMapsApiKey: googleMapsApiKey !== null && googleMapsApiKey !== void 0 ? googleMapsApiKey : '',
        sesRegion: process.env.SES_REGION,
        sesAccessKeyId: process.env.SES_ACCESS_KEY_ID,
        sesSecretAccessKey: process.env.SES_SECRET_ACCESS_KEY
    };
}
// Metro areas for discovery - top US and Canadian cities
exports.METRO_AREAS = {
    US: [
        { name: 'New York', state: 'NY', lat: 40.7128, lng: -74.006 },
        { name: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
        { name: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
        { name: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
        { name: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.074 },
        { name: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
        { name: 'San Antonio', state: 'TX', lat: 29.4241, lng: -98.4936 },
        { name: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611 },
        { name: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
        { name: 'San Jose', state: 'CA', lat: 37.3382, lng: -121.8863 },
        { name: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
        { name: 'Jacksonville', state: 'FL', lat: 30.3322, lng: -81.6557 },
        { name: 'Fort Worth', state: 'TX', lat: 32.7555, lng: -97.3308 },
        { name: 'Columbus', state: 'OH', lat: 39.9612, lng: -82.9988 },
        { name: 'Charlotte', state: 'NC', lat: 35.2271, lng: -80.8431 },
        { name: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
        { name: 'Indianapolis', state: 'IN', lat: 39.7684, lng: -86.1581 },
        { name: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
        { name: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
        { name: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 },
        { name: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 },
        { name: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
        { name: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816 },
        { name: 'Portland', state: 'OR', lat: 45.5152, lng: -122.6784 },
        { name: 'Las Vegas', state: 'NV', lat: 36.1699, lng: -115.1398 }
    ],
    CA: [
        { name: 'Toronto', state: 'ON', lat: 43.6532, lng: -79.3832 },
        { name: 'Vancouver', state: 'BC', lat: 49.2827, lng: -123.1207 },
        { name: 'Montreal', state: 'QC', lat: 45.5017, lng: -73.5673 },
        { name: 'Calgary', state: 'AB', lat: 51.0447, lng: -114.0719 },
        { name: 'Edmonton', state: 'AB', lat: 53.5461, lng: -113.4938 },
        { name: 'Ottawa', state: 'ON', lat: 45.4215, lng: -75.6972 },
        { name: 'Winnipeg', state: 'MB', lat: 49.8951, lng: -97.1384 },
        { name: 'Quebec City', state: 'QC', lat: 46.8139, lng: -71.208 },
        { name: 'Hamilton', state: 'ON', lat: 43.2557, lng: -79.8711 },
        { name: 'Victoria', state: 'BC', lat: 48.4284, lng: -123.3656 }
    ]
};
// Tutoring-related search queries
exports.DISCOVERY_QUERIES = [
    'tutoring center',
    'tutoring service',
    'math tutor',
    'reading tutor',
    'test prep',
    'SAT prep',
    'ACT prep',
    'homework help',
    'learning center',
    'academic tutoring',
    'private tutor',
    'tutoring agency'
];
// Sublocations for major metros (enables deeper discovery with --deep flag)
// Key format: "City, State/Province"
exports.METRO_SUBLOCATIONS = {
    // Canada
    'Toronto, ON': [
        { name: 'Downtown Toronto', lat: 43.6532, lng: -79.3832 },
        { name: 'North York', lat: 43.7615, lng: -79.4111 },
        { name: 'Scarborough', lat: 43.7731, lng: -79.2578 },
        { name: 'Etobicoke', lat: 43.6205, lng: -79.5132 },
        { name: 'Mississauga', lat: 43.5890, lng: -79.6441 },
        { name: 'Markham', lat: 43.8561, lng: -79.3370 },
        { name: 'Richmond Hill', lat: 43.8828, lng: -79.4403 },
    ],
    'Vancouver, BC': [
        { name: 'Downtown Vancouver', lat: 49.2827, lng: -123.1207 },
        { name: 'Burnaby', lat: 49.2488, lng: -122.9805 },
        { name: 'Surrey', lat: 49.1913, lng: -122.8490 },
        { name: 'Richmond', lat: 49.1666, lng: -123.1336 },
        { name: 'Coquitlam', lat: 49.2838, lng: -122.7932 },
    ],
    'Montreal, QC': [
        { name: 'Downtown Montreal', lat: 45.5017, lng: -73.5673 },
        { name: 'Laval', lat: 45.6066, lng: -73.7124 },
        { name: 'Longueuil', lat: 45.5312, lng: -73.5185 },
        { name: 'West Island', lat: 45.4720, lng: -73.7949 },
    ],
    // USA
    'New York, NY': [
        { name: 'Manhattan', lat: 40.7831, lng: -73.9712 },
        { name: 'Brooklyn', lat: 40.6782, lng: -73.9442 },
        { name: 'Queens', lat: 40.7282, lng: -73.7949 },
        { name: 'Bronx', lat: 40.8448, lng: -73.8648 },
        { name: 'Staten Island', lat: 40.5795, lng: -74.1502 },
        { name: 'Jersey City', lat: 40.7178, lng: -74.0431 },
    ],
    'Los Angeles, CA': [
        { name: 'Downtown LA', lat: 34.0522, lng: -118.2437 },
        { name: 'Santa Monica', lat: 34.0195, lng: -118.4912 },
        { name: 'Pasadena', lat: 34.1478, lng: -118.1445 },
        { name: 'Long Beach', lat: 33.7701, lng: -118.1937 },
        { name: 'Glendale', lat: 34.1425, lng: -118.2551 },
        { name: 'Irvine', lat: 33.6846, lng: -117.8265 },
    ],
    'Chicago, IL': [
        { name: 'Downtown Chicago', lat: 41.8781, lng: -87.6298 },
        { name: 'Evanston', lat: 42.0451, lng: -87.6877 },
        { name: 'Oak Park', lat: 41.8850, lng: -87.7845 },
        { name: 'Naperville', lat: 41.7508, lng: -88.1535 },
        { name: 'Schaumburg', lat: 42.0334, lng: -88.0834 },
    ],
    'Houston, TX': [
        { name: 'Downtown Houston', lat: 29.7604, lng: -95.3698 },
        { name: 'Sugar Land', lat: 29.6197, lng: -95.6349 },
        { name: 'The Woodlands', lat: 30.1658, lng: -95.4613 },
        { name: 'Katy', lat: 29.7858, lng: -95.8245 },
        { name: 'Pearland', lat: 29.5636, lng: -95.2860 },
    ],
    'Boston, MA': [
        { name: 'Downtown Boston', lat: 42.3601, lng: -71.0589 },
        { name: 'Cambridge', lat: 42.3736, lng: -71.1097 },
        { name: 'Brookline', lat: 42.3318, lng: -71.1212 },
        { name: 'Newton', lat: 42.3370, lng: -71.2092 },
        { name: 'Somerville', lat: 42.3876, lng: -71.0995 },
    ],
};
