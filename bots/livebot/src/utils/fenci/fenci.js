const Segment = require('segment');

// 初始化分词器
const segment = new Segment();
// 使用默认的识别模块及字典，载入字典文件需要1秒，仅初始化时执行一次即可
segment.useDefault();

// 载入字典，详见dicts目录，或者是自定义字典文件的绝对路径
segment.loadDict('dict.txt');

function segmentText(text){
    return segment.doSegment(text, {
        simple: true,   // 不返回词性
        stripPunctuation: true, // 去标点符号
    });
}

module.exports = {
    segmentText
}
