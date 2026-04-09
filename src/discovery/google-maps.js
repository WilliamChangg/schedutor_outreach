"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchPlaces = searchPlaces;
exports.getPlaceDetails = getPlaceDetails;
exports.discoverLeadsInMetro = discoverLeadsInMetro;
exports.discoverLeadsInMultipleMetros = discoverLeadsInMultipleMetros;
exports.testGoogleMapsConnection = testGoogleMapsConnection;
var undici_1 = require("undici");
var config_js_1 = require("../utils/config.js");
var rate_limiter_js_1 = require("../utils/rate-limiter.js");
var sleep = function (ms) { return new Promise(function (resolve) { return setTimeout(resolve, ms); }); };
var index_js_1 = require("../db/index.js");
var PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';
function searchPlaces(query_1, location_1) {
    return __awaiter(this, arguments, void 0, function (query, location, radiusMeters, // 50km default radius
    paginate // Whether to fetch all pages (up to 60 results)
    ) {
        var config, allResults, pageToken, params, url, response, data;
        if (radiusMeters === void 0) { radiusMeters = 50000; }
        if (paginate === void 0) { paginate = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    config = (0, config_js_1.getConfig)();
                    if (!config.googleMapsApiKey) {
                        throw new Error('Google Maps API key not configured');
                    }
                    allResults = [];
                    _a.label = 1;
                case 1: return [4 /*yield*/, rate_limiter_js_1.googleMapsRateLimiter.waitForSlot()];
                case 2:
                    _a.sent();
                    params = new URLSearchParams({
                        query: query,
                        location: "".concat(location.lat, ",").concat(location.lng),
                        radius: radiusMeters.toString(),
                        key: config.googleMapsApiKey
                    });
                    if (pageToken) {
                        params.set('pagetoken', pageToken);
                    }
                    url = "".concat(PLACES_API_BASE, "/textsearch/json?").concat(params);
                    return [4 /*yield*/, (0, undici_1.request)(url)];
                case 3:
                    response = _a.sent();
                    return [4 /*yield*/, response.body.json()];
                case 4:
                    data = _a.sent();
                    if (!(data.status !== 'OK' && data.status !== 'ZERO_RESULTS')) return [3 /*break*/, 7];
                    if (!(data.status === 'INVALID_REQUEST' && pageToken)) return [3 /*break*/, 6];
                    return [4 /*yield*/, sleep(2000)];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 10];
                case 6: throw new Error("Google Places API error: ".concat(data.status, " - ").concat(data.error_message));
                case 7:
                    allResults.push.apply(allResults, (data.results || []));
                    if (!(paginate && data.next_page_token)) return [3 /*break*/, 9];
                    pageToken = data.next_page_token;
                    // Google requires a delay before using next_page_token
                    return [4 /*yield*/, sleep(2000)];
                case 8:
                    // Google requires a delay before using next_page_token
                    _a.sent();
                    return [3 /*break*/, 10];
                case 9:
                    pageToken = undefined;
                    _a.label = 10;
                case 10:
                    if (pageToken) return [3 /*break*/, 1];
                    _a.label = 11;
                case 11: return [2 /*return*/, allResults];
            }
        });
    });
}
function getPlaceDetails(placeId) {
    return __awaiter(this, void 0, void 0, function () {
        var config, params, url, response, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    config = (0, config_js_1.getConfig)();
                    if (!config.googleMapsApiKey) {
                        throw new Error('Google Maps API key not configured');
                    }
                    return [4 /*yield*/, rate_limiter_js_1.googleMapsRateLimiter.waitForSlot()];
                case 1:
                    _a.sent();
                    params = new URLSearchParams({
                        place_id: placeId,
                        fields: 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,address_components',
                        key: config.googleMapsApiKey
                    });
                    url = "".concat(PLACES_API_BASE, "/details/json?").concat(params);
                    return [4 /*yield*/, (0, undici_1.request)(url)];
                case 2:
                    response = _a.sent();
                    return [4 /*yield*/, response.body.json()];
                case 3:
                    data = _a.sent();
                    if (data.status !== 'OK') {
                        if (data.status === 'NOT_FOUND') {
                            return [2 /*return*/, null];
                        }
                        throw new Error("Google Places API error: ".concat(data.status, " - ").concat(data.error_message));
                    }
                    return [2 /*return*/, data.result];
            }
        });
    });
}
function parseAddressComponents(components) {
    if (!components) {
        return { city: null, stateProvince: null, country: null };
    }
    var city = null;
    var stateProvince = null;
    var country = null;
    for (var _i = 0, components_1 = components; _i < components_1.length; _i++) {
        var component = components_1[_i];
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
    return { city: city, stateProvince: stateProvince, country: country };
}
function classifyBusinessType(name, types) {
    if (types === void 0) { types = []; }
    var nameLower = name.toLowerCase();
    // Check for franchise indicators
    var franchiseKeywords = ['kumon', 'mathnasium', 'sylvan', 'huntington', 'tutor doctor', 'club z'];
    if (franchiseKeywords.some(function (k) { return nameLower.includes(k); })) {
        return 'franchise';
    }
    // Check for online platform indicators
    var onlineKeywords = ['online', 'virtual', 'remote'];
    if (onlineKeywords.some(function (k) { return nameLower.includes(k); })) {
        return 'online_platform';
    }
    // Check for agency indicators
    var agencyKeywords = ['center', 'centre', 'academy', 'institute', 'learning', 'school', 'services', 'group', 'agency'];
    if (agencyKeywords.some(function (k) { return nameLower.includes(k); })) {
        return 'agency';
    }
    // Check if types suggest an establishment
    if (types.includes('establishment') && types.includes('point_of_interest')) {
        return 'agency';
    }
    // Default to solo tutor
    return 'solo_tutor';
}
function discoverLeadsInMetro(metro_1, country_1) {
    return __awaiter(this, arguments, void 0, function (metro, country, options, onProgress) {
        var deep, queries, paginate, useSublocations, metroKey, sublocations, radius, run, result, seenPlaceIds, _i, sublocations_1, sublocation, _a, queries_1, query, searchQuery, places, _b, places_1, place, existingBySourceId, details, _c, city, stateProvince, detectedCountry, existingByName, lead, error_1, errorMessage;
        var _d, _e, _f, _g;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    deep = (_d = options.deep) !== null && _d !== void 0 ? _d : false;
                    queries = (_e = options.queries) !== null && _e !== void 0 ? _e : (deep ? config_js_1.DISCOVERY_QUERIES : config_js_1.DISCOVERY_QUERIES.slice(0, 3));
                    paginate = (_f = options.paginate) !== null && _f !== void 0 ? _f : deep;
                    useSublocations = (_g = options.useSublocations) !== null && _g !== void 0 ? _g : deep;
                    metroKey = "".concat(metro.name, ", ").concat(metro.state);
                    sublocations = useSublocations && config_js_1.METRO_SUBLOCATIONS[metroKey]
                        ? config_js_1.METRO_SUBLOCATIONS[metroKey]
                        : [{ name: metro.name, lat: metro.lat, lng: metro.lng }];
                    radius = sublocations.length > 1 ? 15000 : 50000;
                    run = (0, index_js_1.startDiscoveryRun)('google_maps', queries.join(', '), "".concat(metro.name, ", ").concat(metro.state));
                    result = {
                        leadsFound: 0,
                        leadsNew: 0,
                        leadsDuplicate: 0,
                        leads: []
                    };
                    seenPlaceIds = new Set();
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 11, , 12]);
                    _i = 0, sublocations_1 = sublocations;
                    _h.label = 2;
                case 2:
                    if (!(_i < sublocations_1.length)) return [3 /*break*/, 10];
                    sublocation = sublocations_1[_i];
                    if (sublocations.length > 1) {
                        onProgress === null || onProgress === void 0 ? void 0 : onProgress("\n  Searching ".concat(sublocation.name, "..."));
                    }
                    _a = 0, queries_1 = queries;
                    _h.label = 3;
                case 3:
                    if (!(_a < queries_1.length)) return [3 /*break*/, 9];
                    query = queries_1[_a];
                    searchQuery = "".concat(query, " in ").concat(metro.name, ", ").concat(metro.state);
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress("Searching: \"".concat(query, "\"").concat(paginate ? ' (with pagination)' : ''));
                    return [4 /*yield*/, searchPlaces(query, { lat: sublocation.lat, lng: sublocation.lng }, radius, paginate)];
                case 4:
                    places = _h.sent();
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress("Found ".concat(places.length, " results for \"").concat(query, "\""));
                    _b = 0, places_1 = places;
                    _h.label = 5;
                case 5:
                    if (!(_b < places_1.length)) return [3 /*break*/, 8];
                    place = places_1[_b];
                    // Skip if we've already seen this place ID in this run
                    if (seenPlaceIds.has(place.place_id)) {
                        return [3 /*break*/, 7];
                    }
                    seenPlaceIds.add(place.place_id);
                    // Skip non-operational businesses
                    if (place.business_status && place.business_status !== 'OPERATIONAL') {
                        return [3 /*break*/, 7];
                    }
                    result.leadsFound++;
                    existingBySourceId = (0, index_js_1.getLeadBySourceId)('google_maps', place.place_id);
                    if (existingBySourceId) {
                        result.leadsDuplicate++;
                        return [3 /*break*/, 7];
                    }
                    return [4 /*yield*/, getPlaceDetails(place.place_id)];
                case 6:
                    details = _h.sent();
                    if (!details) {
                        return [3 /*break*/, 7];
                    }
                    _c = parseAddressComponents(details.address_components), city = _c.city, stateProvince = _c.stateProvince, detectedCountry = _c.country;
                    // Skip if not in US or CA
                    if (!detectedCountry || (detectedCountry !== 'US' && detectedCountry !== 'CA')) {
                        return [3 /*break*/, 7];
                    }
                    existingByName = (0, index_js_1.findDuplicateLead)(details.name, city, stateProvince);
                    if (existingByName) {
                        result.leadsDuplicate++;
                        return [3 /*break*/, 7];
                    }
                    lead = (0, index_js_1.insertLead)({
                        business_name: details.name,
                        business_type: classifyBusinessType(details.name, details.types),
                        website: details.website || null,
                        phone: details.formatted_phone_number || null,
                        address: details.formatted_address || null,
                        city: city,
                        state_province: stateProvince,
                        country: detectedCountry,
                        source: 'google_maps',
                        source_id: place.place_id,
                        google_rating: details.rating || null,
                        google_review_count: details.user_ratings_total || null
                    });
                    result.leadsNew++;
                    result.leads.push(lead);
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress("Added: ".concat(details.name, " (").concat(city, ", ").concat(stateProvince, ")"));
                    _h.label = 7;
                case 7:
                    _b++;
                    return [3 /*break*/, 5];
                case 8:
                    _a++;
                    return [3 /*break*/, 3];
                case 9:
                    _i++;
                    return [3 /*break*/, 2];
                case 10:
                    (0, index_js_1.completeDiscoveryRun)(run.id, result.leadsFound, result.leadsNew, result.leadsDuplicate);
                    return [2 /*return*/, result];
                case 11:
                    error_1 = _h.sent();
                    errorMessage = error_1 instanceof Error ? error_1.message : 'Unknown error';
                    (0, index_js_1.failDiscoveryRun)(run.id, errorMessage);
                    throw error_1;
                case 12: return [2 /*return*/];
            }
        });
    });
}
function discoverLeadsInMultipleMetros(metros_1, country_1) {
    return __awaiter(this, arguments, void 0, function (metros, country, options, onProgress) {
        var totalResult, _i, metros_2, metro, metroResult;
        var _a;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    totalResult = {
                        leadsFound: 0,
                        leadsNew: 0,
                        leadsDuplicate: 0,
                        leads: []
                    };
                    _i = 0, metros_2 = metros;
                    _b.label = 1;
                case 1:
                    if (!(_i < metros_2.length)) return [3 /*break*/, 4];
                    metro = metros_2[_i];
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress("\n--- Discovering leads in ".concat(metro.name, ", ").concat(metro.state, " ---"));
                    return [4 /*yield*/, discoverLeadsInMetro(metro, country, options, onProgress)];
                case 2:
                    metroResult = _b.sent();
                    totalResult.leadsFound += metroResult.leadsFound;
                    totalResult.leadsNew += metroResult.leadsNew;
                    totalResult.leadsDuplicate += metroResult.leadsDuplicate;
                    (_a = totalResult.leads).push.apply(_a, metroResult.leads);
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress("".concat(metro.name, " complete: ").concat(metroResult.leadsNew, " new leads, ").concat(metroResult.leadsDuplicate, " duplicates"));
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, totalResult];
            }
        });
    });
}
// Quick test function
function testGoogleMapsConnection() {
    return __awaiter(this, void 0, void 0, function () {
        var config, results, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    config = (0, config_js_1.getConfig)();
                    if (!config.googleMapsApiKey) {
                        console.error('Google Maps API key not configured');
                        return [2 /*return*/, false];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, searchPlaces('tutoring', { lat: 40.7128, lng: -74.006 })];
                case 2:
                    results = _a.sent();
                    console.log("Connection test successful. Found ".concat(results.length, " results."));
                    return [2 /*return*/, true];
                case 3:
                    error_2 = _a.sent();
                    console.error('Connection test failed:', error_2);
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
