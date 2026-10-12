# Stage 1: Build the Node.js application
FROM node:18 AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Create the production image
FROM node:18-alpine
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/dist .
COPY --from=builder /usr/src/app/package*.json ./
RUN npm install --only=production
EXPOSE 3000
CMD ["node", "index.js"]