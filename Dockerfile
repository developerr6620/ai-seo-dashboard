FROM node:20-alpine
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=11005
ENV DATABASE_URL=file:/app/data/prod.sqlite

EXPOSE 11005

# Persist SQLite outside the image layers
RUN mkdir -p /app/data

COPY package.json package-lock.json* ./

# Install dependencies including build tools needed for Prisma
RUN npm ci

COPY . .

# Build the client and SSR server bundles
RUN npm run build

# Generate Prisma client for Linux Alpine
RUN npx prisma generate

CMD ["npm", "run", "docker-start"]
