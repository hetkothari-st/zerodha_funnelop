FROM node:20-alpine AS build
ARG VITE_WS_HUB_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_WS_HUB_URL=$VITE_WS_HUB_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./
RUN npm ci --omit=dev
EXPOSE 8080
CMD ["node", "server/index.js"]
