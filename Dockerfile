FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY etiquetahub.js ./
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["node", "--no-warnings", "etiquetahub.js"]
