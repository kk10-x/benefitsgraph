FROM node:20-alpine
WORKDIR /app
COPY mock-provider/package.json ./
RUN npm install --omit=dev
COPY mock-provider/index.js ./
EXPOSE 4002
CMD ["node", "index.js"]
