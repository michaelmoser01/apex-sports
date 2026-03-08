# Google Maps API key (coach locations)

The coach profile **Locations** feature uses Google Maps for address autocomplete and a draggable map pin. The API key is loaded at **build time** from Secrets Manager (see [STRIPE-DEPLOY.md](STRIPE-DEPLOY.md)) or from `VITE_GOOGLE_MAPS_API_KEY` in `.env` for local dev.

## Fix: "RefererNotAllowedMapError"

This error means the page URL loading the map is not allowed for your API key. Add your site URLs to the key’s **application restrictions** in Google Cloud:

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Click your **API key** (the one you put in Secrets Manager as `GOOGLE_MAPS_API_KEY`).
3. Under **Application restrictions**:
   - Choose **HTTP referrers (web sites)**.
   - Add the referrers that will load the map, for example:
     - `https://dev.getapexsports.com/*` (dev)
     - `https://getapexsports.com/*` or your prod domain
     - `http://localhost:*` for local development
4. Under **API restrictions**, restrict the key to:
   - **Maps JavaScript API**
   - **Places API**
5. Save. Changes can take a few minutes to apply.

After adding `https://dev.getapexsports.com/*`, the coach profile location map at `https://dev.getapexsports.com/dashboard/profile` should load without `RefererNotAllowedMapError`.
