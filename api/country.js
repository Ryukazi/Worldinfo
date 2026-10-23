// Vercel function: same-origin proxy to the Country Info API (avoids browser CORS issues).
const { getCountryInfo } = require('../src/services/country-service.js');

module.exports = async (req, res) => {
  const name = String((req.query && req.query.name) || '').trim();
  if (!name || name.length > 80 || !/^[\p{L}\p{M}\s.'’()-]+$/u.test(name)) {
    return res.status(400).json({ status: false, error: 'Invalid country name' });
  }
  try {
    const data = await getCountryInfo(name);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ status: true, data });
  } catch (e) {
    const notFound = /not found/i.test(e.message);
    return res.status(notFound ? 404 : 502).json({ status: false, error: e.message });
  }
};
