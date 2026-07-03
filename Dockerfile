# Builder stage.
FROM node:lts-alpine AS builder

WORKDIR /discord-defender

# Install pnpm.
RUN npm install --global pnpm@11.9.0

# Copy the files required for dependency resolution.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies.
RUN pnpm install --frozen-lockfile

# Build the application.
COPY tsconfig.json ./
COPY source ./source
RUN pnpm run build

# Production dependencies stage.
FROM node:lts-alpine AS production-dependencies

WORKDIR /discord-defender

# Install pnpm.
RUN npm install --global pnpm@11.9.0

# Copy the files required for dependency resolution.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install production dependencies.
RUN pnpm install --prod --frozen-lockfile

# Final stage.
FROM node:lts-alpine

ENV NODE_ENV=production

# Copy the deployed application.
WORKDIR /discord-defender
COPY --from=production-dependencies --chown=node:node /discord-defender/node_modules ./node_modules
COPY --from=builder --chown=node:node /discord-defender/package.json ./package.json
COPY --from=builder --chown=node:node /discord-defender/distribution ./distribution

USER node

# Start the application.
CMD ["npm", "run-script", "start"]
