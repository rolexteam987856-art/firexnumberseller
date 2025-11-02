const axios = require('axios');

// ✅ SIMPLE COUNTRIES DATABASE
const countries = {
  'india_66': { code: '66', name: 'WhatsApp Indian', country: 'India', price: 140, flag: '🇮🇳' },
  'india_115': { code: '115', name: 'WhatsApp Indian', country: 'India', price: 103, flag: '🇮🇳' },
  'vietnam_118': { code: '118', name: 'WhatsApp Vietnam', country: 'Vietnam', price: 61, flag: '🇻🇳' },
  'southafrica_52': { code: '52', name: 'WhatsApp South Africa', country: 'South Africa', price: 45, flag: '🇿🇦' },
  'colombia_53': { code: '53', name: 'WhatsApp Colombia', country: 'Colombia', price: 71, flag: '🇨🇴' },
  'philippines_51': { code: '51', name: 'WhatsApp Philippines', country: 'Philippines', price: 52, flag: '🇵🇭' },
  'philippines2_117': { code: '117', name: 'WhatsApp Philippines 2', country: 'Philippines', price: 64, flag: '🇵🇭' }
};

// ✅ SIMPLE USER BALANCE STORE (In-memory)
const userBalances = new Map();

function getUserBalance(userId) {
  if (!userBalances.has(userId)) {
    userBalances.set(userId, 1000); // Default balance ₹1000
  }
  return userBalances.get(userId);
}

function deductBalance(userId, amount) {
  const currentBalance = getUserBalance(userId);
  if (currentBalance < amount) {
    return { success: false, error: 'Insufficient balance' };
  }
  const newBalance = currentBalance - amount;
  userBalances.set(userId, newBalance);
  return { success: true, newBalance: newBalance };
}

function refundBalance(userId, amount) {
  const currentBalance = getUserBalance(userId);
  const newBalance = currentBalance + amount;
  userBalances.set(userId, newBalance);
  return { success: true, newBalance: newBalance };
}

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

    // ✅ GET USER BALANCE
    if (path === 'getBalance') {
      const balance = getUserBalance(ownid);
      return res.json({
        success: true,
        userId: ownid,
        balance: balance,
        message: 'Balance retrieved successfully'
      });
    }

    // ✅ GET COUNTRIES LIST
    if (path === 'getCountries') {
      return res.json({
        success: true,
        userId: ownid,
        countries: countries,
        userBalance: getUserBalance(ownid)
      });
    }

    // ✅ GET NUMBER (With balance check and deduction)
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

      // ✅ Balance check karo
      const userBalance = getUserBalance(ownid);
      
      if (userBalance < countryConfig.price) {
        return res.json({
          success: false,
          error: 'INSUFFICIENT BALANCE',
          userId: ownid,
          currentBalance: userBalance,
          required: countryConfig.price,
          message: `You need ₹${countryConfig.price - userBalance} more to get ${countryConfig.name}`
        });
      }

      try {
        // ✅ FireXOTP se number get karo
        const API_KEY = process.env.API_KEY || 'demo';
        const url = `https://firexotp.com/stubs/handler_api.php?action=getNumber&api_key=${API_KEY}&service=wa&country=${countryConfig.code}`;
        
        console.log('Calling FireXOTP:', url);
        const response = await axios.get(url, { timeout: 30000 });
        const data = response.data;

        console.log('FireXOTP Response:', data);

        const parts = data.split(':');
        if (parts[0] === 'ACCESS_NUMBER' && parts.length === 3) {
          
          // ✅ Balance deduct karo
          const deduction = deductBalance(ownid, countryConfig.price);
          
          if (!deduction.success) {
            return res.json({
              success: false,
              error: 'Payment failed: ' + deduction.error,
              userId: ownid
            });
          }

          const numberId = parts[1];
          const phoneNumber = parts[2];

          return res.json({
            success: true,
            id: numberId,
            number: phoneNumber,
            country: countryConfig.country,
            service: countryConfig.name,
            price: countryConfig.price,
            newBalance: deduction.newBalance,
            message: `₹${countryConfig.price} deducted from your account`,
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
        const API_KEY = process.env.API_KEY || 'demo';
        const url = `https://firexotp.com/stubs/handler_api.php?action=getStatus&api_key=${API_KEY}&id=${id}`;
        
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        let otpCode = null;
        let status = 'waiting';

        if (data.includes('STATUS_OK:CODE:')) {
          otpCode = data.split(':')[2];
          status = 'received';
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
        const API_KEY = process.env.API_KEY || 'demo';
        const url = `https://firexotp.com/stubs/handler_api.php?action=setStatus&api_key=${API_KEY}&id=${id}&status=8`;
        
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        // Demo refund amount (actual implementation mein Firebase se price get karna hoga)
        const refundAmount = countries[countryKey]?.price || 50;
        const refund = refundBalance(ownid, refundAmount);

        return res.json({
          success: true,
          userId: ownid,
          data: data,
          refunded: true,
          refundAmount: refundAmount,
          newBalance: refund.newBalance,
          message: `Number cancelled and ₹${refundAmount} refunded to your account`
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
        'getBalance', 
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
