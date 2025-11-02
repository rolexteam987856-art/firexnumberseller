const axios = require('axios');

// ✅ COUNTRIES DATABASE
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
  // ✅ COMPLETE CORS HEADERS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // ✅ OPTIONS request handle karo
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path, countryKey = 'philippines_51', ownid, id } = req.query;

  try {
    console.log('API Request:', { path, ownid, countryKey, id });

    // ✅ HEALTH CHECK (Bina ownid ke allow)
    if (path === 'health') {
      return res.json({
        status: 'OK',
        message: 'FirexOTP Server is running',
        timestamp: new Date().toISOString(),
        countries: Object.keys(countries).length,
        version: '2.0.0',
        security: 'User ID required for all operations except health check'
      });
    }

    // ✅ 🔥 COMPULSORY USER ID CHECK - Bina ownid ke kuch nahi hoga
    if (!ownid) {
      return res.json({
        success: false,
        error: 'USER ID REQUIRED',
        message: 'Please provide your user ID using &ownid=YOUR_USER_ID',
        example: '/api?path=getBalance&ownid=user123'
      });
    }

    // ✅ GET COUNTRIES LIST
    if (path === 'getCountries') {
      return res.json({
        success: true,
        userId: ownid,
        countries: countries,
        message: 'Countries list retrieved successfully'
      });
    }

    // ✅ GET NUMBER (Direct FireXOTP call)
    if (path === 'getNumber') {
      const countryConfig = countries[countryKey];
      
      if (!countryConfig) {
        return res.json({
          success: false,
          error: 'Invalid country selection',
          userId: ownid,
          availableCountries: Object.keys(countries)
        });
      }

      try {
        // ✅ FireXOTP se number get karo
        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
          return res.json({
            success: false,
            error: 'API key not configured',
            userId: ownid
          });
        }

        const url = `https://firexotp.com/stubs/handler_api.php?action=getNumber&api_key=${API_KEY}&service=wa&country=${countryConfig.code}`;
        
        console.log('Calling FireXOTP:', url);
        const response = await axios.get(url, { timeout: 30000 });
        const data = response.data;

        console.log('FireXOTP Response:', data);

        const parts = data.split(':');
        if (parts[0] === 'ACCESS_NUMBER' && parts.length === 3) {
          const numberId = parts[1];
          const phoneNumber = parts[2];

          return res.json({
            success: true,
            id: numberId,
            number: phoneNumber,
            country: countryConfig.country,
            service: countryConfig.name,
            price: countryConfig.price,
            message: 'Number allocated successfully',
            userId: ownid,
            expiresIn: '15 minutes',
            timestamp: new Date().toISOString()
          });
        } else {
          let errorMessage = 'Failed to get number from provider';
          
          if (data.includes('NO_NUMBERS')) {
            errorMessage = 'No numbers available for this country. Please try another country.';
          } else if (data.includes('NO_BALANCE')) {
            errorMessage = 'Provider balance low. Please try again later.';
          } else if (data.includes('ERROR')) {
            errorMessage = 'Provider error: ' + data;
          }
          
          return res.json({
            success: false,
            error: errorMessage,
            rawError: data,
            userId: ownid
          });
        }
      } catch (error) {
        console.error('Get number error:', error.message);
        
        let errorMessage = 'Failed to connect to number provider';
        if (error.code === 'ECONNABORTED') {
          errorMessage = 'Request timeout. Please try again.';
        } else if (error.response) {
          errorMessage = `Provider error: ${error.response.status}`;
        }
        
        return res.json({
          success: false,
          error: errorMessage,
          userId: ownid,
          details: error.message
        });
      }
    }

    // ✅ GET OTP
    if (path === 'getOtp') {
      if (!id) {
        return res.json({ 
          success: false, 
          error: 'Number ID required',
          userId: ownid 
        });
      }

      try {
        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
          return res.json({
            success: false,
            error: 'API key not configured',
            userId: ownid
          });
        }

        const url = `https://firexotp.com/stubs/handler_api.php?action=getStatus&api_key=${API_KEY}&id=${id}`;
        
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        let otpCode = null;
        let status = 'waiting';

        if (data.includes('STATUS_OK:CODE:')) {
          otpCode = data.split(':')[2];
          status = 'received';
        } else if (data.includes('STATUS_CANCEL')) {
          status = 'cancelled';
        } else if (data.includes('STATUS_FINISH')) {
          status = 'finished';
        }

        return res.json({
          success: true,
          userId: ownid,
          data: data,
          numberId: id,
          status: status,
          otp: otpCode,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('OTP check error:', error.message);
        return res.json({
          success: false,
          error: 'Failed to check OTP: ' + error.message,
          userId: ownid
        });
      }
    }

    // ✅ CANCEL NUMBER
    if (path === 'cancelNumber') {
      if (!id) {
        return res.json({ 
          success: false, 
          error: 'Number ID required',
          userId: ownid 
        });
      }

      try {
        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
          return res.json({
            success: false,
            error: 'API key not configured',
            userId: ownid
          });
        }

        const url = `https://firexotp.com/stubs/handler_api.php?action=setStatus&api_key=${API_KEY}&id=${id}&status=8`;
        
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        return res.json({
          success: true,
          userId: ownid,
          data: data,
          message: 'Number cancelled successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Cancel number error:', error.message);
        return res.json({
          success: false,
          error: 'Failed to cancel number: ' + error.message,
          userId: ownid
        });
      }
    }

    // ✅ INVALID PATH
    return res.json({ 
      success: false, 
      error: 'Invalid path',
      userId: ownid,
      availablePaths: [
        'getNumber', 
        'getOtp', 
        'getCountries', 
        'cancelNumber',
        'health'
      ]
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      userId: ownid || 'unknown',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
