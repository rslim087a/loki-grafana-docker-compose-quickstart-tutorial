const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pino = require('pino');
const bodyParser = require('body-parser');
const faker = require('faker');
const path = require('path');
const fs = require('fs');

// Environment variables
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'payment-processor';

// Configure Pino logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: SERVICE_NAME,
    env: process.env.NODE_ENV || 'development'
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});


const logger = connectLogger();

const app = express();

// Middleware
app.use(bodyParser.json());

// Add request ID middleware
app.use((req, res, next) => {
  // Generate trace ID for the entire transaction
  const traceId = req.headers['x-trace-id'] || uuidv4();
  
  // Generate unique transaction ID for this specific request
  const transactionId = uuidv4();
  
  // Attach IDs to the request object
  req.traceId = traceId;
  req.transactionId = transactionId;
  
  // Add to response headers
  res.setHeader('x-trace-id', traceId);
  res.setHeader('x-transaction-id', transactionId);
  
  // Log the incoming request with structured metadata for Loki
  logger.info({
    trace_id: traceId,
    transaction_id: transactionId,
    message: 'Incoming request',
    method: req.method,
    path: req.path,
    query: req.query,
    client_ip: req.ip,
    user_agent: req.get('User-Agent'),
    endpoint: `${req.method} ${req.path}`,
    event_type: 'request'
  });
  
  next();
});

// Response time logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Override end method to calculate response time
  const originalEnd = res.end;
  res.end = function() {
    const responseTime = Date.now() - start;
    res.responseTime = responseTime;
    
    // Log response details with structured metadata for Loki
    const logData = {
      trace_id: req.traceId,
      transaction_id: req.transactionId,
      message: 'Request completed',
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      response_time: responseTime,
      endpoint: `${req.method} ${req.path}`,
      event_type: 'response'
    };
    
    // Add error information if status code indicates an error
    if (res.statusCode >= 400) {
      logData.level = 'error';
      logData.error = res.statusMessage || 'Request failed';
    } else {
      logData.level = 'info';
    }
    
    logger.info(logData);
    
    // Call the original end method
    return originalEnd.apply(this, arguments);
  };
  
  next();
});

// Endpoint to simulate a payment transaction
app.post('/api/payments', (req, res) => {
  const { amount, currency, customerId, cardDetails } = req.body;
  
  // Validate required fields
  if (!amount || !currency || !customerId) {
    logger.error({
      trace_id: req.traceId,
      transaction_id: req.transactionId,
      message: 'Payment validation failed',
      method: req.method,
      path: req.path,
      status_code: 400,
      error: 'Missing required fields',
      validation_errors: {
        amount: !amount ? 'Amount is required' : null,
        currency: !currency ? 'Currency is required' : null,
        customerId: !customerId ? 'Customer ID is required' : null
      },
      event_type: 'payment_validation_error'
    });
    
    return res.status(400).json({
      success: false,
      error: 'Missing required fields for payment'
    });
  }
  
  // Generate a payment ID
  const paymentId = `pmt_${faker.finance.account(10)}`;
  
  // Simulate processing delay (between 50ms and 2000ms)
  const processingTime = Math.floor(Math.random() * 1950) + 50;
  
  // Simulate success/failure based on various conditions
  const simulateFailure = Math.random() < 0.2; // 20% chance of failure
  const simulateTimeout = Math.random() < 0.05; // 5% chance of timeout
  const simulateValidationError = Math.random() < 0.1; // 10% chance of validation error
  
  // Log the payment attempt with additional structured metadata for Loki
  logger.info({
    trace_id: req.traceId,
    transaction_id: req.transactionId,
    message: 'Processing payment',
    method: req.method,
    path: req.path,
    payment_id: paymentId,
    transaction_type: 'payment',
    amount: amount,
    currency: currency,
    customer_id: customerId,
    estimated_processing_time: processingTime,
    event_type: 'payment_processing'
  });
  
  // Simulate processing
  setTimeout(() => {
    // Simulate different outcomes
    if (simulateTimeout) {
      // Simulate gateway timeout
      logger.error({
        trace_id: req.traceId,
        transaction_id: req.transactionId,
        message: 'Payment gateway timeout',
        method: req.method,
        path: req.path,
        payment_id: paymentId,
        transaction_type: 'payment',
        status_code: 504,
        error: 'Payment gateway timeout',
        processing_time: processingTime,
        event_type: 'payment_timeout'
      });
      
      return res.status(504).json({
        success: false,
        payment_id: paymentId,
        error: 'Payment gateway timeout'
      });
    } else if (simulateValidationError) {
      // Simulate validation error
      const errorReason = Math.random() < 0.5 ? 'Invalid card details' : 'Insufficient funds';
      
      logger.error({
        trace_id: req.traceId,
        transaction_id: req.transactionId,
        message: `Payment validation error: ${errorReason}`,
        method: req.method,
        path: req.path,
        payment_id: paymentId,
        transaction_type: 'payment',
        status_code: 400,
        error: errorReason,
        processing_time: processingTime,
        event_type: 'payment_validation_error'
      });
      
      return res.status(400).json({
        success: false,
        payment_id: paymentId,
        error: errorReason
      });
    } else if (simulateFailure) {
      // Simulate payment failure
      logger.error({
        trace_id: req.traceId,
        transaction_id: req.transactionId,
        message: 'Payment processing failed',
        method: req.method,
        path: req.path,
        payment_id: paymentId,
        transaction_type: 'payment',
        status_code: 500,
        error: 'Payment processor error',
        processing_time: processingTime,
        event_type: 'payment_failure'
      });
      
      return res.status(500).json({
        success: false,
        payment_id: paymentId,
        error: 'Payment processor error'
      });
    } else {
      // Simulate payment success
      logger.info({
        trace_id: req.traceId,
        transaction_id: req.transactionId,
        message: 'Payment processed successfully',
        method: req.method,
        path: req.path,
        payment_id: paymentId,
        transaction_type: 'payment',
        status_code: 200,
        amount: amount,
        currency: currency,
        customer_id: customerId,
        processing_time: processingTime,
        event_type: 'payment_success'
      });
      
      return res.status(200).json({
        success: true,
        payment_id: paymentId,
        amount: amount,
        currency: currency,
        status: 'completed',
        timestamp: new Date().toISOString()
      });
    }
  }, processingTime);
});

// Endpoint to get payment status
app.get('/api/payments/:paymentId', (req, res) => {
  const { paymentId } = req.params;
  
  // Log the request with structured data for Loki
  logger.info({
    trace_id: req.traceId,
    transaction_id: req.transactionId,
    message: 'Payment status lookup',
    method: req.method,
    path: req.path,
    payment_id: paymentId,
    transaction_type: 'payment_lookup',
    event_type: 'status_check'
  });
  
  // Simulate random status
  const statuses = ['completed', 'pending', 'failed', 'refunded'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  
  // Simulate processing delay (between 10ms and 300ms)
  const processingTime = Math.floor(Math.random() * 290) + 10;
  
  setTimeout(() => {
    // Log the response
    logger.info({
      trace_id: req.traceId,
      transaction_id: req.transactionId,
      message: `Payment status: ${randomStatus}`,
      method: req.method,
      path: req.path,
      payment_id: paymentId,
      transaction_type: 'payment_lookup',
      status: randomStatus,
      processing_time: processingTime,
      event_type: 'status_result'
    });
    
    res.json({
      payment_id: paymentId,
      status: randomStatus,
      timestamp: new Date().toISOString()
    });
  }, processingTime);
});

// Refund endpoint
app.post('/api/refunds', (req, res) => {
  const { paymentId, amount, reason } = req.body;
  
  // Validate required fields
  if (!paymentId || !amount) {
    logger.error({
      trace_id: req.traceId,
      transaction_id: req.transactionId,
      message: 'Refund validation failed',
      method: req.method,
      path: req.path,
      status_code: 400,
      error: 'Missing required fields',
      validation_errors: {
        paymentId: !paymentId ? 'Payment ID is required' : null,
        amount: !amount ? 'Amount is required' : null
      },
      event_type: 'refund_validation_error'
    });
    
    return res.status(400).json({
      success: false,
      error: 'Missing required fields for refund'
    });
  }
  
  // Generate a refund ID
  const refundId = `ref_${faker.finance.account(10)}`;
  
  // Simulate processing delay
  const processingTime = Math.floor(Math.random() * 1500) + 100;
  
  // Log the refund request
  logger.info({
    trace_id: req.traceId,
    transaction_id: req.transactionId,
    message: 'Processing refund',
    method: req.method,
    path: req.path,
    refund_id: refundId,
    payment_id: paymentId,
    transaction_type: 'refund',
    amount: amount,
    reason: reason || 'Not specified',
    event_type: 'refund_processing'
  });
  
  // Simulate success/failure
  const simulateFailure = Math.random() < 0.15; // 15% chance of failure
  
  setTimeout(() => {
    if (simulateFailure) {
      // Simulate refund failure
      logger.error({
        trace_id: req.traceId,
        transaction_id: req.transactionId,
        message: 'Refund processing failed',
        method: req.method,
        path: req.path,
        refund_id: refundId,
        payment_id: paymentId,
        transaction_type: 'refund',
        status_code: 500,
        error: 'Refund processor error',
        processing_time: processingTime,
        event_type: 'refund_failure'
      });
      
      return res.status(500).json({
        success: false,
        refund_id: refundId,
        payment_id: paymentId,
        error: 'Refund processor error'
      });
    } else {
      // Simulate refund success
      logger.info({
        trace_id: req.traceId,
        transaction_id: req.transactionId,
        message: 'Refund processed successfully',
        method: req.method,
        path: req.path,
        refund_id: refundId,
        payment_id: paymentId,
        transaction_type: 'refund',
        status_code: 200,
        amount: amount,
        processing_time: processingTime,
        event_type: 'refund_success'
      });
      
      return res.status(200).json({
        success: true,
        refund_id: refundId,
        payment_id: paymentId,
        amount: amount,
        status: 'completed',
        timestamp: new Date().toISOString()
      });
    }
  }, processingTime);
});

// Health check endpoint
app.get('/health', (req, res) => {
  // Log health check
  logger.info({
    trace_id: req.traceId,
    transaction_id: req.transactionId,
    message: 'Health check',
    method: req.method,
    path: req.path,
    transaction_type: 'health_check',
    event_type: 'system'
  });
  
  res.status(200).json({ status: 'ok', service: SERVICE_NAME });
});

// Root endpoint with service info
app.get('/', (req, res) => {
  // Log info request
  logger.info({
    trace_id: req.traceId,
    transaction_id: req.transactionId,
    message: 'Service info request',
    method: req.method,
    path: req.path,
    transaction_type: 'info',
    event_type: 'system'
  });
  
  res.status(200).json({
    service: SERVICE_NAME,
    version: '1.0.0',
    endpoints: [
      { method: 'POST', path: '/api/payments', description: 'Process a payment' },
      { method: 'GET', path: '/api/payments/:paymentId', description: 'Get payment status' },
      { method: 'POST', path: '/api/refunds', description: 'Process a refund' },
      { method: 'GET', path: '/health', description: 'Health check' }
    ]
  });
});

// Start the server
app.listen(PORT, () => {
  logger.info({
    message: `${SERVICE_NAME} started on port ${PORT}`,
    port: PORT,
    service: SERVICE_NAME,
    env: process.env.NODE_ENV || 'development',
    event_type: 'startup'
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info({
    message: `${SERVICE_NAME} shutting down`,
    service: SERVICE_NAME,
    event_type: 'shutdown'
  });
  process.exit(0);
});
