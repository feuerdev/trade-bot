const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const serialize = (obj)=> {
  var str = [];
  for (var p in obj)
    if (obj.hasOwnProperty(p)) { 
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
};

function createNonce() {
  return new Date().getTime() * 1000;
  // return timestamp + ('0000' + nonce++).slice(-5);
}

class Futures {
  constructor() {
    this.API_KEY = process.env.API_KEY;
    this.API_SECRET = process.env.API_SECRET;
    this.URL = process.env.URL;
  }

  // make a public call
  async publicMethod (endpoint, params=undefined) {
    
      try {
        const action = endpoint === 'tickers' ? await axios.get(`${this.URL}/${endpoint}`) : await axios.get(`${this.URL}/${endpoint}?${serialize(params)}`)
        const results = endpoint === 'orderbook' ? action.data['orderBook'] : action.data[endpoint]
        return results;
      } catch (e) {
        return e;
      }
  }

   // create authentication
    messageSignature (endpoint,nonce, postData=undefined) {
      const endpointPath = `/api/v3/${endpoint}`
      const message = postData == undefined ? `${nonce}${endpointPath}` : `${serialize(postData)}${nonce}${endpointPath}`
      const firstHash = crypto.createHash('sha256').update(message).digest();
      const base64decode = Buffer.from(this.API_SECRET, 'base64');
      const hash = crypto.createHmac('sha512', base64decode).update(firstHash).digest();
      const finalHash = Buffer.from(hash).toString('base64');
      return finalHash;
  }

  

  // make a private call
   async privateMethod (endpoint, params=undefined) {
     let nonce = createNonce()
    const headers = {
      'APIKey': this.API_KEY,
      'Nonce': nonce,
      'Authent': this.messageSignature(endpoint,nonce, params)
    }
    const data = params != undefined ? `${this.URL}/${endpoint}?${serialize(params)}` : `${this.URL}/${endpoint}`
    
    try {
      const method = endpoint === 'accounts' || 'openorders' || 'recentorders' || 'historicorders' ? await axios.get(data, {headers}) : await axios.post(data, {headers});
       return method.data;
    } catch (e) {
      return e;
    }
  }
}
module.exports = Futures
