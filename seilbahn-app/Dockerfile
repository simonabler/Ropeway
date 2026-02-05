FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
ENV NODE_ENV=production
ENV PORT=80
ENV HOST=0.0.0.0

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/seilbahn-app/browser /usr/share/nginx/html

EXPOSE 80
