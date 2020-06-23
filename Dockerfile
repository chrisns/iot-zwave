FROM robertslando/zwave2mqtt:dev@sha256:c0bfb7426692432100aa9f09e24ec908ba59d3e7632e0ced669577b1ba7b6dd9

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
