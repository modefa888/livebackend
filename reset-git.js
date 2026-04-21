const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('开始重置Git仓库...');

try {
  // 备份远程URL（如果有）
  let remoteUrl = '';
  try {
    if (fs.existsSync('.git')) {
      remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8', stdio: 'pipe' }).trim();
      console.log('已保存远程URL:', remoteUrl);
    }
  } catch (e) {
    console.log('没有找到远程仓库，继续...');
  }

  // 删除.git目录
  if (fs.existsSync('.git')) {
    console.log('删除旧的.git目录...');
    fs.rmSync('.git', { recursive: true, force: true });
  }

  // 重新初始化
  console.log('初始化Git仓库...');
  execSync('git init', { stdio: 'inherit' });

  // 添加.gitignore
  console.log('添加.gitignore...');
  execSync('git add .gitignore', { stdio: 'inherit' });

  // 添加所有文件
  console.log('添加所有文件...');
  execSync('git add .', { stdio: 'inherit' });

  // 提交
  console.log('创建初始提交...');
  execSync('git commit -m "Initial commit"', { stdio: 'inherit' });

  // 重命名分支为main
  console.log('重命名分支为main...');
  execSync('git branch -M main', { stdio: 'inherit' });

  // 如果有远程URL，重新设置
  if (remoteUrl) {
    console.log('重新设置远程仓库...');
    execSync(`git remote add origin ${remoteUrl}`, { stdio: 'inherit' });
  }

  console.log('\n✅ Git仓库重置完成！');
  console.log('现在可以去 http://localhost:3003/tools 点击"推送到远程"了');

} catch (error) {
  console.error('\n❌ 出错:', error.message);
  process.exit(1);
}
