FROM node:22-alpine
WORKDIR /app
COPY app ./app
COPY server ./server
ENV PORT=8787
EXPOSE 8787
VOLUME ["/app/server/data"]
CMD ["node", "server/server.js"]
