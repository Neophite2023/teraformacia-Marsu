const { execFileSync } = require('child_process');
const path = require('path');

function updateIcon() {
  const exePath = path.join(__dirname, 'release', 'win-unpacked', 'Teraformacia Marsu.exe');
  const iconPath = path.join(__dirname, 'release', '.icon-ico', 'icon.ico');
  const rceditPath = path.join(__dirname, 'rcedit.exe');

  console.log(`\nAplikujem ikonu na: ${exePath}`);
  
  try {
    execFileSync(rceditPath, [exePath, '--set-icon', iconPath]);
    console.log('Ikona bola úspešne vložená do spustiteľného súboru!');
  } catch (err) {
    console.error('Chyba pri vkladaní ikony:', err.message);
  }
}

updateIcon();