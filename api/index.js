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
const db = admin.database();

// ✅ Countries Database
const countries = {
  'india_66': { code: '66', name: 'WhatsApp Indian', country: 'India', price: 140, flag: '🇮🇳' },
  'india_115': { code: '115', name: 'WhatsApp Indian', country: 'India', price: 103, flag: '🇮🇳' },
  'vietnam_118': { code: '118', name: 'WhatsApp Vietnam', country: 'Vietnam', price: 61, flag: '🇻🇳' },
  'southafrica_52': { code: '52', name: 'WhatsApp South Africa', country: 'South Africa', price: 45, flag: '🇿🇦' },
  'colombia_53': { code: '53', name: 'WhatsApp Colombia', country: 'Colombia', price: 71, flag: '🇨🇴' },
  'philippines_51': { code: '51', name: 'WhatsApp Philippines', country: 'Philippines', price: 52, flag: '🇵🇭' },
  'philippines2_117': { code: '117', name: 'WhatsApp Philippines 2', country: 'Philippines', price: 64, flag: '🇵🇭' }
};

// ✅ User Balance Check Function
async function checkUserBalance(userId) {
  try {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    
    if (!snapshot.exists()) {
      // Naya user - initialize karo with zero balance
      await userRef.set({
        balance: 0,
        createdAt: new Date().toISOString(),
        totalSpent: 0,
        numbersUsed: 0,
        email: `user_${userId}@firexotp.com`,
        lastActive: new Date().toISOString()
      });
      return 0;
    }
    
    const userData = snapshot.val();
    
    // Update last active time
    await userRef.update({
      lastActive: new Date().toISOString()
    });
    
    return userData.balance || 0;
  } catch (error) {
    console.error('Balance check error:', error);
    return 0;
  }
}

// ✅ Deduct Balance Function
async function deductBalance(userId, amount, countryKey) {
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
    
    // ✅ Transaction record banao
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

// ✅ Refund Balance Function
async function refundBalance(userId, amount, reason = 'cancelled', numberId = null) {
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
    
    // ✅ Refund transaction record banao
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

// ✅ Verify User Exists
async function verifyUser(userId) {
  try {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    
    if (snapshot.exists()) {
      // Update last active time
      await userRef.update({
        lastActive: new Date().toISOString()
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('User verification error:', error);
    return false;
  }
}

// ✅ Get User Info
async function getUserInfo(userId) {
  try {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    
    if (!snapshot.exists()) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = snapshot.val();
    return {
      success: true,
      userId: userId,
      email: userData.email,
      balance: userData.balance || 0,
      totalSpent: userData.totalSpent || 0,
      numbersUsed: userData.numbersUsed || 0,
      joined: userData.createdAt,
      lastActive: userData.lastActive
    };
  } catch (error) {
    console.error('Get user info error:', error);
    return { success: false, error: 'Failed to get user info' };
  }
}

module.exports = async (req, res) => {
  // ✅ COMPLETE CORS HEADERS - SAB ALLOW KARO
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // ✅ OPTIONS request handle karo (Preflight)
  if (req.method === 'OPTIONS') {
    console.log('CORS Preflight request handled');
    return res.status(200).end();
  }

  const { path, countryKey = 'philippines_51', ownid, id } = req.query;

  console.log(`API Request: ${path}`, { userId: ownid, countryKey, numberId: id });

  try {
    // ✅ Health check (bina user verification ke allow)
    if (path === 'health') {
      let userBalance = 0;
      let userExists = false;
      
      try {
        userExists = await verifyUser(ownid);
        if (userExists) {
          userBalance = await checkUserBalance(ownid);
        }
      } catch (error) {
        console.error('Health check user error:', error);
      }
      
      return res.json({
        status: 'OK',
        message: 'FirexOTP Server is running',
        userId: ownid,
        userExists: userExists,
        userBalance: userBalance,
        timestamp: new Date().toISOString(),
        firebase: 'Connected',
        countries: Object.keys(countries).length,
        version: '2.0.0',
        cors: 'enabled'
      });
    }

    // ✅ User verification for all other paths
    if (path !== 'health' && !ownid) {
      return res.json({
        success: false,
        error: 'User ID required. Use: &ownid=YOUR_USER_ID',
        userId: ownid
      });
    }

    if (path !== 'health') {
      const userExists = await verifyUser(ownid);
      if (!userExists) {
        return res.json({
          success: false,
          error: 'User not found. Please sign up first.',
          userId: ownid
        });
      }
    }

    // ✅ Get User Balance & Info
    if (path === 'getBalance') {
      const userInfo = await getUserInfo(ownid);
      return res.json(userInfo);
    }

    // ✅ Get Countries List
    if (path === 'getCountries') {
      return res.json({
        success: true,
        userId: ownid,
        countries: countries
      });
    }

    // ✅ Get Number (with balance check) - MAIN FUNCTION
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

      // ✅ Pehle balance check karo
      const balanceCheck = await checkUserBalance(ownid);
      
      if (balanceCheck < countryConfig.price) {
        return res.json({
          success: false,
          error: 'Insufficient balance',
          userId: ownid,
          currentBalance: balanceCheck,
          required: countryConfig.price,
          message: `You need ₹${countryConfig.price - balanceCheck} more to get ${countryConfig.name}`
        });
      }

      try {
        // ✅ Number get karo from FireXOTP
        const url = `https://firexotp.com/stubs/handler_api.php?action=getNumber&api_key=${API_KEY}&service=wa&country=${countryConfig.code}`;
        console.log('FireXOTP Request:', url);
        
        const response = await axios.get(url, { timeout: 30000 });
        const data = response.data;

        console.log('FireXOTP Response:', data);

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
          const numberRef = db.ref(`userNumbers/${ownid}`).push();
          const numberRecord = {
            numberId: numberId,
            number: phoneNumber,
            country: countryKey,
            countryName: countryConfig.country,
            service: countryConfig.name,
            price: countryConfig.price,
            timestamp: new Date().toISOString(),
            status: 'active',
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
          };
          
          await numberRef.set(numberRecord);

          // ✅ Active transaction save karo
          await db.ref(`activeTransactions/${ownid}`).set({
            ...numberRecord,
            userId: ownid
          });

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
        console.error('FireXOTP API Error:', error.message);
        
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

    // ✅ Get OTP
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
        console.log('FireXOTP OTP Check:', url);
        
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        console.log('FireXOTP OTP Response:', data);

        if (data.includes('STATUS_OK')) {
          let otpCode = null;
          let status = 'waiting';
          
          if (data.includes('STATUS_OK:CODE:')) {
            otpCode = data.split(':')[2];
            status = 'received';
            
            // ✅ Number record update karo
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

            // ✅ Active transaction remove karo
            await db.ref(`activeTransactions/${ownid}`).remove();

            // ✅ OTP transaction record banao
            const transactionRef = db.ref(`transactions/${ownid}`).push();
            await transactionRef.set({
              type: 'otp_received',
              numberId: id,
              otp: otpCode,
              timestamp: new Date().toISOString(),
              status: 'completed'
            });
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
        } else {
          return res.json({
            success: false,
            error: 'OTP check failed: ' + data,
            userId: ownid,
            data: data
          });
        }
      } catch (error) {
        console.error('OTP check error:', error.message);
        return res.json({
          success: false,
          error: 'Failed to check OTP: ' + error.message,
          userId: ownid
        });
      }
    }

    // ✅ Cancel Number
    if (path === 'cancelNumber') {
      if (!id) {
        return res.json({ 
          success: false, 
          error: 'Number ID required',
          userId: ownid 
        });
      }

      try {
        // ✅ FireXOTP par cancel karo
        const url = `https://firexotp.com/stubs/handler_api.php?action=setStatus&api_key=${API_KEY}&id=${id}&status=8`;
        console.log('FireXOTP Cancel:', url);
        
        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        console.log('FireXOTP Cancel Response:', data);

        // ✅ Number record find karo
        const numbersRef = db.ref(`userNumbers/${ownid}`);
        const snapshot = await numbersRef.orderByChild('numberId').equalTo(id).once('value');
        
        let refundAmount = 0;
        
        if (snapshot.exists()) {
          snapshot.forEach((childSnapshot) => {
            const numberData = childSnapshot.val();
            refundAmount = numberData.price || 0;
          });

          // ✅ Status update karo
          const updates = {};
          snapshot.forEach((childSnapshot) => {
            updates[`${childSnapshot.key}/status`] = 'cancelled';
            updates[`${childSnapshot.key}/cancelledAt`] = new Date().toISOString();
          });
          await numbersRef.update(updates);
        }

        // ✅ Active transaction remove karo
        await db.ref(`activeTransactions/${ownid}`).remove();

        // ✅ Refund process karo
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

        return res.json({
          success: true,
          userId: ownid,
          data: data,
          refunded: false,
          message: 'Number cancelled successfully'
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

    // ✅ Get User Transactions
    if (path === 'getTransactions') {
      try {
        const transactionsRef = db.ref(`transactions/${ownid}`).orderByChild('timestamp').limitToLast(50);
        const snapshot = await transactionsRef.once('value');
        const transactions = snapshot.val() || {};
        
        const transactionArray = Object.entries(transactions).map(([key, value]) => ({
          id: key,
          ...value
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return res.json({
          success: true,
          userId: ownid,
          transactions: transactionArray,
          total: transactionArray.length
        });
      } catch (error) {
        console.error('Get transactions error:', error);
        return res.json({
          success: false,
          error: 'Failed to get transactions',
          userId: ownid
        });
      }
    }

    // ✅ Get Active Numbers
    if (path === 'getActiveNumbers') {
      try {
        const activeRef = db.ref(`activeTransactions/${ownid}`);
        const snapshot = await activeRef.once('value');
        const activeNumbers = snapshot.val() || {};
        
        return res.json({
          success: true,
          userId: ownid,
          activeNumbers: activeNumbers,
          hasActive: !!snapshot.exists()
        });
      } catch (error) {
        console.error('Get active numbers error:', error);
        return res.json({
          success: false,
          error: 'Failed to get active numbers',
          userId: ownid
        });
      }
    }

    // ✅ Invalid path
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
        'getTransactions',
        'getActiveNumbers',
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
