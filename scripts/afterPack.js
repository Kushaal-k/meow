const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { appBuilderPath } = require('app-builder-bin');

module.exports = async function (context) {
    if (context.electronPlatformName === 'win32') {
        const exeName = `${context.packager.appInfo.productFilename}.exe`;
        const exePath = path.join(context.appOutDir, exeName);
        const iconPath = path.resolve(context.packager.projectDir, 'assets/icon.ico');

        if (fs.existsSync(exePath) && fs.existsSync(iconPath)) {
            console.log(`  • embedding Windows icon into executable: ${exeName}`);
            const args = JSON.stringify([exePath, '--set-icon', iconPath]);
            const res = spawnSync(appBuilderPath, ['rcedit', '--args', args], { encoding: 'utf8' });
            if (res.status === 0) {
                console.log(`  • successfully embedded icon into ${exeName}`);
            } else {
                console.warn(`  • failed to embed icon into ${exeName}:`, res.stderr || res.stdout);
            }
        }
    }
};
