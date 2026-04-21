const fs = require('fs');
const db = require('./indexMysql');

async function myFunction() {
    let result;
    try {
        // 读取所有记录
        const list = await db.getSettings('scheduleTime')
        console.log(!list)
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

myFunction();

