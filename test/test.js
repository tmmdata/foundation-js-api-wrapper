const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const {assert} = chai
chai.should()
require('dotenv').config()
const api_wrapper = require('../src/foundation-api-wrapper')
const API = new api_wrapper({
	domain: process.env.domain
})

/*
	process.env.email = the email you use to log in
	process.env.password = the password you use for the account
	process.env.domain = the url for the API you are testing with
*/


describe('api', function() {
	step('login', function() {
		// the login step, if our creds are wrong it will abort the suite
		return new Promise((resolve, reject) => {
			API.Call('Auth')
			.post({
				email: process.env.email,
				password: process.env.password,
				nocheck: true
			})
			.then(response => {
				if (!response.attributes) {
					reject(new Error('invalid credentials'))
				} else if (response.error) {
					throw new Error(response.error)
				} else if (response.attributes.expired) {
					throw new Error('password has expired')	
				}else if (response.attributes.auth) {
					throw new Error('2FA turned on')
				} else if(response) {
					assert.ok(true)
					API.apikey = response.attributes.token_guid
					resolve()
				} else {
					throw new Error('failed')
				}
			})
		})
	})

	describe('#actions', function() {
		it('without search returns undefined resource', function() {
			return API.Call('Workspace')
			.post()
			.should.eventually.be.instanceOf(Object).with.nested.property('attributes.workspace_id', null)
		})
		it('give a list of available workspaces using search', function() {
			return API.Call('Workspace')
			.action('search')
			.post()
			.should.eventually.be.instanceOf(Array)
		})
	})
}) 


