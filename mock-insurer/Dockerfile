FROM node:20-alpine
WORKDIR /app
COPY mock-insurer/package.json ./
RUN npm install --omit=dev
COPY mock-insurer/index.js ./
EXPOSE 4001
CMD ["node", "index.js"]
