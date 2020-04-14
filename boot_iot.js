const AWS = require("aws-sdk")
const Queue = require("promise-queue")
const util = require("util")
const awsIot = require('aws-iot-device-sdk')
const net = require('net')
const logger = require('./foo/Zwave2Mqtt/lib/debug')('iot')

logger.color = 4

const _ = {
  set: require("lodash.set"),
  mapValues: require("lodash.mapvalues"),
  pickBy: require("lodash.pickby"),
  get: require("lodash.get")
}

const { AWS_IOT_ENDPOINT_HOST, DEBUG, DEVICE, BUCKET, BUCKET_KEY } = process.env

const queue = new Queue(1, Infinity)
const s3queue = new Queue(1, Infinity)

let things = {}
let home_id
var zwave
const iot = new AWS.Iot({
  debug: DEBUG
})

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

exports.value_update = (nodeid, comclass, value) =>
  exports.update_thing(
    value.node_id,
    _.set({}, `${value.genre}.${value.label}${value.instance > 1 ? "-" + (value.instance - 1) : ""}`, value.value || 0))

exports.update_thing = async (thing_id, update) => {
  let payload = { state: { reported: update } }
  await queue.add(async () => {
    try {
      await iotdata.updateThingShadow({
        thingName: `zwave_${home_id}_${thing_id}`,
        payload: JSON.stringify(payload)
      }).promise()
    }
    catch (error) {
      await iot.createThing({
        thingName: `zwave_${home_id}_${thing_id}`,
        thingTypeName: "zwave"
      }).promise()
      await iotdata.updateThingShadow({
        thingName: `zwave_${home_id}_${thing_id}`,
        payload: JSON.stringify(payload)
      }).promise()
      await subscribe_to_thing(`zwave_${home_id}_${thing_id}`)
    }
  })
}

exports.setValue = async (thing_id, genre, label, value, again = false) =>
  zwave.setValue(...things[thing_id][genre][label].split("-"), value)

exports.zwave_on_value_added = (nodeid, comclass, value) => {
  _.set(things, `zwave_${home_id}_${nodeid}.${value.genre}.${value.label}${value.instance > 1 ? "-" + (value.instance - 1) : ""}`, value.value_id)
  s3queue.add(() => persist_things())
}

exports.thingShadows_on_delta_thing = (thingName, stateObject) => {
  if (thingName === `zwave_${home_id}`) return
  Object.entries(stateObject.state.desired).forEach(([genre, values]) =>
    Object.entries(values).forEach(([label, value]) =>
      exports.silent_try(() => exports.setValue(thingName, genre, label, value)) //@TODO silent catching is really not the answer
    )
  )
}

exports.silent_try = func => {
  try {
    func()
  } catch (error) {
    console.error(error)
  }
}

exports.zwave_on_node_removed = nodeid =>
  iot.deleteThing({ thingName: `zwave_${home_id}_${nodeid}` })

exports.zwave_on_node_available = async (nodeid, nodeinfo) => {
  let params = {
    thingName: `zwave_${home_id}_${nodeid}`,
    thingTypeName: "zwave",
    attributePayload: {
      attributes: _.mapValues(_.pickBy(nodeinfo, info => info.length >= 1 && info.length <= 800), v => v.replace(new RegExp("[ |\(|\)|=]", "g"), "_"))
    }
  }
  logger("node available", params)
  try {
    await iot.updateThing(params).promise()
  } catch (error) {
    await iot.createThing(params).promise()
  }
  await subscribe_to_thing(params.thingName)
}

exports.zwave_get_associations = async nodeid => {
  let thingName = `zwave_${home_id}_${nodeid}`
  let associations = {}
  for (let groupid = 1; groupid <= zwave.getNumGroups(nodeid); groupid++) {
    associations[zwave.getGroupLabel(nodeid, groupid)] = zwave.getAssociationsInstances(nodeid, groupid)
  }
  return await awsMqttClient.async_publish(`$aws/things/${thingName}/shadow/update`, JSON.stringify({ state: { reported: { associations: associations } } }))
}

const subscriptions = []

const subscribe_to_thing = async (thingName, topic = `$aws/things/${thingName}/shadow/update/accepted`) => {
  if (subscriptions.includes(topic)) return
  subscriptions.push(topic)
  logger("subscribing to topic", topic)
  try {
    await awsMqttClient.async_subscribe(topic, { qos: 1 })
  }
  catch (error) {
    logger(error)
  }
}

exports.zwave_on_driver_ready = async homeid => {
  home_id = homeid.toString(16)
  let params = {
    thingName: `zwave_${home_id}`
  }
  try {
    await iot.updateThing(params).promise()
  }
  catch (error) {
    logger(`couldn't update ${params.thingName} trying to create it`)
    await iot.createThing(params).promise()
  }
  await awsMqttClient.async_publish(`$aws/things/${params.thingName}/shadow/update`, JSON.stringify({
    state: {
      desired: null,
      reported: {
        switchAllOn: 0,
        switchAllOff: 0,
      }
    }
  }))
  await subscribe_to_thing(params.thingName)
}

exports.thingShadow_on_delta_hub = (thingName, stateObject) => {
  if (thingName !== `zwave_${home_id}`) return

  const update = key => queue.add(() =>
    iotdata.updateThingShadow({
      thingName: thingName,
      payload: JSON.stringify({ state: { reported: { [key]: stateObject.state[key] } } })
    }).promise())

  if (stateObject.state.switchAllOn)
    update("switchAllOn").then(() => zwave.switchAllOn())

  if (stateObject.state.switchAllOff)
    update("switchAllOff").then(() => zwave.switchAllOff())
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
    logger("restored these things", things)
  })
  .then(() => zwave.connect(DEVICE))



awsMqttClient.on("message", (topic, message) => {
  let payload = JSON.parse(message.toString())
  if (!payload.state || !payload.state.desired) return
  let thing_name = topic.split("/")[2]
  logger("RECEIVED", message.toString())
  exports.thingShadow_on_delta_hub(thing_name, payload)
  exports.thingShadows_on_delta_thing(thing_name, payload)
  iotdata.updateThingShadow({ //@TODO well this is an awfully gross hack isn't it
    thingName: thing_name,
    payload: JSON.stringify({ state: { desired: null } })
  }).promise()
})

awsMqttClient.on("connect", () => subscriptions.forEach(subscription => awsMqttClient.subscribe(subscription)))
awsMqttClient.on("connect", () => logger("aws connected"))

// balance the last will by publishing the current ready status
awsMqttClient.on("connect", () => awsMqttClient.async_publish(`$aws/things/zwave_${home_id}/shadow/update`, JSON.stringify({ state: { reported: { ready: home_id !== undefined } } })))

awsMqttClient.on("error", (error) => logger("aws", error))
awsMqttClient.on("close", () => logger("aws connection close"))
awsMqttClient.on("offline", () => logger("aws offline"))

net.createServer(socket => {
  socket.write('Welcome to the z-wave cli!\n')
  socket.on('data', data => {
    try {
      socket.write(JSON.stringify(eval(`zwave.${data.toString()}`)) + "\n" || "ok\n")
    }
    catch (error) {
      console.log(error)
      socket.write(`ERR\n ${JSON.stringify(error)}`)
    }
  })
}).listen(8888)


module.exports = zw => {
  zwave = zw
  zwave.on("value added", exports.zwave_on_value_added)

  zwave.on("scan complete", () => awsMqttClient.async_publish(`$aws/things/zwave_${home_id}/shadow/update`, JSON.stringify({ state: { reported: { ready: true } } })))

  zwave.on("driver ready", exports.zwave_on_driver_ready)

  zwave.on("driver ready", () => awsIot.device({
    host: AWS_IOT_ENDPOINT_HOST,
    protocol: 'wss',
    will: {
      topic: `aws/things/zwave_${home_id}/shadow/update`,
      payload: JSON.stringify({ state: { reported: { ready: false } } })
    }
  })) // setup a last will to mark the device not ready when the whole process isn't running

  zwave.on("node naming", exports.zwave_on_node_available)
  zwave.on("node ready", exports.zwave_on_node_available)
  zwave.on("node available", exports.zwave_on_node_available)
  zwave.on("node available", exports.zwave_get_associations)
  zwave.on("node removed", exports.zwave_on_node_removed)

  zwave.on("value added", exports.value_update)
  zwave.on("value changed", exports.value_update)



}