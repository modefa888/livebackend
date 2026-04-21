// ********************
// 定义命令列表
// ********************

module.exports = async ($, dbm) => {

    try {
        // 从数据库获取命令列表，按 order 字段排序
        const [commands] = await dbm.execute('SELECT command, description FROM bot_commands WHERE isEnabled = 1 ORDER BY `order` ASC');
        
        // 检查命令列表是否为空
        if (commands.length === 0) {
            $.log('命令列表为空，可能是数据库中没有命令或查询失败', 'warn');
        }
        
        // 设置命令的范围为所有聊天
        await $.bot.setMyCommands(commands, {
            scope: {type: 'all_private_chats'}, // 这里可以是 'all_private_chats', 'all_group_chats', 'all_chat_administrators' 等
        });
        
        $.log('定义命令模块加载完毕。。。');
        $.log(`成功加载 ${commands.length} 个命令`);
    } catch (error) {
        $.log('定义命令模块加载失败 => ' + error.message, 'error');
    }
}

