const axios = require('axios');

// Countries Database
const countries = {
  'india_66': { code: '66', name: 'WhatsApp Indian', country: 'India', price: 140, flag: '🇮🇳' },
  'india_115': { code: '115', name: 'WhatsApp Indian', country: 'India', price: 103, flag: '🇮🇳' },
  'vietnam_118': { code: '118', name: 'WhatsApp Vietnam', country: 'Vietnam', price: 61, flag: '🇻🇳' },
  'southafrica_52': { code: '52', name: 'WhatsApp South Africa', country: 'South Africa', price: 45, flag: '🇿🇦' },
  'colombia_53': { code: '53', name: 'WhatsApp Colombia', country: 'Colombia', price: 71, flag: '🇨🇴' },
  'philippines_51': { code: '51', name: 'WhatsApp Philippines', country: 'Philippines', price: 52, flag: '🇵🇭' },
  'philippines2_117': { code: '117', name: 'WhatsApp Philippines 2', country: 'Philippines', price: 64, flag: '🇵🇭' }
};

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path, countryKey = 'philippines_51', ownid, id } = req.query;

  try {
    // HEALTH CHECK - Bina ownid ke allow
    if (path === 'health') {
      return res.json({
        status: 'OK',
        message: 'FirexOTP API Server',
        timestamp: new Date().toISOString(),
        countries: Object.keys(countries).length
      });
    }

    // 🔥 COMPULSORY USER ID CHECK
    if (!ownid) {
      return res.json({
        success: false,
        error: 'USER_ID_REQUIRED',
        message: 'Please provide user ID: &ownid=YOUR_USER_ID'
      });
    }

    // GET COUNTRIES
    if (path === 'getCountries') {
      return res.json({
        success: true,
        userId: ownid,
        countries: countries
      });
    }

    // GET NUMBER
    if (path === 'getNumber') {
      const countryConfig = countries[countryKey];
      
      if (!countryConfig) {
        return res.json({
          success: false,
          error: 'INVALID_COUNTRY',
          userId: ownid
        });
      }

      try {
        const API_KEY = process.env.API_KEY;
        const url = `https://firexotp.com/stubs/handler_api.php?action=getNumber&api_key=${API_KEY}&service=wa&country=${countryConfig.code}`;
        
        const response = await axios.get(url, { timeout: 30000 });
        const data = response.data;

        console.log('FireXOTP Response:', data);

        if (data.includes('ACCESS_NUMBER')) {
          const parts = data.split(':');
          return res.json({
            success: true,
            id: parts[1],
            number: parts[2],
            country: countryConfig.country,
            service: countryConfig.name,
            price: countryConfig.price,
            userId: ownid,
            timestamp: new Date().toISOString()
          });
        } else {
          let errorMessage = 'Service error';
          if (data.includes('NO_NUMBERS')) errorMessage = 'No numbers available';
          if (data.includes('NO_BALANCE')) errorMessage = 'Provider balance low';
          
          return res.json({
            success: false,
            error: errorMessage,
            userId: ownid
          });
        }
      } catch (error) {
        return res.json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          userId: ownid
        });
      }
    }

    // GET OTP
    if (path === 'getOtp') {
      if (!id) {
        return res.json({ 
          success: false, 
          error: 'NUMBER_ID_REQUIRED',
          userId: ownid 
        });
      }

      try {
        const API_KEY = process.env.API_KEY;
        const url = `https://firexotp.com/stubs/handler_api.php?action=getStatus&api_key=${API_KEY}&id=${id}`;
        
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        return res.json({
          success: true,
          data: data,
          userId: ownid,
          numberId: id,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        return res.json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          userId: ownid
        });
      }
    }

    // CANCEL NUMBER
    if (path === 'cancelNumber') {
      if (!id) {
        return res.json({ 
          success: false, 
          error: 'NUMBER_ID_REQUIRED',
          userId: ownid 
        });
      }

      try {
        const API_KEY = process.env.API_KEY;
        const url = `https://firexotp.com/stubs/handler_api.php?action=setStatus&api_key=${API_KEY}&id=${id}&status=8`;
        
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        return res.json({
          success: true,
          data: data,
          userId: ownid,
          message: 'Number cancelled'
        });
      } catch (error) {
        return res.json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          userId: ownid
        });
      }
    }

    return res.json({ 
      success: false, 
      error: 'INVALID_PATH',
      userId: ownid,
      availablePaths: ['getNumber', 'getOtp', 'getCountries', 'cancelNumber', 'health']
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      userId: ownid || 'unknown'
    });
  }
};
