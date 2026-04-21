const ghpages = require('gh-pages');
const path = require('path');
const { loadConfigFromDB } = require('../../config');

async function pushGitHub($, chatId, fpath = './otox') {
    try {
        const config = await loadConfigFromDB();
        
        const token = config[config.environment].github;
        const username = config[config.environment].user.name;
        const email = config[config.environment].user.email;
        
        const repo = `https://${token}@github.com/${username}/otox.git`;
        const branch = 'main';
        
        const filePath = path.join(__dirname, fpath);
        
        ghpages.publish(filePath, {
            repo: repo,
            branch: branch,
            message: 'Automated upload',
            user: {
                name: username,
                email: email
            }
        }, (err) => {
            if (err) {
                $.log('Error uploading to GitHub:' + err, 'error');
                const githubKeyboard = [
                    [
                        {text: '重新Push', callback_data: 'github_push'},
                    ]];
                const replyMarkup = {inline_keyboard: githubKeyboard};
                $.bot.sendMessage(chatId, `push失败，点击重试！`, {
                    parse_mode: 'Markdown',
                    reply_markup: replyMarkup
                });
            } else {
                const message = `【${fpath}】GitHub File uploaded successfully!`;
                $.log(message);
                $.bot.sendMessage(chatId, message, $.defTgMsgForm);
            }
        });
    } catch (error) {
        $.log('加载配置失败:' + error, 'error');
        $.bot.sendMessage(chatId, `加载配置失败: ${error.message}`, $.defTgMsgForm);
    }
}

module.exports = {
    pushGitHub
}
