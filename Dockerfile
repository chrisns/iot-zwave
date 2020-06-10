FROM robertslando/zwave2mqtt:dev@sha256:217507f3d2739e357e8d97cd10b04297b720febba6eeb7efbf74dd6aefa60ba4

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
