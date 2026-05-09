import { getAirportCoords } from "./AirportDB.js";

const API_KEY = "6bfbb9952b1fc18d93624da80b54a6d3";
const FLIGHTS_PER_PAGE = 100;
const TARGET_FLIGHTS = 100;
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// In dev mode, Vite proxy handles CORS (/api/flights → aviationstack).
// In production, we use a public CORS proxy to bypass browser restrictions.
const isDev = import.meta.env?.DEV ?? (location.hostname === "localhost");
const API_BASE_DEV = "/api/flights";
const API_BASE_PROD = "https://api.allorigins.win/raw?url=" + encodeURIComponent("http://api.aviationstack.com/v1/flights");

/**
 * Fetches live flight data from AviationStack and converts it
 * into the same format used by Data.js:
 *   { departure: {lat, lng}, arrival: {lat, lng}, speed }
 */
export class LiveFlightFetcher {
  constructor() {
    this.flights = [];
    this.isLoading = false;
    this.lastFetch = 0;
    this.onUpdate = null;
    this.refreshTimer = null;
  }

  /**
   * Build the API URL depending on environment.
   */
  _buildUrl(offset) {
    const params = `access_key=${API_KEY}&flight_status=active&limit=${FLIGHTS_PER_PAGE}&offset=${offset}`;
    if (isDev) {
      return `${API_BASE_DEV}?${params}`;
    }
    // Production: route through CORS proxy
    return `${API_BASE_PROD}&${params}`;
  }

  /**
   * Fetch flights from the API. Returns a promise that resolves
   * to an array in the same shape as Data.js exports.
   */
  async fetchFlights() {
    if (this.isLoading) return this.flights;
    this.isLoading = true;

    // Check localStorage cache first (avoid unnecessary API calls)
    const cached = this._getCache();
    if (cached) {
      this.flights = cached;
      this.isLoading = false;
      console.log(`[LiveFlight] Using cached data: ${cached.length} flights (expires in ${this._cacheMinutesLeft()} min)`);
      return this.flights;
    }

    try {
      const allApiFlights = [];
      const pagesToFetch = Math.ceil(TARGET_FLIGHTS / FLIGHTS_PER_PAGE);

      for (let page = 0; page < pagesToFetch; page++) {
        const offset = page * FLIGHTS_PER_PAGE;
        const url = this._buildUrl(offset);

        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`[LiveFlight] API page ${page} failed: ${response.status}`);
            break;
          }
          const json = await response.json();

          // AviationStack returns error object on quota exceeded
          if (json.error) {
            console.warn(`[LiveFlight] API error: ${json.error.message || json.error.type}`);
            break;
          }

          if (json.data && json.data.length > 0) {
            allApiFlights.push(...json.data);
          } else {
            break;
          }
        } catch (err) {
          console.warn(`[LiveFlight] Fetch error on page ${page}:`, err.message);
          break;
        }
      }

      if (allApiFlights.length > 0) {
        const converted = this._convertFlights(allApiFlights);
        this.flights = converted;
        this.lastFetch = Date.now();
        // Cache for 30 minutes so other visits/refreshes don't burn API quota
        this._setCache(converted);
        console.log(`[LiveFlight] Fetched ${allApiFlights.length} API flights → ${converted.length} usable routes`);
      } else {
        console.warn("[LiveFlight] No flights from API, will use fallback data.");
      }

      if (this.onUpdate && this.flights.length > 0) {
        this.onUpdate(this.flights);
      }
    } catch (err) {
      console.error("[LiveFlight] Fatal fetch error:", err);
    } finally {
      this.isLoading = false;
    }

    return this.flights;
  }

  /**
   * Convert AviationStack flight objects to visualizer format.
   */
  _convertFlights(apiFlights) {
    const results = [];
    for (const flight of apiFlights) {
      const depCode = flight.departure?.iata;
      const arrCode = flight.arrival?.iata;
      if (!depCode || !arrCode) continue;

      const depCoords = getAirportCoords(depCode);
      const arrCoords = getAirportCoords(arrCode);
      if (!depCoords || !arrCoords) continue;
      if (depCoords.lat === arrCoords.lat && depCoords.lng === arrCoords.lng) continue;

      let speed = 500;
      if (flight.live && flight.live.speed_horizontal) {
        speed = flight.live.speed_horizontal;
      }

      results.push({
        departure: { lat: depCoords.lat, lng: depCoords.lng },
        arrival: { lat: arrCoords.lat, lng: arrCoords.lng },
        speed: speed,
      });
    }
    return results;
  }

  // --- LocalStorage caching to save API quota ---

  _cacheKey() { return "liveFlightCache"; }

  _setCache(flights) {
    try {
      const data = { flights, timestamp: Date.now() };
      localStorage.setItem(this._cacheKey(), JSON.stringify(data));
    } catch (e) { /* localStorage full or unavailable */ }
  }

  _getCache() {
    try {
      const raw = localStorage.getItem(this._cacheKey());
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Cache valid for 30 minutes
      if (Date.now() - data.timestamp < REFRESH_INTERVAL) {
        return data.flights;
      }
      localStorage.removeItem(this._cacheKey());
    } catch (e) { /* parse error */ }
    return null;
  }

  _cacheMinutesLeft() {
    try {
      const raw = localStorage.getItem(this._cacheKey());
      if (!raw) return 0;
      const data = JSON.parse(raw);
      return Math.max(0, Math.round((REFRESH_INTERVAL - (Date.now() - data.timestamp)) / 60000));
    } catch (e) { return 0; }
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      this.fetchFlights();
    }, REFRESH_INTERVAL);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
