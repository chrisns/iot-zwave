FROM robertslando/zwave2mqtt:dev@sha256:56cb2edd0aa01548190537811a09be8278381024b52e4cce84fd49e3adcf733d as ozw-builder

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
