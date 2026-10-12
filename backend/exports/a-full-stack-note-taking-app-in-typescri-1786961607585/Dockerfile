# Stage 1: Build the Express server
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve the React frontend
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/frontend/build/* ./

# Stage 3: Serve the Express backend
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --only=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]