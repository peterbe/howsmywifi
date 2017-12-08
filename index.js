const fs = require('fs')
const wifi = require('node-wifi')
const { spawn } = require('child_process')
const puppeteer = require('puppeteer')
const sqlite3Wrapper = require('sqlite3-wrapper')
const sqlite3 = require('sqlite3').verbose()
const minimist = require('minimist')
const blessed = require('blessed')
const contrib = require('blessed-contrib')
const VERSION = require('./package.json').version
const DB_NAME = './database.sqlite'
// const db = sqlite3Wrapper.open(DB_NAME)

const initDb = () => {
  const dbRaw = new sqlite3.Database(DB_NAME)
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
}

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

  try {
    await page.goto('http://fast.com', {
      waitUntil: 'networkidle2'
    })
    await page.waitFor('#speed-progress-indicator.succeeded')
  } catch (err) {
    // console.log('ERROR CATCH!')
    // console.error(err)
    await browser.close()
    return
    // return Promise.reject(err)
  }
  const result = { speedValue: null } // assume we can't get it
  const speedObj = await page.evaluate(() => {
    const el = document.querySelector('#speed-value')
    if (el) {
      const unit = document.querySelector('#speed-units')
      return { value: el.textContent, unit: unit.textContent }
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

const run = (db, options) => {
  initDb()
  const t0 = new Date()
  return currentSSID().then(ssid => {
    console.log('SSID:', ssid)
    const t1 = new Date()
    return fastCom(options)
      .then((result, error) => {
        const t2 = new Date()
        if (error) {
          console.warn('WARNING:', error)
        }
        const speedValue = result ? result.speedValue : null
        if (speedValue) {
          console.log('speedValue', formatSpeed(result.speedValue))
          if (options.screeshot) {
            console.log('Screenshot', result.screenshot)
          }
          const took = (t2 - t1) / 1000
          console.log('Took', took.toFixed(2) + 's')
        }
        return db.insert(
          'measurements',
          { speed: speedValue, date: new Date(), ssid: ssid },
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
        // throw error
        return error
      })

    // console.log('speedValue', speedValue);
  })
}

const formatSecondsAgo = secs => {
  let n = secs,
    u = 's'
  if (secs > 3600) {
    let hours = Math.floor(secs / 3600)
    let minutes = Math.floor((secs % 3600) / 60)
    return `-${hours}h${minutes}m`
  } else if (secs > 60) {
    let minutes = Math.floor(secs / 60)
    return `-${minutes}m`
  } else {
    n = Math.ceil(secs)
  }
  return `-${n}${u}`
}

const formatSpeed = mbps => {
  if (mbps < 1) {
    return `${Math.floor(mbps / 1000)}Kbps`
  } else if (mbps > 1000) {
    return `${(mbps / 1000).toFixed(1)}Gbps`
  } else {
    return `${mbps.toFixed(1)}Mbps`
  }
}

// https://rosettacode.org/wiki/Averages/Simple_moving_average#JavaScript
function simple_moving_averager(period) {
  var nums = []
  return function(num) {
    nums.push(num)
    if (nums.length > period) nums.splice(0, 1) // remove the first element of the array
    var sum = 0
    for (var i in nums) sum += nums[i]
    var n = period
    if (nums.length < period) n = nums.length
    return sum / n
  }
}
var sma3 = simple_moving_averager(3)
var sma5 = simple_moving_averager(5)

const runScreen = db => {
  const getGraphData = graphOptions => {
    const limit = graphOptions.limit || 10
    return new Promise((resolve, reject) => {
      db.select(
        { table: 'measurements', limit: limit, order: 'date desc' },
        (err, measurements) => {
          if (err) {
            reject(err)
          }

          const ssid = measurements[0].ssid
          const data = {
            // title: `SSID: ${ssid}`,
            // https://github.com/yaronn/blessed-contrib/issues/133
            title: 'Speed',
            x: [],
            y: [],
            style: {
              line: 'red'
            }
          }
          const movingAverage = {
            // https://github.com/yaronn/blessed-contrib/issues/133
            // title: 'Moving Average',
            title: 'Average',
            x: [],
            y: [],
            style: {
              line: 'yellow'
            }
          }
          const now = new Date().getTime()
          let maxY = 0
          let maxID = 0
          const speeds = []
          measurements.forEach(measurement => {
            if (!measurement.speed) {
              // skip those with null
              // XXX Do a WHERE clause in the query
              return
            }
            speeds.push(measurement.speed)
            if (!maxID) {
              maxID = measurement.id
            }
            const secAgo = (now - measurement.date) / 1000
            data.x.unshift(formatSecondsAgo(secAgo))
            movingAverage.x.unshift(formatSecondsAgo(secAgo))
            data.y.unshift(measurement.speed)
            if (measurements.length >= limit) {
              movingAverage.y.unshift(sma5(measurement.speed))
            } else {
              movingAverage.y.unshift(sma3(measurement.speed))
            }

            // if (measurement.speed) {
            //   data.y.unshift(measurement.speed)
            // } else {
            //   data.y.unshift(0)
            // }
            if (measurement.speed > maxY) {
              maxY = measurement.speed
            }
          })

          maxY *= 1.2 // extra padding

          const datum = [data, movingAverage]
          resolve({ datum, maxY, maxID })
        }
      )
    })
  }
  const screen = blessed.screen()
  const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen })
  // const gauge = grid.set(8, 10, 2, 2, contrib.gauge, {label: 'Speed', percent: [80,20]})
  const speedLine = grid.set(0, 6, 12, 6, contrib.line, {
    style: {
      line: 'red',
      text: 'white',
      baseline: 'black'
    },
    label: 'Speed in Mbps',
    maxY: 10,
    showLegend: true
  })

  let lastMaxID = null
  setInterval(() => {
    getGraphData({limit: 30}).then(graphData => {
      const { maxY, datum, maxID } = graphData
      if (!lastMaxID || maxID !== lastMaxID) {
        // the values have actually changed!
        speedLine.options.maxY = maxY
        speedLine.setData(datum)
        // datum.forEach(data => {
        //   speedLine.setData(data)
        // })
        lastMaxID = maxID
      }
    })
    screen.render()
  }, 2000)

  screen.key(['escape', 'q', 'C-c'], (ch, key) => {
    process.exit(0)
  })

  // fixes https://github.com/yaronn/blessed-contrib/issues/10
  screen.on('resize', function() {
    // donut.emit('attach');
    speedLine.emit('attach')
    // gauge_two.emit('attach');
    // sparkline.emit('attach');
    // bar.emit('attach');
    // table.emit('attach');
    // lcdLineOne.emit('attach');
    // errorsLine.emit('attach');
    // transactionsLine.emit('attach');
    // map.emit('attach');
    // log.emit('attach');
  })

  screen.render()
}
// const updateGauge = () => {
//   setLineData([errorsData], errorsLine)
//
// }

const args = process.argv.slice(2)

const argv = minimist(args, {
  boolean: ['help', 'version', 'screenshots', 'loop', 'noloopgui'],
  integer: ['sleepseconds'],
  string: ['output', 'skip'],
  default: {
    sleepseconds: 60 * 5
    // color: true,
    // "ignore-path": ".prettierignore"
  },
  alias: {
    help: 'h',
    version: 'v',
    sleepseconds: 't',
    loop: 'l'
  },
  unknown: param => {
    if (param.startsWith('-')) {
      console.warn('Ignored unknown option: ' + param + '\n')
      return false
    }
  }
})

if (argv['version']) {
  console.log(VERSION)
  process.exit(0)
}

if (argv['help']) {
  console.log(
    'Usage: index.js [opts]\n\n' +
      'Available options:\n' +
      '  --loop or -l                  Run repeatedly (sleepseconds) and keep taking measurements.\n' +
      '  --sleepseconds or -t          Number of seconds to wait between runs (default 300).\n' +
      '  --screenshots                 Save a screenshot for each load.\n' +
      '  --version or -v               Print minimalcss version.\n' +
      ''
  )
  process.exit(0)
}

const options = {
  screenshot: false
}
const db = sqlite3Wrapper.open(DB_NAME)
if (argv['report']) {
  // todo
} else if (argv['loop']) {
  const interval = argv['sleepseconds'] * 1000
  // The reason for using setTimeout instead of setInterval is that we
  // want to sleep AFTER the run() function has FINISHED.
  const loop = () => {
    run(db, options)
      .then(() => {
        setTimeout(loop, interval)
      })
      .catch(err => {
        console.log('Run failed. Better luck next time')
        console.log(err.toString())
        setTimeout(loop, interval)
      })
  }
  loop()

  if (!argv['noloopgui']) {
    runScreen(db)
  }
  // run(options)
  // setInterval(() => {
  //   run(options)
  // }, interval)
} else {
  run(db, options)
}
