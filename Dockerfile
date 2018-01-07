FROM node:9-alpine

COPY . .

RUN apk add --no-cache --virtual .run-deps \
        python \
        openzwave \
        openzwave-dev \
  && apk --no-cache add --virtual .build-deps \
        python2-dev \
        libffi-dev \
        alpine-sdk \
  && npm i \
  && npm run lint \
#  && npm test \
  && npm prune --production \
  && apk --purge del .build-deps

ENV AWS_ACCESS_KEY=""
ENV AWS_SECRET_ACCESS_KEY=""
ENV AWS_IOT_ENDPOINT_HOST=""
ENV AWS_REGION=""
ENV ZWAVE_NETWORK_KEY=""
ENV DEVICE=/dev/ttyUSB1
ENV DEBUG=false

CMD while [ ! -c ${DEVICE} ]; do \
  sleep 1; \
  echo "waiting for ${DEVICE}"; \
  done; \
  npm start npm start