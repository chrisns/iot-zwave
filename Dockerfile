FROM robertslando/zwave2mqtt:dev@sha256:86a8cfa184ed2e1f05af22e8b8ac4219de1aa1ab3ad36277aff34df72b0f3988
LABEL org.opencontainers.image.source https://github.com/chrisns/iot-zwave

WORKDIR /app
COPY . .
RUN npm i --production


ENV AWS_ACCESS_KEY="" \
    AWS_SECRET_ACCESS_KEY="" \
    AWS_IOT_ENDPOINT_HOST="" \
    AWS_REGION="" \
    BUCKET="" \
    BUCKET_KEY="" \
    DEBUG=false \
    DEVICE=/dev/ttyUSB1
WORKDIR /usr/src/app

CMD npm start
