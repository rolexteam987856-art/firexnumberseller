const axios = require('axios');
const admin = require('firebase-admin');

// ✅ PROPER FIREBASE INITIALIZATION
let db;
let firebaseInitialized = false;

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      }),
      databaseURL: "https://happy-seller-3d85b-default-rtdb.firebaseio.com"
    });
  }
  
  db = admin.database();
  firebaseInitialized = true;
  console.log('Firebase initialized successfully');
} catch (error) {
  console.log('Firebase initialization error:', error.message);
  firebaseInitialized = false;
}

const API_KEY = process.env.API_KEY || 'demo_key';

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

// ✅ USER MANAGEMENT FUNCTIONS
async function initializeUser(userId) {
  if (!firebaseInitialized) return { success: false, error: 'Firebase not connected' };
  
  try {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    
    if (!snapshot.exists()) {
      await userRef.set({
        balance: 0,
        createdAt: new Date().toISOString(),
        totalSpent: 0,
        numbersUsed: 0,
        lastActive: new Date().toISOString(),
        status: 'active'
      });
      return { success: true, newUser: true, balance: 0 };
    }
    
    // Update last active time for existing user
    await userRef.update({
      lastActive: new Date().toISOString()
    });
    
    const userData = snapshot.val();
    return { 
      success: true, 
      newUser: false, 
      balance: userData.balance || 0,
      totalSpent: userData.totalSpent || 0,
      numbersUsed: userData.numbersUsed || 0
    };
  } catch (error) {
    console.error('User initialization error:', error);
    return { success: false, error: error.message };
  }
}

async function checkUserBalance(userId) {
  if (!firebaseInitialized) return 0;
  
  try {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    
    if (snapshot.exists()) {
      const userData = snapshot.val();
      return userData.balance || 0;
    }
    return 0;
  } catch (error) {
    console.error('Balance check error:', error);
    return 0;
  }
}

async function deductBalance(userId, amount, countryKey) {
  if (!firebaseInitialized) {
    return { success: false, error: 'Firebase not connected' };
  }
  
  try {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    
    if (!snapshot.exists()) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = snapshot.val();
    const currentBalance = userData.balance || 0;
    
    if (currentBalance < amount) {
      return { 
        success: false, 
        error: 'Insufficient balance', 
        currentBalance: currentBalance,
        required: amount 
      };
    }
    
    const newBalance = currentBalance - amount;
    const totalSpent = (userData.totalSpent || 0) + amount;
    const numbersUsed = (userData.numbersUsed || 0) + 1;
    
    await userRef.update({
      balance: newBalance,
      totalSpent: totalSpent,
      numbersUsed: numbersUsed,
      lastUsed: new Date().toISOString(),
      lastActive: new Date().toISOString()
    });
    
    // Transaction record
    const transactionRef = db.ref(`transactions/${userId}`).push();
    await transactionRef.set({
      type: 'number_purchase',
      amount: amount,
      country: countryKey,
      service: countries[countryKey]?.name || 'Unknown',
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      timestamp: new Date().toISOString(),
      status: 'completed'
    });
    
    return { success: true, newBalance: newBalance };
  } catch (error) {
    console.error('Deduction error:', error);
    return { success: false, error: 'Deduction failed' };
  }
}

async function refundBalance(userId, amount, reason = 'cancelled', numberId = null) {
  if (!firebaseInitialized) {
    return { success: false, error: 'Firebase not connected' };
  }
  
  try {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    
    if (!snapshot.exists()) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = snapshot.val();
    const currentBalance = userData.balance || 0;
    const newBalance = currentBalance + amount;
    
    await userRef.update({
      balance: newBalance,
      lastRefund: new Date().toISOString(),
      lastActive: new Date().toISOString()
    });
    
    // Refund transaction record
    const transactionRef = db.ref(`transactions/${userId}`).push();
    await transactionRef.set({
      type: 'refund',
      amount: amount,
      reason: reason,
      numberId: numberId,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      timestamp: new Date().toISOString(),
      status: 'completed'
    });
    
    return { success: true, newBalance: newBalance };
  } catch (error) {
    console.error('Refund error:', error);
    return { success: false, error: 'Refund failed' };
  }
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
    // ✅ HEALTH CHECK (Bina ownid ke allow)
    if (path === 'health') {
      return res.json({
        status: 'OK',
        message: 'FirexOTP Server is running',
        timestamp: new Date().toISOString(),
        firebase: firebaseInitialized ? 'Connected' : 'Not Connected',
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

    // ✅ Initialize user (agar naya hai to create karo)
    const userInit = await initializeUser(ownid);
    if (!userInit.success) {
      return res.json({
        success: false,
        error: 'User initialization failed: ' + userInit.error,
        userId: ownid
      });
    }

    // ✅ GET USER BALANCE
    if (path === 'getBalance') {
      const balance = await checkUserBalance(ownid);
      return res.json({
        success: true,
        userId: ownid,
        balance: balance,
        totalSpent: userInit.totalSpent || 0,
        numbersUsed: userInit.numbersUsed || 0,
        isNewUser: userInit.newUser || false
      });
    }

    // ✅ GET COUNTRIES LIST
    if (path === 'getCountries') {
      return res.json({
        success: true,
        userId: ownid,
        countries: countries,
        userBalance: await checkUserBalance(ownid)
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
      const userBalance = await checkUserBalance(ownid);
      
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
        const url = `https://firexotp.com/stubs/handler_api.php?action=getNumber&api_key=${API_KEY}&service=wa&country=${countryConfig.code}`;
        const response = await axios.get(url, { timeout: 30000 });
        const data = response.data;

        const parts = data.split(':');
        if (parts[0] === 'ACCESS_NUMBER' && parts.length === 3) {
          
          // ✅ Balance deduct karo
          const deduction = await deductBalance(ownid, countryConfig.price, countryKey);
          
          if (!deduction.success) {
            return res.json({
              success: false,
              error: 'Payment failed: ' + deduction.error,
              userId: ownid
            });
          }

          const numberId = parts[1];
          const phoneNumber = parts[2];

          // ✅ Number record save karo
          if (firebaseInitialized) {
            const numberRef = db.ref(`userNumbers/${ownid}`).push();
            await numberRef.set({
              numberId: numberId,
              number: phoneNumber,
              country: countryKey,
              countryName: countryConfig.country,
              service: countryConfig.name,
              price: countryConfig.price,
              timestamp: new Date().toISOString(),
              status: 'active',
              userId: ownid
            });

            // Active transaction save karo
            await db.ref(`activeTransactions/${ownid}`).set({
              numberId: numberId,
              number: phoneNumber,
              country: countryKey,
              price: countryConfig.price,
              timestamp: new Date().toISOString(),
              status: 'active',
              userId: ownid
            });
          }

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
            expiresIn: '15 minutes'
          });
        } else {
          return res.json({
            success: false,
            error: 'Failed to get number: ' + data,
            userId: ownid
          });
        }
      } catch (error) {
        console.error('Get number error:', error);
        return res.json({
          success: false,
          error: 'Network error: ' + error.message,
          userId: ownid
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
        const url = `https://firexotp.com/stubs/handler_api.php?action=getStatus&api_key=${API_KEY}&id=${id}`;
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        // ✅ Agar OTP mila hai to update karo
        if (data.includes('STATUS_OK:CODE:')) {
          const otpCode = data.split(':')[2];
          
          if (firebaseInitialized) {
            // Number record update karo
            const numbersRef = db.ref(`userNumbers/${ownid}`);
            const snapshot = await numbersRef.orderByChild('numberId').equalTo(id).once('value');
            
            if (snapshot.exists()) {
              const updates = {};
              snapshot.forEach((childSnapshot) => {
                updates[`${childSnapshot.key}/status`] = 'completed';
                updates[`${childSnapshot.key}/otp`] = otpCode;
                updates[`${childSnapshot.key}/completedAt`] = new Date().toISOString();
              });
              await numbersRef.update(updates);
            }

            // Active transaction remove karo
            await db.ref(`activeTransactions/${ownid}`).remove();
          }
        }

        return res.json({
          success: true,
          userId: ownid,
          data: data,
          numberId: id
        });
      } catch (error) {
        console.error('OTP check error:', error);
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
        const url = `https://firexotp.com/stubs/handler_api.php?action=setStatus&api_key=${API_KEY}&id=${id}&status=8`;
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        // ✅ Refund process karo
        if (firebaseInitialized) {
          const numbersRef = db.ref(`userNumbers/${ownid}`);
          const snapshot = await numbersRef.orderByChild('numberId').equalTo(id).once('value');
          
          let refundAmount = 0;
          if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
              const numberData = childSnapshot.val();
              refundAmount = numberData.price || 0;
            });

            // Status update karo
            const updates = {};
            snapshot.forEach((childSnapshot) => {
              updates[`${childSnapshot.key}/status`] = 'cancelled';
              updates[`${childSnapshot.key}/cancelledAt`] = new Date().toISOString();
            });
            await numbersRef.update(updates);
          }

          // Active transaction remove karo
          await db.ref(`activeTransactions/${ownid}`).remove();

          // Refund karo
          if (refundAmount > 0) {
            const refund = await refundBalance(ownid, refundAmount, 'number_cancelled', id);
            if (refund.success) {
              return res.json({
                success: true,
                userId: ownid,
                data: data,
                refunded: true,
                refundAmount: refundAmount,
                newBalance: refund.newBalance,
                message: `Number cancelled and ₹${refundAmount} refunded to your account`
              });
            }
          }
        }

        return res.json({
          success: true,
          userId: ownid,
          data: data,
          refunded: false,
          message: 'Number cancelled successfully'
        });
      } catch (error) {
        console.error('Cancel number error:', error);
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
      message: error.message
    });
  }
};
