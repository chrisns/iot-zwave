FROM node:8-alpine as ozw-builder
RUN apk --no-cache add eudev-dev coreutils
RUN apk --no-cache add linux-headers alpine-sdk python openssl

RUN wget https://github.com/OpenZWave/open-zwave/archive/master.zip
RUN unzip master.zip
WORKDIR /open-zwave-master
RUN make
RUN make install

WORKDIR /app
COPY package-lock.json .
COPY package.json .
RUN npm i
RUN npm audit fix
COPY . .
RUN npm prune --production


FROM node:8-alpine
RUN apk add --no-cache eudev-dev
COPY --from=ozw-builder /usr/local /usr/local
COPY --from=ozw-builder /app /app
WORKDIR /app


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
