/* eslint-disable no-undef, camelcase, no-unused-vars, no-return-assign */

const AWS = require("aws-sdk")
const Queue = require("promise-queue")
const ZWave = require("openzwave-shared")
const util = require("util")

const _ = {
  set: require("lodash.set"),
  mapValues: require("lodash.mapvalues"),
  pickBy: require("lodash.pickby"),
  get: require("lodash.get")
}
const {AWS_ACCESS_KEY, AWS_SECRET_ACCESS_KEY, AWS_IOT_ENDPOINT_HOST, AWS_REGION, ZWAVE_NETWORK_KEY, DEBUG, DEVICE} = process.env

const queue = new Queue(1, Infinity)

let things = {}

let home_id

const iot = new AWS.Iot({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  debug: DEBUG
})

const iotdata = new AWS.IotData({
  endpoint: AWS_IOT_ENDPOINT_HOST,
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  debug: DEBUG
})

const AWSMqtt = require("aws-mqtt-client").default

const awsMqttClient = new AWSMqtt({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  endpointAddress: AWS_IOT_ENDPOINT_HOST,
  region: AWS_REGION,
  logger: console
})

awsMqttClient.async_publish = util.promisify(awsMqttClient.publish)
awsMqttClient.async_subscribe = util.promisify(awsMqttClient.subscribe)

const zwave = new ZWave({
  Logging: DEBUG,
  ConsoleOutput: DEBUG,
  NetworkKey: ZWAVE_NETWORK_KEY
})

exports.zwave_driver_failed = () => {
  console.log("driver failed")
  zwave.disconnect()
  process.exit()
}

exports.value_update = (nodeid, comclass, value) =>
  exports.update_thing(
    value.node_id,
    _.set({}, `${value.genre}.${value.label}${value.instance > 1 ? "-" + (value.instance - 1) : ""}`, value.value || 0))

exports.update_thing = async (thing_id, update) => {
  let payload = {state: {reported: update}}
  let shadow = {payload: "{}"}
  try {
    shadow = await iotdata.getThingShadow({thingName: `zwave_${home_id}_${thing_id}`}).promise()
  }
  catch (error) {
    console.error("caught error", error)
  }
  Object.entries(update).forEach(([genre, paramset]) =>
    Object.entries(paramset).forEach(([param, value]) => {
        let path = `state.desired[${genre}][${param}]`
        let existing = _.get(JSON.parse(shadow.payload), path)
        if (existing && existing === value) {
          _.set(payload, path, null)
        }
      }
    )
  )
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

exports.setValue = (thing_id, genre, label, value) =>
  zwave.setValue(...things[thing_id][genre][label].split("-"), value)

exports.zwave_on_value_added = (nodeid, comclass, value) =>
  things = _.set(things, `zwave_${home_id}_${nodeid}.${value.genre}.${value.label}${value.instance > 1 ? "-" + (value.instance - 1) : ""}`, value.value_id)

exports.thingShadows_on_delta_thing = (thingName, stateObject) => {
  if (thingName === `zwave_${home_id}`) return
  Object.entries(stateObject.state).forEach(([genre, values]) =>
    Object.entries(values).forEach(([label, value]) =>
      exports.silent_try(() => exports.setValue(thingName, genre, label, value)) //@TODO silent catching is really not the answer
    )
  )
  iotdata.updateThingShadow({ //@TODO well this is an awfully gross hack isn't it
    thingName: thingName,
    payload: JSON.stringify({state: {desired: null}})
  }).promise()
}

exports.silent_try = func => {
  try {
    func()
  } catch (error) {
    console.error(error)
  }
}

exports.SIGINT = () => {
  console.log("disconnecting...")
  zwave.disconnect(DEVICE)
  process.exit()
}

exports.zwave_on_node_removed = nodeid =>
  iot.deleteThing({thingName: `zwave_${home_id}_${nodeid}`})

exports.zwave_on_node_available = async (nodeid, nodeinfo) => {
  let params = {
    thingName: `zwave_${home_id}_${nodeid}`,
    thingTypeName: "zwave",
    attributePayload: {
      attributes: _.mapValues(_.pickBy(nodeinfo, info => info.length >= 1 && info.length <= 800), v => v.replace(new RegExp("[ |\(|\)]", "g"), "_"))
    }
  }
  console.log("node available", params)
  try {
    await iot.updateThing(params).promise()
  } catch (error) {
    await iot.createThing(params).promise()
  }
  await subscribe_to_thing(params.thingName)
}

const subscriptions = []

const subscribe_to_thing = async (thingName, topic = `$aws/things/${thingName}/shadow/update/delta`) => {
  if (subscriptions.includes(topic)) return
  subscriptions.push(topic)
  console.log("subscribing to topic", topic)
  try {
    await awsMqttClient.async_subscribe(topic, {qos: 1})
    await awsMqttClient.async_publish(`$aws/things/${thingName}/shadow/update`, JSON.stringify({state: {desired: {ignore_me: null}}}))

  }
  catch (error) {
    console.error(error)
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
    console.error(`couldn't update ${params.thingName} trying to create it`)
    await iot.createThing(params).promise()
  }
  await awsMqttClient.async_publish(`$aws/things/${params.thingName}/shadow/update`, JSON.stringify({
    state: {
      desired: {secureAddNode: 0, healNetwork: 0, addNode: 0, cancelControllerCommand: 0, removeNode: 0, softReset: 0},
      reported: {secureAddNode: 0, healNetwork: 0, addNode: 0, cancelControllerCommand: 0, removeNode: 0, softReset: 0}
    }
  }))
  await subscribe_to_thing(params.thingName)
}

exports.thingShadow_on_delta_hub = (thingName, stateObject) => {
  if (thingName !== `zwave_${home_id}`) return

  const update = key => queue.add(() =>
    iotdata.updateThingShadow({
      thingName: thingName,
      payload: JSON.stringify({state: {reported: {[key]: stateObject.state[key]}}})
    }).promise())

  if (stateObject.state.secureAddNode) {
    zwave.addNode(true)
    update("secureAddNode")
  }
  if (stateObject.state.healNetwork) {
    zwave.healNetwork()
    update("healNetwork")
  }
  if (stateObject.state.addNode) {
    zwave.addNode()
    update("addNode")
  }
  if (stateObject.state.cancelControllerCommand) {
    zwave.cancelControllerCommand()
    update("cancelControllerCommand")
  }
  if (stateObject.state.removeNode) {
    zwave.removeNode()
    update("removeNode")
  }
  if (stateObject.state.softReset) {
    zwave.softReset()
    update("softReset")
  }
}

zwave.connect(DEVICE)
zwave.on("value added", exports.zwave_on_value_added)
zwave.on("value added", (nodeid, comclass, value) => console.debug("value added", nodeid, comclass, value))
zwave.on("driver ready", homeid => console.log("scanning homeid=0x%s...", homeid.toString(16)))
zwave.on("scan complete", () => console.log("====> scan complete."))

zwave.on("driver ready", exports.zwave_on_driver_ready)

zwave.on("node naming", exports.zwave_on_node_available)
zwave.on("node ready", exports.zwave_on_node_available)
zwave.on("node available", exports.zwave_on_node_available)
zwave.on("node removed", exports.zwave_on_node_removed)

process.on("SIGINT", exports.SIGINT)
zwave.on("driver failed", exports.zwave_driver_failed)

zwave.on("notification", (nodeId, notification) => console.log("notification", nodeId, notification))

zwave.on("value added", exports.value_update)
zwave.on("value changed", exports.value_update)

awsMqttClient.on("message", (topic, message) => {
  let thing_name = topic.split("/")[2]
  let payload = JSON.parse(message.toString())
  console.log(payload)
  exports.thingShadow_on_delta_hub(thing_name, payload)
  exports.thingShadows_on_delta_thing(thing_name, payload)
})

