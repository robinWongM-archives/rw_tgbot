const TelegramBot = require('node-telegram-bot-api'),
      weiboMid = require('weibo-mid')

const config = require('./config.js')
const pWeiboCN = /weibo\.cn\/(?:status|detail)\/(\d+)/i
const pWeiboCOM = /weibo\.com\/\d+\/(.+)/i

// replace the value below with the Telegram token you receive from @BotFather
const token = config.bot_token;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

let channels = []
config.channels.forEach(channel => {
    bot.getChat(channel).then(chat => {
        channels.push({
            id: channel,
            name: chat.title,
            previousCount: 0,
            count: 0
        })
    })
})

// not ready to preserve the data - only for testing
function fetchCount() {
    for (let i = 0; i < channels.length; i++) {
        let channel = channels[i]
        bot.getChatMembersCount(channel.id).then(count => {
            channel.count = count
            if(channel.previousCount != 0 && channel.previousCount != count) {
                // modified
                let output = '#分台订阅者人数 【' + channel.name + '】' + channel.previousCount + ' → ' + channel.count
                bot.sendMessage(config.main_channel, output, {
                    disable_notification: true
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
                [{
                    text: '微博 HTML5 版 打开',
                    url: 'https://m.weibo.cn/status/' + id
                }],
                [{
                    text: '微博 APP 打开（通用）',
                    url: 'https://service.rwong.cc/tg_bot/weibo/' + id
                }],
                [{
                    text: '微博国际版 打开',
                    url: 'https://service.rwong.cc/tg_bot/weico/' + id
                }]
            ]
        }
    }
}

bot.onText(/\/weiboid (.+)/, (msg, match) => {
    const chatId = msg.chat.id
    const resp = match[1]

    bot.sendMessage(chatId, 'Try:', returnWeibo(resp))
})

bot.on('message', msg => {
    const chatId = msg.chat.id
    if(chatId != config.owner_id && chatId != config.exi_channel)
        return

    console.log('Received Message')

    let text
    if(msg.reply_to_message) {
        text = msg.reply_to_message.text
    } else {
        text = msg.text
    }

    console.log('message content:' + text)

    // match weibo
    let ret = pWeiboCN.exec(text)
    if(ret.length > 1) {
        console.log('matched message', ret[1])
        let id = ret[1]
        bot.sendMessage(chatId, '点击链接调起微博 APP：', {
            reply_to_message_id: msg.message_id,
            ...returnWeibo(id)
        })
    }
    
})


setInterval(() => {
    fetchCount()
}, 30000)

fetchCount() // initialize