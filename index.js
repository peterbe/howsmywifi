const fs = require('fs')
const wifi = require('node-wifi')
const { spawn } = require('child_process')
const puppeteer = require('puppeteer')
const sqlite3Wrapper = require('sqlite3-wrapper')
const sqlite3 = require('sqlite3').verbose()

const DB_NAME = './database.sqlite'
const db = sqlite3Wrapper.open(DB_NAME)
const dbRaw = new sqlite3.Database('./database.sqlite')

dbRaw.serialize(function() {
  dbRaw.run(`
    CREATE TABLE IF NOT EXISTS measurements
    (
      id INTEGER PRIMARY KEY,
      speed FLOAT NULL,
      date DATETIME NOT NULL,
      ssid TEXT NOT NULL
    )
  `)
})

dbRaw.close()

const OSX_AIRPORT_PATH =
  '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'
const currentSSID = () => {
  // wifi.init({
  //     iface : null // network interface, choose a random wifi interface if set to null
  // });
  //
  // wifi.getCurrentConnections(function(err, currentConnections) {
  //   if (err) {
  //     console.error(err);
  //     throw err
  //     // console.log(err)
  //   }
  //   console.log('CURRENT CONNETIONS');
  //   console.log(currentConnections)
  // })
  return new Promise((resolve, reject) => {
    const airport = spawn(OSX_AIRPORT_PATH, ['-I'])
    airport.stderr.on('data', data => {
      reject(data.toString())
    })
    airport.stdout.on('data', data => {
      const ssids = data
        .toString()
        .split('\n')
        .filter(line => {
          return line.search(/\bSSID:/) > -1
        })
        .map(line => {
          return line.split(':')[1].trim()
        })
      if (ssids.length) {
        resolve(ssids[0])
      } else {
        reject('No SSID found')
      }
    })
  })
}

const fastCom = async options => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  await page.goto('http://fast.com', {
    waitUntil: 'networkidle2'
  })

  await page.waitFor('#speed-progress-indicator.succeeded')
  const result = {speedValue: null} // assume we can't get it
  const speedObj = await page.evaluate(() => {
    const el = document.querySelector('#speed-value')
    if (el) {
      const unit = document.querySelector('#speed-units')
      return {value: el.textContent, unit: unit.textContent}
    }
    return null
  })
  if (speedObj) {
    let speed = parseFloat(speedObj.value)
    if (speedObj.unit !== 'Mbps') {
      speed = speed / 1024
    }
    result.speedValue = speed
  }

  if (options.screenshot) {
    const date = new Date().toISOString().replace(/\//g, '.')
    const fn = `screenshots/screenshot.${date}.png`
    if (!fs.existsSync('screenshots')) {
      fs.mkdirSync('screenshots')
    }
    await page.screenshot({ path: fn })
    result.screenshot = fn
    // console.log('Screenshot in', fn);
  }
  await browser.close()
  return Promise.resolve(result)
}

const run = options => {
  currentSSID().then(ssid => {
    console.log('SSID:', ssid)
    fastCom(options)
      .then(result => {
        console.log('speedValue', result.speedValue)
        console.log('Screenshot', result.screenshot)
        db.insert(
          'measurements',
          { speed: result.speedValue, date: new Date(), ssid: ssid },
          (error, id) => {
            if (error) {
              throw error
            }
            // console.log('Row inserted')
          }
        )
      })
      .catch(error => {
        console.error(error)
        throw error
      })
    // console.log('speedValue', speedValue);
  })
}

run({ screenshot: true })
