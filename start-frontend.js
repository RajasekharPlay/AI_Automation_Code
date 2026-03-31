// Launcher — changes cwd to frontend/ then starts Vite
process.chdir(__dirname + '/frontend');
import('./frontend/node_modules/vite/bin/vite.js');
