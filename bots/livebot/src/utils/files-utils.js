const fs = require('fs');
const path = require('path');

function downloadAndSaveFile($, file_id, file_name, savePath, userId) {
    // 构建完整的保存路径
    const saveFilePath = path.join(path.resolve(__dirname, savePath), file_name);

    // 创建一个可写流到指定的保存路径
    const fileWriteStream = fs.createWriteStream(saveFilePath);

    // 使用bot的downloadFile方法下载文件，并将内容写入到可写流
    $.bot.downloadFile(file_id, '').then((tempFilePath) => {
        // 读取临时文件内容
        const tempFileReadStream = fs.createReadStream(tempFilePath);

        // 将临时文件内容写入到指定的保存路径
        tempFileReadStream.pipe(fileWriteStream);

        fileWriteStream.on('finish', () => {
            // 删除临时文件
            fs.unlink(tempFilePath, (err) => {
                if (err) {
                    $.log(`删除临时文件${tempFilePath}失败` + err.message, 'error');
                } else {
                    $.log(`临时文件${tempFilePath}已删除`);
                }
            });
            if (savePath === '../utils/otox/'){
                const githubKeyboard = [
                    [
                        {text: 'Push', callback_data: 'github_push'},
                    ]];
                const replyMarkup = {inline_keyboard: githubKeyboard};
                $.bot.sendMessage(userId, `保存文件 *${file_name}* 到 ${savePath} 成功, 是否push？`, {
                    parse_mode: 'Markdown',
                    reply_markup: replyMarkup
                });
            }else {
                $.bot.sendMessage(userId, `保存文件 *${file_name}* 到 ${savePath} 成功！`, $.defTgMsgForm);
            }
            $.log(`File saved to${saveFilePath} 成功！`);
        });

        fileWriteStream.on('error', (err) => {
            $.log(`保存文件${saveFilePath}失败` + err.message, 'error');
            $.bot.sendMessage(userId, `保存文件 *${file_name}* 到 ${savePath} 失败！`, $.defTgMsgForm);
        });
    }).catch((err) => {
        $.log(`下载文件失败` + err.message, 'error');
        $.bot.sendMessage(userId, `下载文件 *${file_name}* 到 ${savePath} 失败！`, $.defTgMsgForm);
    });
}

module.exports = {
    downloadAndSaveFile,
}
