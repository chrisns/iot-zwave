FROM node:alpine as ozw-builder
RUN apk --no-cache add eudev-dev coreutils
RUN apk --no-cache add linux-headers alpine-sdk python openssl libmicrohttpd-dev

RUN wget https://github.com/OpenZWave/open-zwave/archive/master.zip
RUN unzip master.zip
RUN rm master.zip
WORKDIR /open-zwave-master/cpp/build
RUN make
RUN make install

WORKDIR /app
COPY package.json ./
RUN npm i
RUN npm audit fix
RUN npm prune --production
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
