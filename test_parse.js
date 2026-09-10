const fs = require('fs');

const path = process.argv[2] || 'data/AndroMoney.csv';
const buf = fs.readFileSync(path);
const text = new TextDecoder('big5').decode(buf);
console.log(text.slice(0, 500));
