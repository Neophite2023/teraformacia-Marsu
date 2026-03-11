const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 512,
    height: 512,
    webPreferences: { offscreen: true }
  });

  const svgPath = path.join(__dirname, 'icon.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  
  // HTML obal s explicitným štýlom pre SVG
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:0; background:transparent;">
      <div id="container" style="width:512px; height:512px;">
        ${svgContent}
      </div>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  win.webContents.on('did-finish-load', () => {
    // Počkáme chvíľu na dokončenie rasterizácie
    setTimeout(async () => {
      const image = await win.webContents.capturePage();
      const pngBuffer = image.toPNG();
      if (pngBuffer.length > 1000) { // Overíme, či nie je prázdny
        fs.writeFileSync('icon.png', pngBuffer);
        console.log('SUCCESS: Ikona bola úspešne uložená ako icon.png');
      } else {
        console.error('ERROR: Vygenerovaný PNG je príliš malý/prázdny.');
      }
      app.quit();
    }, 1500);
  });
});

