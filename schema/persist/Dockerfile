ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY schema/amflow/common/package.json schema/amflow/common/package.json
COPY schema/amflow/client/package.json schema/amflow/client/package.json
COPY schema/amflow/server/package.json schema/amflow/server/package.json
COPY schema/runner-ipc/package.json schema/runner-ipc/package.json
COPY schema/http/package.json schema/http/package.json
COPY schema/persist/package.json schema/persist/package.json
COPY playlogClient-like/package.json playlogClient-like/package.json
COPY agvw-like/package.json agvw-like/package.json
COPY akashic-server/package.json akashic-server/package.json
COPY akashic-runner/package.json akashic-runner/package.json
COPY akashic-storage/package.json akashic-storage/package.json
COPY webapp/package.json webapp/package.json
COPY manager-server/package.json manager-server/package.json
RUN npm ci -w @multi-indiegame/persist-schema

COPY . .
RUN npm run build -w @multi-indiegame/persist-schema

FROM node:${NODE_VERSION}-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --parents \
  /app/schema/persist/package.json \
  /app/schema/persist/prisma.config.ts \
  /app/schema/persist/dist \
  /app/schema/persist/prisma \
  /
COPY --from=build --parents /app/package.json /app/node_modules /
COPY *.pem ./
RUN chown -R node:node .
USER node
CMD ["npm", "run", "migrate", "-w", "@multi-indiegame/persist-schema"]
