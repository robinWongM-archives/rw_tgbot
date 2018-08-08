const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.js')

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
                let output = '【' + channel.name + '】分台订阅者人数更新：' + channel.previousCount + ' → ' + channel.count
                bot.sendMessage(config.main_channel, output)
            }
            channel.previousCount = count
            channels[i] = channel
        })
    }
}

// Matches "/echo [whatever]"
bot.onText(/\/echo (.+)/, (msg, match) => {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message

  const chatId = msg.chat.id;
  if(chatId != config.owner_id) return
  const resp = match[1]; // the captured "whatever"

  // send back the matched "whatever" to the chat
  bot.sendMessage(chatId, resp);
});

bot.onText(/\/chat (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    if(chatId != config.owner_id) return
    const resp = match[1]; // the captured "whatever"

    try {
        bot.getChat(resp).then((chat) => {
            bot.sendMessage(chatId, chat.id)
        })
    } catch(err) {
        console.error(err)
    }
})

setInterval(() => {
    fetchCount()
}, 30000)