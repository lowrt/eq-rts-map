const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
  const { appOutDir, electronPlatformName } = context;

  console.log('🔧 Running afterPack optimization...');
  console.log(`Platform: ${electronPlatformName}`);

  let totalSavedBytes = 0;
  let totalRemovedFiles = 0;

  // 1. 清理 Chrome locales - 只保留英文
  const keepLocales = ['en-US.pak'];
  let localesPath;

  if (electronPlatformName === 'darwin') {
    localesPath = path.join(appOutDir, 'eq-rts-map.app', 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources');
  } else if (electronPlatformName === 'win32') {
    localesPath = path.join(appOutDir, 'locales');
  } else if (electronPlatformName === 'linux') {
    localesPath = path.join(appOutDir, 'locales');
  }

  if (localesPath && fs.existsSync(localesPath)) {
    try {
      const files = fs.readdirSync(localesPath);
      let removedCount = 0;
      let savedBytes = 0;

      files.forEach((file) => {
        if (!file.endsWith('.pak') || file === 'resources.pak' || file.startsWith('chrome_')) {
          return;
        }

        if (!keepLocales.includes(file)) {
          const filePath = path.join(localesPath, file);
          const stats = fs.statSync(filePath);
          savedBytes += stats.size;

          fs.unlinkSync(filePath);
          removedCount++;
        }
      });

      totalSavedBytes += savedBytes;
      totalRemovedFiles += removedCount;
      console.log(`   Removed ${removedCount} locale files`);
      console.log(`   Saved ${(savedBytes / 1024 / 1024).toFixed(2)} MB`);

    } catch (error) {
      console.error('❌ Error during locale cleanup:', error);
    }
  }

  console.log('\n🎉 Optimization complete!');
  console.log(`   Total removed files: ${totalRemovedFiles}`);
  console.log(`   Total saved: ${(totalSavedBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log('\n✨ AfterPack hook finished\n');
};