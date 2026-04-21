// ==UserScript==
// @name         智能存档助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  带侧边栏的智能存档工具
// @author       Your Name
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      180.184.79.211
// @connect      127.0.0.1
// ==/UserScript==

/********************* 新增：m3u8 捕获********************/
let capturedM3u8List = [];

let m3u8IndicatorEl = null;

/********************* 控制台美化输出模块********************/
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
        
        console.group(`%c 📦 ${title}`, `color: ${this.title}; font-weight: bold; font-size: 14px;`);
        if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                if (value) {
                    console.log(`%c ✓ ${key}:`, `color: ${colors[type]}; font-weight: 500;`, value);
                } else {
                    console.log(`%c ✗ ${key}:`, `color: ${this.error}; font-weight: 500;`, '未获取到');
                }
            }
        } else {
            console.log(`%c ${data}`, `color: ${colors[type]};`);
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
        console.log('%c 标题:', 'color: #42A5F5; font-weight: 500;', title ? `%c ${title}` : '%c ❌ 未获取到', title ? 'color: #4CAF50;' : 'color: #F44336;');
        console.log('%c URL:', 'color: #42A5F5; font-weight: 500;', `%c ${window.location.href}`, 'color: #66BB6A;');
        console.groupEnd();
        
        console.group('%c 🖼️ 封面信息', 'color: #1E88E5; font-weight: bold;');
        if (cover) {
            console.log('%c 封面地址:', 'color: #64B5F6; font-weight: 500;', cover);
            console.log('%c 预览:', 'color: #64B5F6; font-weight: 500;');
            console.log('%c ┌─────────────────────────────────────────────────────┐', 'color: #90CAF9;');
            console.log(`%c │ ${cover.slice(0, 60)}${cover.length > 60 ? '...' : ''} │`, 'color: #90CAF9;');
            console.log('%c └─────────────────────────────────────────────────────┘', 'color: #90CAF9;');
        } else {
            console.log('%c ❌ 封面地址: 未获取到', 'color: #EF5350; font-weight: 500;');
        }
        console.groupEnd();
        
        console.group('%c 🎬 m3u8 地址列表', 'color: #00897B; font-weight: bold;');
        if (m3u8List && m3u8List.length > 0) {
            console.log(`%c ✅ 成功捕获 ${m3u8List.length} 条 m3u8 地址`, 'color: #66BB6A; font-weight: 500;');
            m3u8List.forEach((url, index) => {
                console.log(`%c [${index + 1}]`, 'color: #FFA726; font-weight: bold;', url);
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


    // 配置项
    const HOST = 'http://127.0.0.1:3002/api';
    const TOKEN = 'your_api_secret';
    const BUTTON_COLORS = {
        normal: '#2196F3',
        uploaded: '#F44336',
        delete: '#FF9800',
        disabled: '#9E9E9E' // ⭐ 新增
    };
    const SIDEBAR_WIDTH = 180;
    const COLLAPSE_TIMEOUT = 10000; // 10秒自动收起
    const ANIMATION_DURATION = 300; // 动画持续时间

    let sidebarTimeout;
    let isExpanded = false;

    // 样式设置函数
    function setElementStyle(element, styles) {
        Object.assign(element.style, styles);
    }
    const setStyle = setElementStyle; // ⭐ 兼容旧调用

    // 创建侧边栏容器
    function createSidebarContainer() {
        const container = document.createElement('div');
        container.id = 'smart-archive-sidebar';
        setElementStyle(container, {
            position: 'fixed',
            top: '20px',
            left: `-${SIDEBAR_WIDTH}px`,
            width: `${SIDEBAR_WIDTH}px`,
            padding: '15px',
            backgroundColor: 'rgba(255,255,255,0.97)',
            borderRadius: '0 15px 15px 0',
            boxShadow: '2px 2px 10px rgba(0,0,0,0.15)',
            transition: `left ${ANIMATION_DURATION}ms ease-out`,
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });
        return container;
    }

    // 创建触发按钮
    function createTriggerButton() {
        const trigger = document.createElement('div');
        trigger.innerHTML = '>';
        setElementStyle(trigger, {
            position: 'absolute',
            right: '-25px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '25px',
            height: '40px',
            backgroundColor: 'rgba(255,255,255,0.9)',
            borderRadius: '0 8px 8px 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            fontSize: '16px',
            boxShadow: '2px 2px 5px rgba(0,0,0,0.1)'
        });
        return trigger;
    }

    // 创建操作按钮
    function createActionButton(text) {
        const button = document.createElement('button');
        button.textContent = text;
        setElementStyle(button, {
            padding: '8px 12px',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontSize: '14px',
            fontWeight: '500',
            color: 'white'
        });
        return button;
    }

    // 创建星级评分
    function createStarRating(initialRating = 0) {
        const container = document.createElement('div');
        setElementStyle(container, {
            display: 'flex',
            gap: '5px',
            marginTop: '10px',
            padding: '5px 0',
            borderTop: '1px solid #eee'
        });

        let currentRating = initialRating;

        const updateStars = (rating) => {
            container.querySelectorAll('[data-value]').forEach((star, index) => {
                star.style.color = index + 1 <= rating ? '#FFD700' : '#e0e0e0';
                star.style.textShadow = index + 1 <= rating ? '0 0 2px rgba(255,215,0,0.5)' : 'none';
            });
        };

        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('div');
            star.innerHTML = '★';
            star.dataset.value = i;
            setElementStyle(star, {
                cursor: 'pointer',
                fontSize: '24px',
                color: i <= initialRating ? '#FFD700' : '#e0e0e0',
                transition: 'all 0.2s ease',
                textShadow: i <= initialRating ? '0 0 2px rgba(255,215,0,0.5)' : 'none'
            });

            star.addEventListener('mouseenter', () => {
                star.style.transform = 'scale(1.2)';
                star.style.textShadow = '0 0 3px rgba(0,0,0,0.2)';
            });
            star.addEventListener('mouseleave', () => {
                star.style.transform = 'scale(1)';
                star.style.textShadow = 'none';
            });

            star.addEventListener('click', async () => {
                currentRating = i;
                updateStars(currentRating);
                
                try {
                    await apiClient.updateRating({
                        pageHref: location.href,
                        rating: currentRating
                    });
                } catch (error) {
                    console.error('更新评分失败:', error);
                }
            });

            container.appendChild(star);
        }

        container.updateRating = updateStars;
        return container;
    }

    // 侧边栏控制
    function toggleSidebar(expand) {
        const sidebar = document.getElementById('smart-archive-sidebar');
        if (!sidebar) return;

        isExpanded = expand !== undefined ? expand : !isExpanded;
        sidebar.style.left = isExpanded ? '0' : `-${SIDEBAR_WIDTH}px`;
        document.getElementById('sidebar-trigger').innerHTML = isExpanded ? '<' : '>';
        resetSidebarTimer();
    }

    function resetSidebarTimer() {
        clearTimeout(sidebarTimeout);
        if (isExpanded) {
            sidebarTimeout = setTimeout(() => toggleSidebar(false), COLLAPSE_TIMEOUT);
        }
    }

    // 获取页面封面（保留原有逻辑）
    function getPageCover() {
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
            ['d3d3Ljc4ZG9yay5jb20vaW5kZXgucGhwL3ZvZC9wbGF5L2lkLw==', 'div[class="art-poster"]', 'style', '', 'https://community.image.video.qpic.cn/v_station_video_web_comment_fbd86c-2_794787413_1688866446598836'],
            ['d3d3LnBvcm5sdWx1LmNvbS96aC1oYW5zL3Yv', 'div[class="art-poster"]', 'style', '', 'https://www.pornlulu.com/imgdef/noimage.webp'],
            ['YXZwbGUuYXBwL3ZpZGVvLw==', 'div[class="plyr__poster"]', 'style', '', ''],
            ['eDNjMS5jb20vdmlkZW9zLw==', 'div[class="fp-poster"] img', 'src', '', ''],
            ['Y2RuMjAxMS5jb20=', 'div[class*="cover"]', 'style', '', ''],
            ['d3d3Lnlhc2V0dWJlLmNvbS92aWRlby8=', 'video[class="vjs-tech"]', 'poster', '', ''],
            ['MThqLnR2L3Y=', 'div[class="plyr__poster"]', 'style', '', ''],


            ['emguc3RyaXBjaGF0LmNvbQ==', 'meta[property="og:image"]', 'content', '', ''],
            ['a2FuYXYuYWQvaW5kZXgucGhwL3ZvZC9wbGF5L2lkLw==', 'img[class="countext-img"]', 'src', '', ''],
            ['enpiZndva2UuY29tL2NvbWljL2luZGV4L2RldGFpbA==', 'meta[property="og:image"]', 'content', '', ''],
        ];

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
                    method: "GET",
                    url: `${HOST}/check_existence?pageHref=${encodeURIComponent(pageHref)}`,
                    headers: { "Authorization": `Bearer ${TOKEN}` },
                    onload: response => resolve(JSON.parse(response.responseText)),
                    onerror: reject
                });
            });
        },

        saveData(data) {
            return new Promise((resolve, reject) => {

                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${HOST}/save_data`,
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${TOKEN}`
                    },
                    data: JSON.stringify(data),
                    onload: resolve,
                    onerror: reject
                });
            });
        },

        deleteData(pageHref) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${HOST}/delete_by_href`,
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${TOKEN}`
                    },
                    data: JSON.stringify({ pageHref: encodeURIComponent(pageHref) }),
                    onload: resolve,
                    onerror: reject
                });
            });
        },

        updateRating(data) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${HOST}/update_rating`,
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${TOKEN}`
                    },
                    data: JSON.stringify(data),
                    onload: response => resolve(response.status === 200),
                    onerror: reject
                });
            });
        }
    };

    /******************** * m3u8 状态指示器 ********************/
    function createM3u8Indicator() {
        // ✅ 如果已经存在，直接复用
        const exist = document.getElementById('m3u8-indicator');
        if (exist) return exist;

        const btn = createActionButton('▶️❌');
        btn.id = 'm3u8-indicator'; // ⭐ 唯一 ID
        btn.title = '等待捕获 m3u8';

        setElementStyle(btn, {
            backgroundColor: BUTTON_COLORS.disabled,
            cursor: 'not-allowed',
            display: 'inline-block',
            opacity: '0.6'
        });

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
            m3u8IndicatorEl.textContent = '▶️✅';
            m3u8IndicatorEl.style.backgroundColor = '#4CAF50';
            m3u8IndicatorEl.style.cursor = 'pointer';
            m3u8IndicatorEl.title = `已捕获 ${list.length} 条 m3u8`;
            m3u8IndicatorEl.style.opacity = '1';
        } else {
            m3u8IndicatorEl.textContent = '▶️❌';
            m3u8IndicatorEl.style.backgroundColor = BUTTON_COLORS.disabled;
            m3u8IndicatorEl.style.cursor = 'not-allowed';
            m3u8IndicatorEl.title = '等待捕获 m3u8';
            m3u8IndicatorEl.style.opacity = '0.6';
        }
    }



    /********************
     * m3u8 播放器
     ********************/
    function playM3u8(url) {
        const mask = document.createElement('div');
        setStyle(mask, {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            zIndex: 999999
        });

        const box = document.createElement('div');
        setStyle(box, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            width: '70%',
            background: '#000',
            padding: '10px',
            borderRadius: '8px'
        });

        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.style.width = '100%';

        box.appendChild(video);
        mask.appendChild(box);
        document.body.appendChild(mask);

        mask.onclick = e => e.target === mask && mask.remove();

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
        if (!url) return;
        if (capturedM3u8List.includes(url)) return;
        capturedM3u8List.push(url);
        updateM3u8Indicator(capturedM3u8List);
        
        ConsoleLogger.logPageInfo(document.title, getPageCover(), capturedM3u8List);
    }

    /********************
     * XHR 拦截（唯一）
     ********************/
    const rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (typeof url === 'string' && url.includes('.m3u8')) {
            addM3u8(url);
            console.log('🎬 m3u8(XHR):', url);
        }
        return rawOpen.call(this, method, url, ...rest);
    };


    /********************
     * 主逻辑
     ********************/
    async function main() {
        const pageInfo = {
            title: document.title,
            href: location.href,
            cover: getPageCover(),
            m3u8: () => capturedM3u8List.slice()
        };

        ConsoleLogger.logPageInfo(pageInfo.title, pageInfo.cover, capturedM3u8List);

        if (!pageInfo.cover) return;

        const sidebar = createSidebarContainer();
        const trigger = createTriggerButton();
        trigger.addEventListener('click', () => toggleSidebar());

        const uploadBtn = createActionButton('保存');
        const deleteBtn = createActionButton('删除');
        const starRating = createStarRating(0);
        const refreshBtn = createActionButton('🔄 刷新数据');

        m3u8IndicatorEl = createM3u8Indicator();
        updateM3u8Indicator(capturedM3u8List); // ⭐ 关键补偿


        setElementStyle(uploadBtn, { backgroundColor: BUTTON_COLORS.normal });
        setElementStyle(deleteBtn, { backgroundColor: BUTTON_COLORS.delete, display: 'none' });
        setElementStyle(refreshBtn, { backgroundColor: '#FF9800', marginTop: '10px' });

        try {
            const res = await apiClient.checkExists(pageInfo.href);
            if (res.exists) {
                uploadBtn.textContent = '已存';
                uploadBtn.style.backgroundColor = BUTTON_COLORS.uploaded;
                deleteBtn.style.display = 'inline-block';
                res.m3u8List?.forEach(addM3u8);
                if (res.stars && res.stars > 0) {
                    starRating.updateRating(res.stars);
                }
            }
        } catch {}

        uploadBtn.onclick = async () => {
            if (uploadBtn.textContent === '已存') return;
            uploadBtn.textContent = '保存中...';
            await apiClient.saveData({
                pageTitle: pageInfo.title,
                pageHref: pageInfo.href,
                pageImg: pageInfo.cover,
                m3u8List: pageInfo.m3u8,
            });
            uploadBtn.textContent = '已存';
            uploadBtn.style.backgroundColor = BUTTON_COLORS.uploaded;
            deleteBtn.style.display = 'inline-block';
        };

        deleteBtn.onclick = async () => {
            await apiClient.deleteData(pageInfo.href);
            uploadBtn.textContent = '保存';
            uploadBtn.style.backgroundColor = BUTTON_COLORS.normal;
            deleteBtn.style.display = 'none';
        };

        refreshBtn.onclick = async () => {
            refreshBtn.textContent = '刷新中...';
            try {
                const newCover = getPageCover();
                await apiClient.saveData({
                    pageTitle: pageInfo.title,
                    pageHref: pageInfo.href,
                    pageImg: newCover || pageInfo.cover,
                    m3u8List: pageInfo.m3u8(),
                });
                pageInfo.cover = newCover || pageInfo.cover;
                refreshBtn.textContent = '✅ 刷新成功';
                setTimeout(() => {
                    refreshBtn.textContent = '🔄 刷新数据';
                }, 2000);
            } catch (error) {
                console.error('刷新失败:', error);
                refreshBtn.textContent = '❌ 刷新失败';
                setTimeout(() => {
                    refreshBtn.textContent = '🔄 刷新数据';
                }, 2000);
            }
        };

        sidebar.append(uploadBtn, deleteBtn, starRating, refreshBtn, m3u8IndicatorEl, trigger);
        document.body.appendChild(sidebar);
        resetSidebarTimer();
    }

    // 初始化逻辑
    function init() {
        if (document.readyState === 'complete') {
            main();
        } else {
            document.addEventListener('DOMContentLoaded', main);
            setTimeout(main, 2000); // 容错处理
        }
    }

   init();
})();