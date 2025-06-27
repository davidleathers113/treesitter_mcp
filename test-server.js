#!/usr/bin/env node

// Simple test script to verify the Tree-sitter MCP server
const { spawn } = require('child_process');

console.log('Testing Tree-sitter MCP Server...\n');

// Start the server
const server = spawn('node', ['build/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
});

// Send MCP requests
const testRequests = [
    // Initialize
    JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" }
        }
    }),

    // List tools
    JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
    }),

    // Test parse_code with a simple JavaScript example
    JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
            name: "parse_code",
            arguments: {
                code: "const x = 1;",
                language: "javascript",
                // Use npm package (install with: npm install tree-sitter-javascript)
                // wasmPath: "./node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm"

                // Or use CDN (requires internet connection)
                wasmPath: "https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm"
            }
        }
    })
];

let requestIndex = 0;

function sendNextRequest() {
    if (requestIndex < testRequests.length) {
        const request = testRequests[requestIndex];
        console.log(`Sending request ${requestIndex + 1}:`, request);
        server.stdin.write(request + '\n');
        requestIndex++;
    } else {
        console.log('\nAll test requests sent. Closing server...');
        server.kill('SIGTERM');
    }
}

server.stdout.on('data', (data) => {
    const response = data.toString().trim();
    console.log('Response:', response);
    console.log('---');

    // Send next request after a short delay
    setTimeout(sendNextRequest, 1000);
});

server.stderr.on('data', (data) => {
    console.log('Server stderr:', data.toString());
});

server.on('close', (code) => {
    console.log(`\nServer process exited with code ${code}`);
});

server.on('error', (error) => {
    console.error('Error starting server:', error);
});

// Start with the first request
setTimeout(sendNextRequest, 1000);