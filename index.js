/* eslint-disable no-undef, camelcase, no-unused-vars, no-return-assign */

const AWS = require('aws-sdk')
const awsIot = require('aws-iot-device-sdk')
const Queue = require('promise-queue')
const ZWave = require('openzwave-shared')

const _ = {
  set: require('lodash.set'),
  mapValues: require('lodash.mapvalues'),
  pickBy: require('lodash.pickby'),
  get: require('lodash.get')
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

const thingShadows = awsIot.thingShadow({
  accessKeyId: AWS_ACCESS_KEY,
  secretKey: AWS_SECRET_ACCESS_KEY,
  host: AWS_IOT_ENDPOINT_HOST,
  protocol: 'wss',
  debug: DEBUG
})

const zwave = new ZWave({
  Logging: DEBUG,
  ConsoleOutput: DEBUG,
  NetworkKey: ZWAVE_NETWORK_KEY
})

module.exports.zwave_driver_failed = () => {
  console.log('driver failed')
  zwave.disconnect()
  process.exit()
}

module.exports.value_update = (nodeid, comclass, value) =>
  module.exports.update_thing(
    value.node_id,
    _.set({}, `${value.genre}.${value.label}`, value.value))

module.exports.update_thing = async (thing_id, update) => {
  let payload = {state: {reported: update}}

  let shadow = await iotdata.getThingShadow({thingName: `zwave_${home_id}_${thing_id}`}).promise()

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
  return queue.add(() =>
    iotdata.updateThingShadow({
      thingName: `zwave_${home_id}_${thing_id}`,
      payload: JSON.stringify(payload)
    }).promise()
  )
}

module.exports.setValue = (thing_id, genre, label, value) =>
  zwave.setValue(...things[thing_id][genre][label].split('-').concat([value]))

module.exports.zwave_on_value_added = (nodeid, comclass, value) =>
  things = _.set(things, `zwave_${home_id}_${nodeid}.${value.genre}.${value.label}`, value.value_id)

module.exports.thingShadows_on_delta_thing = (thingName, stateObject) => {
  if (thingName === `zwave_${home_id}`) return
  Object.entries(stateObject.state).forEach(([genre, values]) =>
    Object.entries(values).forEach(([label, value]) =>
      module.exports.try(() => module.exports.setValue(thingName, genre, label, value))
    )
  )
}

module.exports.try = func => {
  try {
    func()
  } catch (error) {
    console.error(error)
  }
}

module.exports.SIGINT = () => {
  console.log('disconnecting...')
  zwave.disconnect(DEVICE)
  process.exit()
}

module.exports.zwave_on_node_removed = nodeid =>
  iot.deleteThing({thingName: `zwave_${home_id}_${nodeid}`})

module.exports.zwave_on_node_available = (nodeid, nodeinfo) => {
  let params = {
    thingName: `zwave_${home_id}_${nodeid}`,
    thingTypeName: 'zwave',
    attributePayload: {
      attributes: _.mapValues(_.pickBy(nodeinfo, info => info.length >= 1 && info.length <= 800), v => v.replace(new RegExp(' ', 'g'), '_'))
    }
  }
  console.log('node available', params)
  return iot.createThing(params).promise()
    .catch(() => iot.updateThing(params).promise())
    .then(() => thingShadows.register(params.thingName))
}

module.exports.zwave_on_driver_ready = homeid => {
  home_id = homeid.toString(16)
  let params = {
    thingName: `zwave_${home_id}`
  }
  return iot.createThing(params).promise()
    .catch(() => iot.updateThing(params).promise())
    .then(() => thingShadows.register(params.thingName))
}

module.exports.thingShadow_on_delta_hub = (thingName, stateObject) => {
  if (thingName !== `zwave_${home_id}`) return

  const update = key => queue.add(() =>
    iotdata.updateThingShadow({
      thingName: thingName,
      payload: JSON.stringify({state: {reported: {[key]: stateObject.state[key]}}})
    }).promise())

  if (stateObject.state.secureAddNode) {
    zwave.addNode(true)
    update('secureAddNode')
  }
  if (stateObject.state.healNetwork) {
    zwave.healNetwork()
    update('healNetwork')
  }
  if (stateObject.state.addNode) {
    zwave.addNode()
    update('addNode')
  }
  if (stateObject.state.cancelControllerCommand) {
    zwave.cancelControllerCommand()
    update('cancelControllerCommand')
  }
  if (stateObject.state.removeNode) {
    zwave.removeNode()
    update('removeNode')
  }
  if (stateObject.state.softReset) {
    zwave.softReset()
    update('softReset')
  }
}

if (!global.it) {
  zwave.connect(DEVICE)
  zwave.on('value added', module.exports.zwave_on_value_added)
  zwave.on('value added', (nodeid, comclass, value) => console.debug('value added', nodeid, comclass, value))
  zwave.on('driver ready', homeid => console.log('scanning homeid=0x%s...', homeid.toString(16)))
  zwave.on('scan complete', () => console.log('====> scan complete, hit ^C to finish.'))

  thingShadows.on('delta', module.exports.thingShadow_on_delta_hub)
  zwave.on('driver ready', module.exports.zwave_on_driver_ready)
  zwave.on('node available', module.exports.zwave_on_node_available)
  zwave.on('node removed', module.exports.zwave_on_node_removed)
  process.on('SIGINT', module.exports.SIGINT)
  thingShadows.on('delta', module.exports.thingShadows_on_delta_thing)
  zwave.on('driver failed', module.exports.zwave_driver_failed)

  zwave.on('value added', module.exports.value_update)
  zwave.on('value changed', module.exports.value_update)
}
