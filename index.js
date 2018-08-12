const TelegramBot = require('node-telegram-bot-api'),
      weiboMid = require('weibo-mid')

const config = require('./config.js')
const pWeiboCN = /weibo\.cn\/(?:status|detail)\/(\d+)/i
const pWeicoCC = /weico\.cc\/share\/(?:\d+)\.html\?weibo_id=(\d+)/i
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
    
    let reportJob = schedule.scheduleJob('10 */6 * * * *', async () => {
        let nowTime = moment()
        console.log('[' + moment().tz('Asia/Shanghai').format('YYYY/MM/DD HH:mm:ss') + '] Running 速报')

        output = ''
        preList = {}

        channels.forEach(channel => {
            if(!preList[channel.category])
                preList[channel.category] = []

            preList[channel.category].push(channel)
        })

        switch (nowTime.hour()) {
            case 0:
                output = output + '#港股盘后报道'
                break
            case 6:
                output = output + '#港股盘前报道'
                break
            case 12:
                output = output + '#港股午市报道'
                break
            case 18:
                output = output + '#港股收市报道'
                break
        }

        output = " *" + moment().tz('Asia/Shanghai').format('YYYY/MM/DD [HKT] HH:mm') + '*\n'

        switch (nowTime.hour()) {
            case 0:
                output = output + '截止市场夜宵时间，'
                break
            case 6:
                output = output + '截止市场通宵时分，'
                break
            case 12:
                output = output + '截止上午收盘，'
                break
            case 18:
                output = output + '截止下午收盘，'
                break
        }

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
                list.forEach(async (channel, i, arr) => {
                    let ret = await query('SELECT count FROM news_stat ' +
                                          'WHERE channel = ' + mysql.escape(channel.id) + ' ' +
                                          'AND time <= ' + mysql.escape(moment().subtract('1', 'hours').format("YYYY-MM-DD HH:mm:ss")) + 
                                          'ORDER BY time DESC LIMIT 1')
                    if(!ret) {
                        ret = await query('SELECT count FROM news_stat ' +
                                          'WHERE channel = ' + mysql.escape(channel.id) + ' ' +
                                          'ORDER BY time LIMIT 1')
                    }

                    arr[i].previousCount = ret[0].count
                    listSum.previous += ret[0].count
                    listSum.current += channel.count
                })
                preList[key].sum = listSum
                allSum.previous += listSum.previous
                allSum.current += listSum.current
            }
        }

        output = output + '港股综合指数报 ' + allSum.current + ' 点，'

        if(allSum.previous < allSum.current) {
            // Up
            output = output + '*上涨 ' + (round(((allSum.current - allSum.previous) / allSum.previous) * 100, 2).toFixed(2)) + '% (' + (allSum.current - allSum.previous) + '.00)*'
        } else if(ret.count > channel.count) {
            output = output + '*下跌 ' + (round(((allSum.previous - allSum.current) / allSum.previous) * 100, 2).toFixed(2)) + '% (' + (allSum.current - allSum.previous) + '.00)*'
        } else {
            output = output + '平盘 0.00% (0.00)'
        }

        output = output + '。再来看各个板块的情况：\n'

        for (const key in preList) {
            if (preList.hasOwnProperty(key)) {
                let list = preList[key]
                output = output + '\n#' + key + ' 板块报 ' + list.sum.current + '点，'
                if(list.sum.previous < list.sum.current) {
                    // Up
                    output = output + '*上涨 ' + (round(((list.sum.current - list.sum.previous) / list.sum.previous) * 100, 2).toFixed(2)) + '% (' + (list.sum.current - list.sum.previous) + '.00)*'
                } else if(ret.count > channel.count) {
                    output = output + '*下跌 ' + (round(((list.sum.previous - list.sum.current) / list.sum.previous) * 100, 2).toFixed(2)) + '% (' + (list.sum.current - list.sum.previous) + '.00)*'
                } else {
                    output = output + '平盘 0.00% (0.00)'
                }

                output = output + '\n其中，'

                list.forEach(channel => {
                    output = output + '[' + channel.name + '](https://t.me/' + channel.id + ') 报 ' + channel.count + ' 点，'
                    
                    if(channel.previousCount < channel.count) {
                        // Up
                        output = output + '*上涨 ' + (round(((channel.count - channel.previousCount) / channel.previousCount) * 100, 2).toFixed(2)) + '% (' + (channel.count - channel.previousCount) + '.00)*'
                    } else if(ret.count > channel.count) {
                        output = output + '*下跌 ' + (round(((channel.previousCount - channel.count) / channel.previousCount) * 100, 2).toFixed(2)) + '% (' + (channel.previousCount - channel.count) + '.00)*'
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

bot.onText(/\/weiboid (.+)/, (msg, match) => {
    const chatId = msg.chat.id
    const resp = match[1]

    bot.sendMessage(chatId, 'Try:', returnWeibo(resp))
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
        let weiboCNRet = pWeiboCN.exec(text)
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

        let weicoCCRet = pWeicoCC.exec(text)
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