const axios = require('axios');
const db = require('../../config/db');

class MusicService {
  // 搜索音乐
  async searchMusic(keyword, platform = 'netease') {
    try {
      console.log(`搜索音乐: ${keyword} (平台: ${platform})`);

      // 这里应该调用音乐平台的API进行搜索
      // 暂时返回模拟数据
      const mockResults = [
        {
          id: '1',
          title: '测试歌曲 1',
          artist: '测试歌手 1',
          album: '测试专辑 1',
          duration: 180,
          url: 'https://example.com/music/1.mp3',
          platform
        },
        {
          id: '2',
          title: '测试歌曲 2',
          artist: '测试歌手 2',
          album: '测试专辑 2',
          duration: 200,
          url: 'https://example.com/music/2.mp3',
          platform
        }
      ];

      // 记录搜索历史
      await db.execute(
        'INSERT INTO music_search_history (keyword, platform, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [keyword, platform]
      );

      return { success: true, results: mockResults };
    } catch (error) {
      console.error('搜索音乐失败:', error);
      return { success: false, message: '搜索音乐失败', error: error.message };
    }
  }

  // 获取音乐详情
  async getMusicDetail(musicId, platform = 'netease') {
    try {
      console.log(`获取音乐详情: ${musicId} (平台: ${platform})`);

      // 这里应该调用音乐平台的API获取详情
      // 暂时返回模拟数据
      const mockDetail = {
        id: musicId,
        title: '测试歌曲',
        artist: '测试歌手',
        album: '测试专辑',
        duration: 180,
        url: `https://example.com/music/${musicId}.mp3`,
        cover: 'https://example.com/cover/${musicId}.jpg',
        lyrics: '这是测试歌词',
        platform
      };

      return { success: true, music: mockDetail };
    } catch (error) {
      console.error('获取音乐详情失败:', error);
      return { success: false, message: '获取音乐详情失败', error: error.message };
    }
  }

  // 获取搜索历史
  async getSearchHistory(limit = 20) {
    try {
      const [history] = await db.execute(
        'SELECT * FROM music_search_history ORDER BY createdAt DESC LIMIT ?',
        [limit]
      );

      return { success: true, history };
    } catch (error) {
      console.error('获取搜索历史失败:', error);
      return { success: false, message: '获取搜索历史失败', error: error.message };
    }
  }

  // 清空搜索历史
  async clearSearchHistory() {
    try {
      await db.execute('DELETE FROM music_search_history');
      return { success: true, message: '搜索历史已清空' };
    } catch (error) {
      console.error('清空搜索历史失败:', error);
      return { success: false, message: '清空搜索历史失败', error: error.message };
    }
  }
}

module.exports = new MusicService();