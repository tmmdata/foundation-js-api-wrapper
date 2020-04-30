const axios = require('axios')

class API  {
  constructor({domain, path, port}) {
    this.domain = domain
    this.path = path
    this.port = port
    this.subscriptions = {}
    this.cache = {}
    this.active_calls = 0
    this.wait_queue = []
    this.wait_until_queue = []
    this.__lock = false
  }

  Call (resource, id) {
    let call = this.__callFactory(resource, id)
    return call
  }

  on (status, callback) {
    this.subscriptions[status] = callback
  }

  off (status) {
    delete this.subscriptions[status]
  }

  Wait (func) {
    this.wait_queue.push(func)
    this.__checkWait()
  }

  waitUntil (check_func, func) {
    this.wait_until_queue.push({
      check: check_func,
      run: func
    })
  }

  __callFactory (resource, id) {
    let call = new APICall(this, {
      resource: resource,
      id: id
    })
    if(this.apikey) {
      call.defaults = {
        apikey: this.apikey
      }
    }
    call.__plusCall = () => this.active_calls ++
    call.__minusCall = () => {
      this.active_calls--
      this.__checkWait()
      this.__checkWaitUntil()
    }

    if(resource.indexOf('/') === 0) {
      call.baseURL = 'https://' + this.domain;  
    } else {
      call.baseURL = 'https://' + this.domain + '/api/3/';
    }
    return call
  }

  __checkWait() {
    if (this.active_calls === 0) {
      setTimeout(() => {
        if (this.active_calls === 0) {
          this.wait_queue.forEach(func => {
            func()
          })
          this.wait_queue = []
        }
      }, 10)
    }
  }

  __checkWaitUntil() {
    this.wait_until_queue = this.wait_until_queue.filter(({check, run}) => {
      if(check()) {
        run()
        return false
      } else return true
    })
    
  }
}

class APICall {
  constructor(parent, {resource, id}) {
    if(!resource) this.path = ''
    else if(id) this.path = `${resource}/${id}`
    else this.path = resource
    this.parent = parent // TODO: this may be not so great
    this.actions = []
    this.params = {}
    this.subscriptions = {} 
  }

  on (status, callback) {
    this.subscriptions[status] = callback
    return this
  }

  off (status) {
    delete this.subscriptions[status]
    return this
  }

  action (action, args) {
    if(!action) return this
    if(typeof args === 'object') {
      this.actions.push({
        act: action,
        args: JSON.stringify(args)
      })
    } else if(args) {
      this.actions.push({
        act: action,
        arg: args
      })
    } else {
      this.actions.push({
        act: action
      })
    }
    return this
  }

  get (additional_params) {
    this.__resolveActions()
    let params = Object.assign({}, this.defaults, this.params, additional_params)
    params.attributesonly = true // optiimization
    let key = this.__buildKey(params)
    let url = `${this.baseURL}${this.path}`
    this.parent.cache[key] = new Promise((resolve, reject) => {
      if((!params.apikey && !params.userkey) && !params.nocheck) {
        resolve(false)
      }
      this.__plusCall()
      axios.get(url, {
        params: params
      })
      .then(response => {
        this.__minusCall()
        resolve(response.data)
        delete this.parent.cache[key]
      })
      .catch(error => {
        this.__minusCall()
        if(error.response) {
          if(this.path === 'ErrorLog') return // if it fails, we will loop so we have to exit
          let api_error = error.response.data.errors
          if(this.subscriptions[api_error.status]) this.subscriptions[api_error.status](api_error.detail)
          else if(this.parent.subscriptions[error.response.status]) this.parent.subscriptions[api_error.status](api_error.detail)
          else if(this.parent.subscriptions['error']) this.parent.subscriptions['error'](api_error.status, api_error.detail)
        }
        resolve(false)
        delete this.parent.cache[key]
      })
    })
    return this.parent.cache[key]
  }
    
  post (additional_params) {
    this.__resolveActions()
    let params = Object.assign({}, this.defaults, this.params, additional_params)
    params.attributesonly = true
    let key = this.__buildKey(params)
    let url = `${this.baseURL}${this.path}`
    let data = this.__buildQuery(params, true)
    this.parent.cache[key] = new Promise((resolve, reject) => {
      if((!params.apikey && !params.userkey) && !params.nocheck) {
        resolve(false)
      }
      this.__plusCall()
      axios({
        method: 'post',
        url: url,
        data: data,
        headers: {
          Accept:'application/vnd.api+json'
        },
      })
      .then(response => {
        this.__minusCall()
        if(response.data && typeof response.data === 'object') {
          if (response.data.error) {
            resolve({
              error: true,
              error_message: response.data.error_message
            })
          }
          resolve(response.data.data)
        } else {
          if(this.path === 'ErrorLog') return // if it fails, we will loop so we have to exit
          this.parent.subscriptions['error']('debug', {
            key: key,
            url: url,
            data: data,
            path: this.path,
            error: response.data.split('\n')
          })
          resolve(false)
        }
        delete this.parent.cache[key]
      })
      .catch(error => {
        this.__minusCall()
        if(error.response) {
          if(this.path === 'ErrorLog') return // if it fails, we will loop so we have to exit
          let api_error = error.response.data.errors
          if(this.subscriptions[api_error.status]) this.subscriptions[api_error.status](api_error.detail)
          else if(this.parent.subscriptions[error.response.status]) this.parent.subscriptions[api_error.status](api_error.detail)
          else if(this.parent.subscriptions['error']) this.parent.subscriptions['error'](api_error.status, api_error.detail)
        }
        resolve(false)
        delete this.parent.cache[key]
      })
    })
    return this.parent.cache[key]
  }

  file (formData, additional_params) {
    this.__resolveActions()
    let params = Object.assign({}, this.defaults, this.params, additional_params)
    params.attributesonly = true
    let key = this.__buildKey(params)
    let url = `${this.baseURL}${this.path}?${this.__buildQuery(params, true)}`
    this.parent.cache[key] = new Promise((resolve) => {
      if(!params.apikey && !params.nocheck) {
        resolve(false)
      }
      axios({
        method: 'post',
        url: url,
        data: formData,
        headers: {
          Accept:'application/vnd.api+json'
        },
      })
      .then(response => {
        resolve(response.data.data)
        delete this.parent.cache[key]
      })
      .catch(error => {
        console.log(error)
        resolve(false)
        delete this.parent.cache[key]
      })
    })
    return this.parent.cache[key]
  }

  newWindow (method, additional_params) {
    this.__resolveActions()
    let params = Object.assign({}, this.params, this.defaults)
    if(method === 'post') params.post = true // this is for exports mostly
    params.attributesonly = true
    let key = this.__buildKey(params)
    let url = `${this.baseURL}${this.path}?${this.__buildQuery(params, true)}`
    if(!params.apikey && !params.nocheck) {
      return false
    }
  
    if (method === 'post') {
      var d = new Date();
      var winName = 'exportWindow'+d.getTime()
      var form = document.createElement("form")
      form.setAttribute("method", "post")
      form.setAttribute("action", url)
      form.setAttribute("target",winName)
      for (var opt in additional_params) {
        var input = document.createElement('input')
        input.type = 'hidden'
        input.name = opt
        input.value = additional_params[opt]
        form.appendChild(input)
      }
      document.body.appendChild(form)
      window.open('',winName)
      form.target = winName
      form.submit()
      document.body.removeChild(form)
    } else {
      var export_string = ''
      for (var opt in additional_params) {
        export_string += '&'+opt+'='+encodeURIComponent(additional_params[opt])
      }
      var new_win = window.open(url+export_string)
      if (!new_win || new_win.closed || typeof new_win.closed == 'undefined') {
      }
    }
  }

  __resolveActions () {
    this.actions.forEach((action, index) => {
      // TODO: this can be so much cleaner
      this.params[`action${index}`] = action.act
      if(action.args) this.params[`args${index}`] = action.args
      else if(action.arg) this.params[`arg${index}`] = action.arg
    })
  }

  __buildQuery (params, encode) {
    let query = []
    Object.keys(params).forEach(param => {
      let val = params[param]
      query.push(`${param}=${encode ? encodeURIComponent(val) : val}`)
    })
    return query.join('&')
  }

  __buildKey (params) {
    return `${this.baseURL}${this.path}?${this.__buildQuery(params, false)}`
  }
}

module.exports = API