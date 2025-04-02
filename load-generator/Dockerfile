FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies
RUN npm init -y && \
    npm install axios uuid faker@5.5.3

# Copy load generator script
COPY load-generator.js .

# Set environment variables with defaults
ENV PAYMENT_SERVICE_URL=http://payment-service:3000
ENV REQUESTS_PER_MINUTE=30
ENV RUN_FOREVER=true
ENV DURATION_MINUTES=30
ENV RANDOM_SEED=12345

# Run the load generator
CMD ["node", "load-generator.js"]