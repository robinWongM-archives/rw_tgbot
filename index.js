const TelegramBot = require('node-telegram-bot-api'),
      weiboMid = require('weibo-mid')

const config = require('./config.js')
const pWeiboCN = /weibo\.cn\/(?:status|detail)\/(\d+)/i
const pWeicoCC = /weico\.cc\/share\/(?:\d+)\.html\?weibo_id=(\d+)/i
const pWeiboCOM = /weibo\.com\/\d+\/(.+)/i

const got = require('got'),
      cheerio = require('cheerio')

// replace the value below with the Telegram token you receive from @BotFather
const token = config.bot_token;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

let channels = []
config.channels.forEach(category => {
    category.items.forEach(channel => {
        bot.getChat('@' + channel).then(chat => {
            channels.push({
                id: channel,
                name: chat.title,
                category: category.category,
                previousCount: 0,
                count: 0
            })
        })
    })
})

// not ready to preserve the data - only for testing
function fetchCount() {
    for (let i = 0; i < channels.length; i++) {
        let channel = channels[i]
        bot.getChatMembersCount('@' + channel.id).then(count => {
            channel.count = count
            if(channel.previousCount != 0 && channel.previousCount != count) {
                // modified
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
            channel.previousCount = count
            channels[i] = channel
        })
    }
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
            const that = this
            rthkList.push({
                title: $rthk(that).children('a').text(),
                link: $rthk(that).children('a').attr('href'),
                time: $rthk(that).children('.ns2-created').text()
            })
        })

        let output = '#港闻测试 ' + new Date().toISOString().slice(11, 19) + '\n' +
                     '**NOW News** \n'

        for (let i = 0; i < 5; i++) {
            const news = nowNewsJSON[i]
            output = output + '[' + news.title + '](https://news.now.com/home/local/player?newsId=' + news.newsId + ') ' + new Date(news.publishDate).toISOString().slice(11, 19) + '\n'
        }

        output = output + '**NOW News International** \n'

        for (let i = 0; i < 5; i++) {
            const news = nowNewsInternationalJSON[i]
            output = output + '[' + news.title + '](https://news.now.com/home/international/player?newsId=' + news.newsId + ') ' + new Date(news.publishDate).toISOString().slice(11, 19) + '\n'
        }

        output = output + '**RTHK** \n'

        for (let j = 0; j < 5; j++) {
            const news = rthkList[j]
            console.log(news)
            output = output + '[' + news.title + '](' + news.link + ') ' + news.time.slice(15, 20) + '\n'
        }

        bot.sendMessage('@the_BetaNews', output, {
            parse_mode: 'Markdown',
            disable_notification: true
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
        console.log(weiboCNRet)
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
        console.log(weicoCCRet)
        console.log('here???')
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


setInterval(() => {
    fetchCount()
}, 30000)

setInterval(() => {
    fetchLatest()
}, 30000)

fetchLatest()
fetchCount() // initialize