/* global describe, beforeEach, it */
const sinon = require('sinon')
const chai = require('chai')
const expect = chai.expect
const rewire = require('rewire')
chai.use(require('sinon-chai'))

describe.skip('iot_zwave', function () {
  let mycode
  this.timeout(10000)

  beforeEach(() => {
    mycode = rewire('../index')
  })

  describe('zwave_on_node_removed', () =>
    it('should delete the thing', () => {
      let stub = sinon.stub()
      mycode.__set__('iot', {deleteThing: stub})
      mycode.zwave_on_node_removed('foo')
      return expect(stub).to.have.been.calledWith({thingName: 'zwave_foo'})
    })
  )

  describe('value_update', () =>
    it('should format things correctly to update_thing', () => {
      mycode.update_thing = sinon.stub()
      mycode.value_update('_', '_', {node_id: 'aa', genre: 'foo', label: 'ff', value: 'na'})
      return expect(mycode.update_thing).to.have.been.calledWith('aa', {foo: {ff: 'na'}})
    }
    )
  )

  describe.skip('update_thing', () => false)

  describe.skip('setValue', () => false)

  describe.skip('zwave_on_value_added', () => false)

  describe.skip('thingShadows_on_delta_thing', () => false)

  describe.skip('SIGINT', () => false)

  describe.skip('zwave_on_node_removed', () => false)

  describe.skip('zwave_on_node_available', () => false)

  describe.skip('zwave_on_driver_ready', () => false)

  describe.skip('thingShadow_on_delta_hub', () => false)
})
