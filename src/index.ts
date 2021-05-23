//Load .env File
import dotenv from "dotenv"
dotenv.config()

import WebSocket from "ws"
import * as Indicators from "technicalindicators"
import Futures from "./kraken"

/**
Strategy:

1. If three continous 1m Haikin Ashi Candles are red sell/green buy
2. Settle trade if color changes

*/


 const urlWsApi = "wss://futures.kraken.com/ws/v1"
//const urlWsApi = "wss://demo-futures.kraken.com/ws/v1"
const connection = new WebSocket(urlWsApi)
const api = new Futures()

const data = {
  open: [] as number[],
  high: [] as number[],
  low:  [] as number[],
  close:[] as number[]
}

// let ashi// = new Indicators.HeikinAshi(data)

connection.on("open", () => {
  console.log("established")
  
  const sub = {  
    "event":"subscribe",
    "feed":"ticker",
    "product_ids":[  
      "PI_XBTUSD"
    ]
  }
  connection.send(JSON.stringify(sub))
})

connection.on("message", (data:WebSocket.Data) => {
  const json = JSON.parse(data as string)
  if(!json.event && json.feed == "ticker") {
    addData(json.time, json.last)
  }
})

let curOpen:number
let curClose:number
let curHigh:number
let curLow:number
let curTime:number | null

function addData(time: number, price:number) {
  if (curTime == null) {
    curTime = time
    curOpen = price
    curLow = price
    curHigh = price
  } else if(time > curTime + 1000*60) {
    //settle current bar
    curClose = price
    data.close.push(curClose)
    data.open.push(curOpen)
    data.high.push(curHigh)
    data.low.push(curLow)

    const ashis = Indicators.HeikinAshi.calculate(data)
    checkSignal(ashis)
    curTime = null
  } else {
    //update values
    curLow = Math.min(price, curLow)
    curHigh = Math.max(price, curHigh) 
  }
}

let hasPositionOpen = false
let positionIsBuy:boolean
let positionEntry:number
function checkSignal(ashis:Indicators.CandleList) {
  const len = ashis.open?.length ?? 0
  if (!hasPositionOpen) {
    if (len > 3) {
      const colors:boolean[] = []
      for(let i = 1; i<=3; i++) {
        const open = ashis.open?.[len-i]
        const close = ashis.close?.[len-i]
        if(!open || !close) {
          throw "Weird Values"
        }
        
        colors.push(close > open)
        
      }
      if(colors[0] == colors[1] == colors[2]) {
        const entry = ashis.open?.[len-1]
        const isBuy = colors?.[0]
        if(!entry || !isBuy) {
          throw "Weird values"
        }

        //Signal found!
        hasPositionOpen = true
        positionEntry = entry
        positionIsBuy = isBuy
        console.log("Signal Found: "+(colors[0]? "Buy" : "Sell")+" at "+entry)
        //Send order here
        open(positionIsBuy)
      } else {
        console.log("No open signal found")
      }
    }
  } else {
    const lastOpen = ashis.open?.[len-1]
    const lastClose = ashis.close?.[len-1]
    if(!lastClose || !lastOpen) {
      throw "Weird Values"
    }
    const lastIsGreen = lastClose > lastOpen
    if (lastIsGreen != positionIsBuy) {
      const currentPrice = lastOpen
      const diff = ((currentPrice-positionEntry)/positionEntry) * 100
      const profit = positionIsBuy ? diff : diff*-1
      console.log("Closing Position at "+ currentPrice +"! Profit: "+ profit+ "%")
      close(positionIsBuy)
      hasPositionOpen = false
    } else {
      console.log("No close signal found")
    }
  }
}

async function open(isBuy:boolean) {
  const params = {
    orderType: 'mkt',
    symbol: 'pi_xbtusd',
    side: isBuy ? "buy" : "sell",
    size: 1000
  }
  
  const result = await api.privateMethod('sendorder', params);
  console.log(result)
}

async function close(isBuy:boolean) {
  const params = {
    orderType: 'mkt',
    symbol: 'pi_xbtusd',
    side: !isBuy ? "buy" : "sell",
    size: 1000,
    reduceOnly: true
  }
  
  const result = await api.privateMethod('sendorder', params);
  console.log(result)
}
