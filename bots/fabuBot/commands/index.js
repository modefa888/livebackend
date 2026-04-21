const { info, error, logBotAction } = require('../utils/logger.js');

module.exports = async ($, pool) => {
    try {
        info('[faBuBot] 开始加载命令模块...');
        
        // 检查是否有 command_type 字段
        const [columns] = await pool.execute("SHOW COLUMNS FROM fabubot_commands LIKE 'command_type'");
        const hasCommandType = columns.length > 0;
        
        let botCommands = [];
        let groupCommands = [];
        
        if (hasCommandType) {
            // 分别获取机器人命令和群组命令
            const [botResult] = await pool.execute('SELECT command, description FROM fabubot_commands WHERE isEnabled = 1 AND command_type = \'bot\' ORDER BY `order` ASC');
            const [groupResult] = await pool.execute('SELECT command, description FROM fabubot_commands WHERE isEnabled = 1 AND command_type = \'group\' ORDER BY `order` ASC');
            botCommands = botResult;
            groupCommands = groupResult;
            info(`[faBuBot] 成功加载 ${botCommands.length} 个机器人命令，${groupCommands.length} 个群组命令`);
        } else {
            // 兼容旧版本，所有命令都设置
            const [allCommands] = await pool.execute('SELECT command, description FROM fabubot_commands WHERE isEnabled = 1 ORDER BY `order` ASC');
            botCommands = allCommands;
            groupCommands = allCommands;
            info(`[faBuBot] 成功加载 ${allCommands.length} 个命令（兼容模式）`);
        }
        
        // 设置私人聊天命令（机器人命令）
        if (botCommands.length > 0) {
            await $.bot.setMyCommands(botCommands, {
                scope: {type: 'all_private_chats'},
            });
            info('[faBuBot] 私人聊天命令设置成功');
        }
        
        // 设置群组聊天命令（群组命令）
        if (groupCommands.length > 0) {
            await $.bot.setMyCommands(groupCommands, {
                scope: {type: 'all_group_chats'},
            });
            info('[faBuBot] 群组聊天命令设置成功');
        }
        
        // 同时设置所有聊天的命令（兼容）
        if (hasCommandType) {
            const [allCommands] = await pool.execute('SELECT command, description FROM fabubot_commands WHERE isEnabled = 1 ORDER BY `order` ASC');
            if (allCommands.length > 0) {
                await $.bot.setMyCommands(allCommands);
            }
        }
        
        info('[faBuBot] 命令模块加载完毕');
    } catch (err) {
        error('[faBuBot] 命令模块加载失败 => ' + err.message, err);
    }
}
