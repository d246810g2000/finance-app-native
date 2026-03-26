import { Buffer } from 'buffer';
import process from 'process';

// Polyfill Buffer globally
if (typeof global.Buffer === 'undefined') {
    global.Buffer = Buffer;
}
if (typeof global.process === 'undefined') {
    global.process = process;
}

import "expo-router/entry";

