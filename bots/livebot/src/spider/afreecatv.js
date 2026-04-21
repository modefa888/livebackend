const $ = require('../config/includes');
const qs = require('qs');

const host = 'https://play.afreecatv.com';
async function getStationStatus(mid) {
  try {
    let room_status = 0;
    let aid = '';
    let bno = '';
    let liveUrl = '';
    let avatar_thumb = '';
    let username = '';
    let title = '';
    let roomid = mid;
    let targetUrl = 'https://play.afreecatv.com/' + mid;
    const liveResponse = await makeRequest(mid, 'live');
    const response = await $.axios.get(`https://st.afreecatv.com/api/get_station_status.php?szBjId=${mid}`);
    if (!response.data) {
      console.log("请求错误");
      return { msg: "请求错误" };
    }
    const data = response.data['DATA'];
    title = data['station_title'];
    username = data['user_nick'];
    broad_start = data['broad_start'];
    today_ok_cnt = data['today_ok_cnt'];
    if (liveResponse['RESULT']) {
      room_status = 1;
      const aidResponse = await makeRequest(mid, 'aid');
      aid = aidResponse['AID'];
      bno = liveResponse['BNO'];
      const respURL = await $.axios.get(`https://livestream-manager.afreecatv.com/broad_stream_assign.html?return_type=gcp_cdn&use_cors=true&cors_origin_url=play.afreecatv.com&broad_key=${bno}-common-master-hls`);
      const view_url = respURL.data['view_url']
      liveUrl = view_url + '?aid=' + aid;
      avatar_thumb = 'https://liveimg.afreecatv.com/m/' + bno + '#' + broad_start;
    } else {
      room_status = 0;
    }
    const code = 1;
    return { code, title, username, roomid, avatar_thumb, room_status, liveUrl, targetUrl };
  } catch (error) {
    const msg = `请求失败: ${error}`;
    const code = 0;
    return { msg, code };
  }
}

async function makeRequest(mid, type) {
  const data = qs.stringify({
    'bid': mid,
    'bno': '',
    'type': type,
    'pwd': '',
    'player_type': 'html5',
    'stream_type': 'common',
    'quality': 'master',
    'mode': 'landing',
    'from_api': '0',
    'is_revive': 'false'
  });
  const config = {
    method: 'post',
    url: `https://live.afreecatv.com/afreeca/player_live_api.php?bjid=${mid}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': 'AbroadChk=OK; AbroadVod=OK'
    },
    data: data
  };

  try {
    const response = await $.axios(config);
    return response.data['CHANNEL'];
  } catch (error) {
    return null;
  }
}

module.exports = {
  getStationStatus,
  getModuleName() {
    return 'play.afreecatv.com';
  },
  getMidCount(){
      return 3;
  }
};
