const $ = require("../../config/includes");
const axios = require("axios")

module.exports = async (token) => {
    // 请求头配置
    const headers = {
        "accept": "*/*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        "content-length": "0",
        "content-type": "application/json",
        "lang": "0",
        "origin": "https://app.gpcchain.org",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Google Chrome\";v=\"123\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"123\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "token": token,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    };

    // API URL 配置
    const urls = {
        balance: "https://api.gpcchain.online/Users/Balance",
        index: "https://api.gpcchain.online/index",
        receiveAnti: "https://api.gpcchain.online/Trade/ReceiveAnti"
    };

    // 获取账户余额信息
    const getBalance = async () => {
        try {
            const response = await axios.post(urls.balance, {},{ headers });
            const { data } = response.data;
            const balanceInfo = data[1];  // 根据实际的响应结构调整
            return {
                coinname: balanceInfo.coinname,
                balance: balanceInfo.balance,
                usdt: balanceInfo.usdt,
                cny: balanceInfo.cny
            };
        } catch (error) {
            $.log("获取余额信息出错:" + error.message, 'error');
            return null;
        }
    };

    // 获取指数信息
    const getIndex = async () => {
        try {
            const response = await axios.post(urls.index, {},{ headers });
            const { data } = response.data;
            return {
                hP_total: data.hP_total,
                unReceive_ANTI: data.unReceive_ANTI,
                receiveCount_total: data.receiveCount_total
            };
        } catch (error) {
            $.log("获取指数信息出错:" + error.message, 'error');
            return null;
        }
    };

    // 获取GPC信息
    const receiveAnti = async () => {
        try {
            const response = await axios.post(urls.receiveAnti, {},{ headers });
            return response.data.msg;
        } catch (error) {
            $.log("领取GPC时出错:" + error.message, 'error');
            return "领取GPC时出错";
        }
    };

    // 主函数，汇总结果
    const main = async () => {
        let result = '当前账户📒\n';

        const balanceData = await getBalance();
        if (balanceData) {
            result += `币🪙 ${balanceData.coinname}, 数量: ${balanceData.balance}, 价值: ${balanceData.usdt}💲/ ${balanceData.cny}¥\n`;
        } else {
            result += "获取余额信息失败。\n";
        }

        const indexData = await getIndex();
        if (indexData) {
            result += `全网算力总量: ${indexData.hP_total}, 待领取: ${indexData.unReceive_ANTI}, 领取人数: ${indexData.receiveCount_total}\n`;
        } else {
            result += "获取指数信息失败。\n";
        }

        const antiMessage = await receiveAnti();
        result += antiMessage === "领取成功" ? antiMessage + " " + indexData.unReceive_ANTI : antiMessage;

        return result;
    };

    return main();
};
