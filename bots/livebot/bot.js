process.env["NTBA_FIX_319"] = 1;
const net = require('net');

// 延迟加载模块 - 只在需要时加载，减少启动时间
let $;
let botRegister;
let ServiceManager;
let argsSet;
let apiHandlers;
let botCommands;
let botSearch;
let botAdmin;
let botChannle;
let botCallbackQuery;
let botTools;
let botHappy;
let botMusic;
let botSetings;
let botMessages;
let serviceManager;
let loadConfigFromDB;

// 预加载核心模块的工厂函数
const loadModules = async () => {
    if (!$) $ = require('./src/config/includes');
    if (!botRegister) botRegister = require('./src/register/bot-register');
    if (!ServiceManager) ServiceManager = require('./src/services').ServiceManager;
    if (!argsSet) argsSet = require('./src/utils/args-utils');
    if (!apiHandlers) apiHandlers = require('./src/spider/index').apiHandlers;
    if (!botCommands) botCommands = require('./src/register/commands-register');
    if (!botSearch) botSearch = require('./src/register/search-register');
    if (!botAdmin) botAdmin = require('./src/register/admin-register');
    if (!botChannle) botChannle = require('./src/register/channle-register');
    if (!botCallbackQuery) botCallbackQuery = require('./src/register/callbackquery-register');
    if (!botTools) botTools = require('./src/register/tools-register');
    if (!botHappy) botHappy = require('./src/register/happy-register');
    if (!botMusic) botMusic = require('./src/register/music-register');
    if (!botSetings) botSetings = require('./src/register/setting-register');
    if (!botMessages) botMessages = require('./src/register/message-register');
    if (!loadConfigFromDB) loadConfigFromDB = require('./config').loadConfigFromDB;
    if (!serviceManager) serviceManager = new ServiceManager();
};

// 检查是否是 Telegram 常见错误的辅助函数
const isTelegramCommonError = (error) => {
    if (error && error.code === 'ETELEGRAM' && error.response && error.response.body) {
        const errorBody = error.response.body;
        return errorBody.description && (
            errorBody.description.includes('chat not found') ||
            errorBody.description.includes('bot was blocked') ||
            errorBody.description.includes('user is deactivated') ||
            errorBody.description.includes('Forbidden')
        );
    }
    return false;
};

// 代理检查函数
const checkProxyConnection = async (proxyUrl) => {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(proxyUrl);
      const host = url.hostname;
      const port = url.port || (url.protocol === 'https:' ? 443 : 80);
      
      const socket = new net.Socket();
      let timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`代理连接超时: ${proxyUrl}`));
      }, 5000);
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`代理连接失败: ${err.message}`));
      });
      
      socket.connect(port, host);
    } catch (error) {
      reject(new Error(`代理地址解析失败: ${error.message}`));
    }
  });
};

// 全局变量，保存机器人状态
let botStatus = {
  isRunning: false,
  error: null
};

// 启动机器人
const startBot = async () => {
  try {
    // 加载所有需要的模块
    await loadModules();
    
    // 从数据库加载配置
    const config = await loadConfigFromDB();
    
    // 传入config
    $.initConfig(config);

    // 从命令行获取一些配置
    argsSet($, config);

    // 检查代理连接（如果配置了代理）
    const proxy = config[config.environment].proxy;
    if (proxy) {
      try {
        $.log(`检查代理连接: ${proxy}`, 'info');
        await checkProxyConnection(proxy);
        $.log('代理连接成功', 'info');
      } catch (error) {
        $.log(`代理连接失败: ${error.message}`, 'error');
        $.log('请检查代理配置或确保代理服务正在运行', 'error');
        botStatus.error = `代理连接失败: ${error.message}`;
        return false;
      }
    } else {
      $.log('未配置代理，跳过代理检查', 'info');
    }

    let dbm;
    // 获取数据源 - 延迟加载数据库模块
    if (config.sourceData === 'mysql'){
        dbm = require('./src/db');
    } else {
        // 对于 sqlite 数据源，提供默认的 dbm 对象
        dbm = {
            testConnection: async () => {
                $.log('使用 sqlite 数据源，跳过数据库连接测试', 'info');
                return true;
            },
            getMessagesAll: async () => [],
            getWeimiList: async () => [],
            getSettings: async () => [],
            getVtbs: async () => [],
            getUser: async () => []
        };
    }
    $.log(`使用数据源【${config.sourceData}】`);

    // 数据库连接测试
    try {
        if (typeof dbm.testConnection !== 'function') {
            throw new Error('数据库模块缺少testConnection方法');
        }

        const isConnected = await dbm.testConnection();
        if (!isConnected) {
            throw new Error('连接测试未通过');
        }

        $.log('数据库连接测试成功', 'info');
    } catch (error) {
        $.log(`数据库连接失败: ${error.message}`, 'error');
        $.log('请检查数据库配置文件是否正确', 'error');
        botStatus.error = error.message;
        return false;
    }

    // 初始化服务层
    serviceManager.initialize($, dbm);
    $.log('服务层初始化完成', 'info');

    // 启动机器人 polling
    await $.bot.startPolling();
    $.log( "机器人: " + config[config.environment].appName + ' 已启动！🎉');
    botStatus.isRunning = true;
    botStatus.error = null;
    
    // 注册所有模块
    botRegister($, dbm, apiHandlers, config);
    botSearch($, dbm, config);
    botHappy($, dbm, config);
    botAdmin($, dbm, config, apiHandlers);
    botCallbackQuery($, dbm, config);
    botChannle($, dbm, config);
    botTools($, dbm, config);
    botMusic($, dbm);
    botSetings($, dbm);
    botMessages($, dbm);

    // 加载监控+通知模块
    require("./src/utils/monitor-utils")($, dbm, apiHandlers, config);
    require("./src/utils/readLine-utils")($);

    // 设置命令菜单
    await botCommands($, dbm);

    // 包装 sendMessage 方法
    const originalSendMessage = $.bot.sendMessage.bind($.bot);
    $.bot.sendMessage = async function(chatId, text, options = {}) {
        try {
            const result = await originalSendMessage(chatId, text, options);
            $.recordSendMessage(chatId, text, 'text');
            return result;
        } catch (error) {
            if (isTelegramCommonError(error)) {
                $.log(`发送消息失败: ${error.response.body.description} (chatId: ${chatId})`, 'warn');
                return null;
            }
            throw error;
        }
    };

    // 监听polling_error事件 - 使用节流
    let lastErrorTime = 0;
    let errorCount = 0;
    $.bot.on('polling_error', (error) => {
        const now = Date.now();
        if (now - lastErrorTime > 60000) {
            $.log('Telegram polling error occurred: ' + error.message, 'error');
            lastErrorTime = now;
            errorCount = 1;
        } else if (errorCount === 1) {
            $.log('Telegram polling error is still occurring. Will suppress further error messages for 1 minute.', 'error');
            errorCount++;
        }
    });

    return true;
  } catch (error) {
    if ($ && $.log) {
        $.log(`机器人启动失败: ${error.message}`, 'error');
    } else {
        console.error(`机器人启动失败: ${error.message}`);
    }
    botStatus.error = error.message;
    return false;
  }
};

// 停止机器人
const stopBot = async () => {
  try {
    if ($.bot && botStatus.isRunning) {
      await $.bot.stopPolling();
      $.log('机器人已停止', 'info');
      botStatus.isRunning = false;
      return true;
    }
    return false;
  } catch (error) {
    $.log(`停止机器人失败: ${error.message}`, 'error');
    return false;
  }
};

// 获取机器人状态
const getBotStatus = () => {
  return botStatus;
};

// 获取环境配置
const getEnvConfig = async () => {
  try {
    // 确保模块已加载
    if (!loadConfigFromDB) {
      await loadModules();
    }
    const config = await loadConfigFromDB();
    return {
      environment: config.environment,
      appName: config[config.environment].appName,
      botToken: config[config.environment].token,
      proxy: config[config.environment].proxy
    };
  } catch (error) {
    console.error('获取环境配置失败:', error);
    throw error;
  }
};

// 命令管理 - 延迟加载数据库
let db;

const getDB = () => {
    if (!db) db = require('../../config/db');
    return db;
};

// 获取命令列表
const getCommands = async () => {
  try {
    const [commands] = await getDB().execute('SELECT command, description FROM bot_commands WHERE isEnabled = 1');
    return commands;
  } catch (error) {
    console.error('获取命令列表失败:', error);
    return [];
  }
};

// 添加命令
const addCommand = async (command) => {
  try {
    const [existingCommands] = await getDB().execute('SELECT * FROM bot_commands WHERE command = ?', [command.command]);
    if (existingCommands.length > 0) {
      return false;
    }
    await getDB().execute('INSERT INTO bot_commands (command, description, isEnabled, isAdmin) VALUES (?, ?, ?, ?)', [command.command, command.description, command.isEnabled || true, command.isAdmin || false]);
    return true;
  } catch (error) {
    console.error('添加命令失败:', error);
    return false;
  }
};

// 删除命令
const deleteCommand = async (commandName) => {
  try {
    const [result] = await getDB().execute('DELETE FROM bot_commands WHERE command = ?', [commandName]);
    return result.affectedRows > 0;
  } catch (error) {
    console.error('删除命令失败:', error);
    return false;
  }
};

// 更新命令
const updateCommand = async (commandName, newCommand) => {
  try {
    const [result] = await getDB().execute('UPDATE bot_commands SET description = ?, isEnabled = ?, isAdmin = ? WHERE command = ?', [newCommand.description, newCommand.isEnabled, newCommand.isAdmin, commandName]);
    return result.affectedRows > 0;
  } catch (error) {
    console.error('更新命令失败:', error);
    return false;
  }
};

// 更新机器人命令
const updateBotCommands = async () => {
  if ($ && $.bot) {
    try {
      const commands = await getCommands();
      await $.bot.setMyCommands(commands, {
        scope: {type: 'all_private_chats'}
      });
      return true;
    } catch (error) {
      console.error('更新机器人命令失败:', error);
      return false;
    }
  }
  return false;
};

// 发送消息
const sendMessage = async (chatId, text, options = {}) => {
  if ($ && $.bot) {
    try {
      return await $.sendMessageSafe(chatId, text, { parse_mode: 'HTML', ...options });
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }
  throw new Error('机器人未初始化');
};

// 导出函数，方便其他模块使用初始化后的 bot 实例
module.exports = {
  startBot,
  stopBot,
  getBotStatus,
  getEnvConfig,
  getCommands,
  addCommand,
  deleteCommand,
  updateCommand,
  updateBotCommands,
  sendMessage,
  botStatus, // 导出状态对象，方便其他模块直接访问
  get$: () => $ // 导出函数，返回初始化后的 $ 对象
};
