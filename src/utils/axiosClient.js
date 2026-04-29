const axios = require('axios');
require("dotenv").config();

let SocksProxyAgent, HttpsProxyAgent;
let agentsLoaded = false;

async function loadAgents() {
    if (agentsLoaded) return;
    try {
        const socksModule = await import('socks-proxy-agent');
        SocksProxyAgent = socksModule.SocksProxyAgent || socksModule.default;
        
        const httpsModule = await import('https-proxy-agent');
        HttpsProxyAgent = httpsModule.HttpsProxyAgent || httpsModule.default || httpsModule.ProxyAgent;
        
        agentsLoaded = true;
    } catch (err) {
        console.warn('[axiosClient] 加载代理模块失败:', err.message);
    }
}

function createAxiosInstance({ proxy, timeout = 15000 }) {
    const config = {
        timeout,
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
    };

    if (proxy && agentsLoaded) {
        const agent =
            proxy.startsWith('socks')
                ? new SocksProxyAgent(proxy)
                : new HttpsProxyAgent(proxy);

        config.httpAgent = agent;
        config.httpsAgent = agent;
    }

    return axios.create(config);
}

async function axiosClient(options) {
    await loadAgents();

    const {
        url,
        method = 'GET',
        params,
        data,
        headers,
        useProxy = false,
        proxy = process.env.PROXY_URL || 'http://127.0.0.1:10808',
    } = options;

    if (useProxy) {
        try {
            const proxyAxios = createAxiosInstance({ proxy });
            const res = await proxyAxios({
                url,
                method,
                params,
                data,
                headers,
            });
            return res;
        } catch (err) {
            console.warn('[axiosClient] 代理失败，切换直连:', err.message);
        }
    }

    const directAxios = createAxiosInstance({});
    return directAxios({
        url,
        method,
        params,
        data,
        headers,
    });
}

module.exports = axiosClient;