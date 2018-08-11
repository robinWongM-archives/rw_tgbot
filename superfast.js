const got = require('got'),
      cheerio = require('cheerio')

async function fetchLatest(bot, chatId) {
    try {
        // NOW News Local
        let nowNews = await got('https://news.now.com/api/getNewsListv2?category=119&pageSize=10&pageNo=1').body
        let nowNewsJSON = JSON.parse(nowNews)

        // RTHK News Local
        let rthk = await got('http://news.rthk.hk/rthk/webpageCache/services/loadModNewsShowSp2List.php?lang=zh-TW&cat=3&newsCount=60&dayShiftMode=1&archive_date=').body
        let $rthk = cheerio.load(rthk)
        let rthkList = []

        $rthk('.ns2-inner').each(function(i, elem) {
            rthkList.push({
                title: elem.children('.ns2-title a').text(),
                link: elem.children('.ns2-title a').attr('href'),
                time: elem.children('.ns2-created').text()
            })
        })

        let output = '#港闻测试 ' + new Date().toISOString().slice(11, 19) + '\n' +
                     '**NOW News** \n'

        for (let i = 0; i < 5; i++) {
            const news = nowNewsJSON[i]
            output = output + '[' + news.title + '](https://news.now.com/home/local/player?newsId=' + news.newsId + ') ' + new Date(news.publishDate).toISOString().slice(11, 19) + '\n'
        }

        output = output + '**RTHK** \n'

        for (let j = 0; j < 5; j++) {
            const news = rthkList[j]
            output = output + '[' + news.title + '](https://news.now.com/home/local/player?newsId=' + news.newsId + ') ' + news.time.slice(15, 20) + '\n'
        }

        bot.sendMessage(chatId, output, {
            parse_mode: 'Markdown',
            disable_notification: true
        })

    } catch (err) {
        bot.sendMessage(chatId, '#错误 获取最新新闻时出现问题，错误详情：' + err)
    }
}

module.exports = fetchLatest