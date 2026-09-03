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

        // Verify/copy ffmpeg and ffprobe into resources/bin/
        const resBinDir = path.join(context.appOutDir, 'resources', 'bin');
        fs.mkdirSync(resBinDir, { recursive: true });
        const srcFfmpeg = path.resolve(context.packager.projectDir, 'bin/win/x64/ffmpeg.exe');
        const srcFfprobe = path.resolve(context.packager.projectDir, 'bin/win/x64/ffprobe.exe');
        if (fs.existsSync(srcFfmpeg) && !fs.existsSync(path.join(resBinDir, 'ffmpeg.exe'))) {
            fs.copyFileSync(srcFfmpeg, path.join(resBinDir, 'ffmpeg.exe'));
            console.log(`  • copied ffmpeg.exe into resources/bin/`);
        }
        if (fs.existsSync(srcFfprobe) && !fs.existsSync(path.join(resBinDir, 'ffprobe.exe'))) {
            fs.copyFileSync(srcFfprobe, path.join(resBinDir, 'ffprobe.exe'));
            console.log(`  • copied ffprobe.exe into resources/bin/`);
        }
    } else if (context.electronPlatformName === 'darwin') {
        const archName = (context.arch === 3 || context.arch === 'arm64') ? 'arm64' : 'x64';
        let resDir = path.join(context.appOutDir, 'resources');
        if (fs.existsSync(context.appOutDir)) {
            const items = fs.readdirSync(context.appOutDir);
            const appBundle = items.find(f => f.endsWith('.app'));
            if (appBundle) {
                resDir = path.join(context.appOutDir, appBundle, 'Contents', 'Resources');
            }
        }
        const resBinDir = path.join(resDir, 'bin');
        fs.mkdirSync(resBinDir, { recursive: true });
        const srcDir = path.resolve(context.packager.projectDir, 'bin/mac', archName);
        const srcFfmpeg = path.join(srcDir, 'ffmpeg');
        const srcFfprobe = path.join(srcDir, 'ffprobe');
        if (fs.existsSync(srcFfmpeg)) {
            fs.copyFileSync(srcFfmpeg, path.join(resBinDir, 'ffmpeg'));
            try { fs.chmodSync(path.join(resBinDir, 'ffmpeg'), 0o755); } catch (_) {}
            console.log(`  • bundled mac (${archName}) ffmpeg into Resources/bin/`);
        }
        if (fs.existsSync(srcFfprobe)) {
            fs.copyFileSync(srcFfprobe, path.join(resBinDir, 'ffprobe'));
            try { fs.chmodSync(path.join(resBinDir, 'ffprobe'), 0o755); } catch (_) {}
            console.log(`  • bundled mac (${archName}) ffprobe into Resources/bin/`);
        }
    }
};
