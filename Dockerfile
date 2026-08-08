FROM node:24-alpine

WORKDIR /app/Backend

COPY Backend/package*.json ./
RUN npm ci --omit=dev

COPY Backend/src ./src
COPY banco /app/banco

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "npm run db:migrate && npm start"]
