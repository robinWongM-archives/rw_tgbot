const TelegramBot = require('node-telegram-bot-api'),
      weiboMid = require('weibo-mid')

const config = require('./config.js')
const pWeiboCN = /weibo\.cn\/(?:status|detail)\/(\d+)/i
const pWeiboCNNew = /weibo\.cn\/(?:\d+)\/(\d+)/i
const pWeicoCC = /weico\.cc\/share\/(?:\d+)\.html\?weibo_id=(\d+)/i
const pWeicoCCNew = /weico\.net\/share\/(?:\d+)\.html\?weibo_id=(\d+)/i
const pWeiboCOM = /weibo\.com\/\d+\/(.+)/i

const got = require('got'),
      cheerio = require('cheerio')

const mysql = require('mysql')
const pool = mysql.createPool({
    host     :  '127.0.0.1',
    user     :  'news_media',
    password :  config.mysql_token,
    database :  'news_media'
})
const schedule = require('node-schedule'),
      moment = require('moment')

const puppeteer = require('puppeteer')

const query = function( sql, values ) {
    // 返回一个 Promise
    return new Promise(( resolve, reject ) => {
      pool.getConnection(function(err, connection) {
        if (err) {
          reject( err )
        } else {
          connection.query(sql, values, ( err, rows) => {
            if ( err ) {
              reject( err )
            } else {
              resolve( rows )
            }
            // 结束会话
            connection.release()
          })
        }
      })
    })
  }

  // Thanks to https://stackoverflow.com/a/21323330
function round(value, exp) {
    if (typeof exp === 'undefined' || +exp === 0)
      return Math.round(value);
  
    value = +value;
    exp = +exp;
  
    if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0))
      return NaN;
  
    // Shift
    value = value.toString().split('e');
    value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp)));
  
    // Shift back
    value = value.toString().split('e');
    return +(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp));
  }

// replace the value below with the Telegram token you receive from @BotFather
const token = config.bot_token;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

// Monitor channel update
let lastUpdateTime = moment().tz('Asia/Shanghai')
let monitorInterval = 12

bot.on('channel_post', (msg) => {
    lastUpdateTime = moment().tz('Asia/Shanghai')
})

let channels = []

async function init() {
    // init channel
    for (const category of config.channels) {
        for (const channel of category.items) {
            let chat = await bot.getChat('@' + channel)
            channels.push({
                id: channel,
                name: chat.title,
                category: category.category,
                previousCount: 0,
                count: 0
            })
        }
    }

    // Read from database
    //try {
        await query('CREATE TABLE IF NOT EXISTS news_stat ( ' +
                              'id INT UNSIGNED AUTO_INCREMENT, ' +
                              'time DATETIME NOT NULL, ' +
                              'channel VARCHAR(128) NOT NULL, ' +
                              'count INT UNSIGNED NOT NULL, ' +
                              'PRIMARY KEY (id)' +
                              ') ENGINE=innoDB CHARSET=utf8')
        
        //let latest = await query('SELECT * FROM news_stat')
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i]

            let channelRow = await query('SELECT * FROM news_stat ' +
                                            'WHERE channel = ' + mysql.escape(channel.id) + ' ' + 
                                            'ORDER BY time DESC LIMIT 1')
            if(channelRow.length) {
                channels[i].previousCount = channels[i].count = channelRow[0].count
                console.log('loaded data: '+ channel.id + ' ' + channels[i].previousCount)
            }
        }

        // and then fetch the latets count
        await fetchCount()
    //} catch (err) {
    //    console.error(err)
    //}

    // setting up scheduled job
    let updateJob = schedule.scheduleJob('*/20 * * * * *', async () => {
        console.log('[' + moment().tz('Asia/Shanghai').format('YYYY/MM/DD HH:mm:ss') + '] Running Fetching')
        fetchCount()
    })
    
    let reportJob = schedule.scheduleJob('10 0 * * * *', async () => {
        let nowTime = moment().tz('Asia/Shanghai')
        console.log('[' + nowTime.format('YYYY/MM/DD HH:mm:ss') + '] Running 速报')

        let diffDuration = moment.duration(nowTime.diff(lastUpdateTime)).asHours()
        if(diffDuration >= monitorInterval) {
            bot.sendMessage(config.exi_channel, `#WARNING *某频道已经超过 ${Math.floor(diffDuration)} 个小时没有更新，快滴 Check 一下啦*`, {
                parse_mode: 'Markdown',
                disable_notification: false,
                disable_web_page_preview: true
            })
        }

        if (nowTime.hour() != 22)
        //if(nowTime.hour() != 2 && nowTime.hour() != 8 && nowTime.hour() != 14 && nowTime.hour() != 20)
            return

        console.log('[' + nowTime.format('YYYY/MM/DD HH:mm:ss') + '] Running 速报到点咗')
        
        output = ''
        preList = {}

        channels.forEach(channel => {
            if(!preList[channel.category])
                preList[channel.category] = []

            preList[channel.category].push(channel)
        })

        /* switch (nowTime.hour()) {
            case 2:
                output = output + '#港股盘后报道'
                break
            case 8:
                output = output + '#港股盘前报道'
                break
            case 14:
                output = output + '#港股午市报道'
                break
            case 20:
                output = output + '#港股收市报道'
                break
            default:
                output = output + '#港股测试报道'
        } */
        output = output + '#港股收市报道'

        //output = output + " *" + nowTime.subtract(6, 'hours').format('YYYY/MM/DD [HKT] HH:mm [-]') + ' ' +
        //                  nowTime.add(6, 'hours').format('HH:mm')  + '*\n'
        output = output + " *" + nowTime.subtract(1, 'days').format('YYYY/MM/DD [HKT] HH:mm [-]') + ' ' +
                          nowTime.add(1, 'days').format('YYYY/MM/DD [HKT] HH:mm')  + '*\n'

        /* switch (nowTime.hour()) {
            case 2:
                output = output + '截止市场夜宵时间，'
                break
            case 8:
                output = output + '截止市场通宵时分，'
                break
            case 14:
                output = output + '截止午间收盘，'
                break
            case 20:
                output = output + '截止晚上收盘，'
                break
            default:
                output = output + '截止本次抽风，'
        } */
        output = output + '截至市场收盘，'

        let allSum = {
            previous: 0,
            current: 0
        }

        for (const key in preList) {
            if (preList.hasOwnProperty(key)) {
                let list = preList[key]
                let listSum = {
                    previous: 0,
                    current: 0
                }

                for (let i = 0; i < list.length; i++) {
                    const channel = list[i]
                    let ret = await query('SELECT count FROM news_stat ' +
                                          'WHERE channel = ' + mysql.escape(channel.id) + ' ' +
                                          'AND time <= ' + mysql.escape(moment().subtract('1', 'days').format("YYYY-MM-DD HH:mm:ss")) + 
                                          // 'AND time <= ' + mysql.escape(moment().subtract('6', 'hours').format("YYYY-MM-DD HH:mm:ss")) + 
                                          'ORDER BY time DESC LIMIT 1')
                    if(ret.length <= 0) {
                        ret = await query('SELECT count FROM news_stat ' +
                                          'WHERE channel = ' + mysql.escape(channel.id) + ' ' +
                                          'ORDER BY time LIMIT 1')
                    }

                    list[i].lastCount = ret[0].count
                    listSum.previous += ret[0].count
                    listSum.current += channel.count
                }
                preList[key].sum = listSum
                allSum.previous += listSum.previous
                allSum.current += listSum.current
            }
        }

        output = output + '港股综合指数报 ' + allSum.current + ' 点，'

        if(allSum.previous < allSum.current) {
            // Up
            output = output + '*上涨📈 ' + (round(((allSum.current - allSum.previous) / allSum.previous) * 100, 2).toFixed(2)) + '% (' + (allSum.current - allSum.previous) + '.00)*'
        } else if(allSum.previous > allSum.current) {
            output = output + '*下跌📉 ' + (round(((allSum.previous - allSum.current) / allSum.previous) * 100, 2).toFixed(2)) + '% (' + (allSum.current - allSum.previous) + '.00)*'
        } else {
            output = output + '平盘 0.00% (0.00)'
        }

        output = output + '。来看各个板块的情况：\n'

        for (const key in preList) {
            if (preList.hasOwnProperty(key)) {
                let list = preList[key]
                output = output + '\n#' + key + ' 板块报 ' + list.sum.current + ' 点，'
                if(list.sum.previous < list.sum.current) {
                    // Up
                    output = output + '*上涨📈 ' + (round(((list.sum.current - list.sum.previous) / list.sum.previous) * 100, 2).toFixed(2)) + '% (' + (list.sum.current - list.sum.previous) + '.00)*'
                } else if(list.sum.previous > list.sum.current) {
                    output = output + '*下跌📉 ' + (round(((list.sum.previous - list.sum.current) / list.sum.previous) * 100, 2).toFixed(2)) + '% (' + (list.sum.current - list.sum.previous) + '.00)*'
                } else {
                    output = output + '平盘 0.00% (0.00)'
                }

                output = output + '\n其中，'

                list.forEach(channel => {
                    output = output + '[' + channel.name + '](https://t.me/' + channel.id + ') 报 ' + channel.count + ' 点，'
                    
                    if(channel.lastCount < channel.count) {
                        // Up
                        output = output + '*上涨📈 ' + (round(((channel.count - channel.lastCount) / channel.lastCount) * 100, 2).toFixed(2)) + '% (' + (channel.count - channel.lastCount) + '.00)*'
                    } else if(channel.lastCount > channel.count) {
                        output = output + '*下跌📉 ' + (round(((channel.lastCount - channel.count) / channel.lastCount) * 100, 2).toFixed(2)) + '% (' + (channel.lastCount - channel.count) + '.00)*'
                    } else {
                        output = output + '平盘 0.00% (0.00)'
                    }

                    output = output + '\n'
                })
            }
        }

        output = output + '\n本报道由上海商业银行特约播出'
    
        bot.sendMessage(config.main_channel, output, {
            parse_mode: 'Markdown',
            disable_notification: true,
            disable_web_page_preview: true
        })
    
    })
}

async function fetchCount() {
    for (let i = 0; i < channels.length; i++) {
        let channel = channels[i]
        let count = await bot.getChatMembersCount('@' + channel.id)
        channel.count = count

        if(channel.previousCount != count) {
            // save db
            try {
                console.log('trying to save ' + channel.id)
                await query('INSERT INTO news_stat SET ?', {
                    time: new Date(),
                    channel: channel.id,
                    count: count
                })
            } catch (err) {
                console.error('saving error:' + err)
                bot.sendMessage(config.main_channel, '#数据库错误 ' + err, {
                    disable_notification: true,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            }
            if(channel.previousCount != 0) {
                // really modified
                let output = '#港股L2行情 #'+ channel.category + ' [' + channel.name + '](https://t.me/' + channel.id + ') '
                if(channel.previousCount < count) {
                    output = output + count + '🔺(' + (channel.count - channel.previousCount) + ')'
                } else {
                    output = output + count + '🔻(' + (channel.previousCount - channel.count) + ')'
                }
                bot.sendMessage(config.main_channel, output, {
                    disable_notification: true,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            }
        }

        channel.previousCount = count
        channels[i] = channel
    }

    return
}

function returnWeibo(id) {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'HTML5',
                        url: 'https://m.weibo.cn/status/' + id
                    },
                    {
                        text: 'Official',
                        url: 'https://service.rwong.cc/tg_bot/weibo/' + id
                    },
                    {
                        text: 'Intl.',
                        url: 'https://service.rwong.cc/tg_bot/weico/' + id
                    }
                ]
            ]
        }
    }
}

async function fetchLatest() {
    try {
        // NOW News Local
        let nowNews = (await got('https://news.now.com/api/getNewsListv2?category=119&pageSize=10&pageNo=1')).body
        let nowNewsJSON = JSON.parse(nowNews)

        // NOW News International
        let nowNewsInternational = (await got('https://news.now.com/api/getNewsListv2?category=120&pageSize=10&pageNo=1')).body
        let nowNewsInternationalJSON = JSON.parse(nowNewsInternational)

        // RTHK News Local
        let rthk = (await got('http://news.rthk.hk/rthk/webpageCache/services/loadModNewsShowSp2List.php?lang=zh-TW&cat=3&newsCount=60&dayShiftMode=1&archive_date=')).body
        let $rthk = cheerio.load(rthk)
        let rthkList = []

        $rthk('.ns2-inner').each(function(i, elem) {
            rthkList.push({
                title: $rthk('a', elem).text(),
                link: $rthk('a', elem).attr('href'),
                time: $rthk('.ns2-created', elem).text()
            })
        })

        let output = '#港闻测试 ' + new Date().toISOString().slice(11, 19) + '\n' +
                     '\n*NOW News* \n'

        for (let i = 0; i < 5; i++) {
            const news = nowNewsJSON[i]
            output = output + '[' + news.title + '](https://news.now.com/home/local/player?newsId=' + news.newsId + ') ' + new Date(news.publishDate).toISOString().slice(11, 19) + '\n'
        }

        output = output + '\n*NOW News International* \n'

        for (let i = 0; i < 5; i++) {
            const news = nowNewsInternationalJSON[i]
            output = output + '[' + news.title + '](https://news.now.com/home/international/player?newsId=' + news.newsId + ') ' + new Date(news.publishDate).toISOString().slice(11, 19) + '\n'
        }

        output = output + '\n*RTHK* \n'

        for (let j = 0; j < 5; j++) {
            const news = rthkList[j]
            output = output + '[' + news.title + '](' + news.link + ') ' + news.time.slice(15, 20) + '\n'
        }

        bot.sendMessage('@the_BetaNews', output, {
            parse_mode: 'Markdown',
            disable_notification: true,
            disable_web_page_preview: true
        })

    } catch (err) {
        bot.sendMessage('@the_BetaNews', '#错误 获取最新新闻时出现问题，错误详情：' + err)
    }
}

bot.onText(/\/getMonitor/, (msg, match) => {
    const chatId = msg.chat.id
    let nowTime = moment().tz('Asia/Shanghai')

    bot.sendMessage(chatId, `港闻频道崩溃监控：\n上次推文接收时间: ${lastUpdateTime.format("YYYY-MM-DD HH:mm:ss")}\n无响应小时数: ${moment.duration(nowTime.diff(lastUpdateTime)).asHours()}\n监控间隔：${monitorInterval} 小时`, {
        disable_notification: true,
        disable_web_page_preview: true
    })
})
bot.onText(/\/setMonitor (.+)/, (msg, match) => {
    const chatId = msg.chat.id
    const resp = parseFloat(match[1])

    if (isNaN(resp) || !isFinite(resp)) {
        bot.sendMessage(chatId, '您输入的参数不正确喔', {
            disable_notification: true
        })
        return
    }

    monitorInterval = resp

    bot.sendMessage(chatId, `设置成功。当频道持续 ${monitorInterval} 小时没有新的推文推送，将报警提示。`, {
        disable_notification: true,
        disable_web_page_preview: true
    })
})

bot.onText(/\/echo (.+)/, (msg, match) => {
    bot.sendMessage(msg.chat.id, match, {
        parse_mode: 'Markdown'
    })
})

let woshuo = 'cgjsafcvw;eoisguof'
let nishuo = 'iwlahgfodugefr;vsh'

bot.onText(/我说(.+)你说(.+)/, (msg, match) => {
    if (match[1] && match[2]) {
        woshuo = match[1].trim()
        nishuo = match[2].trim()
    }
})
bot.on('message', (msg) => {
    if (typeof(msg.text) === 'string') {
        if (msg.text.trim() === woshuo) {
            bot.sendMessage(msg.chat.id, nishuo)
        } 
    }
})

bot.onText(/\/weiboid (.+)/, (msg, match) => {
    const chatId = msg.chat.id
    const resp = match[1]

    bot.sendMessage(chatId, 'Try:', returnWeibo(resp))
})

bot.onText(/\/chart/, (msg, match) => {
    let preList = {}
    let categoryList = []

    channels.forEach(channel => {
        if(!preList[channel.category])
            preList[channel.category] = []

        preList[channel.category].push(channel)
    })

    for (const category in preList) {
        if (preList.hasOwnProperty(category)) {
            categoryList.push([{
                text: category,
                callback_data: JSON.stringify({
                    type: 'category',
                    data: category
                })
            }])
        }
    }

    bot.sendMessage(msg.chat.id, '请选择板块：', {
        reply_markup: {
            inline_keyboard: categoryList
        }
    })
})

async function renderImage(channel, name='') {
    let ret = await query('SELECT time, count FROM news_stat WHERE channel = ' + mysql.escape(channel) )
    ret = ret.map(item => {
        return {
            x: item.time,
            y: item.count
        }
    })
    ret.push({
        x: new Date(),
        y: ret[ret.length - 1].y
    })
    let html = `
    <html>
        <head>
            <meta charset="UTF-8">
            <style>

        <body>
            <div id="myChart"></div>
            <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/echarts/4.1.0/echarts.min.js"></script>
            <!--<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.7.2/Chart.bundle.min.js"></script>-->
            <script>
                var ctx = document.getElementById('myChart')
                var chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        datasets: [{
                            data: ${ JSON.stringify(ret) },
                            label: '${channel}',
                            fill: false,
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgb(54, 162, 235)',
                            steppedLine: true
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            xAxes: [{
                                type: 'time'
                            }]
                        }
                    }
                })
            </script>
        </body>
    </html>
    `
    console.log('The output HTML was ', html)

    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    await page.setViewport({
        width: 1280,
        height: 720,
        deviceScaleFactor: 2.0
    })
    await page.goto(`data:text/html,${html}`)
    const screenshot = await page.screenshot()
    await browser.close()

    return screenshot
}



bot.on('callback_query', async query => {
    if(query.message.date && query.data) {
        let data
        try {
            data = JSON.parse(query.data)
        } catch (err) {
            return
        }

        if(data.type === 'category') {
            // Then we display the channels
            let preList = {}
    
            channels.forEach(channel => {
                if(!preList[channel.category])
                    preList[channel.category] = []
        
                preList[channel.category].push([{
                    text: channel.name,
                    callback_data: JSON.stringify({
                        type: 'channel',
                        data: channel.id
                    })
                }])
            })

            // Valid, and edit the message
            await bot.editMessageText('请选择频道：', {
                message_id: query.message.message_id,
                chat_id: query.message.chat.id
            })
            await bot.editMessageReplyMarkup({
                inline_keyboard: preList[data.data]
            }, {
                message_id: query.message.message_id,
                chat_id: query.message.chat.id
            })

        } else if(data.type === 'channel') {
            // We display the chart
            await bot.editMessageText('正在生成图表，请耐心等待。', {
                message_id: query.message.message_id,
                chat_id: query.message.chat.id
            })
            let screenshot = await renderImage(data.data)
            await bot.sendPhoto(query.message.chat.id, screenshot, {
                filename: 'chart.png'
            })
        }
        await bot.answerCallbackQuery({
            callback_query_id: query.id
        })
    }
})

bot.on('message', msg => {
    const chatId = msg.chat.id
    /* if(chatId != config.owner_id && chatId != config.exi_channel)
        return */

    console.log('Received Message')

    let text
    if(msg.reply_to_message) {
        text = msg.reply_to_message.text
    } else {
        text = msg.text
    }

    if(text) {
        // match weibo for text message
        console.log('message content:' + text)
        let weiboCNRet = pWeiboCN.exec(text) || pWeiboCNNew.exec(text)
        if(weiboCNRet) {
            console.log('matched message', weiboCNRet[1])
            let id = weiboCNRet[1]
            bot.sendMessage(chatId, '今日最新闻，老友一齐滚来微博啦先',
                            {
                                parse_mode: 'Markdown',
                                reply_to_message_id: msg.message_id,
                                disable_notification: true,
                                ...returnWeibo(id)
                            })
        }

        let weicoCCRet = pWeicoCC.exec(text) || pWeicoCCNew.exec(text)
        if(weicoCCRet) {
            console.log('matched message', weicoCCRet[1])
            let id = weicoCCRet[1]
            bot.sendMessage(chatId, '今日最新闻，老友一齐滚来微博啦先',
                            {
                                parse_mode: 'Markdown',
                                reply_to_message_id: msg.message_id,
                                disable_notification: true,
                                ...returnWeibo(id)
                            })
        }
    }
})

bot.on('polling_error', error => {
    console.log('Polling error:' + error.code)
})

init()

/* setInterval(() => {
    fetchLatest()
}, 30000)

fetchLatest() */