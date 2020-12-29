FROM robertslando/zwave2mqtt:dev@sha256:f00ab059625fd2692fdc0f3e4a5ccb63e2855f003ebfa033db5bcac26336f68f
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
