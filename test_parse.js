
const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

// Mocked RawRecord interface
/**
 * @typedef {Object.<string, any>} RawRecord
 */

// Ported parsing logic from financeService.ts
const parseCsvLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
};

const parseCsvData = (csvText) => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length < 3) {
        console.error('CSV 檔案的格式不符合預期 (至少需要 3 行數據)。');
        return [];
    }

    const headers = parseCsvLine(lines[1]);
    console.log('解析出的標題:', headers.map(h => h.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').trim()));

    const rows = lines.slice(2).map(line => {
        const values = parseCsvLine(line);
        const rowObject = {};
        headers.forEach((header, index) => {
            const cleanHeader = header.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').trim();
            const cleanValue = values[index] ? values[index].replace(/^"|"$/g, '').trim() : '';
            rowObject[cleanHeader] = cleanValue;
        });
        return rowObject;
    });

    return rows;
};

// Main test execution
try {
    const filePath = path.join(__dirname, 'AndroMoney CSV.txt');
    const buffer = fs.readFileSync(filePath);

    // Test Big5 decoding
    const decodedText = iconv.decode(buffer, 'big5');
    console.log('--- 檔案前 100 字元 (已解碼) ---');
    console.log(decodedText.substring(0, 100));
    console.log('-------------------------------\n');

    const records = parseCsvData(decodedText);
    console.log(`總共解析出 ${records.length} 筆資料`);

    if (records.length > 0) {
        console.log('\n--- 第一筆資料樣例 ---');
        console.log(JSON.stringify(records[0], null, 2));

        console.log('\n--- 最後一筆資料樣例 ---');
        console.log(JSON.stringify(records[records.length - 1], null, 2));
    }
} catch (err) {
    console.error('測試失敗:', err);
}
