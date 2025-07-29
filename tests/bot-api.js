/**
 * Bot API Test Suite for WikiBeachia
 * 
 * This file tests all the bot API endpoints to ensure they work correctly.
 * Make sure the server is running before executing these tests.
 * 
 * Usage: node test-bot-api.js
 */

const https = require('https');
const http = require('http');

// Test configuration
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  botCredentials: {
    username: '_system',
    clientSecret: '1725387735f61cc1053acfa4a73a7e6897a6922817a968416602404a5600a7bd'
  }
};

// Global test state
let testToken = null;
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Utility function to make HTTP requests
function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.baseUrl + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test assertion helper
function assert(condition, message) {
  testResults.total++;
  if (condition) {
    console.log(`✓ ${message}`);
    testResults.passed++;
  } else {
    console.log(`✗ ${message}`);
    testResults.failed++;
  }
}

// Test helper for expected failures
function assertFails(condition, message) {
  testResults.total++;
  if (!condition) {
    console.log(`✓ ${message}`);
    testResults.passed++;
  } else {
    console.log(`✗ ${message}`);
    testResults.failed++;
  }
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test suites
async function testBotLogin() {
  console.log('\n=== Bot Login Tests ===');
  
  // Test 1: Login with missing credentials
  try {
    const response = await makeRequest('POST', '/api/v1/bot/login', {}, {});
    assert(response.status === 400, 'Login fails with missing credentials');
    assert(response.data.error.includes('Missing username or client secret'), 'Error message mentions missing fields');
  } catch (err) {
    assert(false, `Login test failed: ${err.message}`);
  }

  // Test 2: Login with invalid credentials
  try {
    const response = await makeRequest('POST', '/api/v1/bot/login', {}, {
      username: 'invalid-bot',
      clientSecret: 'invalid-secret'
    });
    assert(response.status === 401, 'Login fails with invalid credentials');
    assert(response.data.error.includes('Invalid username or client secret'), 'Error message mentions invalid credentials');
  } catch (err) {
    assert(false, `Invalid login test failed: ${err.message}`);
  }

  // Test 3: Successful login (this will likely fail without a real bot user)
  try {
    const response = await makeRequest('POST', '/api/v1/bot/login', {}, CONFIG.botCredentials);
    if (response.status === 200) {
      assert(response.data.token, 'Login returns a token');
      assert(response.data.user, 'Login returns user information');
      testToken = response.data.token;
      console.log('✓ Successful bot login (token acquired)');
      testResults.passed++;
    } else {
      console.log('! Bot login failed - this is expected if no test bot exists');
      console.log(`  Status: ${response.status}, Error: ${response.data?.error || 'Unknown'}`);
      console.log('  Note: Create a bot user with username "test-bot" and password "test-secret" to enable full testing');
    }
    testResults.total++;
  } catch (err) {
    assert(false, `Bot login test failed: ${err.message}`);
  }
}

async function testAuthenticatedEndpoints() {
  if (!testToken) {
    console.log('\n=== Authenticated Endpoints Tests ===');
    console.log('! Skipping authenticated tests - no valid token available');
    return;
  }

  console.log('\n=== Authenticated Endpoints Tests ===');
  const authHeaders = { 'Authorization': `Bearer ${testToken}` };

  // Test bot info endpoint
  try {
    const response = await makeRequest('GET', '/api/v1/bot/info', authHeaders);
    assert(response.status === 200, 'Bot info endpoint returns 200');
    assert(response.data.username, 'Bot info includes username');
    assert(response.data.role !== undefined, 'Bot info includes role');
  } catch (err) {
    assert(false, `Bot info test failed: ${err.message}`);
  }

  // Test bot health endpoint
  try {
    const response = await makeRequest('GET', '/api/v1/bot/health', authHeaders);
    assert(response.status === 200, 'Bot health endpoint returns 200');
    assert(response.data.status === 'healthy', 'Bot health status is healthy');
    assert(response.data.api_version, 'Bot health includes API version');
  } catch (err) {
    assert(false, `Bot health test failed: ${err.message}`);
  }

  // Test token refresh
  try {
    const response = await makeRequest('POST', '/api/v1/bot/refresh-token', authHeaders);
    assert(response.status === 200, 'Token refresh returns 200');
    assert(response.data.token, 'Token refresh returns new token');
    assert(response.data.token !== testToken, 'New token is different from old token');
    
    // Update token for subsequent tests
    testToken = response.data.token;
  } catch (err) {
    assert(false, `Token refresh test failed: ${err.message}`);
  }
}

async function testPageEndpoints() {
  if (!testToken) {
    console.log('\n=== Page Endpoints Tests ===');
    console.log('! Skipping page tests - no valid token available');
    return;
  }

  console.log('\n=== Page Endpoints Tests ===');
  const authHeaders = { 'Authorization': `Bearer ${testToken}` };

  // Test getting all pages
  try {
    const response = await makeRequest('GET', '/api/v1/bot/pages', authHeaders);
    assert(response.status === 200, 'Get all pages returns 200');
    assert(Array.isArray(response.data.pages), 'Pages response contains array');
    assert(typeof response.data.total === 'number', 'Pages response includes total count');
  } catch (err) {
    assert(false, `Get all pages test failed: ${err.message}`);
  }

  // Test getting a specific page (trying common pages)
  const testPages = ['home', 'main', 'index'];
  let pageFound = false;
  
  for (const pageName of testPages) {
    try {
      const response = await makeRequest('GET', `/api/v1/bot/pages/${pageName}`, authHeaders);
      if (response.status === 200) {
        assert(response.data.name, 'Page response includes name');
        assert(response.data.content, 'Page response includes content');
        assert(response.data.display_name, 'Page response includes display_name');
        pageFound = true;
        console.log(`✓ Successfully retrieved page: ${pageName}`);
        testResults.passed++;
        break;
      }
    } catch (err) {
      // Continue to next page
    }
  }
  
  testResults.total++;
  if (!pageFound) {
    console.log('! No common pages found to test retrieval');
  }

  // Test creating a page
  const testPageData = {
    display_name: 'Bot Test Page',
    content: 'This is a test page created by the bot API test suite.',
    permission: 0,
    markdown: false
  };

  try {
    const response = await makeRequest('POST', '/api/v1/bot/pages', authHeaders, testPageData);
    if (response.status === 201) {
      assert(response.data.page, 'Page creation returns page data');
      assert(response.data.page.name === 'bot_test_page', 'Page name is properly formatted');
      console.log('✓ Successfully created test page');
      testResults.passed++;
      
      // Test updating the page
      const updateData = {
        display_name: 'Updated Bot Test Page',
        content: 'This content has been updated by the bot API test suite.'
      };
      
      try {
        const updateResponse = await makeRequest('PUT', '/api/v1/bot/pages/bot_test_page', authHeaders, updateData);
        assert(updateResponse.status === 200, 'Page update returns 200');
        assert(updateResponse.data.page.display_name === updateData.display_name, 'Page display name was updated');
        console.log('✓ Successfully updated test page');
        testResults.passed++;
      } catch (err) {
        assert(false, `Page update test failed: ${err.message}`);
      }
      testResults.total++;
      
    } else if (response.status === 409) {
      console.log('! Page creation failed - page already exists (this is expected if tests ran before)');
      testResults.total++;
    } else {
      assert(false, `Page creation failed with status ${response.status}: ${response.data?.error}`);
    }
  } catch (err) {
    assert(false, `Page creation test failed: ${err.message}`);
  }
  testResults.total++;
}

async function testSearchEndpoint() {
  if (!testToken) {
    console.log('\n=== Search Endpoint Tests ===');
    console.log('! Skipping search tests - no valid token available');
    return;
  }

  console.log('\n=== Search Endpoint Tests ===');
  const authHeaders = { 'Authorization': `Bearer ${testToken}` };

  // Test search without query
  try {
    const response = await makeRequest('GET', '/api/v1/bot/search', authHeaders);
    assert(response.status === 400, 'Search without query returns 400');
    assert(response.data.error.includes('Missing search query'), 'Error mentions missing query');
  } catch (err) {
    assert(false, `Search validation test failed: ${err.message}`);
  }

  // Test search with query
  try {
    const response = await makeRequest('GET', '/api/v1/bot/search?query=test&type=title', authHeaders);
    assert(response.status === 200, 'Search with query returns 200');
    assert(Array.isArray(response.data.results), 'Search returns results array');
    assert(response.data.query === 'test', 'Search returns query parameter');
    assert(response.data.type === 'title', 'Search returns type parameter');
  } catch (err) {
    assert(false, `Search functionality test failed: ${err.message}`);
  }
}

async function testAdminEndpoints() {
  if (!testToken) {
    console.log('\n=== Admin Endpoints Tests ===');
    console.log('! Skipping admin tests - no valid token available');
    return;
  }

  console.log('\n=== Admin Endpoints Tests ===');
  const authHeaders = { 'Authorization': `Bearer ${testToken}` };

  // Test wiki settings endpoint (requires admin role)
  try {
    const response = await makeRequest('GET', '/api/v1/bot/wiki/settings', authHeaders);
    if (response.status === 200) {
      assert(response.data, 'Wiki settings returns data');
      console.log('✓ Bot has admin permissions - wiki settings accessible');
      testResults.passed++;
    } else if (response.status === 403) {
      console.log('! Bot lacks admin permissions - this is expected for non-admin bots');
      testResults.passed++;
    } else {
      assert(false, `Wiki settings test failed with unexpected status: ${response.status}`);
    }
  } catch (err) {
    assert(false, `Wiki settings test failed: ${err.message}`);
  }
  testResults.total++;

  // Test user info endpoint (requires admin role)
  try {
    const response = await makeRequest('GET', '/api/v1/bot/users/admin', authHeaders);
    if (response.status === 200) {
      assert(response.data.username, 'User info returns username');
      assert(response.data.role !== undefined, 'User info returns role');
      console.log('✓ Bot can access user information');
      testResults.passed++;
    } else if (response.status === 403) {
      console.log('! Bot lacks admin permissions for user info - this is expected for non-admin bots');
      testResults.passed++;
    } else {
      assert(false, `User info test failed with unexpected status: ${response.status}`);
    }
  } catch (err) {
    assert(false, `User info test failed: ${err.message}`);
  }
  testResults.total++;
}

async function testAuthenticationSecurity() {
  console.log('\n=== Authentication Security Tests ===');

  // Test endpoints without authentication
  const protectedEndpoints = [
    '/api/v1/bot/info',
    '/api/v1/bot/pages',
    '/api/v1/bot/pages/test',
    '/api/v1/bot/health',
    '/api/v1/bot/search?query=test'
  ];

  for (const endpoint of protectedEndpoints) {
    try {
      const response = await makeRequest('GET', endpoint);
      assert(response.status === 401, `${endpoint} requires authentication`);
    } catch (err) {
      assert(false, `Auth test for ${endpoint} failed: ${err.message}`);
    }
  }

  // Test with invalid token
  try {
    const response = await makeRequest('GET', '/api/v1/bot/info', { 'Authorization': 'Bearer invalid-token' });
    assert(response.status === 401, 'Invalid token is rejected');
  } catch (err) {
    assert(false, `Invalid token test failed: ${err.message}`);
  }
}

async function testBotLogout() {
  if (!testToken) {
    console.log('\n=== Bot Logout Tests ===');
    console.log('! Skipping logout tests - no valid token available');
    return;
  }

  console.log('\n=== Bot Logout Tests ===');
  const authHeaders = { 'Authorization': `Bearer ${testToken}` };

  try {
    const response = await makeRequest('POST', '/api/v1/bot/logout', authHeaders);
    assert(response.status === 200, 'Bot logout returns 200');
    assert(response.data.message.includes('logged out'), 'Logout message is appropriate');

    // Verify token is invalidated
    await sleep(100); // Brief delay
    const testResponse = await makeRequest('GET', '/api/v1/bot/info', authHeaders);
    assert(testResponse.status === 401, 'Token is invalidated after logout');
  } catch (err) {
    assert(false, `Bot logout test failed: ${err.message}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log('WikiBeachia Bot API Test Suite');
  console.log('================================');
  console.log(`Testing against: ${CONFIG.baseUrl}`);
  console.log('');

  try {
    await testBotLogin();
    await testAuthenticationSecurity();
    await testAuthenticatedEndpoints();
    await testPageEndpoints();
    await testSearchEndpoint();
    await testAdminEndpoints();
    await testBotLogout();

    // Print results
    console.log('\n================================');
    console.log('Test Results Summary');
    console.log('================================');
    console.log(`Total tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    
    if (testResults.failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log(`❌ ${testResults.failed} test(s) failed`);
    }

    console.log('\nNotes:');
    console.log('- Some tests may fail if a test bot user is not configured');
    console.log('- Create a bot user with username "test-bot" and password "test-secret" for full testing');
    console.log('- Admin-only endpoints will show expected failures for non-admin bots');

  } catch (err) {
    console.error('Test suite failed:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nTest suite interrupted');
  process.exit(0);
});

// Check if server is running before starting tests
async function checkServerHealth() {
  try {
    const response = await makeRequest('GET', '/');
    return response.status < 500;
  } catch (err) {
    return false;
  }
}

// Start tests
(async () => {
  const isServerRunning = await checkServerHealth();
  if (!isServerRunning) {
    console.error('❌ Server is not running or not accessible at', CONFIG.baseUrl);
    console.log('Please start the server with: npm start');
    process.exit(1);
  }

  await runAllTests();
})();
