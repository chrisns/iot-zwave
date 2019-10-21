FROM node:alpine as ozw-builder
RUN apk --no-cache add eudev-dev coreutils linux-headers alpine-sdk python openssl

COPY open-zwave /open-zwave
WORKDIR /open-zwave/cpp/build
RUN make
RUN make install

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm i --production

FROM node:alpine
RUN apk add --no-cache eudev-dev busybox-extras
COPY --from=ozw-builder /usr/local /usr/local
COPY --from=ozw-builder /app /app
WORKDIR /app
COPY index.js ./
#USER node


ENV AWS_ACCESS_KEY="" \
    AWS_SECRET_ACCESS_KEY="" \
    AWS_IOT_ENDPOINT_HOST="" \
    AWS_REGION="" \
    ZWAVE_NETWORK_KEY="" \
    BUCKET="" \
    BUCKET_KEY="" \
    DEVICE=/dev/ttyUSB1 \
    DEBUG=false \
    USER_DATA=/data

CMD \
  while [ ! -c ${DEVICE} ]; do \
    sleep 1; \
    echo "waiting for ${DEVICE}"; \
    done; \
  npm start
