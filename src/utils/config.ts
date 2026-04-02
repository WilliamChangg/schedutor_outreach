export interface Config {
  googleMapsApiKey: string;
  sesRegion?: string;
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string;
}

export function getConfig(): Config {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!googleMapsApiKey) {
    console.warn('Warning: GOOGLE_MAPS_API_KEY not set. Google Maps discovery will not work.');
  }

  return {
    googleMapsApiKey: googleMapsApiKey ?? '',
    sesRegion: process.env.SES_REGION,
    sesAccessKeyId: process.env.SES_ACCESS_KEY_ID,
    sesSecretAccessKey: process.env.SES_SECRET_ACCESS_KEY
  };
}

// Metro areas for discovery - top US and Canadian cities
export const METRO_AREAS = {
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
export const DISCOVERY_QUERIES = [
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
