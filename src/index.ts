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

let data = {
  open: [] as number[],
  high: [] as number[],
  low:  [] as number[],
  close:[] as number[]
}

// let ashi// = new Indicators.HeikinAshi(data)

connection.on("open", () => {
  console.log("established")
  
  let sub = {  
    "event":"subscribe",
    "feed":"ticker",
    "product_ids":[  
      "PI_XBTUSD"
    ]
  }
  connection.send(JSON.stringify(sub))
})

connection.on("message", (data:any) => {
  const json = JSON.parse(data)
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

    let ashis = Indicators.HeikinAshi.calculate(data)
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
  const len = ashis.open!.length
  if (!hasPositionOpen) {
    if (len > 3) {
      let colors:boolean[] = []
      for(let i = 1; i<=3; i++) {
        let open = ashis.open![len-i]!
        let close = ashis.close![len-i]!
        colors.push(close > open)
      }
      if(colors[0] == colors[1] == colors[2]) {
        //Signal found!
        hasPositionOpen = true
        positionIsBuy = colors[0]!
        positionEntry = ashis.open![len-1]!
        console.log("Signal Found: "+(colors[0]? "Buy" : "Sell")+" at "+ashis.open![len-1])
        //Send order here
        open(positionIsBuy)
      } else {
        console.log("No open signal found")
      }
    }
  } else {
    let lastOpen = ashis.open![len-1]!
    let lastClose = ashis.close![len-1]!
    const lastIsGreen = lastClose > lastOpen
    if (lastIsGreen != positionIsBuy) {
      let currentPrice = ashis.open![len-1]!
      let diff = ((currentPrice-positionEntry)/positionEntry) * 100
      let profit = positionIsBuy ? diff : diff*-1
      console.log("Closing Position at "+ currentPrice +"! Profit: "+ profit+ "%")
      close(positionIsBuy)
      hasPositionOpen = false
    } else {
      console.log("No close signal found")
    }
  }
}

async function open(isBuy:boolean) {
  let params = {
    orderType: 'mkt',
    symbol: 'pi_xbtusd',
    side: isBuy ? "buy" : "sell",
    size: 1000
  }
  
  const result = await api.privateMethod('sendorder', params);
  console.log(result)
}

async function close(isBuy:boolean) {
  let params = {
    orderType: 'mkt',
    symbol: 'pi_xbtusd',
    side: !isBuy ? "buy" : "sell",
    size: 1000,
    reduceOnly: true
  }
  
  const result = await api.privateMethod('sendorder', params);
  console.log(result)
}
