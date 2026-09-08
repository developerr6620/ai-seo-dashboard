FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/prod.sqlite

# Create directory for SQLite database
RUN mkdir -p /app/data

COPY package.json package-lock.json* ./

# Install dependencies including build tools
RUN npm ci

COPY . .

# Build the client and SSR server bundles
RUN npm run build

# Generate Prisma client for Linux Alpine
RUN npx prisma generate

CMD ["npm", "run", "docker-start"]
