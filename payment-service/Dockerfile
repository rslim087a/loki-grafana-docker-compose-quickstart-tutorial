FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# Install dependencies and add curl for debugging
RUN npm install && \
    apk add --no-cache curl

COPY . .

# Set environment variables with defaults
ENV PORT=3000
ENV SERVICE_NAME=payment-processor
ENV LOKI_URL=http://loki:3100/loki/api/v1/push
ENV NODE_ENV=production
ENV LOG_LEVEL=info

EXPOSE 3000

# Use a simple command that ensures logs go to stdout/stderr
CMD ["node", "app.js"]