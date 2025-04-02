const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const faker = require('faker');

// Configuration
const CONFIG = {
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3000',
  requestsPerMinute: parseInt(process.env.REQUESTS_PER_MINUTE || '30'),
  runForever: process.env.RUN_FOREVER === 'true' || true,
  durationMinutes: parseInt(process.env.DURATION_MINUTES || '30'),
  randomSeed: process.env.RANDOM_SEED || '12345'
};

// Set random seed for reproducibility
faker.seed(parseInt(CONFIG.randomSeed));

// Helper functions
const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Request generators
const generatePaymentRequest = () => {
  const amount = getRandomInt(100, 10000) / 100; // $1.00 to $100.00
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
  const currency = currencies[getRandomInt(0, currencies.length - 1)];
  
  return {
    amount,
    currency,
    customerId: `cust_${faker.datatype.uuid().substring(0, 8)}`,
    cardDetails: {
      number: faker.finance.creditCardNumber(),
      expiry: `${getRandomInt(1, 12)}/${getRandomInt(23, 30)}`,
      cvv: faker.finance.creditCardCVV()
    }
  };
};

const generateRefundRequest = (paymentId) => {
  return {
    paymentId,
    amount: getRandomInt(50, 10000) / 100,
    reason: faker.lorem.sentence()
  };
};

// API calls
const makePaymentRequest = async () => {
  const traceId = uuidv4();
  try {
    console.log(`[${new Date().toISOString()}] Making payment request...`);
    const response = await axios.post(
      `${CONFIG.paymentServiceUrl}/api/payments`, 
      generatePaymentRequest(),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-trace-id': traceId
        }
      }
    );
    console.log(`[${new Date().toISOString()}] Payment response: ${response.status} ${JSON.stringify(response.data)}`);
    return response.data.payment_id;
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Payment error: ${error.message}`);
    if (error.response) {
      console.log(`Response status: ${error.response.status}`);
      console.log(`Response data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
};

const getPaymentStatus = async (paymentId) => {
  const traceId = uuidv4();
  try {
    console.log(`[${new Date().toISOString()}] Checking payment status for ${paymentId}...`);
    const response = await axios.get(
      `${CONFIG.paymentServiceUrl}/api/payments/${paymentId}`,
      {
        headers: {
          'x-trace-id': traceId
        }
      }
    );
    console.log(`[${new Date().toISOString()}] Status response: ${response.status} ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Status check error: ${error.message}`);
  }
};

const makeRefundRequest = async (paymentId) => {
  const traceId = uuidv4();
  try {
    console.log(`[${new Date().toISOString()}] Making refund request for ${paymentId}...`);
    const response = await axios.post(
      `${CONFIG.paymentServiceUrl}/api/refunds`, 
      generateRefundRequest(paymentId),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-trace-id': traceId
        }
      }
    );
    console.log(`[${new Date().toISOString()}] Refund response: ${response.status} ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Refund error: ${error.message}`);
  }
};

const getHealthCheck = async () => {
  const traceId = uuidv4();
  try {
    console.log(`[${new Date().toISOString()}] Health check...`);
    const response = await axios.get(
      `${CONFIG.paymentServiceUrl}/health`,
      {
        headers: {
          'x-trace-id': traceId
        }
      }
    );
    console.log(`[${new Date().toISOString()}] Health check response: ${response.status} ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Health check error: ${error.message}`);
  }
};

const getServiceInfo = async () => {
  const traceId = uuidv4();
  try {
    console.log(`[${new Date().toISOString()}] Getting service info...`);
    const response = await axios.get(
      `${CONFIG.paymentServiceUrl}/`,
      {
        headers: {
          'x-trace-id': traceId
        }
      }
    );
    console.log(`[${new Date().toISOString()}] Service info response: ${response.status} ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Service info error: ${error.message}`);
  }
};

// Main load generator function
const runLoadGenerator = async () => {
  console.log(`Starting load generator with ${CONFIG.requestsPerMinute} requests per minute`);
  console.log(`Target service: ${CONFIG.paymentServiceUrl}`);
  
  let successfulPaymentIds = [];
  const startTime = Date.now();
  const endTime = startTime + (CONFIG.durationMinutes * 60 * 1000);
  
  // Check initial health
  await getServiceInfo();
  await getHealthCheck();
  
  // Keep track of the interval for cleanup
  let loadInterval;
  
  try {
    loadInterval = setInterval(async () => {
      if (!CONFIG.runForever && Date.now() > endTime) {
        console.log(`Load test completed after ${CONFIG.durationMinutes} minutes`);
        clearInterval(loadInterval);
        return;
      }
      
      const requestType = Math.random();
      
      if (requestType < 0.6) {
        // 60% chance: make a new payment
        const paymentId = await makePaymentRequest();
        if (paymentId) {
          successfulPaymentIds.push(paymentId);
          // Keep only the most recent 100 payment IDs
          if (successfulPaymentIds.length > 100) {
            successfulPaymentIds.shift();
          }
        }
      } else if (requestType < 0.8) {
        // 20% chance: check status of a random payment
        if (successfulPaymentIds.length > 0) {
          const randomIndex = getRandomInt(0, successfulPaymentIds.length - 1);
          await getPaymentStatus(successfulPaymentIds[randomIndex]);
        } else {
          // If no successful payments yet, just make a payment
          await makePaymentRequest();
        }
      } else if (requestType < 0.95) {
        // 15% chance: make a refund for a random payment
        if (successfulPaymentIds.length > 0) {
          const randomIndex = getRandomInt(0, successfulPaymentIds.length - 1);
          await makeRefundRequest(successfulPaymentIds[randomIndex]);
          // Optionally remove the refunded payment ID
          if (Math.random() > 0.5) {
            successfulPaymentIds.splice(randomIndex, 1);
          }
        } else {
          // If no successful payments yet, just make a payment
          await makePaymentRequest();
        }
      } else {
        // 5% chance: health check
        await getHealthCheck();
      }
      
    }, (60 * 1000) / CONFIG.requestsPerMinute);
    
    // Periodic health checks
    setInterval(async () => {
      await getHealthCheck();
    }, 60 * 1000); // Every minute
    
  } catch (error) {
    console.error('Error in load generator:', error);
    if (loadInterval) {
      clearInterval(loadInterval);
    }
  }
};

// Start the load generator
runLoadGenerator().catch(err => {
  console.error('Fatal error in load generator:', err);
  process.exit(1);
});