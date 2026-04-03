export interface Config {
    googleMapsApiKey: string;
    sesRegion?: string;
    sesAccessKeyId?: string;
    sesSecretAccessKey?: string;
}
export declare function getConfig(): Config;
export declare const METRO_AREAS: {
    US: {
        name: string;
        state: string;
        lat: number;
        lng: number;
    }[];
    CA: {
        name: string;
        state: string;
        lat: number;
        lng: number;
    }[];
};
export declare const DISCOVERY_QUERIES: string[];
