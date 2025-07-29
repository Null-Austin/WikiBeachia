# WikiBeachia Bot API Documentation

This document describes the comprehensive Bot API endpoints available for automated interactions with WikiBeachia.

## Authentication

All bot API endpoints (except login) require authentication using a Bearer token in the Authorization header:

```
Authorization: Bearer <your_bot_token>
```

## Base URL

All API endpoints are prefixed with `/api/v1/bot/`

## Endpoints

### 1. Bot Authentication

#### POST `/api/v1/bot/login`
Authenticate a bot user and receive an access token.

**Request Body:**
```json
{
  "username": "bot_username",
  "clientSecret": "bot_client_secret"
}
```

**Response:**
```json
{
  "user": {
    "id": 2,
    "username": "_home",
    "display_name": "Homer Simpson",
    "role": 100,
    "type": "bot"
  },
  "token": "generated_access_token"
}
```

#### POST `/api/v1/bot/logout`
Invalidate the current bot token.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "message": "Bot logged out successfully"
}
```

#### POST `/api/v1/bot/refresh-token`
Generate a new access token while invalidating the current one.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "token": "new_generated_token",
  "message": "Token refreshed successfully"
}
```

### 2. Bot Information

#### GET `/api/v1/bot/info`
Get information about the authenticated bot.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": 2,
  "username": "_home",
  "display_name": "Homer Simpson",
  "role": 100,
  "account_status": "active",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

#### GET `/api/v1/bot/health`
Health check endpoint for monitoring bot API status.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "status": "healthy",
  "bot": {
    "username": "_home",
    "role": 100
  },
  "timestamp": "2024-01-01T12:00:00.000Z",
  "api_version": "1.0"
}
```

### 3. Page Management

#### GET `/api/v1/bot/pages/:name`
Get content of a specific page by name.

**Headers:** `Authorization: Bearer <token>`

**Parameters:**
- `name` (string): The page name (URL parameter)

**Response:**
```json
{
  "id": 1,
  "name": "home",
  "display_name": "Home",
  "content": "Welcome to the home page. :)",
  "permission": 500,
  "markdown": false,
  "created_at": "2024-01-01T00:00:00.000Z",
  "last_modified": "2024-01-01T00:00:00.000Z"
}
```

#### GET `/api/v1/bot/pages`
Get all pages accessible to the bot (with pagination).

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `offset` (number, optional): Starting position (default: 0)
- `limit` (number, optional): Number of pages to return (default: 50, max: 100)

**Response:**
```json
{
  "pages": [
    {
      "id": 1,
      "name": "home",
      "display_name": "Home",
      "permission": 500,
      "markdown": false,
      "created_at": "2024-01-01T00:00:00.000Z",
      "last_modified": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 50
}
```

#### POST `/api/v1/bot/pages`
Create a new page.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "display_name": "New Page Title",
  "content": "Page content goes here",
  "permission": 0,
  "markdown": false
}
```

**Response:**
```json
{
  "message": "Page created successfully",
  "page": {
    "id": 3,
    "name": "new_page_title",
    "display_name": "New Page Title",
    "content": "Page content goes here",
    "permission": 0
  }
}
```

#### PUT `/api/v1/bot/pages/:name`
Update an existing page.

**Headers:** `Authorization: Bearer <token>`

**Parameters:**
- `name` (string): The page name (URL parameter)

**Request Body:**
```json
{
  "display_name": "Updated Page Title",
  "content": "Updated page content"
}
```

**Response:**
```json
{
  "message": "Page updated successfully",
  "page": {
    "id": 3,
    "name": "new_page_title",
    "display_name": "Updated Page Title",
    "content": "Updated page content"
  }
}
```

### 4. Search

#### GET `/api/v1/bot/search`
Search for pages by title or content.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `query` (string, required): Search term
- `type` (string, optional): Search type ('title', 'content', or 'all' - default: 'all')

**Response:**
```json
{
  "results": [
    {
      "id": 1,
      "name": "home",
      "display_name": "Home",
      "permission": 500,
      "created_at": "2024-01-01T00:00:00.000Z",
      "last_modified": "2024-01-01T00:00:00.000Z"
    }
  ],
  "query": "home",
  "type": "all",
  "count": 1
}
```

### 5. User Information (Admin Bots Only)

#### GET `/api/v1/bot/users/:username`
Get information about a specific user. Requires bot role ≥ 100.

**Headers:** `Authorization: Bearer <token>`

**Parameters:**
- `username` (string): The username (URL parameter)

**Response:**
```json
{
  "id": 1,
  "username": "admin",
  "display_name": "Site Administrator",
  "role": 500,
  "account_status": "active",
  "type": "user",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

### 6. Wiki Settings (Admin Bots Only)

#### GET `/api/v1/bot/wiki/settings`
Get wiki settings. Requires bot role ≥ 100.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "site_name": "WikiBeachia",
  "admin_account_enabled": "true"
}
```

## Error Responses

All endpoints return standard HTTP status codes with JSON error messages:

### 400 Bad Request
```json
{
  "error": "Missing required fields: display_name and content"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid or expired bot token"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions to access this page"
}
```

### 404 Not Found
```json
{
  "error": "Page not found"
}
```

### 409 Conflict
```json
{
  "error": "Page name already exists"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## Permission System

Bots are subject to the same permission system as regular users:
- Each page has a `permission` level (0-500)
- Bots must have a role ≥ page permission level to read the page
- Bots must have a role ≥ (page permission - 1) to edit the page
- Only bots with role ≥ 100 can access user information and wiki settings

## Rate Limiting

Consider implementing rate limiting in production:
- Recommended: 100 requests per minute per bot
- Burst allowance: 20 requests per 10 seconds

## Examples

### Python Bot Example

```python
import requests

class WikiBeachiaBot:
    def __init__(self, base_url, username, client_secret):
        self.base_url = base_url
        self.username = username
        self.client_secret = client_secret
        self.token = None
    
    def login(self):
        response = requests.post(f"{self.base_url}/api/v1/bot/login", json={
            "username": self.username,
            "clientSecret": self.client_secret
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            return True
        return False
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}"}
    
    def get_page(self, name):
        response = requests.get(
            f"{self.base_url}/api/v1/bot/pages/{name}",
            headers=self.get_headers()
        )
        return response.json() if response.status_code == 200 else None
    
    def create_page(self, display_name, content, permission=0):
        response = requests.post(
            f"{self.base_url}/api/v1/bot/pages",
            json={
                "display_name": display_name,
                "content": content,
                "permission": permission
            },
            headers=self.get_headers()
        )
        return response.status_code == 201

# Usage
bot = WikiBeachiaBot("http://localhost:3000", "_home", "bot_secret")
if bot.login():
    page = bot.get_page("home")
    print(page)
```

### JavaScript/Node.js Bot Example

```javascript
class WikiBeachiaBot {
    constructor(baseUrl, username, clientSecret) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.clientSecret = clientSecret;
        this.token = null;
    }
    
    async login() {
        const response = await fetch(`${this.baseUrl}/api/v1/bot/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: this.username,
                clientSecret: this.clientSecret
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            this.token = data.token;
            return true;
        }
        return false;
    }
    
    getHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }
    
    async getPage(name) {
        const response = await fetch(`${this.baseUrl}/api/v1/bot/pages/${name}`, {
            headers: this.getHeaders()
        });
        return response.ok ? await response.json() : null;
    }
    
    async searchPages(query, type = 'all') {
        const response = await fetch(
            `${this.baseUrl}/api/v1/bot/search?query=${encodeURIComponent(query)}&type=${type}`,
            { headers: this.getHeaders() }
        );
        return response.ok ? await response.json() : null;
    }
}

// Usage
const bot = new WikiBeachiaBot('http://localhost:3000', '_home', 'bot_secret');
await bot.login();
const results = await bot.searchPages('welcome');
console.log(results);
```

## Security Considerations

1. **Client Secrets**: Store bot client secrets securely, never in plain text
2. **Token Storage**: Bot tokens should be stored securely and refreshed regularly
3. **HTTPS**: Always use HTTPS in production
4. **Rate Limiting**: Implement appropriate rate limiting to prevent abuse
5. **Logging**: Monitor bot API usage for suspicious activity
6. **Permissions**: Follow the principle of least privilege when setting bot roles
