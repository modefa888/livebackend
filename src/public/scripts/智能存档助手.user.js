// ==UserScript==
// @name         智能存档助手
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  带侧边栏的智能存档工具 - 美化版
// @author       Your Name
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      180.184.79.211
// @connect      127.0.0.1
// ==/UserScript==

/********************* 站点规则配置 ********************/
const siteRules = [
    ['cm91LnZpZGVv', 'meta[property="og:image"]', 'content', '', ''],
    ['cm91dno2Lnh5eg==', 'meta[property="og:image"]', 'content', '', ''],
    ['OTFwb3JuLmNvbQ==', 'div[id="player_one"]', 'poster', '', ''],
    ['c3BhbmtiYW5nLmNvbQ==', 'img[id="player_cover_img"]', 'data-src', '', ''],
    ['OTFwb3JuYS5jb20=', 'div[id="mse"]', 'data-poster', 'https://daily-api-amber.vercel.app/51cg/img?url=', ''],
    ['Y24ucG9ybmh1Yi5jb20=', 'meta[property="og:image"]', 'content', '', ''],
    ['d3d3Lnh2aWRlb3MuY29t', 'div[class="video-pic"] img', 'src', '', ''],
    ['OTFwaW5zZS5jb20=', 'meta[property="og:image"]', 'content', '', ''],
    ['L2FyY2hpdmVzLw==', 'div[class="post-content"] p img', 'data-xkrkllgl', 'https://daily-api-amber.vercel.app/51cg/img?url=', ''],
    ['L2FyY2hpdmVzLw==', 'video[class="dplayer-video dplayer-video-current"]', 'poster', 'https://daily-api-amber.vercel.app/51cg/img?url=', ''],
    ['L3ZpZGVvLw==', 'div[class="vjs-poster"]', 'style', '', ''],
    ['YXJjaGl2ZWJhdGUuYmxvZy93YXRjaC8=', 'div[class="vjs-poster"] img', 'src', '', ''],
    ['d3d3Ljc4ZG9yay5jb20vaW5kZXgucGhwL3ZvZC9wbGF5L2lkLw==', 'div[class="art-poster"]', 'style', '', ''],
    ['d3d3LnBvcm5sdWx1LmNvbS96aC1oYW5zL3Yv', 'div[class="art-poster"]', 'style', '', ''],
    ['YXZwbGUuYXBwL3ZpZGVvLw==', 'div[class="plyr__poster"]', 'style', '', ''],
    ['eDNjMS5jb20vdmlkZW9zLw==', 'div[class="fp-poster"] img', 'src', '', ''],
    ['Y2RuMjAxMS5jb20=', 'div[class*="cover"]', 'style', '', ''],
    ['d3d3Lnlhc2V0dWJlLmNvbS92aWRlby8=', 'video[class="vjs-tech"]', 'poster', '', ''],
    ['MThqLnR2L3Y=', 'div[class="plyr__poster"]', 'style', '', ''],
    ['emguc3RyaXBjaGF0LmNvbQ==', 'meta[property="og:image"]', 'content', '', ''],
    ['a2FuYXYuYWQvaW5kZXgucGhwL3ZvZC9wbGF5L2lkLw==', 'img[class="countext-img"]', 'src', '', ''],
    ['enpiZndva2UuY29tL2NvbWljL2luZGV4L2RldGFpbA==', 'meta[property="og:image"]', 'content', '', ''],
    ['eGlhb3lha2Fua2FuLmNvbS9wb3N0Lw==', 'div[class="m4-vod"] img', 'src', '', ''],
    ['d3d3LnBhcGFsYWguY29tL3Y=', 'meta[property="og:image"]', 'content', '', ''],
];

/********************* 控制台美化输出模块 ********************/
const ConsoleLogger = {
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
    info: '#2196F3',
    title: '#9C27B0',
    
    log(title, data, type = 'info') {
        const colors = {
            success: this.success,
            warning: this.warning,
            error: this.error,
            info: this.info
        };
        
        console.group('%c 📦 ' + title, 'color: ' + this.title + '; font-weight: bold; font-size: 14px;');
        if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                if (value) {
                    console.log('%c ✓ ' + key + ':', 'color: ' + colors[type] + '; font-weight: 500;', value);
                } else {
                    console.log('%c ✗ ' + key + ':', 'color: ' + this.error + '; font-weight: 500;', '未获取到');
                }
            }
        } else {
            console.log('%c ' + data, 'color: ' + colors[type] + ';');
        }
        console.groupEnd();
    },
    
    logPageInfo(title, cover, m3u8List) {
        console.clear();
        console.log('%c ┌─────────────────────────────────────────────────────────┐', 'color: #607D8B;');
        console.log('%c │              🎯 智能存档助手 - 数据获取报告              │', 'color: #607D8B;');
        console.log('%c └─────────────────────────────────────────────────────────┘', 'color: #607D8B;');
        console.log('');
        
        console.group('%c 📄 页面信息', 'color: #1976D2; font-weight: bold;');
        console.log('%c 标题:', 'color: #42A5F5; font-weight: 500;', title ? '%c ' + title : '%c ❌ 未获取到', title ? 'color: #4CAF50;' : 'color: #F44336;');
        console.log('%c URL:', 'color: #42A5F5; font-weight: 500;', '%c ' + window.location.href, 'color: #66BB6A;');
        console.groupEnd();
        
        console.group('%c 🖼️ 封面信息', 'color: #1E88E5; font-weight: bold;');
        if (cover) {
            console.log('%c 封面地址:', 'color: #64B5F6; font-weight: 500;', cover);
            console.log('%c 预览:', 'color: #64B5F6; font-weight: 500;');
            console.log('%c ┌─────────────────────────────────────────────────────┐', 'color: #90CAF9;');
            console.log('%c │ ' + cover.slice(0, 60) + (cover.length > 60 ? '...' : '') + ' │', 'color: #90CAF9;');
            console.log('%c └─────────────────────────────────────────────────────┘', 'color: #90CAF9;');
        } else {
            console.log('%c ❌ 封面地址: 未获取到', 'color: #EF5350; font-weight: 500;');
        }
        console.groupEnd();
        
        console.group('%c 🎬 m3u8 地址列表', 'color: #00897B; font-weight: bold;');
        if (m3u8List && m3u8List.length > 0) {
            console.log('%c ✅ 成功捕获 ' + m3u8List.length + ' 条 m3u8 地址', 'color: #66BB6A; font-weight: 500;');
            m3u8List.forEach((url, index) => {
                console.log('%c [' + (index + 1) + ']', 'color: #FFA726; font-weight: bold;', url);
            });
        } else {
            console.log('%c ⏳ 等待捕获 m3u8 地址...', 'color: #FFA726; font-weight: 500;');
        }
        console.groupEnd();
        
        console.log('');
        console.log('%c ┌─────────────────────────────────────────────────────────┐', 'color: #607D8B;');
        console.log('%c │              💡 提示: 点击左侧侧边栏保存数据             │', 'color: #607D8B;');
        console.log('%c └─────────────────────────────────────────────────────────┘', 'color: #607D8B;');
    }
};

(function() {
    'use strict';

    // 注入美化样式
    function injectStyles() {
        if (document.getElementById('smart-archive-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'smart-archive-styles';
        style.textContent = `
            #smart-archive-sidebar {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            #smart-archive-sidebar .sa-btn {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 10px 14px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                color: white;
                transition: all 0.3s ease;
                overflow: hidden;
            }
            
            #smart-archive-sidebar .sa-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            
            #smart-archive-sidebar .sa-btn:active {
                transform: translateY(0);
            }
            
            #smart-archive-sidebar .sa-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none !important;
            }
            
            #smart-archive-sidebar .sa-btn.loading {
                pointer-events: none;
            }
            
            #smart-archive-sidebar .sa-btn .sa-spinner {
                display: none;
                width: 14px;
                height: 14px;
                border: 2px solid rgba(255,255,255,0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: sa-spin 0.8s linear infinite;
            }
            
            #smart-archive-sidebar .sa-btn.loading .sa-spinner {
                display: inline-block;
            }
            
            #smart-archive-sidebar .sa-btn.loading .sa-icon {
                display: none;
            }
            
            @keyframes sa-spin {
                to { transform: rotate(360deg); }
            }
            
            #smart-archive-sidebar .sa-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            
            #smart-archive-sidebar .sa-btn-primary:hover {
                background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
            }
            
            #smart-archive-sidebar .sa-btn-success {
                background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            }
            
            #smart-archive-sidebar .sa-btn-success:hover {
                background: linear-gradient(135deg, #0e8a7d 0%, #2fd66d 100%);
            }
            
            #smart-archive-sidebar .sa-btn-warning {
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            }
            
            #smart-archive-sidebar .sa-btn-warning:hover {
                background: linear-gradient(135deg, #e085e8 0%, #e04a5f 100%);
            }
            
            #smart-archive-sidebar .sa-btn-info {
                background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            }
            
            #smart-archive-sidebar .sa-btn-info:hover {
                background: linear-gradient(135deg, #3e9ae6 0%, #00dce0 100%);
            }
            
            #smart-archive-sidebar .sa-btn-purple {
                background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
            }
            
            #smart-archive-sidebar .sa-btn-purple:hover {
                background: linear-gradient(135deg, #9647e5 0%, #5559e4 100%);
            }
            
            #smart-archive-sidebar .sa-status {
                padding: 8px 10px;
                border-radius: 8px;
                font-size: 11px;
                text-align: center;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            
            #smart-archive-sidebar .sa-status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                animation: sa-pulse 2s infinite;
            }
            
            #smart-archive-sidebar .sa-status.online {
                background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
                color: #166534;
            }
            
            #smart-archive-sidebar .sa-status.online .sa-status-dot {
                background: #22c55e;
            }
            
            #smart-archive-sidebar .sa-status.offline {
                background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                color: #991b1b;
            }
            
            #smart-archive-sidebar .sa-status.offline .sa-status-dot {
                background: #ef4444;
            }
            
            @keyframes sa-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            #smart-archive-sidebar .sa-stars {
                display: flex;
                justify-content: center;
                gap: 4px;
                padding: 12px 0;
                margin-top: 8px;
                border-top: 1px solid #f0f0f0;
            }
            
            #smart-archive-sidebar .sa-star {
                font-size: 24px;
                cursor: pointer;
                transition: all 0.2s ease;
                color: #e5e7eb;
                text-shadow: none;
            }
            
            #smart-archive-sidebar .sa-star:hover {
                transform: scale(1.3);
            }
            
            #smart-archive-sidebar .sa-star.active {
                color: #fbbf24;
                text-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
            }
            
            #smart-archive-sidebar .sa-trigger {
                position: absolute;
                right: -28px;
                top: 50%;
                transform: translateY(-50%);
                width: 28px;
                height: 44px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 0 10px 10px 0;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 16px;
                color: white;
                box-shadow: 2px 2px 8px rgba(102, 126, 234, 0.4);
                transition: all 0.3s ease;
            }
            
            #smart-archive-sidebar .sa-trigger:hover {
                background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
                box-shadow: 2px 2px 12px rgba(102, 126, 234, 0.6);
            }
            
            #smart-archive-sidebar .sa-divider {
                height: 1px;
                background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
                margin: 6px 0;
            }
            
            #smart-archive-sidebar .sa-tooltip {
                position: absolute;
                left: calc(100% + 10px);
                top: 50%;
                transform: translateY(-50%);
                background: rgba(0,0,0,0.85);
                color: white;
                padding: 6px 10px;
                border-radius: 6px;
                font-size: 12px;
                white-space: nowrap;
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease;
                z-index: 10000;
            }
            
            #smart-archive-sidebar .sa-trigger:hover .sa-tooltip {
                opacity: 1;
                visibility: visible;
            }
        `;
        document.head.appendChild(style);
    }

    let capturedM3u8List = [];
    let m3u8IndicatorEl = null;

    // 检查当前URL是否匹配任何站点规则
    function isSiteMatched() {
        const currentUrl = window.location.href;
        try {
            for (const [base64Path] of siteRules) {
                if (currentUrl.includes(atob(base64Path))) {
                    return true;
                }
            }
        } catch (error) {
            console.error('检查站点匹配失败:', error);
        }
        return false;
    }

    // 配置项
    const HOST = 'http://180.184.79.211:8888/api';
    const TOKEN = 'your_api_secret';
    const SIDEBAR_WIDTH = 190;
    const COLLAPSE_TIMEOUT = 15000;
    const ANIMATION_DURATION = 300;

    let sidebarTimeout;
    let isExpanded = false;
    let apiConnected = true;

    // 创建侧边栏容器
    function createSidebarContainer() {
        injectStyles();
        
        const container = document.createElement('div');
        container.id = 'smart-archive-sidebar';
        Object.assign(container.style, {
            position: 'fixed',
            top: '80px',
            left: '-' + SIDEBAR_WIDTH + 'px',
            width: SIDEBAR_WIDTH + 'px',
            padding: '16px',
            backgroundColor: 'rgba(255,255,255,0.98)',
            borderRadius: '0 16px 16px 0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            transition: 'left ' + ANIMATION_DURATION + 'ms cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            border: '1px solid rgba(0,0,0,0.05)'
        });
        return container;
    }

    // 创建触发按钮
    function createTriggerButton() {
        const trigger = document.createElement('div');
        trigger.id = 'sidebar-trigger';
        trigger.className = 'sa-trigger';
        trigger.innerHTML = '❯';
        trigger.setAttribute('data-tip', '点击展开');
        return trigger;
    }

    // 创建操作按钮
    function createActionButton(text, className) {
        const button = document.createElement('button');
        button.className = 'sa-btn ' + className;
        button.innerHTML = '<span class="sa-icon">' + text + '</span><span class="sa-spinner"></span>';
        return button;
    }

    // 创建状态提示区域
    function createStatusIndicator() {
        const container = document.createElement('div');
        container.id = 'api-status-indicator';
        container.className = 'sa-status online';
        container.innerHTML = '<span class="sa-status-dot"></span><span class="sa-status-text">后端连接正常</span>';
        return container;
    }

    // 更新状态提示
    function updateStatusIndicator(connected) {
        const indicator = document.getElementById('api-status-indicator');
        if (!indicator) return;
        
        apiConnected = connected;
        
        if (connected) {
            indicator.className = 'sa-status online';
            indicator.innerHTML = '<span class="sa-status-dot"></span><span class="sa-status-text">后端连接正常</span>';
        } else {
            indicator.className = 'sa-status offline';
            indicator.innerHTML = '<span class="sa-status-dot"></span><span class="sa-status-text">后端连接失败</span>';
        }
    }

    // 创建星级评分
    function createStarRating(initialRating = 0) {
        const container = document.createElement('div');
        container.className = 'sa-stars';

        const updateStars = (rating) => {
            container.querySelectorAll('.sa-star').forEach((star, index) => {
                if (index < rating) {
                    star.classList.add('active');
                } else {
                    star.classList.remove('active');
                }
            });
        };

        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('span');
            star.innerHTML = '★';
            star.className = 'sa-star' + (i <= initialRating ? ' active' : '');
            star.dataset.value = i;

            star.addEventListener('mouseenter', () => {
                star.style.transform = 'scale(1.4)';
            });
            star.addEventListener('mouseleave', () => {
                star.style.transform = 'scale(1)';
            });

            star.addEventListener('click', async () => {
                if (!apiConnected) {
                    showToast('⚠️', '后端未连接，无法更新评分');
                    return;
                }
                
                updateStars(i);
                
                try {
                    await apiClient.updateRating({
                        pageHref: location.href,
                        rating: i
                    });
                    showToast('✅', '评分更新成功');
                } catch {
                    showToast('❌', '评分更新失败');
                }
            });

            container.appendChild(star);
        }

        container.updateRating = updateStars;
        return container;
    }

    // 显示Toast提示
    function showToast(icon, message) {
        const toast = document.createElement('div');
        toast.innerHTML = '<span style="margin-right:8px">' + icon + '</span><span>' + message + '</span>';
        Object.assign(toast.style, {
            position: 'fixed',
            top: '120px',
            right: '20px',
            padding: '14px 20px',
            background: 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(30,30,30,0.95) 100%)',
            color: 'white',
            borderRadius: '12px',
            fontSize: '14px',
            zIndex: '99999',
            display: 'flex',
            alignItems: 'center',
            animation: 'saToastIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)'
        });
        
        const style = document.createElement('style');
        style.textContent = '@keyframes saToastIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes saToastOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100px); opacity: 0; } }';
        document.head.appendChild(style);
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'saToastOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // 侧边栏控制
    function toggleSidebar(expand) {
        const sidebar = document.getElementById('smart-archive-sidebar');
        const trigger = document.getElementById('sidebar-trigger');
        if (!sidebar) return;

        isExpanded = expand !== undefined ? expand : !isExpanded;
        sidebar.style.left = isExpanded ? '0' : '-' + SIDEBAR_WIDTH + 'px';
        trigger.innerHTML = isExpanded ? '❮' : '❯';
        trigger.setAttribute('data-tip', isExpanded ? '点击收起' : '点击展开');
        resetSidebarTimer();
    }

    function resetSidebarTimer() {
        clearTimeout(sidebarTimeout);
        if (isExpanded) {
            sidebarTimeout = setTimeout(() => toggleSidebar(false), COLLAPSE_TIMEOUT);
        }
    }

    // 获取页面封面
    function getPageCover() {
        try {
            const currentUrl = window.location.href;
            for (const [base64Path, selector, attr, pre] of siteRules) {
                if (currentUrl.includes(atob(base64Path))) {
                    const element = document.querySelector(selector);
                    if (!element) continue;
                    
                    let imageUrl = element.getAttribute(attr);
                    
                    if (attr === 'style' && imageUrl) {
                        const match = imageUrl.match(/background-image:\s*url\(["']?([^"']+)["']?\)/i);
                        imageUrl = match ? match[1] : null;
                    }
                    
                    if (imageUrl) {
                        return pre + imageUrl;
                    }
                }
            }
        } catch (error) {
            console.error('获取封面失败:', error);
        }
        return null;
    }

    // API客户端
    const apiClient = {
        checkExists(pageHref) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: HOST + '/check_existence?pageHref=' + encodeURIComponent(pageHref),
                    headers: { 'Authorization': 'Bearer ' + TOKEN },
                    timeout: 5000,
                    onload: response => {
                        updateStatusIndicator(true);
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch {
                            reject(new Error('解析响应失败'));
                        }
                    },
                    onerror: () => {
                        updateStatusIndicator(false);
                        reject(new Error('网络错误'));
                    }
                });
            });
        },

        saveData(data) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: HOST + '/save_data',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + TOKEN
                    },
                    timeout: 10000,
                    data: JSON.stringify(data),
                    onload: response => {
                        updateStatusIndicator(true);
                        resolve(response);
                    },
                    onerror: () => {
                        updateStatusIndicator(false);
                        reject(new Error('网络错误'));
                    }
                });
            });
        },

        deleteData(pageHref) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: HOST + '/delete_by_href',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + TOKEN
                    },
                    timeout: 5000,
                    data: JSON.stringify({ pageHref: encodeURIComponent(pageHref) }),
                    onload: response => {
                        updateStatusIndicator(true);
                        resolve(response);
                    },
                    onerror: () => {
                        updateStatusIndicator(false);
                        reject(new Error('网络错误'));
                    }
                });
            });
        },

        updateRating(data) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: HOST + '/update_rating',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + TOKEN
                    },
                    timeout: 5000,
                    data: JSON.stringify(data),
                    onload: response => {
                        updateStatusIndicator(true);
                        resolve(response.status === 200);
                    },
                    onerror: () => {
                        updateStatusIndicator(false);
                        reject(new Error('网络错误'));
                    }
                });
            });
        }
    };

    // 复制数据到剪贴板
    function copyPageData(pageInfo) {
        const data = {
            title: pageInfo.title,
            url: pageInfo.href,
            cover: pageInfo.cover,
            m3u8List: pageInfo.m3u8(),
            timestamp: new Date().toISOString()
        };
        
        try {
            navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
                showToast('✅', '数据复制成功');
            }).catch(() => {
                fallbackCopy(data);
            });
        } catch {
            fallbackCopy(data);
        }
    }

    function fallbackCopy(data) {
        const textarea = document.createElement('textarea');
        textarea.value = JSON.stringify(data, null, 2);
        Object.assign(textarea.style, {
            position: 'fixed',
            left: '-9999px'
        });
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            showToast('✅', '数据复制成功');
        } catch {
            showToast('❌', '复制失败');
        }
        
        document.body.removeChild(textarea);
    }

    // m3u8 状态指示器
    function createM3u8Indicator() {
        const exist = document.getElementById('m3u8-indicator');
        if (exist) return exist;

        const btn = createActionButton('▶️ m3u8', 'sa-btn-info');
        btn.id = 'm3u8-indicator';
        btn.style.opacity = '0.6';
        btn.style.fontSize = '12px';

        btn.addEventListener('click', () => {
            if (!capturedM3u8List.length) return;
            playM3u8(capturedM3u8List[0]);
        });

        return btn;
    }

    function updateM3u8Indicator(list) {
        if (!m3u8IndicatorEl) {
            m3u8IndicatorEl = document.getElementById('m3u8-indicator');
        }
        if (!m3u8IndicatorEl) return;

        if (list.length > 0) {
            m3u8IndicatorEl.innerHTML = '<span class="sa-icon">▶️ m3u8 (' + list.length + ')</span><span class="sa-spinner"></span>';
            m3u8IndicatorEl.style.opacity = '1';
            m3u8IndicatorEl.style.cursor = 'pointer';
        } else {
            m3u8IndicatorEl.innerHTML = '<span class="sa-icon">▶️ 等待m3u8</span><span class="sa-spinner"></span>';
            m3u8IndicatorEl.style.opacity = '0.6';
            m3u8IndicatorEl.style.cursor = 'not-allowed';
        }
    }

    // m3u8 播放器
    function playM3u8(url) {
        const mask = document.createElement('div');
        Object.assign(mask.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,.85)',
            zIndex: '999999',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });

        const box = document.createElement('div');
        Object.assign(box.style, {
            width: '80%',
            maxWidth: '900px',
            background: '#000',
            padding: '16px',
            borderRadius: '12px'
        });

        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.style.width = '100%';
        video.style.borderRadius = '8px';

        box.appendChild(video);
        mask.appendChild(box);
        document.body.appendChild(mask);

        mask.onclick = e => { if (e.target === mask) mask.remove(); };

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
        } else {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
            s.onload = () => {
                const hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
            };
            document.head.appendChild(s);
        }
    }

    function addM3u8(url) {
        if (!url || capturedM3u8List.includes(url)) return;
        capturedM3u8List.push(url);
        updateM3u8Indicator(capturedM3u8List);
        ConsoleLogger.logPageInfo(document.title, getPageCover(), capturedM3u8List);
    }

    // XHR 拦截 - 同时监测 m3u8 和 mp4
    const rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (typeof url === 'string' && (url.includes('.m3u8') || url.includes('.mp4'))) {
            addM3u8(url);
            console.log('🎬 媒体地址:', url);
        }
        return rawOpen.call(this, method, url, ...rest);
    };

    // 设置按钮加载状态
    function setButtonLoading(button, loading) {
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }

    // 主逻辑
    async function main() {
        const pageInfo = {
            title: document.title,
            href: location.href,
            cover: getPageCover(),
            m3u8: () => capturedM3u8List.slice()
        };

        ConsoleLogger.logPageInfo(pageInfo.title, pageInfo.cover, capturedM3u8List);

        const sidebar = createSidebarContainer();
        const trigger = createTriggerButton();
        const statusIndicator = createStatusIndicator();
        const uploadBtn = createActionButton('💾 保存', 'sa-btn-primary');
        const deleteBtn = createActionButton('🗑️ 删除', 'sa-btn-warning');
        const copyBtn = createActionButton('📋 复制数据', 'sa-btn-purple');
        const refreshBtn = createActionButton('🔄 刷新', 'sa-btn-info');
        const starRating = createStarRating(0);

        m3u8IndicatorEl = createM3u8Indicator();
        updateM3u8Indicator(capturedM3u8List);

        deleteBtn.style.display = 'none';

        trigger.addEventListener('click', () => toggleSidebar());

        // 异步检查后端状态
        checkBackendStatus(pageInfo, uploadBtn, deleteBtn, starRating);

        uploadBtn.onclick = async () => {
            if (uploadBtn.textContent.includes('已存')) return;
            if (!apiConnected) {
                showToast('⚠️', '后端未连接，无法保存');
                return;
            }
            
            setButtonLoading(uploadBtn, true);
            try {
                await apiClient.saveData({
                    pageTitle: pageInfo.title,
                    pageHref: pageInfo.href,
                    pageImg: pageInfo.cover,
                    m3u8List: pageInfo.m3u8()
                });
                uploadBtn.innerHTML = '<span class="sa-icon">✅ 已保存</span><span class="sa-spinner"></span>';
                uploadBtn.className = 'sa-btn sa-btn-success';
                deleteBtn.style.display = 'flex';
                showToast('✅', '保存成功');
            } catch {
                showToast('❌', '保存失败，请重试');
            } finally {
                setButtonLoading(uploadBtn, false);
            }
        };

        deleteBtn.onclick = async () => {
            if (!apiConnected) {
                showToast('⚠️', '后端未连接，无法删除');
                return;
            }
            
            setButtonLoading(deleteBtn, true);
            try {
                await apiClient.deleteData(pageInfo.href);
                uploadBtn.innerHTML = '<span class="sa-icon">💾 保存</span><span class="sa-spinner"></span>';
                uploadBtn.className = 'sa-btn sa-btn-primary';
                deleteBtn.style.display = 'none';
                starRating.updateRating(0);
                showToast('✅', '删除成功');
            } catch {
                showToast('❌', '删除失败，请重试');
            } finally {
                setButtonLoading(deleteBtn, false);
            }
        };

        refreshBtn.onclick = async () => {
            if (!apiConnected) {
                showToast('⚠️', '后端未连接，无法刷新');
                return;
            }
            
            setButtonLoading(refreshBtn, true);
            try {
                const newCover = getPageCover();
                await apiClient.saveData({
                    pageTitle: pageInfo.title,
                    pageHref: pageInfo.href,
                    pageImg: newCover || pageInfo.cover,
                    m3u8List: pageInfo.m3u8()
                });
                pageInfo.cover = newCover || pageInfo.cover;
                showToast('✅', '刷新成功');
            } catch {
                showToast('❌', '刷新失败，请重试');
            } finally {
                setButtonLoading(refreshBtn, false);
            }
        };

        copyBtn.onclick = () => { copyPageData(pageInfo); };

        sidebar.appendChild(statusIndicator);
        sidebar.appendChild(uploadBtn);
        sidebar.appendChild(deleteBtn);
        sidebar.appendChild(copyBtn);
        sidebar.appendChild(refreshBtn);
        sidebar.appendChild(starRating);
        sidebar.appendChild(m3u8IndicatorEl);
        sidebar.appendChild(trigger);
        
        document.body.appendChild(sidebar);
        resetSidebarTimer();
    }

    // 异步检查后端状态
    async function checkBackendStatus(pageInfo, uploadBtn, deleteBtn, starRating) {
        try {
            const res = await apiClient.checkExists(pageInfo.href);
            if (res.exists) {
                uploadBtn.innerHTML = '<span class="sa-icon">✅ 已保存</span><span class="sa-spinner"></span>';
                uploadBtn.className = 'sa-btn sa-btn-success';
                deleteBtn.style.display = 'flex';
                if (res.m3u8List) res.m3u8List.forEach(addM3u8);
                if (res.stars && res.stars > 0) starRating.updateRating(res.stars);
            }
        } catch {
            console.log('后端连接失败或未检测到已保存数据');
        }
    }

    // 初始化逻辑
    function init() {
        if (!isSiteMatched()) {
            console.log('当前站点不在支持列表中，不显示悬浮框');
            return;
        }
        
        if (document.readyState === 'complete') {
            main();
        } else {
            document.addEventListener('DOMContentLoaded', main);
            setTimeout(main, 2000);
        }
    }

    init();
})();