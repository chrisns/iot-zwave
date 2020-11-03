const AWS = require('aws-sdk')
const Queue = require('promise-queue')
const util = require('util')
const awsIot = require('aws-iot-device-sdk')
const net = require('net')
const logger = require('/usr/src/app/lib/debug')('iot')

logger.color = 4

const _ = {
  set: require('lodash.set'),
  mapValues: require('lodash.mapvalues'),
  pickBy: require('lodash.pickby'),
  get: require('lodash.get')
}

const { AWS_IOT_ENDPOINT_HOST, DEBUG, BUCKET, BUCKET_KEY } = process.env

const queue = new Queue(1, Infinity)
const s3queue = new Queue(1, Infinity)

let things = {}
let home_id
var zwave

const s3 = new AWS.S3({
  params: {
    Bucket: BUCKET,
    Key: BUCKET_KEY
  }
})

const persist_things = () =>
  s3.putObject({
    Body: JSON.stringify((things))
  }).promise()

const iotdata = new AWS.IotData({
  endpoint: AWS_IOT_ENDPOINT_HOST,
  debug: DEBUG
})

var awsMqttClient = awsIot.device({
  host: AWS_IOT_ENDPOINT_HOST,
  protocol: 'wss'
})

awsMqttClient.async_publish = util.promisify(awsMqttClient.publish)
awsMqttClient.async_subscribe = util.promisify(awsMqttClient.subscribe)
awsMqttClient.async_unsubscribe = util.promisify(awsMqttClient.unsubscribe)

const value_update = (nodeid, comclass, value) =>
  update_thing(
    value.node_id,
    _.set({}, `${value.genre}.${value.label}${value.instance > 1 ? '-' + (value.instance - 1) : ''}`, value.value || 0))

const update_thing = async (thing_id, update) => {
  const payload = { state: { reported: update } }
  await queue.add(async () => {
    try {
      await iotdata.updateThingShadow({
        thingName: `zwave_${home_id}_${thing_id}`,
        payload: JSON.stringify(payload)
      }).promise()
    } catch (error) {
      awsMqttClient.async_publish('thingManager/upsert', JSON.stringify({
        thingName: `zwave_${home_id}_${thing_id}`,
        thingTypeName: 'zwave'
      }), { qos: 1 })
      await iotdata.updateThingShadow({
        thingName: `zwave_${home_id}_${thing_id}`,
        payload: JSON.stringify(payload)
      }).promise()
      await subscribe_to_thing(`zwave_${home_id}_${thing_id}`)
    }
  })
}

const setValue = async (thing_id, genre, label, value, again = false) =>
  zwave.setValue(...things[thing_id][genre][label].split('-'), value)

const zwave_on_value_added = (nodeid, comclass, value) => {
  _.set(things, `zwave_${home_id}_${nodeid}.${value.genre}.${value.label}${value.instance > 1 ? '-' + (value.instance - 1) : ''}`, value.value_id)
  s3queue.add(() => persist_things())
}

const thingShadows_on_delta_thing = (thingName, stateObject) => {
  if (thingName === `zwave_${home_id}`) return
  Object.entries(stateObject.state.desired).forEach(([genre, values]) =>
    Object.entries(values).forEach(([label, value]) =>
      silent_try(() => setValue(thingName, genre, label, value)) // @TODO silent catching is really not the answer
    )
  )
}

const silent_try = func => {
  try {
    func()
  } catch (error) {
    console.error(error)
  }
}

const zwave_on_node_removed = async nodeid => {
  await unsubscribe_to_thing(`zwave_${home_id}_${nodeid}`)
  return awsMqttClient.async_publish('thingManager/delete', JSON.stringify({ thingName: `zwave_${home_id}_${nodeid}` }), { qos: 1 })
}

const zwave_on_node_available = async (nodeid, nodeinfo) => {
  const params = {
    thingName: `zwave_${home_id}_${nodeid}`,
    thingTypeName: 'zwave',
    attributePayload: {
      attributes: _.mapValues(_.pickBy(nodeinfo, info => info.length >= 1 && info.length <= 800), v => v.replace(new RegExp('[ |\(|\)|=\&]', 'g'), '_'))
    }
  }
  logger('node available', params)
  awsMqttClient.async_publish('thingManager/upsert', JSON.stringify(params), { qos: 1 })
  await subscribe_to_thing(params.thingName)
}

var subscriptions = []

const subscribe_to_thing = async (thingName, topic = `$aws/things/${thingName}/shadow/update/accepted`) => {
  if (subscriptions.includes(topic)) return
  subscriptions.push(topic)
  logger('subscribing to topic', topic)
  try {
    await awsMqttClient.async_subscribe(topic, { qos: 1 })
  } catch (error) {
    logger(error)
  }
}

const unsubscribe_to_thing = async (thingName, topic = `$aws/things/${thingName}/shadow/update/accepted`) => {
  if (!subscriptions.includes(topic)) return
  subscriptions = subscriptions.filter(t => t !== topic)
  logger('unsubscribing to topic', topic)
  try {
    await awsMqttClient.async_unsubscribe(topic)
  } catch (error) {
    logger(error)
  }
}

const zwave_on_driver_ready = async homeid => {
  home_id = homeid.toString(16)
  const params = {
    thingName: `zwave_${home_id}`
  }
  awsMqttClient.async_publish('thingManager/upsert', JSON.stringify(params), { qos: 1 })
}

s3.getObject().promise()
  .then(response => response.Body)
  .then(JSON.parse)
  .catch((error) => {
    logger(error)
    return {}
  })
  .then(persisted_things => {
    things = persisted_things
    logger('restored these things', things)
  })

awsMqttClient.on('message', (topic, message) => {
  const payload = JSON.parse(message.toString())
  if (!payload.state || !payload.state.desired) return
  const thing_name = topic.split('/')[2]
  logger('RECEIVED', message.toString())
  thingShadows_on_delta_thing(thing_name, payload)
  iotdata.updateThingShadow({ // @TODO well this is an awfully gross hack isn't it
    thingName: thing_name,
    payload: JSON.stringify({ state: { desired: null } })
  }).promise()
})

awsMqttClient.on('connect', () => subscriptions.forEach(subscription => awsMqttClient.subscribe(subscription)))
awsMqttClient.on('connect', () => logger('aws connected'))

// balance the last will by publishing the current ready status
awsMqttClient.on('connect', () => awsMqttClient.async_publish(`$aws/things/zwave_${home_id}/shadow/update`, JSON.stringify({ state: { reported: { ready: home_id !== undefined } } })))

awsMqttClient.on('error', (error) => logger('aws', error))
awsMqttClient.on('close', () => logger('aws connection close'))
awsMqttClient.on('offline', () => logger('aws offline'))

net.createServer(socket => {
  socket.write('Welcome to the z-wave cli!\n')
  socket.on('data', data => {
    try {
      socket.write(JSON.stringify(eval(`zwave.${data.toString()}`)) + '\n' || 'ok\n')
    } catch (error) {
      console.log(error)
      socket.write(`ERR\n ${JSON.stringify(error)}`)
    }
  })
}).listen(8888)

module.exports = zw => {
  zwave = zw.client
  zwave.on('value added', zwave_on_value_added)

  zwave.on('scan complete', () => awsMqttClient.async_publish(`$aws/things/zwave_${home_id}/shadow/update`, JSON.stringify({ state: { reported: { ready: true } } })))

  zwave.on('driver ready', zwave_on_driver_ready)

  zwave.on('driver ready', () => awsIot.device({
    host: AWS_IOT_ENDPOINT_HOST,
    protocol: 'wss',
    will: {
      topic: `aws/things/zwave_${home_id}/shadow/update`,
      payload: JSON.stringify({ state: { reported: { ready: false } } })
    }
  })) // setup a last will to mark the device not ready when the whole process isn't running

  zwave.on('node ready', zwave_on_node_available)
  zwave.on('node available', zwave_on_node_available)
  zwave.on('node removed', zwave_on_node_removed)

  zwave.on('value added', value_update)
  zwave.on('value changed', value_update)
}
