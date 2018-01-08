# Z-Wave AWS-IOT Bridge/Gateway

[![Greenkeeper badge](https://badges.greenkeeper.io/chrisns/iot-zwave.svg)](https://greenkeeper.io/)

## To carry out system activities
Publish to `$aws/things/zwave/shadow/update` (or update the thing shadow)
```json
{
  "state": {
    "desired": {
      "X": "Y"
    }  
  }
}
```
Where `X` is one of:
- `secureAddNode`
- `healNetwork`
- `addNode`
- `cancelControllerCommand`
- `removeNode`
- `softReset`

And `Y` is anything different, you might like to use the timestamp of when you did it.
When this has been received and actioned you will be able to see the same thing published in the thing shadow or to `$aws/things/zwave/shadow/update`

```json
{
  "state": {
    "reported": {
      "X": "Y"
    }  
  }
}
```

## Usage
### Starting up
#### Docker
```bash
docker run \ 
    --device=/dev/ttyACM0 \
    -e DEVICE=/dev/ttyACM0 \
    -e AWS_ACCESS_KEY=XXX \
    -e AWS_SECRET_ACCESS_KEY=XX \
    -e AWS_IOT_ENDPOINT_HOST=XX \
    -e AWS_REGION=eu-west-2 \
    -e ZWAVE_NETWORK_KEY=XX \
    chrisns/iot-zwave
```

#### Node
```bash
git clone git@github.com:chrisns/iot-zwave
cd iot-zwave
npm i
DEVICE=/dev/ttyACM0 \
AWS_ACCESS_KEY=XXX \
AWS_SECRET_ACCESS_KEY=XX \
AWS_IOT_ENDPOINT_HOST=XX \
AWS_REGION=eu-west-2 \
ZWAVE_NETWORK_KEY=XX \
npm start
```

#### Z-wave Key
Use [the random.org generator](https://www.random.org/cgi-bin/randbyte?nbytes=16&format=h) to get a fresh set of 16 random hex numbers but don't forget to add the "0x" prefix and the commas.

It should look something like: `0x97,0x81,0x18,0x90,0xd3,0x57,0xac,0x93,0xa2,0x20,0x9c,0x91,0x6d,0x83,0x17,0xcb`

### General usage
This will make a thingshadow for each of your zwave devices.

The name is `zwave_x_n` where `x` is the homeid and `n` is the node id.

So for example I have a [Aeotec by Aeon Labs ZW120 Door / Window Sensor](https://www.amazon.co.uk/gp/product/B01GK5D1PE/ref=as_li_tl?ie=UTF8&camp=1634&creative=6738&creativeASIN=B01GK5D1PE&linkCode=as2&tag=chrisns-21&linkId=d1e5c073ed1c29cffa1fe8c3e25c5b09) that reports:

```json
{
  "reported": {
    "system": {
      "Powerlevel": "Normal",
      "Application Version": "1.05",
      "Test Status": "Failed",
      "Acked Frames": 0,
      "Timeout": 0,
      "ZWave+ Version": 1,
      "Frame Count": 0,
      "InstallerIcon": 3078,
      "Library Version": "3",
      "Maximum Wake-up Interval": 16777200,
      "Default Wake-up Interval": 0,
      "UserIcon": 3078,
      "Test Node": 0,
      "Test Powerlevel": "Normal",
      "Minimum Wake-up Interval": 0,
      "Wake-up Interval Step": 240,
      "Wake-up Interval": 0,
      "Protocol Version": "4.05"
    },
    "config": {
      "Interval time of battery report": 0,
      "Report type": 256,
      "Basic Set Report": "Open: 0xFF, Close: 0x00",
      "Sensor Binary Report": "Open: 0xFF, Close: 0x00",
      "Enable wake up 10 minutes when re-power on the sensor": "Enable",
      "Set the low battery value": 18,
      "Reset To Factory Defaults": "Normal"
    },
    "user": {
      "SourceNodeId": 0,
      "Sensor": true,
      "Alarm Type": 0,
      "Burglar": 254,
      "Battery Level": 74,
      "Access Control": 254,
      "Alarm Level": 0
    },
    "basic": {
      "Basic": 255
    }
  }
}
```
If you update the shadow in desired with the same path, this app will do it's best to make that reality and report it back when it's done. **Sleeping nodes can see that take quite a while.**

Because Amazon IOT inflicts a 8kb [limit](http://docs.amazonaws.cn/en_us/general/latest/gr/aws_service_limits.html#limits_iot) on the payload I can't put all the nice helpful content that openzwave provides like what are valid values, and help text to accompany these values, or even what is read only.

## Pre-requisites
- You will need to make a [Thing Type](http://docs.aws.amazon.com/iot/latest/developerguide/thing-types.html) with the name `zwave`. you don't need to add attributes but I added `manufacturerid`, `productid`, `producttype` to mine so I can filter by those things.

## TODO
These are features I'd like to provide, but feel free to chip in
- [x] read zwave config
- [x] write zwave config
- [x] read zwave basic status
- [x] write zwave basic status
- [x] create things on demand
- [x] handle soft resetting controller
- [x] handle adding insecure nodes
- [x] handle adding secure nodes
- [x] handle removing nodes
- [ ] handle multiple controllers, sharing configuration and handing over between them
- [ ] provide some way to set scenes up
- [ ] provide some way to set associations up
- [ ] provide some way to set buttons up
- [ ] provide some way to set polling up
- [x] Docker
- [ ] toggler of binary switches (useful for alerts)
- [ ] support over 50 zwave things (will need to have multiple connections to aws iot)
- [ ] Arm (for Raspberry PI support)
- [ ] Ubuntu Snap to install on ubuntu core
- [x] Support multiple z-wave networks - handy if you have multiple networks for:
    - Desire to support different frequency ranges maybe EU, US, JP to support different devices
    - Multiple physically distant locations
    - Desire for seperation of concerns for security - e.g. a network for lights and another for security devices
    - All AWS IoT things will be zwave_$homeid_$nodeid

## Contributions
Pull Requests welcome