FROM node:alpine as ozw-builder
RUN apk --no-cache add eudev-dev coreutils
RUN apk --no-cache add linux-headers alpine-sdk python openssl libmicrohttpd-dev

COPY open-zwave /open-zwave
WORKDIR /open-zwave/cpp/build
RUN make
RUN make install

WORKDIR /app
COPY package.json ./
RUN npm i --production
RUN npm audit fix
COPY index.js ./

FROM node:alpine
RUN apk add --no-cache eudev-dev busybox-extras
COPY --from=ozw-builder /usr/local /usr/local
COPY --from=ozw-builder /app /app
WORKDIR /app
#USER node


ENV AWS_ACCESS_KEY=""
ENV AWS_SECRET_ACCESS_KEY=""
ENV AWS_IOT_ENDPOINT_HOST=""
ENV AWS_REGION=""
ENV ZWAVE_NETWORK_KEY=""
ENV BUCKET=""
ENV BUCKET_KEY=""
ENV DEVICE=/dev/ttyUSB1
ENV DEBUG=false
ENV USER_DATA=/data

CMD \
  while [ ! -c ${DEVICE} ]; do \
    sleep 1; \
    echo "waiting for ${DEVICE}"; \
    done; \
  npm start
