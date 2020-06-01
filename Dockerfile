FROM robertslando/zwave2mqtt:dev@sha256:bfbd07af30c5f8fe7d7b9a2baf21c6de3fa1c5b4f5f7bc8cdc0b38bff205008e as ozw-builder

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
