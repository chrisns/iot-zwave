FROM node:12-alpine as ozw-builder
RUN apk --no-cache add eudev-dev coreutils linux-headers alpine-sdk python openssl

COPY open-zwave /open-zwave
WORKDIR /open-zwave/cpp/build
RUN make
RUN make install

WORKDIR /app
COPY . .
RUN npm i --production
WORKDIR /app/zwave2mqtt
RUN npm i
RUN npm run build
RUN npm prune --production


FROM node:alpine
RUN apk add --no-cache eudev-dev busybox-extras
COPY --from=ozw-builder /usr/local /usr/local
COPY --from=ozw-builder /app /app
WORKDIR /app/zwave2mqtt

ENV AWS_ACCESS_KEY="" \
    AWS_SECRET_ACCESS_KEY="" \
    AWS_IOT_ENDPOINT_HOST="" \
    AWS_REGION="" \
    BUCKET="" \
    BUCKET_KEY="" \
    DEBUG=false \
    DEVICE=/dev/ttyUSB1

CMD npm start
