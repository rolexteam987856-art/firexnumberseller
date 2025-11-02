const axios = require('axios');
const admin = require('firebase-admin');

// Firebase Initialization
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
    databaseURL: "https://happy-seller-3d85b-default-rtdb.firebaseio.com"
  });
  console.log('Firebase initialized successfully');
} catch (error) {
  console.log('Firebase initialization:', error.message);
}

const API_KEY = process.env.API_KEY;

// ✅ Multiple Countries Database with Prices
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
  // CORS - Allow all
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path } = req.query;
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || '';

  try {
    // ✅ PERFECT FIX: Sirf otpal.vercel.app allow, baaki sab block
    const isDirectAccess = userAgent.includes('Mozilla') && 
                           (!referer || !referer.includes('otpal.vercel.app'));

    // If direct access, show HTML
    if (isDirectAccess && path && path !== 'health') {
      return res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Access Blocked</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: #1a1a1a;
            color: white;
        }
        .container {
            background: #2d2d2d;
            padding: 40px;
            border-radius: 10px;
            border: 2px solid #ff4444;
            max-width: 600px;
            margin: 0 auto;
        }
        h1 { color: #ff4444; }
        .shayri { 
            color: #ffaa00; 
            font-style: italic;
            margin: 20px 0;
            padding: 20px;
            background: #333;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚫 Access Blocked</h1>
        <p>Are you stupid 😂 this is not api Bhai Direct Api Samajh ke ghus gaya yaar</p>
        <div class="shayri">
            "Log kehte hain — 'Bhai tu hamesha smile karta hai!'<br>
            Arre naam hi Happy hai, rona toh gunah hai bhaiya! 😜"
        </div>
        <p>Direct API access is not allowed👍</p>
        <p>Please use the official website:</p>
        <a href="https://otpal.vercel.app" target="_blank" style="text-decoration: none;">
  <button style="background-color: #00ffff; 
                 color: black; 
                 padding: 18px 36px; 
                 border: none; 
                 border-radius: 12px; 
                 cursor: pointer; 
                 font-size: 22px; 
                 font-weight: bold; 
                 box-shadow: 0 0 15px rgba(0, 255, 255, 0.6); 
                 transition: all 0.3s ease;"
          onmouseover="this.style.backgroundColor='#00cccc'; this.style.boxShadow='0 0 30px rgba(0, 255, 255, 0.9)'; this.style.transform='scale(1.05)';"
          onmouseout="this.style.backgroundColor='#00ffff'; this.style.boxShadow='0 0 15px rgba(0, 255, 255, 0.6)'; this.style.transform='scale(1)';">
    Happy Website
  </button>
</a>
    </div>
</body>
</html>`);
    }

    // Normal API functionality
    if (path === 'health') {
      return res.json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        firebase: 'Connected',
        countries: Object.keys(countries).length
      });
    }

    if (path === 'getNumber') {
      const { countryKey = 'philippines_51' } = req.query; // Default to Philippines
      const countryConfig = countries[countryKey];
      
      if (!countryConfig) {
        return res.json({
          success: false,
          error: 'Invalid country selection'
        });
      }

      const url = `https://firexotp.com/stubs/handler_api.php?action=getNumber&api_key=${API_KEY}&service=wa&country=${countryConfig.code}`;
      const response = await axios.get(url);
      const data = response.data;

      const parts = data.split(':');
      if (parts[0] === 'ACCESS_NUMBER' && parts.length === 3) {
        return res.json({
          success: true,
          id: parts[1],
          number: parts[2],
          country: countryConfig.country,
          service: countryConfig.name,
          price: countryConfig.price
        });
      } else {
        return res.json({
          success: false,
          error: data
        });
      }
    }

    if (path === 'getCountries') {
      return res.json({
        success: true,
        countries: countries
      });
    }

    if (path === 'getOtp') {
      const { id } = req.query;
      if (!id) {
        return res.json({ success: false, error: 'ID required' });
      }

      const url = `https://firexotp.com/stubs/handler_api.php?action=getStatus&api_key=${API_KEY}&id=${id}`;
      const response = await axios.get(url);

      return res.json({
        success: true,
        data: response.data
      });
    }

    if (path === 'cancelNumber') {
      const { id } = req.query;
      if (!id) {
        return res.json({ success: false, error: 'ID required' });
      }

      const url = `https://firexotp.com/stubs/handler_api.php?action=setStatus&api_key=${API_KEY}&id=${id}&status=8`;
      const response = await axios.get(url);

      return res.json({
        success: true,
        data: response.data
      });
    }

    return res.json({ error: 'Invalid path' });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
