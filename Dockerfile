FROM robertslando/zwave2mqtt:dev@sha256:22424dfbcfcce8af652ec6effdc2e29abd741469a342aafa599f698ba8c9fe3c
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
