FROM node:18 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./
COPY package.json package-lock.json ./
EXPOSE 3000
CMD ["node", "index.js"]