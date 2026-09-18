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
RUN npm ci -w @multi-indiegame/webapp

COPY . .
RUN npm run build -w @multi-indiegame/persist-schema \
  && npm run build -w @multi-indiegame/amflow-event-schema \
  && npm run build -w @multi-indiegame/amflow-client-event-schema \
  && npm run build -w @multi-indiegame/playlog-client \
  && npm run build -w @multi-indiegame/agvw \
  && npm run setup -w @multi-indiegame/webapp \
  && npm run build -w @multi-indiegame/webapp

FROM node:${NODE_VERSION}-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/webapp/.next/standalone .
COPY --from=build /app/webapp/public webapp/public
COPY --from=build /app/webapp/.next/static webapp/.next/static
COPY *.pem ./webapp
RUN chown -R node:node .
EXPOSE ${PORT}
USER node
CMD ["node", "webapp/server.js"]
