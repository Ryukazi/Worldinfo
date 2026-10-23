// Works as CommonJS (Vercel api/) and as a plain browser script (window.WSCountry).
(function (root) {
  var COUNTRY_API_BASE = "https://api.siputzx.my.id";

  async function getCountryInfo(countryName, opts) {
    opts = opts || {};
    if (!countryName || !String(countryName).trim()) throw new Error("Country name is required");
    var url = new URL(opts.path || "/api/tools/countryInfo", opts.base || COUNTRY_API_BASE);
    url.searchParams.set("name", String(countryName).trim());
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch(url.toString(), {
        method: "GET", headers: { Accept: "application/json" }, signal: controller.signal
      });
      if (response.status === 429) throw new Error("Country API rate limit reached. Try again shortly.");
      if (!response.ok) throw new Error("Country API error: " + response.status);
      var result = await response.json();
      if (!result || result.status !== true || !result.data) throw new Error("Country information was not found");
      return result.data;
    } finally { clearTimeout(timeout); }
  }

  var api = { getCountryInfo: getCountryInfo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WSCountry = api;
})(typeof self !== "undefined" ? self : this);
